import { getSql } from '@/lib/db'

export interface SalonDailyMetrics {
  day: string
  revenue: number
  appointments: number
  attended: number
  no_shows: number
  cancelled: number
  new_clients: number
  returning_clients: number
  ticket_avg: number | null
  updated_at: string
}

export interface SalonMetricsPatch {
  revenue?: number
  appointments?: number
  attended?: number
  no_shows?: number
  cancelled?: number
  new_clients?: number
  returning_clients?: number
  ticket_avg?: number | null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export async function getSalonMetrics(day = todayIso()): Promise<SalonDailyMetrics | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from salon_daily_metrics where day = ${day}::date limit 1
  `) as SalonDailyMetrics[]
  return rows[0] ?? null
}

export async function upsertSalonMetrics(day: string, patch: SalonMetricsPatch) {
  const sql = getSql()
  const existing = await getSalonMetrics(day)
  const revenue = patch.revenue ?? existing?.revenue ?? 0
  const appointments = patch.appointments ?? existing?.appointments ?? 0
  const attended = patch.attended ?? existing?.attended ?? 0
  const no_shows = patch.no_shows ?? existing?.no_shows ?? 0
  const cancelled = patch.cancelled ?? existing?.cancelled ?? 0
  const new_clients = patch.new_clients ?? existing?.new_clients ?? 0
  const returning_clients = patch.returning_clients ?? existing?.returning_clients ?? 0
  const ticket_avg =
    patch.ticket_avg !== undefined
      ? patch.ticket_avg
      : attended > 0
        ? revenue / attended
        : existing?.ticket_avg ?? null

  await sql`
    insert into salon_daily_metrics (
      day, revenue, appointments, attended, no_shows, cancelled,
      new_clients, returning_clients, ticket_avg, updated_at
    )
    values (
      ${day}::date, ${revenue}, ${appointments}, ${attended}, ${no_shows}, ${cancelled},
      ${new_clients}, ${returning_clients}, ${ticket_avg}, now()
    )
    on conflict (day) do update set
      revenue = excluded.revenue,
      appointments = excluded.appointments,
      attended = excluded.attended,
      no_shows = excluded.no_shows,
      cancelled = excluded.cancelled,
      new_clients = excluded.new_clients,
      returning_clients = excluded.returning_clients,
      ticket_avg = excluded.ticket_avg,
      updated_at = now()
  `
}

// Recalcula métricas do dia a partir dos dados ROM (funciona sem token Avec).
export async function recomputeSalonMetricsFromRom(day = todayIso()) {
  const sql = getSql()

  const [apptRows, attendedRows, newRows, returningRows] = await Promise.all([
    sql`
      select count(*)::int as n from client_services
      where active = true
        and scheduled_at is not null
        and date_trunc('day', scheduled_at) = ${day}::date
    `,
    sql`
      select count(*)::int as n from contacts
      where status = 'convertido'
        and date_trunc('day', last_contact_at) = ${day}::date
    `,
    sql`
      select count(*)::int as n from contacts
      where date_trunc('day', created_at) = ${day}::date
    `,
    sql`
      select count(*)::int as n from contacts
      where status = 'convertido'
        and date_trunc('day', created_at) < ${day}::date
        and date_trunc('day', last_contact_at) = ${day}::date
    `,
  ])

  const appointments = (apptRows[0] as { n: number }).n
  const attended = (attendedRows[0] as { n: number }).n
  const new_clients = (newRows[0] as { n: number }).n
  const returning_clients = (returningRows[0] as { n: number }).n

  const existing = await getSalonMetrics(day)
  const no_shows = Math.max(0, appointments - attended - (existing?.cancelled ?? 0))

  await upsertSalonMetrics(day, {
    revenue: existing?.revenue ?? 0,
    appointments,
    attended,
    no_shows: existing?.no_shows ?? no_shows,
    cancelled: existing?.cancelled ?? 0,
    new_clients,
    returning_clients,
    ticket_avg: existing?.ticket_avg ?? (attended > 0 && existing?.revenue ? existing.revenue / attended : null),
  })
}
