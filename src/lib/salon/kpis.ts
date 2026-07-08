import { getSql } from '@/lib/db'

export interface ContactKpis {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: { conversion_rate: number; total_contacts: number } | null
}

export async function fetchContactKpis(dayLimit = 30): Promise<ContactKpis> {
  const sql = getSql()
  const [byDay, byStatus, conversionRows] = await Promise.all([
    sql`select * from v_kpi_daily limit ${dayLimit}`,
    sql`select * from v_kpi_status`,
    sql`select * from v_kpi_conversion limit 1`,
  ])

  return {
    byDay: byDay as ContactKpis['byDay'],
    byStatus: byStatus as ContactKpis['byStatus'],
    conversion: (conversionRows[0] as ContactKpis['conversion']) ?? null,
  }
}
