-- Última visita na recepção: profissional + preço (fase B) em client_services
alter table client_services
  add column if not exists professional_name text;

alter table client_services
  add column if not exists last_price numeric(12, 2);

create index if not exists client_services_last_done_idx
  on client_services (contact_id, last_done_at desc nulls last)
  where active = true and last_done_at is not null;
