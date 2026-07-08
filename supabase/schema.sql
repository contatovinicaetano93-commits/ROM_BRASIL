-- ROM · Onboarding & KPIs de contato
-- Rodar no SQL Editor do Supabase (projeto novo, dedicado ao ROM).

create extension if not exists "pgcrypto";

-- Cada cliente/lead que entrou em contato, por qualquer canal.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  channel text not null check (channel in ('whatsapp', 'telegram', 'avec', 'instagram', 'manual')),
  source text not null default 'manual',
  status text not null default 'novo' check (status in ('novo', 'em_atendimento', 'agendado', 'convertido', 'perdido')),
  avec_client_id text,
  notes text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists contacts_channel_idx on contacts (channel);
create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_created_at_idx on contacts (created_at desc);
create unique index if not exists contacts_phone_idx on contacts (phone) where phone is not null;

-- Log granular de cada evento (mensagem recebida/enviada, webhook do Avec, etc).
-- Existe pra tornar o sistema resiliente: nada some, tudo fica rastreável e reprocessável.
create table if not exists contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'telegram', 'avec', 'instagram', 'manual')),
  direction text not null check (direction in ('in', 'out')),
  handled_by text not null default 'ai' check (handled_by in ('ai', 'human', 'system')),
  payload jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists contact_events_contact_idx on contact_events (contact_id);
create index if not exists contact_events_created_at_idx on contact_events (created_at desc);
create index if not exists contact_events_error_idx on contact_events (created_at desc) where error is not null;

-- KPIs agregados por dia e canal — o painel administrativo lê daqui.
create or replace view v_kpi_daily as
select
  date_trunc('day', created_at) as day,
  channel,
  count(*) as contacts_count
from contacts
group by 1, 2
order by 1 desc;

create or replace view v_kpi_status as
select
  status,
  count(*) as contacts_count
from contacts
group by 1;

create or replace view v_kpi_conversion as
select
  count(*) filter (where status = 'convertido')::float
    / nullif(count(*), 0)::float as conversion_rate,
  count(*) as total_contacts
from contacts;
