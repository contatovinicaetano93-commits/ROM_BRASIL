import { getSql } from '@/lib/db'

export interface P1ProfessionalRow {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  /** Fração 0–1; null quando 0126 não trouxe ocupação para o profissional. */
  occupancy: number | null
}

export interface P1ServiceRow {
  name: string
  quantity: number
  revenue: number
}

export interface P1AcquisitionRow {
  channel: string
  clients: number
}

export interface SalonP1Daily {
  day: string
  professionals: P1ProfessionalRow[]
  services: P1ServiceRow[]
  acquisition: P1AcquisitionRow[]
  reactivation_count: number
  updated_at: string
}

let p1TableReady: Promise<void> | null = null

export async function ensureSalonP1Table() {
  if (!p1TableReady) {
    p1TableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_p1_daily (
          day date primary key,
          professionals jsonb not null default '[]',
          services jsonb not null default '[]',
          acquisition jsonb not null default '[]',
          reactivation_count int not null default 0,
          updated_at timestamptz not null default now()
        )
      `
    })().catch((err) => {
      p1TableReady = null
      throw err
    })
  }
  await p1TableReady
}

export async function upsertSalonP1Daily(
  day: string,
  patch: {
    professionals?: P1ProfessionalRow[]
    services?: P1ServiceRow[]
    acquisition?: P1AcquisitionRow[]
    reactivation_count?: number
  },
) {
  await ensureSalonP1Table()
  const sql = getSql()
  const existing = (await sql`
    select * from salon_p1_daily where day = ${day}::date limit 1
  `) as SalonP1Daily[]
  const cur = existing[0]

  const professionals = patch.professionals ?? (cur?.professionals as P1ProfessionalRow[] | undefined) ?? []
  const services = patch.services ?? (cur?.services as P1ServiceRow[] | undefined) ?? []
  const acquisition = patch.acquisition ?? (cur?.acquisition as P1AcquisitionRow[] | undefined) ?? []
  const reactivation_count =
    patch.reactivation_count ?? Number(cur?.reactivation_count ?? 0)

  await sql`
    insert into salon_p1_daily (
      day, professionals, services, acquisition, reactivation_count, updated_at
    )
    values (
      ${day}::date,
      ${professionals},
      ${services},
      ${acquisition},
      ${reactivation_count},
      now()
    )
    on conflict (day) do update set
      professionals = excluded.professionals,
      services = excluded.services,
      acquisition = excluded.acquisition,
      reactivation_count = excluded.reactivation_count,
      updated_at = now()
  `
}

export async function getSalonP1Daily(day: string): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      where day = ${day}::date
      limit 1
    `) as SalonP1Daily[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

/**
 * syncP1Kpis grava um snapshot por dia, mas cada snapshot já é uma janela
 * rolante de 30 dias (não um delta diário) — então "comparação de período"
 * aqui é o snapshot mais recente vs o snapshot disponível mais próximo de N
 * dias atrás, não meses de calendário como no TM.
 *
 * `maxSkewDays`: se o dia encontrado estiver mais antigo que target−N, retorna null
 * (evita Abr herdar snapshot de Jan quando o mês não foi backfillado).
 */
export async function getSalonP1DailyNear(
  targetDay: string,
  opts?: { maxSkewDays?: number },
): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      where day <= ${targetDay}::date
      order by day desc
      limit 1
    `) as SalonP1Daily[]
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

export async function getLatestSalonP1Daily(): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      order by day desc
      limit 1
    `) as SalonP1Daily[]
    return rows[0] ?? null
  } catch {
    return null
  }
}
