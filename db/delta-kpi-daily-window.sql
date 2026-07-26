-- Contatos por dia: janela real por calendário (não LIMIT em linhas day×canal).
-- Usa first_contact_at (quando o lead entrou) com fallback em created_at.
-- day como date (não timestamptz) evita chave ISO ambígua no painel.
-- KPIs CRM excluem contatos anonimizados (LGPD) de forma consistente.

create or replace view v_kpi_daily as
select
  (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date as day,
  channel,
  count(*)::int as contacts_count
from contacts
where anonymized_at is null
group by 1, 2
order by 1 desc;

create or replace view v_kpi_status as
select
  status,
  count(*)::int as contacts_count
from contacts
where anonymized_at is null
group by 1;

create or replace view v_kpi_conversion as
select
  coalesce(
    count(*) filter (where status = 'convertido')::float
      / nullif(count(*), 0)::float,
    0
  ) as conversion_rate,
  count(*)::int as total_contacts
from contacts
where anonymized_at is null;
