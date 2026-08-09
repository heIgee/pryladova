create or replace function get_interval_summary(
  p_agent_id text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  app_name text,
  duration_sec bigint
)
language sql
stable
as $$
  select
    ws.app_name,
    sum(
      extract(
        epoch from (
          least(coalesce(ws.ended_at, now()), p_range_end)
          - greatest(ws.started_at, p_range_start)
        )
      )
    )::bigint as duration_sec
  from window_segments ws
  where ws.agent_id = p_agent_id
    and ws.started_at < p_range_end
    and coalesce(ws.ended_at, now()) > p_range_start
  group by ws.app_name
  having sum(
    extract(
      epoch from (
        least(coalesce(ws.ended_at, now()), p_range_end)
        - greatest(ws.started_at, p_range_start)
      )
    )
  ) > 0
  order by duration_sec desc;
$$;
