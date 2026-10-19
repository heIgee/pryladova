-- Focus-change count per app for the history tile. Return type changes, so replace the function.

drop function if exists public.get_interval_summary(text, timestamptz, timestamptz);

create function public.get_interval_summary(
  p_agent_id text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  app_name text,
  duration_sec bigint,
  switch_count bigint
)
language sql
stable
as $$
  select
    ws.app_name,
    sum(
      extract(
        epoch from (
          least(
            coalesce(ws.ended_at, hb.last_active_at, hb.last_seen_at, ws.started_at),
            p_range_end
          )
          - greatest(ws.started_at, p_range_start)
        )
      )
    )::bigint as duration_sec,
    count(*) filter (
      where ws.close_reason = 'focus_change'
        and ws.ended_at >= p_range_start
        and ws.ended_at < p_range_end
    )::bigint as switch_count
  from window_segments ws
  left join agent_heartbeats hb on hb.agent_id = ws.agent_id
  where ws.agent_id = p_agent_id
    and ws.started_at < p_range_end
    and coalesce(ws.ended_at, hb.last_active_at, hb.last_seen_at, ws.started_at) > p_range_start
  group by ws.app_name
  having sum(
    extract(
      epoch from (
        least(
          coalesce(ws.ended_at, hb.last_active_at, hb.last_seen_at, ws.started_at),
          p_range_end
        )
        - greatest(ws.started_at, p_range_start)
      )
    )
  ) > 0
  order by duration_sec desc;
$$;

grant execute on function public.get_interval_summary(text, timestamptz, timestamptz) to service_role;
