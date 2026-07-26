-- ON CONFLICT (phone|avec_client_id) exige índice UNIQUE sem predicado WHERE.
-- Índices parciais (WHERE ... IS NOT NULL) não satisfazem a inference do Postgres.
-- NULLs continuam permitidos em múltiplas linhas (UNIQUE padrão do PG).
-- Cria o UNIQUE pleno ANTES de dropar o índice antigo: se houver duplicatas,
-- a migration falha sem remover a proteção existente (runner não é transacional).

create unique index if not exists contacts_phone_uidx on contacts (phone);
drop index if exists contacts_phone_idx;
alter index if exists contacts_phone_uidx rename to contacts_phone_idx;

create unique index if not exists contacts_avec_client_id_uidx on contacts (avec_client_id);
drop index if exists contacts_avec_client_id_idx;
alter index if exists contacts_avec_client_id_uidx rename to contacts_avec_client_id_idx;
