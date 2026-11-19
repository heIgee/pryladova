-- Per-agent monotonic sequence. captured_at stays the interval boundary.
-- (agent_id, sequence) is the idempotency key and the order key.
-- A sequence at or below the stored maximum is ignored and does not mutate segments.
-- Segment mutations keep the transaction-scoped advisory lock
-- pg_advisory_xact_lock(873401, hashtext(agent_id)).

create table agent_event_sequences (
  agent_id text not null,
  sequence bigint not null,
  primary key (agent_id, sequence),
  constraint agent_event_sequences_sequence_positive check (sequence > 0)
);

alter table agent_event_sequences enable row level security;

grant select, insert on public.agent_event_sequences to service_role;

create or replace function claim_agent_sequence(
  p_agent_id text,
  p_sequence bigint
)
returns boolean
language plpgsql
as $$
declare
  v_max bigint;
begin
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

  if p_sequence is null or p_sequence <= 0 then
    return false;
  end if;

  select max(sequence)
  into v_max
  from agent_event_sequences
  where agent_id = p_agent_id;

  if p_sequence <= coalesce(v_max, 0) then
    return false;
  end if;

  insert into agent_event_sequences (agent_id, sequence)
  values (p_agent_id, p_sequence);

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

-- Required p_sequence keeps this overload distinct from close_open_segment(text, timestamptz, text).
-- The inner close still takes the advisory lock. Claim and close commit together.
create or replace function close_open_segment(
  p_agent_id text,
  p_ended_at timestamptz,
  p_close_reason text,
  p_sequence bigint
)
returns boolean
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

  if not claim_agent_sequence(p_agent_id, p_sequence) then
    return false;
  end if;

  return public.close_open_segment(p_agent_id, p_ended_at, p_close_reason);
end;
$$;

-- Required p_sequence keeps this overload distinct from
-- close_and_open_segment(text, timestamptz, text, text).
create or replace function close_and_open_segment(
  p_agent_id text,
  p_captured_at timestamptz,
  p_app_name text,
  p_window_title text,
  p_sequence bigint
)
returns jsonb
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(873401, hashtext(p_agent_id));

  if not claim_agent_sequence(p_agent_id, p_sequence) then
    return jsonb_build_object('action', 'noop', 'reason', 'sequence');
  end if;

  return public.close_and_open_segment(
    p_agent_id,
    p_captured_at,
    p_app_name,
    p_window_title
  );
end;
$$;

grant execute on function public.claim_agent_sequence(text, bigint) to service_role;
grant execute on function public.close_open_segment(text, timestamptz, text, bigint) to service_role;
grant execute on function public.close_and_open_segment(text, timestamptz, text, text, bigint) to service_role;
