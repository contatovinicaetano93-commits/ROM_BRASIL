-- ON CONFLICT (phone|avec_client_id) exige índice UNIQUE sem predicado WHERE.
-- Índices parciais (WHERE ... IS NOT NULL) não satisfazem a inference do Postgres.
-- NULLs continuam permitidos em múltiplas linhas (UNIQUE padrão do PG).
-- Dedup antes dos UNIQUE: painéis com dados sujos falhariam o CREATE INDEX.

-- 1a) Telefone duplicado → reúne contact_events no keeper
with ranked as (
  select
    id,
    phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.phone = d.phone and k.rn = 1
  where d.rn > 1
)
update contact_events ce
set contact_id = pairs.keeper_id
from pairs
where ce.contact_id = pairs.loser_id;

-- 1b) client_services
with ranked as (
  select
    id,
    phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.phone = d.phone and k.rn = 1
  where d.rn > 1
)
update client_services cs
set contact_id = pairs.keeper_id
from pairs
where cs.contact_id = pairs.loser_id;

-- 1c) whatsapp_aftercare_messages
with ranked as (
  select
    id,
    phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.phone = d.phone and k.rn = 1
  where d.rn > 1
)
update whatsapp_aftercare_messages w
set contact_id = pairs.keeper_id
from pairs
where w.contact_id = pairs.loser_id;

-- 1d) contact_brief_cache dos perdedores
with ranked as (
  select
    id,
    phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
losers as (
  select id as loser_id from ranked where rn > 1
)
delete from contact_brief_cache cbc
using losers
where cbc.contact_id = losers.loser_id;

-- 1e) remove contatos duplicados por telefone
with ranked as (
  select
    id,
    phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
losers as (
  select id as loser_id from ranked where rn > 1
)
delete from contacts c
using losers
where c.id = losers.loser_id;

-- 2a) avec_client_id duplicado → contact_events
with ranked as (
  select
    id,
    avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.avec_client_id = d.avec_client_id and k.rn = 1
  where d.rn > 1
)
update contact_events ce
set contact_id = pairs.keeper_id
from pairs
where ce.contact_id = pairs.loser_id;

-- 2b) client_services
with ranked as (
  select
    id,
    avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.avec_client_id = d.avec_client_id and k.rn = 1
  where d.rn > 1
)
update client_services cs
set contact_id = pairs.keeper_id
from pairs
where cs.contact_id = pairs.loser_id;

-- 2c) whatsapp_aftercare_messages
with ranked as (
  select
    id,
    avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
pairs as (
  select d.id as loser_id, k.id as keeper_id
  from ranked d
  join ranked k on k.avec_client_id = d.avec_client_id and k.rn = 1
  where d.rn > 1
)
update whatsapp_aftercare_messages w
set contact_id = pairs.keeper_id
from pairs
where w.contact_id = pairs.loser_id;

-- 2d) contact_brief_cache
with ranked as (
  select
    id,
    avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
losers as (
  select id as loser_id from ranked where rn > 1
)
delete from contact_brief_cache cbc
using losers
where cbc.contact_id = losers.loser_id;

-- 2e) remove contatos duplicados por avec_client_id
with ranked as (
  select
    id,
    avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        last_contact_at desc nulls last,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
losers as (
  select id as loser_id from ranked where rn > 1
)
delete from contacts c
using losers
where c.id = losers.loser_id;

drop index if exists contacts_phone_idx;
create unique index if not exists contacts_phone_idx on contacts (phone);

drop index if exists contacts_avec_client_id_idx;
create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id);
