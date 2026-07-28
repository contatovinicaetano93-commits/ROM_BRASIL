-- Deduplica contacts por telefone (dígitos canônicos BR) e libera órfãos avec sem phone
-- quando já existe contato com o mesmo avec_client_id (não deve existir) ou
-- quando o índice único já impede duplicata exata.
--
-- Estratégia: por grupo de dígitos canônicos (mesma regra de normalizePhone),
-- mantém o contato mais completo/recente; reaponta FKs; zera chaves do doador; delete.
-- Depois normaliza phones para E.164 (+55 para nacionais 10–11 dígitos).

-- 1) Duplicatas exatas de phone (defensivo — índice único deveria impedir)
--    (no-op se não houver)

-- 2) Duplicatas por dígitos canônicos (formatos mistos legados: 11… vs 5511…)
do $$
declare
  r record;
  survivor uuid;
  donor uuid;
  donors uuid[];
  i int;
begin
  for r in
    select
      case
        when length(regexp_replace(phone, '\D', '', 'g')) in (10, 11)
          then '55' || regexp_replace(phone, '\D', '', 'g')
        else regexp_replace(phone, '\D', '', 'g')
      end as digits,
      (array_agg(
        id
        order by
          (avec_client_id is not null)::int desc,
          (name is not null and length(trim(name)) > 0)::int desc,
          (email is not null)::int desc,
          last_contact_at desc nulls last,
          created_at desc
      )) as ids
    from contacts
    where phone is not null
      and length(regexp_replace(phone, '\D', '', 'g')) >= 10
    group by 1
    having count(*) > 1
  loop
    survivor := r.ids[1];
    donors := r.ids[2:array_length(r.ids, 1)];
    if donors is null then
      continue;
    end if;

    foreach donor in array donors loop
      update client_services set contact_id = survivor where contact_id = donor;
      update contact_events set contact_id = survivor where contact_id = donor;
      delete from contact_brief_cache where contact_id = donor;
      update whatsapp_aftercare_messages set contact_id = survivor where contact_id = donor;

      -- Preferências / dados: preenche buracos no survivor
      update contacts s
      set
        name = coalesce(s.name, d.name),
        email = coalesce(s.email, d.email),
        avec_client_id = coalesce(
          s.avec_client_id,
          case
            when not exists (
              select 1 from contacts x
              where x.avec_client_id = d.avec_client_id and x.id <> s.id
            ) then d.avec_client_id
            else null
          end
        ),
        preferred_manicurist = coalesce(s.preferred_manicurist, d.preferred_manicurist),
        preferred_hairstylist = coalesce(s.preferred_hairstylist, d.preferred_hairstylist),
        notes = coalesce(s.notes, d.notes),
        last_contact_at = greatest(s.last_contact_at, d.last_contact_at)
      from contacts d
      where s.id = survivor and d.id = donor;

      update contacts set phone = null, avec_client_id = null where id = donor;
      delete from contacts where id = donor;
    end loop;

    -- Normaliza phone do survivor para E.164 app (+55 em nacionais 10–11 dígitos)
    update contacts
    set phone = '+' || case
      when length(regexp_replace(phone, '\D', '', 'g')) in (10, 11)
        then '55' || regexp_replace(phone, '\D', '', 'g')
      else regexp_replace(phone, '\D', '', 'g')
    end
    where id = survivor
      and phone is not null;
  end loop;
end $$;

-- 3) Normaliza phones restantes (sem duplicata) para o mesmo E.164 do app
update contacts
set phone = '+' || case
  when length(regexp_replace(phone, '\D', '', 'g')) in (10, 11)
    then '55' || regexp_replace(phone, '\D', '', 'g')
  else regexp_replace(phone, '\D', '', 'g')
end
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) >= 10
  and phone is distinct from (
    '+' || case
      when length(regexp_replace(phone, '\D', '', 'g')) in (10, 11)
        then '55' || regexp_replace(phone, '\D', '', 'g')
      else regexp_replace(phone, '\D', '', 'g')
    end
  );

-- 4) Garante índices únicos (idempotente)
create unique index if not exists contacts_phone_idx on contacts (phone);
create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id);
