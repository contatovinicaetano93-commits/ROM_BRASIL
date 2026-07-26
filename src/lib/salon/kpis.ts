import { getSql } from '@/lib/db'
import { contactKpiWindow } from '@/lib/salon/contact-kpi-chart'

export interface ContactKpis {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: { conversion_rate: number; total_contacts: number } | null
  /** Janela calendário usada em byDay (YYYY-MM-DD). */
  window: { from: string; to: string; days: number }
}

export { contactKpiWindow }

export async function fetchContactKpis(dayLimit = 30): Promise<ContactKpis> {
  const sql = getSql()
  const window = contactKpiWindow(dayLimit)
  const [byDay, byStatus, conversionRows] = await Promise.all([
    sql`
      select
        day::text as day,
        channel,
        contacts_count
      from v_kpi_daily
      where day >= ${window.from}::date
        and day <= ${window.to}::date
      order by day asc, channel asc
    `,
    sql`select * from v_kpi_status`,
    sql`select * from v_kpi_conversion limit 1` as unknown as Promise<
      NonNullable<ContactKpis['conversion']>[]
    >,
  ])

  return {
    byDay: byDay as ContactKpis['byDay'],
    byStatus: byStatus as ContactKpis['byStatus'],
    conversion: conversionRows[0] ?? null,
    window,
  }
}
