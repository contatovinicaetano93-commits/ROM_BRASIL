-- Restaura status corretos após upserts com default 'novo' que rebaixaram dump/visitas.
-- importado ≠ novo lead: base Avec (clients/backfill/lake) não é aquisição de funil.
-- Visitas returning (0002) com status 'novo' eram leads reais de retorno → convertido.

-- 1) Returning ainda em 'novo' → convertido + source de visita (não dump).
update contacts
set
  status = 'convertido',
  source = 'avec_sync_visit_0002'
where status = 'novo'
  and channel = 'avec'
  and source like 'avec_sync_returning%';

-- 2) Qualquer returning legado fora de importado (em_atendimento/agendado/convertido/…)
--    troca source dump → visit para entrar no KPI byDay.
update contacts
set source = 'avec_sync_visit_0002'
where channel = 'avec'
  and source like 'avec_sync_returning%'
  and status <> 'importado';

-- 3) Dump puro ainda em 'novo' → importado (não inclui returning).
update contacts
set status = 'importado'
where status = 'novo'
  and channel = 'avec'
  and (
    source like 'avec_sync_clients%'
    or source like 'avec_backfill%'
    or source like 'avec_lake%'
  );

-- Alinha v_kpi_daily: exclui dump (clients/returning legado/backfill/lake).
-- Source novo avec_sync_visit_* não é dump e entra no funil se status ≠ importado.
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
