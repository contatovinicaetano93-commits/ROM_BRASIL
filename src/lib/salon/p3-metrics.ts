import { getSql } from '@/lib/db'

export interface P3CurvePoint {
  day: string
  revenue: number
}

export interface SalonP3Daily {
  day: string
  /** null = ainda não calculado neste dia; 0 = taxa legítima de 0%. */
  return_rate: number | null
  new_clients_period: number
  revenue_curve: P3CurvePoint[]
  updated_at: string
}

export async function ensureSalonP3Table() {
  const sql = getSql()
  await sql`
    create table if not exists salon_p3_daily (
      day date primary key,
      return_rate numeric(6,4),
      new_clients_period int not null default 0,
      revenue_curve jsonb not null default '[]',
      updated_at timestamptz not null default now()
    )
  `
  // Painéis com 014 (NOT NULL DEFAULT 0): 0 legado em linha vazia vira null uma vez.
  await sql`
    do $$
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'salon_p3_daily'
          and column_name = 'return_rate'
          and is_nullable = 'NO'
      ) then
        alter table salon_p3_daily alter column return_rate drop not null;
        alter table salon_p3_daily alter column return_rate drop default;
        update salon_p3_daily
          set return_rate = null
          where return_rate = 0
            and new_clients_period = 0
            and jsonb_array_length(coalesce(revenue_curve, '[]'::jsonb)) = 0;
      end if;
    end $$
  `
}

export async function upsertSalonP3Daily(
  day: string,
  patch: {
    return_rate?: number
    new_clients_period?: number
    revenue_curve?: P3CurvePoint[]
  },
) {
  await ensureSalonP3Table()
  const sql = getSql()
  const existing = (await sql`
    select * from salon_p3_daily where day = ${day}::date limit 1
  `) as SalonP3Daily[]
  const cur = existing[0]

  const return_rate =
    patch.return_rate !== undefined
      ? patch.return_rate
      : cur?.return_rate != null
        ? Number(cur.return_rate)
        : null
  const new_clients_period = patch.new_clients_period ?? Number(cur?.new_clients_period ?? 0)
  const revenue_curve =
    patch.revenue_curve ?? (cur?.revenue_curve as P3CurvePoint[] | undefined) ?? []

  await sql`
    insert into salon_p3_daily (
      day, return_rate, new_clients_period, revenue_curve, updated_at
    )
    values (
      ${day}::date,
      ${return_rate},
      ${new_clients_period},
      ${revenue_curve},
      now()
    )
    on conflict (day) do update set
      return_rate = excluded.return_rate,
      new_clients_period = excluded.new_clients_period,
      revenue_curve = excluded.revenue_curve,
      updated_at = now()
  `
}

/**
 * Snapshot P3 útil mais recente ≤ targetDay.
 * return_rate / new_clients_period vêm da Avec (0007 / 0017) em janela rolante.
 * Se todos os snapshots estiverem vazios, cai naturalmente no mais novo.
 * return_rate null = não calculado; 0 é taxa válida e conta como útil.
 */
export async function getSalonP3DailyNear(targetDay: string): Promise<SalonP3Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        return_rate::float as return_rate,
        new_clients_period,
        revenue_curve,
        updated_at
      from salon_p3_daily
      where day <= ${targetDay}::date
      order by
        (
          return_rate is not null
          or new_clients_period > 0
          or jsonb_array_length(coalesce(revenue_curve, '[]'::jsonb)) > 0
        ) desc,
        day desc
      limit 1
    `) as SalonP3Daily[]
    return rows[0] ?? null
  } catch {
    return null
  }
}
