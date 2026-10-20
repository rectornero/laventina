create table if not exists push_subs (
  endpoint text primary key,
  user_id text not null references users(id) on delete cascade,
  household_id text not null references households(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  hour smallint not null default 8,
  daily boolean not null default true,
  assigned boolean not null default true,
  last_digest date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subs_user on push_subs(user_id);
