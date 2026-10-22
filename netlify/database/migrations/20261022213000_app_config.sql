create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
