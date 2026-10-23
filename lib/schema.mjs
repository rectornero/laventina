// The schema. On Netlify it ships as netlify/database/migrations/20261020070000_initial_schema.sql (a test keeps the two equal);
// tests and the local preview apply it directly.
export const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  pass_hash text not null,
  color text,
  created_at timestamptz not null default now()
);
create table if not exists households (
  id text primary key,
  name text not null default 'Our home',
  invite_code text unique,
  generated_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists members (
  household_id text not null references households(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create unique index if not exists members_one_household on members(user_id);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists login_attempts (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);
create table if not exists records (
  household_id text not null references households(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  visibility text not null default 'shared',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (household_id, kind, id)
);
create index if not exists records_sync on records(household_id, updated_at);
create table if not exists tasks (
  id text primary key,
  household_id text not null references households(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'open',
  due_on date,
  due_time text,
  show_from date,
  priority smallint not null default 0,
  list_id text,
  assignee_id text,
  claimed_at timestamptz,
  done_at timestamptz,
  done_by text,
  repeat jsonb,
  subtasks jsonb,
  tags jsonb,
  source text not null default 'todo',
  source_type text,
  source_ref text,
  project_id text,
  phase text,
  blocked_by jsonb,
  sort_order double precision,
  item_id text,
  room_id text,
  est_minutes int,
  extra jsonb,
  visibility text not null default 'shared',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists tasks_sync on tasks(household_id, updated_at);
create unique index if not exists tasks_generated on tasks(household_id, source, source_ref, due_on) where source <> 'todo';
`;

// Push notifications: one row per device that said yes. Ships as 20261020090000_push_subscriptions.sql.
export const PUSH_SCHEMA = `
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
`;


// The house bell, thank-yous and the Sunday recap: per-device switches. Ships as 20261022210000_bell_and_recap.sql.
export const BELL_SCHEMA = `
alter table push_subs add column if not exists bell boolean not null default true;
alter table push_subs add column if not exists weekly boolean not null default true;
alter table push_subs add column if not exists last_recap date;
`;

// Settings the app keeps for itself, such as its notification key pair. Ships as 20261022213000_app_config.sql.
export const CONFIG_SCHEMA = `
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
`;

// "Remind me N minutes before" pings already sent, so each goes out once. Ships as 20261023114000_task_reminders.sql.
export const REMINDER_SCHEMA = `
create table if not exists reminders_sent (
  task_id text not null,
  user_id text not null,
  mins smallint not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, user_id, mins, due_at)
);
`;

// In order. Netlify applies the matching files in netlify/database/migrations/; tests and the local preview run these.
export const MIGRATIONS = [["20261020070000_initial_schema", SCHEMA], ["20261020090000_push_subscriptions", PUSH_SCHEMA], ["20261022210000_bell_and_recap", BELL_SCHEMA], ["20261022213000_app_config", CONFIG_SCHEMA], ["20261023114000_task_reminders", REMINDER_SCHEMA]];
