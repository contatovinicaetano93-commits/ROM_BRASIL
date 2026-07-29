import { getSql } from '@/lib/db'

/** Amostra no payload — evita encher o Postgres com dumps de 50k+ linhas a cada sync. */
export const MAX_SNAPSHOT_PAYLOAD_ROWS = 200

/** Relatórios de valorização de estoque — UI lê o payload completo (stock.ts). Demais: só metadados. */
export const SNAPSHOT_PAYLOAD_REPORT_IDS = new Set(['0045', '0242', '0243', '0142'])

export type SaveReportSnapshotOptions = {
  /** Se false/omitido, amostra até MAX_SNAPSHOT_PAYLOAD_ROWS linhas. */
  keepPayload?: boolean
  /** Quantos snapshots recentes manter por report_id após o insert (default 1). */
  retain?: number
}

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string,
  opts?: SaveReportSnapshotOptions | { keepFullPayload?: boolean }
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  // Suporte legacy: keepFullPayload ou keepPayload
  const legacyFull = (opts as { keepFullPayload?: boolean })?.keepFullPayload
  const keepPayload =
    (opts as SaveReportSnapshotOptions)?.keepPayload ??
    legacyFull ??
    SNAPSHOT_PAYLOAD_REPORT_IDS.has(reportId)
  const sample = keepPayload ? rows : rows.slice(0, MAX_SNAPSHOT_PAYLOAD_ROWS)
  const retain = Math.max(1, (opts as SaveReportSnapshotOptions)?.retain ?? 1)

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

  // Mantém só N mais recentes — impede crescimento ilimitado com cron.
  await sql`
    delete from avec_report_snapshots
    where id in (
      select id from (
        select id,
               row_number() over (order by fetched_at desc) as rn
        from avec_report_snapshots
        where report_id = ${reportId}
      ) ranked
      where rn > ${retain}
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

export type PurgeSnapshotsResult = {
  snapshots_deleted: number
  sync_runs_deleted: number
  payloads_cleared: number
}

/**
 * Recupera espaço no Postgres: DELETE primeiro (não UPDATE) — sob size-limit o UPDATE
 * de jsonb enorme precisa de espaço livre e falha com "could not extend file".
 * Depois zera payloads legados remanescentes e limpa sync runs velhos.
 */
export async function purgeAvecStorageBloat(opts?: {
  keepSnapshotDays?: number
  keepSyncRunDays?: number
}): Promise<PurgeSnapshotsResult> {
  const sql = getSql()
  const keepSnapshotDays = Math.max(0, opts?.keepSnapshotDays ?? 0)
  const keepSyncRunDays = Math.max(1, opts?.keepSyncRunDays ?? 2)

  // 1) DELETE primeiro — libera linhas sem reescrever jsonb gigante.
  let snapshotsDeleted = 0
  if (keepSnapshotDays <= 0) {
    const deleted = (await sql`
      delete from avec_report_snapshots
      where id not in (
        select distinct on (report_id) id
        from avec_report_snapshots
        order by report_id, fetched_at desc
      )
      returning id
    `) as { id: string }[]
    snapshotsDeleted = deleted.length
  } else {
    const cutoff = new Date(Date.now() - keepSnapshotDays * 86_400_000).toISOString()
    const deleted = (await sql`
      delete from avec_report_snapshots
      where fetched_at < ${cutoff}::timestamptz
      returning id
    `) as { id: string }[]
    snapshotsDeleted = deleted.length
  }

  // 2) Zera payloads remanescentes (não-valorização) — após DELETE, bem menor.
  const cleared = (await sql`
    update avec_report_snapshots
    set payload = '[]'::jsonb
    where payload is not null
      and payload <> '[]'::jsonb
      and report_id not in ('0045', '0242', '0243', '0142')
    returning id
  `) as { id: string }[]

  const runsCutoff = new Date(Date.now() - keepSyncRunDays * 86_400_000).toISOString()
  const runs = (await sql`
    delete from avec_sync_runs
    where created_at < ${runsCutoff}::timestamptz
    returning id
  `) as { id: string }[]

  return {
    snapshots_deleted: snapshotsDeleted,
    sync_runs_deleted: runs.length,
    payloads_cleared: cleared.length,
  }
}
