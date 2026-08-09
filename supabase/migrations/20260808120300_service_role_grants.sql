-- Nest uses the secret key (service_role). RLS is enabled with no anon policies;
-- service_role bypasses RLS but still needs table- and function-level grants.

grant select, insert, update, delete on public.window_segments to service_role;
grant select, insert, update, delete on public.agent_heartbeats to service_role;
grant select, insert, update, delete on public.hub_settings to service_role;

grant execute on function public.close_and_open_segment(text, timestamptz, text, text) to service_role;
grant execute on function public.get_interval_summary(text, timestamptz, timestamptz) to service_role;
