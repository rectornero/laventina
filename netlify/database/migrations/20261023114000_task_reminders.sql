create table if not exists reminders_sent (
  task_id text not null,
  user_id text not null,
  mins smallint not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, user_id, mins, due_at)
);
