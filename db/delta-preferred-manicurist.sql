-- Manicure de preferência do cliente (perfil da recepção)
alter table contacts
  add column if not exists preferred_manicurist text;
