-- ON CONFLICT (phone|avec_client_id) exige índice UNIQUE sem predicado WHERE.
-- Índices parciais (WHERE ... IS NOT NULL) não satisfazem a inference do Postgres.
-- NULLs continuam permitidos em múltiplas linhas (UNIQUE padrão do PG).
-- Antes de criar UNIQUE pleno, funde duplicatas existentes (multi-canal / imports).

with ranked as (
  select id, phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.phone = r.phone and keep.rn = 1
  where r.rn > 1
)
update contact_events ce
set contact_id = d.keep_id
from dups d
where ce.contact_id = d.dup_id;

with ranked as (
  select id, phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.phone = r.phone and keep.rn = 1
  where r.rn > 1
)
update client_services cs
set contact_id = d.keep_id
from dups d
where cs.contact_id = d.dup_id;

with ranked as (
  select id, phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.phone = r.phone and keep.rn = 1
  where r.rn > 1
)
update whatsapp_aftercare_messages m
set contact_id = d.keep_id
from dups d
where m.contact_id = d.dup_id;

with ranked as (
  select id, phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.phone = r.phone and keep.rn = 1
  where r.rn > 1
)
delete from contact_brief_cache c
using dups d
where c.contact_id = d.dup_id;

with ranked as (
  select id, phone,
    row_number() over (
      partition by phone
      order by
        (avec_client_id is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where phone is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.phone = r.phone and keep.rn = 1
  where r.rn > 1
)
delete from contacts c
using dups d
where c.id = d.dup_id;

with ranked as (
  select id, avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.avec_client_id = r.avec_client_id and keep.rn = 1
  where r.rn > 1
)
update contact_events ce
set contact_id = d.keep_id
from dups d
where ce.contact_id = d.dup_id;

with ranked as (
  select id, avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.avec_client_id = r.avec_client_id and keep.rn = 1
  where r.rn > 1
)
update client_services cs
set contact_id = d.keep_id
from dups d
where cs.contact_id = d.dup_id;

with ranked as (
  select id, avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.avec_client_id = r.avec_client_id and keep.rn = 1
  where r.rn > 1
)
update whatsapp_aftercare_messages m
set contact_id = d.keep_id
from dups d
where m.contact_id = d.dup_id;

with ranked as (
  select id, avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.avec_client_id = r.avec_client_id and keep.rn = 1
  where r.rn > 1
)
delete from contact_brief_cache c
using dups d
where c.contact_id = d.dup_id;

with ranked as (
  select id, avec_client_id,
    row_number() over (
      partition by avec_client_id
      order by
        (phone is not null) desc,
        case status
          when 'convertido' then 4
          when 'agendado' then 3
          when 'em_atendimento' then 2
          when 'novo' then 1
          when 'importado' then 0
          else -1
        end desc,
        created_at asc,
        id asc
    ) as rn
  from contacts
  where avec_client_id is not null
),
dups as (
  select r.id as dup_id, keep.id as keep_id
  from ranked r
  join ranked keep on keep.avec_client_id = r.avec_client_id and keep.rn = 1
  where r.rn > 1
)
delete from contacts c
using dups d
where c.id = d.dup_id;

drop index if exists contacts_phone_idx;
create unique index if not exists contacts_phone_idx on contacts (phone);

drop index if exists contacts_avec_client_id_idx;
create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id);
