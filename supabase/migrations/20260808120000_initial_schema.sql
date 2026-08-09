create table window_segments (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  app_name text not null,
  window_title text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  close_reason text check (close_reason in ('focus_change', 'stale', 'shutdown')),
  classification jsonb,
  created_at timestamptz not null default now()
);

create unique index window_segments_one_open_per_agent
  on window_segments (agent_id)
  where ended_at is null;

create index window_segments_agent_started
  on window_segments (agent_id, started_at desc);

create index window_segments_agent_range
  on window_segments (agent_id, started_at, ended_at);

create table agent_heartbeats (
  agent_id text primary key,
  last_seen_at timestamptz not null
);

create table hub_settings (
  id int primary key check (id = 1),
  classification_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into hub_settings (id) values (1);

alter table window_segments enable row level security;
alter table agent_heartbeats enable row level security;
alter table hub_settings enable row level security;

create or replace function close_and_open_segment(
  p_agent_id text,
  p_captured_at timestamptz,
  p_app_name text,
  p_window_title text
)
returns jsonb
language plpgsql
as $$
declare
  v_open_id uuid;
  v_open_started_at timestamptz;
  v_new_id uuid;
begin
  select id, started_at
  into v_open_id, v_open_started_at
  from window_segments
  where agent_id = p_agent_id
    and ended_at is null
  limit 1;

  if v_open_id is not null and p_captured_at < v_open_started_at then
    return jsonb_build_object('action', 'noop');
  end if;

  if v_open_id is not null then
    update window_segments
    set ended_at = p_captured_at,
        close_reason = 'focus_change'
    where id = v_open_id;
  end if;

  insert into window_segments (agent_id, app_name, window_title, started_at)
  values (p_agent_id, p_app_name, p_window_title, p_captured_at)
  returning id into v_new_id;

  return jsonb_build_object('action', 'opened', 'segment_id', v_new_id);
end;
$$;
