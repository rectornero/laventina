create table if not exists butler_log (
  id bigserial primary key,
  household_id text not null,
  user_id text not null references users(id) on delete cascade,
  role text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists butler_log_user on butler_log(user_id, id desc);
create table if not exists butler_profile (
  user_id text primary key references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists api_tokens (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
