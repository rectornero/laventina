alter table push_subs add column if not exists bell boolean not null default true;
alter table push_subs add column if not exists weekly boolean not null default true;
alter table push_subs add column if not exists last_recap date;
