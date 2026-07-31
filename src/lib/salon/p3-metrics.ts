import { getSql } from '@/lib/db'

export interface P3CurvePoint {
  day: string
  revenue: number
}

export interface SalonP3Daily {
  day: string
  return_rate: number
  new_clients_period: number
  revenue_curve: P3CurvePoint[]
  updated_at: string
}

let p3TableReady: Promise<void> | null = null

export async function ensureSalonP3Table() {
  if (!p3TableReady) {
    p3TableReady = (async () => {
      const sql = getSql()
      const exists = (await sql`
        select to_regclass('public.salon_p3_daily') is not null as ok
      `) as { ok: boolean }[]
      if (exists[0]?.ok) return

      await sql`
        create table if not exists salon_p3_daily (
          day date primary key,
          return_rate numeric(6,4) not null default 0,
          new_clients_period int not null default 0,
          revenue_curve jsonb not null default '[]',
          updated_at timestamptz not null default now()
        )
      `
    })().catch((err) => {
      p3TableReady = null
      throw err
    })
  }
  await p3TableReady
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

  const return_rate = patch.return_rate ?? Number(cur?.return_rate ?? 0)
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
 * Snapshot P3 mais recente ≤ targetDay.
 * return_rate / new_clients_period vêm da Avec (0007 / 0017) em janela rolante.
 */
export async function getSalonP3DailyNear(
  targetDay: string,
  opts?: { maxSkewDays?: number },
): Promise<SalonP3Daily | null> {
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
      order by day desc
      limit 1
    `) as SalonP3Daily[]
    const row = rows[0] ?? null
    if (!row || opts?.maxSkewDays == null) return row
    const minDay = addDaysIso(targetDay, -Math.max(0, Math.floor(opts.maxSkewDays)))
    return row.day >= minDay ? row : null
  } catch {
    return null
  }
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Corrige jsonb legado gravado como string (JSON.stringify + postgres.js). */
export async function repairSalonP3JsonbEncoding(): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    update salon_p3_daily set
      revenue_curve = case
        when jsonb_typeof(revenue_curve) = 'string' then (revenue_curve #>> '{}')::jsonb
        else revenue_curve
      end
    where jsonb_typeof(revenue_curve) = 'string'
    returning day
  `) as { day: string }[]
  return rows.length
}
