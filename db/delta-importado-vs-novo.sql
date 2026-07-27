-- Restaura status importado para dump Avec que foi rebaixado a "novo"
-- por upserts sem status (default 'novo') — ex.: returning 0002, WhatsApp match.
-- importado ≠ novo lead: base Avec não é aquisição de funil.

update contacts
set status = 'importado'
where status = 'novo'
  and channel = 'avec'
  and (
    source like 'avec_sync_clients%'
    or source = 'avec_sync_returning_0002'
    or source like 'avec_backfill%'
    or source like 'avec_lake%'
  );

-- Alinha v_kpi_daily com exclusão de returning (além de clients/backfill/lake).
drop view if exists v_kpi_daily;

create view v_kpi_daily as
select
  (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date as day,
  channel,
  count(*)::int as contacts_count
from contacts
where anonymized_at is null
  and status <> 'importado'
  and coalesce(source, '') not like 'avec_sync_clients%'
  and coalesce(source, '') not like 'avec_sync_returning%'
  and coalesce(source, '') not like 'avec_backfill%'
  and coalesce(source, '') not like 'avec_lake%'
group by 1, 2
order by 1 desc;
