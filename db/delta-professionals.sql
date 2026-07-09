-- Delta ROM Brasil · profissionais + vínculo na agenda
-- Rodar no Neon após schema base

create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  avec_pro_id text,
  name text not null,
  telegram_chat_id text,
  active boolean not null default true,
  daily_goal numeric(12, 2),
  created_at timestamptz not null default now()
);

create unique index if not exists professionals_avec_pro_id_idx
  on professionals (avec_pro_id) where avec_pro_id is not null;

create unique index if not exists professionals_telegram_chat_id_idx
  on professionals (telegram_chat_id) where telegram_chat_id is not null;

create index if not exists professionals_active_idx
  on professionals (active) where active = true;

alter table client_services
  add column if not exists professional_id uuid references professionals (id) on delete set null;

alter table client_services
  add column if not exists avec_professional_name text;

create index if not exists client_services_professional_idx
  on client_services (professional_id)
  where professional_id is not null;

create table if not exists professional_daily_metrics (
  day date not null,
  professional_id uuid not null references professionals (id) on delete cascade,
  appointments int not null default 0,
  attended int not null default 0,
  no_shows int not null default 0,
  revenue numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, professional_id)
);
