-- Open segments count only until last agent heartbeat, not wall-clock now().

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
          least(
            coalesce(ws.ended_at, hb.last_seen_at, ws.started_at),
            p_range_end
          )
          - greatest(ws.started_at, p_range_start)
        )
      )
    )::bigint as duration_sec
  from window_segments ws
  left join agent_heartbeats hb on hb.agent_id = ws.agent_id
  where ws.agent_id = p_agent_id
    and ws.started_at < p_range_end
    and coalesce(ws.ended_at, hb.last_seen_at, ws.started_at) > p_range_start
  group by ws.app_name
  having sum(
    extract(
      epoch from (
        least(
          coalesce(ws.ended_at, hb.last_seen_at, ws.started_at),
          p_range_end
        )
        - greatest(ws.started_at, p_range_start)
      )
    )
  ) > 0
  order by duration_sec desc;
$$;
