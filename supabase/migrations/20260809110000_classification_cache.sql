create table classification_cache (
  app_name text not null,
  window_title text not null,
  classification jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (app_name, window_title)
);

create index classification_cache_updated_at on classification_cache (updated_at desc);

alter table classification_cache enable row level security;

grant select, insert, update, delete on public.classification_cache to service_role;
