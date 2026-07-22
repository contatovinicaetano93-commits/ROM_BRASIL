#!/usr/bin/env python3
"""Import AvecLake reservas (+ métricas de comandas) into ROM Neon DBs.

Credentials via env files in /tmp — never commit secrets.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

from lake_utils import categorize, norm_phone, phone_key, run_athena

SP = ZoneInfo("America/Sao_Paulo")

SALONS = {
    "brasil": 40613,
    "iguatemi": 99801,
}

ACTIVE_STATUS = ("AGENDADO", "CONFIRMADO", "AGUARDANDO", "EM ATENDIMENTO")


def rows_as_dicts(raw: list[list[str | None]]) -> list[dict[str, str | None]]:
    if not raw:
        return []
    headers = [h or f"c{i}" for i, h in enumerate(raw[0])]
    out = []
    for r in raw[1:]:
        out.append({headers[i]: (r[i] if i < len(r) else None) for i in range(len(headers))})
    return out


def parse_hora(hora: str | None) -> tuple[int, int]:
    if not hora:
        return 9, 0
    m = re.search(r"(\d{1,2}):(\d{2})", hora)
    if not m:
        return 9, 0
    return int(m.group(1)), int(m.group(2))


def scheduled_at(data_reserva: str | None, hora: str | None) -> datetime | None:
    if not data_reserva:
        return None
    d = date.fromisoformat(data_reserva[:10])
    hh, mm = parse_hora(hora)
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=SP)


def fetch_maps(salao_id: int) -> tuple[dict[str, str], dict[str, str]]:
    prof_rows = rows_as_dicts(
        run_athena(
            f"""
            SELECT cast(id as varchar) as id, nome
            FROM avec_lake_db.profissionais
            WHERE salao_id = {salao_id}
            """
        )
    )
    svc_rows = rows_as_dicts(
        run_athena(
            f"""
            SELECT cast(id as varchar) as id, servico
            FROM avec_lake_db.salao_servicos
            WHERE salao_id = {salao_id}
            """
        )
    )
    prof = {r["id"]: (r.get("nome") or "").strip() for r in prof_rows if r.get("id")}
    svc = {r["id"]: (r.get("servico") or "").strip() for r in svc_rows if r.get("id")}
    return prof, svc


def fetch_reservas(salao_id: int, days_back: int, days_fwd: int) -> list[dict[str, str | None]]:
    return rows_as_dicts(
        run_athena(
            f"""
            SELECT
              cast(id as varchar) as id,
              cast(salao_cliente_id as varchar) as salao_cliente_id,
              cliente_nome,
              cliente_telefone,
              cast(servico_id as varchar) as servico_id,
              cast(profissional_id as varchar) as profissional_id,
              cast(data_reserva as varchar) as data_reserva,
              hora_inicial,
              cast(valor as varchar) as valor,
              status
            FROM avec_lake_db.reservas
            WHERE salao_id = {salao_id}
              AND data_reserva BETWEEN current_date - interval '{days_back}' day
                                  AND current_date + interval '{days_fwd}' day
              AND status IN ({",".join("'"+s+"'" for s in ACTIVE_STATUS)})
            """
        )
    )


def fetch_comanda_daily(salao_id: int, days_back: int) -> list[dict[str, str | None]]:
    return rows_as_dicts(
        run_athena(
            f"""
            SELECT
              cast(date(data) as varchar) as day,
              cast(count(*) as varchar) as attended,
              cast(coalesce(sum(try_cast(total as double)), 0) as varchar) as revenue
            FROM avec_lake_db.comandas
            WHERE salao_id = {salao_id}
              AND date(data) BETWEEN current_date - interval '{days_back}' day AND current_date
              AND upper(coalesce(status, '')) NOT IN ('CANCELADA', 'CANCELADO', 'ABERTA')
            GROUP BY 1
            ORDER BY 1
            """
        )
    )


def load_contact_phone_index(conn: psycopg.Connection) -> dict[str, str]:
    idx: dict[str, str] = {}
    with conn.cursor() as cur:
        cur.execute("select id::text, phone from contacts where phone is not null and anonymized_at is null")
        for cid, phone in cur.fetchall():
            k = phone_key(phone)
            if k and k not in idx:
                idx[k] = cid
    return idx


def ensure_contact(
    conn: psycopg.Connection,
    phone_idx: dict[str, str],
    nome: str | None,
    telefone: str | None,
    salao_cliente_id: str | None,
    *,
    status: str = "novo",
    partial_phone_unique: bool = False,
) -> str | None:
    k = phone_key(telefone)
    phone = norm_phone(telefone)
    name = (nome or "Cliente").strip()[:200] or "Cliente"

    with conn.cursor() as cur:
        if salao_cliente_id:
            cur.execute(
                "select id::text from contacts where avec_client_id = %s limit 1",
                (salao_cliente_id,),
            )
            row = cur.fetchone()
            if row:
                if k:
                    phone_idx[k] = row[0]
                return row[0]

        if k and k in phone_idx:
            return phone_idx[k]

        if phone:
            cur.execute(
                "select id::text from contacts where phone = %s limit 1",
                (phone,),
            )
            row = cur.fetchone()
            if row:
                if k:
                    phone_idx[k] = row[0]
                return row[0]

        if not phone and not salao_cliente_id:
            return None

        conflict = (
            "on conflict (phone) where phone is not null do update set name = coalesce(nullif(contacts.name,''), excluded.name)"
            if partial_phone_unique
            else "on conflict (phone) do update set name = coalesce(nullif(contacts.name,''), excluded.name)"
        )
        try:
            with conn.transaction():
                cur.execute(
                    f"""
                    insert into contacts (
                      name, phone, channel, source, status, avec_client_id,
                      first_contact_at, last_contact_at, created_at
                    ) values (
                      %s, %s, 'avec', 'avec_lake_seed', %s, %s,
                      timestamptz '2020-01-01', timestamptz '2020-01-01', timestamptz '2020-01-01'
                    )
                    {conflict if phone else ''}
                    returning id::text
                    """,
                    (name, phone, status, salao_cliente_id),
                )
                cid = cur.fetchone()[0]
        except Exception:
            # avec_client_id unique or other race — resolve by id/phone
            if salao_cliente_id:
                cur.execute(
                    "select id::text from contacts where avec_client_id = %s limit 1",
                    (salao_cliente_id,),
                )
                row = cur.fetchone()
                if row:
                    cid = row[0]
                elif phone:
                    cur.execute(
                        "select id::text from contacts where phone = %s limit 1",
                        (phone,),
                    )
                    row = cur.fetchone()
                    cid = row[0] if row else None
                else:
                    cid = None
            elif phone:
                cur.execute(
                    "select id::text from contacts where phone = %s limit 1",
                    (phone,),
                )
                row = cur.fetchone()
                cid = row[0] if row else None
            else:
                cid = None
            if not cid:
                return None

    if k:
        phone_idx[k] = cid
    return cid


def import_unit(
    unit: str,
    database_url: str,
    *,
    days_fwd: int = 45,
    days_back_hist: int = 7,
    days_metrics: int = 30,
    contact_status: str = "novo",
) -> dict[str, Any]:
    salao_id = SALONS[unit]
    print(f"\n==== {unit} salao_id={salao_id} ====")
    print("fetching profissionais/servicos…")
    prof, svc = fetch_maps(salao_id)
    print(f"profissionais={len(prof)} servicos={len(svc)}")
    print("fetching reservas…")
    reservas = fetch_reservas(salao_id, days_back=days_back_hist, days_fwd=days_fwd)
    print(f"reservas ativas janela={len(reservas)}")

    stats = {
        "unit": unit,
        "reservas": len(reservas),
        "inserted_services": 0,
        "matched_contacts": 0,
        "created_contacts": 0,
        "skipped_no_phone": 0,
        "metrics_days": 0,
    }

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select indexdef from pg_indexes
                where tablename='contacts' and indexdef ilike '%phone%' and indexdef ilike '%UNIQUE%'
                limit 1
                """
            )
            idxdef = (cur.fetchone() or [""])[0]
            partial_phone_unique = "WHERE" in idxdef.upper()

        phone_idx = load_contact_phone_index(conn)
        print(f"contacts index={len(phone_idx)} partial_phone_unique={partial_phone_unique}")

        with conn.cursor() as cur:
            cur.execute(
                """
                delete from client_services
                where notes like 'lake:reserva:%%'
                  and scheduled_at is not null
                  and (scheduled_at at time zone 'America/Sao_Paulo')::date
                      between (current_date at time zone 'America/Sao_Paulo')::date - %s
                          and (current_date at time zone 'America/Sao_Paulo')::date + %s
                """,
                (days_back_hist, days_fwd),
            )
            deleted = cur.rowcount
        conn.commit()
        print(f"cleared previous lake services={deleted}")

        batch: list[tuple] = []
        for r in reservas:
            when = scheduled_at(r.get("data_reserva"), r.get("hora_inicial"))
            if not when:
                continue
            k_before = phone_key(r.get("cliente_telefone"))
            existed = bool(k_before and k_before in phone_idx)
            cid = ensure_contact(
                conn,
                phone_idx,
                r.get("cliente_nome"),
                r.get("cliente_telefone"),
                r.get("salao_cliente_id"),
                status=contact_status,
                partial_phone_unique=partial_phone_unique,
            )
            if not cid:
                stats["skipped_no_phone"] += 1
                continue
            if existed:
                stats["matched_contacts"] += 1
            else:
                stats["created_contacts"] += 1

            service_name = svc.get(r.get("servico_id") or "", "") or f"Serviço {r.get('servico_id') or '?'}"
            pro_name = prof.get(r.get("profissional_id") or "", "") or None
            price = None
            try:
                if r.get("valor") is not None:
                    price = float(r["valor"])
            except ValueError:
                price = None
            note = f"lake:reserva:{r.get('id')}"
            batch.append(
                (
                    cid,
                    service_name[:200],
                    categorize(service_name),
                    when,
                    pro_name,
                    price,
                    note,
                )
            )

        with conn.cursor() as cur:
            cur.executemany(
                """
                insert into client_services (
                  contact_id, name, category, scheduled_at, professional_name, last_price, notes, active
                ) values (%s,%s,%s,%s,%s,%s,%s,true)
                """,
                batch,
            )
            stats["inserted_services"] = len(batch)
        conn.commit()
        print(f"inserted client_services={len(batch)}")

        print("fetching comanda daily metrics…")
        daily = fetch_comanda_daily(salao_id, days_metrics)

        with conn.cursor() as cur:
            for d in daily:
                day = d.get("day")
                if not day:
                    continue
                try:
                    revenue = float(d.get("revenue") or 0)
                    attended = int(float(d.get("attended") or 0))
                except ValueError:
                    continue
                ticket = (revenue / attended) if attended else 0
                cur.execute(
                    """
                    select count(*)::int from client_services
                    where scheduled_at is not null
                      and notes like 'lake:reserva:%%'
                      and (scheduled_at at time zone 'America/Sao_Paulo')::date = %s::date
                    """,
                    (day,),
                )
                appointments = cur.fetchone()[0]
                cur.execute(
                    """
                    insert into salon_daily_metrics as m (
                      day, revenue, appointments, attended, no_shows, cancelled,
                      new_clients, returning_clients, ticket_avg, updated_at
                    ) values (
                      %s::date, %s, %s, %s, 0, 0, 0, 0, %s, now()
                    )
                    on conflict (day) do update set
                      revenue = excluded.revenue,
                      appointments = excluded.appointments,
                      attended = excluded.attended,
                      ticket_avg = excluded.ticket_avg,
                      updated_at = now()
                    """,
                    (day, revenue, appointments, attended, ticket),
                )
                stats["metrics_days"] += 1
        conn.commit()
        print(f"metrics days upserted={stats['metrics_days']}")

    return stats


def main():
    for path in ("/tmp/avec-lake/env", "/tmp/rom-dbs/env"):
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("export "):
                        line = line[len("export ") :]
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        os.environ[k] = v.strip().strip("'").strip('"')

    only = os.environ.get("ONLY_UNIT")
    results = []

    if os.environ.get("DATABASE_URL_BRASIL") and (not only or only == "brasil"):
        results.append(import_unit("brasil", os.environ["DATABASE_URL_BRASIL"], contact_status="novo"))
    if os.environ.get("DATABASE_URL_IGUATEMI") and (not only or only == "iguatemi"):
        results.append(import_unit("iguatemi", os.environ["DATABASE_URL_IGUATEMI"], contact_status="novo"))
    if os.environ.get("DATABASE_URL_ROMSALES") and (not only or only == "romsales"):
        print("\n==== romsales (mirror brasil) ====")
        results.append(
            import_unit("brasil", os.environ["DATABASE_URL_ROMSALES"], contact_status="novo")
        )

    print("\nDONE")
    for r in results:
        print(r)


if __name__ == "__main__":
    main()
