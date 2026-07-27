/**
 * Backfill da Visão analítica: snapshots P1/P2/P3 no fim do mês +
 * cancelamentos/no-shows do calendário do mês.
 * (O revenue-backfill só cobre receita/atendidos/payment_mix — não os KPIs comerciais.)
 */
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'
import {
  syncCancellationsRange,
  syncNoShows0248Range,
  type AvecSyncStats,
} from '@/lib/avec/sync'
import { todayIso } from '@/lib/salon/format'
import { getDeploymentContext } from '@/lib/deployment'
import { monthToDateRange } from '@/lib/salon/period-analytics'

export type AnalyticsBackfillResult = {
  month: string
  anchor_day: string
  from: string
  to: string
  p1_rows: number
  p2_rows: number
  p3_rows: number
  cancellation_rows: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
}

function emptyStats(): AvecSyncStats {
  const deployment = getDeploymentContext()
  return {
    panel: deployment.panel,
    deployment_host: deployment.host,
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
    p1_rows: 0,
    p2_rows: 0,
    p3_rows: 0,
  }
}

function parseMonthKey(month: string): string | null {
  const m = month.trim()
  if (!/^\d{4}-\d{2}$/.test(m)) return null
  const mm = Number(m.slice(5))
  if (mm < 1 || mm > 12) return null
  return m
}

/** Lista YYYY-MM de Jan até o mês anterior ao corrente (ou até `throughMonth`). */
export function monthsNeedingAnalyticsBackfill(opts?: {
  year?: number
  throughMonth?: string
  referenceDay?: string
}): string[] {
  const ref = opts?.referenceDay ?? todayIso()
  const year = opts?.year ?? Number(ref.slice(0, 4))
  const through =
    opts?.throughMonth && parseMonthKey(opts.throughMonth)
      ? opts.throughMonth
      : (() => {
          const [y, m] = ref.split('-').map(Number)
          const prev = m === 1 ? { y: y! - 1, m: 12 } : { y: y!, m: m! - 1 }
          return `${prev.y}-${String(prev.m).padStart(2, '0')}`
        })()

  const out: string[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > through) break
    if (key.startsWith(String(year))) out.push(key)
  }
  return out
}

/**
 * Preenche um mês fechado da Visão analítica:
 * - P1/P2/P3 com âncora = último dia do mês (janela Avec ~30d)
 * - cancelamentos dia a dia + no-shows 0248 no calendário do mês
 */
export async function runAnalyticsMonthBackfill(month: string): Promise<AnalyticsBackfillResult> {
  const monthKey = parseMonthKey(month)
  if (!monthKey) {
    throw new Error(`Mês inválido: ${month} (use YYYY-MM)`)
  }

  const { from, to } = monthToDateRange(monthKey)
  const stats = emptyStats()
  const opts = { anchorDay: to, daysBack: 30 }

  await syncP1Kpis(stats, undefined, opts)
  await syncP2Kpis(stats, undefined, opts)
  await syncP3Kpis(stats, undefined, opts)
  await syncCancellationsRange(from, to, stats)
  await syncNoShows0248Range(from, to, stats)

  return {
    month: monthKey,
    anchor_day: to,
    from,
    to,
    p1_rows: stats.p1_rows ?? 0,
    p2_rows: stats.p2_rows ?? 0,
    p3_rows: stats.p3_rows ?? 0,
    cancellation_rows: stats.cancellation_rows,
    snapshots_saved: stats.snapshots_saved,
    errors: stats.errors,
    warnings: stats.warnings,
  }
}
