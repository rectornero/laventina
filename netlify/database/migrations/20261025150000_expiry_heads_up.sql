alter table push_subs add column if not exists expiry boolean not null default true;
alter table push_subs add column if not exists last_expiry date;
