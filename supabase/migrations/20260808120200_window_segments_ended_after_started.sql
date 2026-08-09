alter table window_segments
  add constraint window_segments_ended_after_started
  check (ended_at is null or ended_at >= started_at);
