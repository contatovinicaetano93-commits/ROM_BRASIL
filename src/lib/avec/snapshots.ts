import { getSql } from '@/lib/db'

/** Amostra no payload — evita encher o Postgres com dumps de 50k+ linhas a cada sync. */
export const MAX_SNAPSHOT_PAYLOAD_ROWS = 200

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string,
  opts?: { keepFullPayload?: boolean }
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  // KPIs de estoque somam o payload inteiro — não amostrar nesses relatórios.
  const sample = opts?.keepFullPayload ? rows : rows.slice(0, MAX_SNAPSHOT_PAYLOAD_ROWS)
  await sql`
    insert into avec_report_snapshots (report_id, params, row_count, payload, sync_run_id)
    values (
      ${reportId},
      ${params},
      ${rows.length},
      ${sample},
      ${syncRunId ?? null}
    )
  `
}

/** Limpa snapshots e runs antigos — chamado no sync full (ritmo leve). */
export async function pruneAvecSyncHistory(opts?: {
  snapshotDays?: number
  runDays?: number
}): Promise<{ snapshots_deleted: number; runs_deleted: number }> {
  const snapshotDays = opts?.snapshotDays ?? 14
  const runDays = opts?.runDays ?? 30
  const sql = getSql()
  const snap = (await sql`
    with d as (
      delete from avec_report_snapshots
      where fetched_at < now() - (${snapshotDays}::int * interval '1 day')
         or (report_id = '0223' and row_count > ${MAX_SNAPSHOT_PAYLOAD_ROWS * 2})
      returning 1
    )
    select count(*)::int as n from d
  `) as { n: number }[]
  const runs = (await sql`
    with d as (
      delete from avec_sync_runs
      where created_at < now() - (${runDays}::int * interval '1 day')
      returning 1
    )
    select count(*)::int as n from d
  `) as { n: number }[]
  return {
    snapshots_deleted: Number(snap[0]?.n ?? 0),
    runs_deleted: Number(runs[0]?.n ?? 0),
  }
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
