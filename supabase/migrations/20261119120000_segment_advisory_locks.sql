-- Per-agent segment mutations serialize across API processes via transaction-scoped
-- advisory locks (class 873401, key hashtext(agent_id)).

alter table window_segments drop constraint if exists window_segments_close_reason_check;

alter table window_segments add constraint window_segments_close_reason_check
  check (close_reason in ('focus_change', 'stale', 'shutdown', 'lock'));

create or replace function close_open_segment(
  p_agent_id text,
  p_ended_at timestamptz,
  p_close_reason text
)
returns boolean
language plpgsql
as $$
declare
  v_started_at timestamptz;
  v_end_at timestamptz;
  v_updated integer;
begin
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

  select started_at
  into v_started_at
  from window_segments
  where agent_id = p_agent_id
    and ended_at is null
  limit 1;

  if v_started_at is null then
    return false;
  end if;

  v_end_at := p_ended_at;
  if v_end_at < v_started_at then
    v_end_at := v_started_at;
  end if;

  update window_segments
  set ended_at = v_end_at,
      close_reason = p_close_reason
  where agent_id = p_agent_id
    and ended_at is null
    and started_at <= v_end_at;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function open_window_segment(
  p_agent_id text,
  p_started_at timestamptz,
  p_app_name text,
  p_window_title text
)
returns boolean
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

  if exists (
    select 1
    from window_segments
    where agent_id = p_agent_id
      and ended_at is null
  ) then
    return false;
  end if;

  insert into window_segments (agent_id, app_name, window_title, started_at)
  values (p_agent_id, p_app_name, p_window_title, p_started_at);

  return true;
end;
$$;

create or replace function sweep_stale_segments(p_cutoff timestamptz)
returns void
language plpgsql
as $$
declare
  r record;
  v_end timestamptz;
begin
  for r in
    select agent_id, last_seen_at, last_active_at
    from agent_heartbeats
    where last_seen_at < p_cutoff
  loop
    v_end := coalesce(r.last_active_at, r.last_seen_at);
    perform public.close_open_segment(r.agent_id, v_end, 'stale');
  end loop;
end;
$$;

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
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

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

grant execute on function public.close_open_segment(text, timestamptz, text) to service_role;
grant execute on function public.open_window_segment(text, timestamptz, text, text) to service_role;
grant execute on function public.sweep_stale_segments(timestamptz) to service_role;