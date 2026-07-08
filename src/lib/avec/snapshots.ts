import { getSql } from '@/lib/db'

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  await sql`
    insert into avec_report_snapshots (report_id, params, row_count, payload, sync_run_id)
    values (
      ${reportId},
      ${JSON.stringify(params)}::jsonb,
      ${rows.length},
      ${JSON.stringify(rows)}::jsonb,
      ${syncRunId ?? null}
    )
  `
}

export async function getLatestSnapshot(reportId: string) {
  const sql = getSql()
  const rows = (await sql`
    select * from avec_report_snapshots
    where report_id = ${reportId}
    order by fetched_at desc
    limit 1
  `) as { report_id: string; payload: unknown; fetched_at: string; row_count: number }[]
  return rows[0] ?? null
}
