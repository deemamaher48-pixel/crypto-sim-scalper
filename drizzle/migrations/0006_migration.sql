create table public.telegram_admins(chat_id bigint primary key, user_id uuid not null, panel_message_id bigint, created_at timestamptz not null default now());
create table public.tg_subscribers(chat_id bigint primary key, expires_at timestamptz not null, created_at timestamptz not null default now());
create table public.tg_license_keys(code text primary key, days int not null, used_by bigint, used_at timestamptz, created_at timestamptz not null default now());
grant all on public.telegram_admins, public.tg_subscribers, public.tg_license_keys to service_role;
alter table public.telegram_admins enable row level security;
alter table public.tg_subscribers enable row level security;
alter table public.tg_license_keys enable row level security;
insert into public.telegram_admins(chat_id,user_id) values (942861256,'71fb1164-6444-4140-a3bb-fe15491ab903');