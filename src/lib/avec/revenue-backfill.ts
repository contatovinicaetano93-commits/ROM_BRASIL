/**
 * Backfill receita (0088) + formas de pagamento (0081) para um intervalo de dias.
 * Preenche salon_daily_metrics / salon_p2_daily fora da janela curta do sync (~7d),
 * para o Financeiro comparar meses anteriores sem zerar.
 */
import { fetchAllAvecReport } from '@/lib/avec/client'
import { normalizeRevenueRow } from '@/lib/avec/normalize'
import { getDailyReports, resolveReportId } from '@/lib/avec/registry'
import { syncPaymentMixRecent } from '@/lib/avec/sync-p2'
import { avecSiteParam } from '@/lib/brand'
import { materializeSalonMonthMetrics, monthKeyFromDay } from '@/lib/salon/month-metrics'
import { getSalonMetrics, upsertSalonMetrics } from '@/lib/salon/metrics'

export type RevenueBackfillDay = { day: string; revenue: number; attended: number }

export type RevenueBackfillResult = {
  from: string
  to: string
  next_from: string | null
  done: boolean
  report_id: string
  days: RevenueBackfillDay[]
  days_with_revenue: number
  sum_revenue: number
  revenue_errors: string[]
  payment_errors: string[]
  payment_snapshots: number
  months_materialized: string[]
}

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addCalendarDays(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + delta)).toISOString().slice(0, 10)
}

function isoToBr(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-')
  return `${d}/${m}/${y}`
}

function listDaysInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let cur = fromIso
  while (cur <= toIso) {
    out.push(cur)
    cur = addCalendarDays(cur, 1)
  }
  return out
}

/** 1º dia do ano civil (America/Sao_Paulo) relativo a `today`. */
export function yearStartOf(todayYmd = todayIsoLocal()) {
  return `${todayYmd.slice(0, 4)}-01-01`
}

export function resolveRevenueReportId(): string {
  const def = getDailyReports().find((r) => r.mapper === 'revenue')
  return (def && resolveReportId(def)) || '0088'
}

function uniqueMonths(from: string, to: string): string[] {
  const months = new Set<string>()
  for (const day of listDaysInclusive(from, to)) {
    months.add(monthKeyFromDay(day))
  }
  return [...months]
}

async function backfillRevenueDays(from: string, to: string) {
  const days = listDaysInclusive(from, to)
  const summary: RevenueBackfillDay[] = []
  const errors: string[] = []
  const reportId = resolveRevenueReportId()

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchAllAvecReport(reportId, params)
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])

      let revenue = 0
      let attended = 0
      for (const row of rows as Record<string, unknown>[]) {
        const rev = normalizeRevenueRow(row)
        if (!rev) continue
        if (!rev.day || rev.day === day) {
          revenue += rev.revenue
          attended += rev.attended
        }
      }

      const attendedInt = Math.round(attended)
      const revenueRounded = Math.round(revenue * 100) / 100
      // Sempre grava a linha do dia (mesmo 0) — senão Relatórios marca INCOMPLETO.
      // Mas não zera métricas já gravadas se o payload veio vazio/ilegível.
      if (revenueRounded === 0 && attendedInt === 0) {
        const existing = await getSalonMetrics(day)
        if (existing && (Number(existing.revenue) > 0 || Number(existing.attended) > 0)) {
          summary.push({
            day,
            revenue: Number(existing.revenue),
            attended: Number(existing.attended),
          })
          continue
        }
      }
      await upsertSalonMetrics(day, {
        revenue: revenueRounded,
        attended: attendedInt,
        ticket_avg: attendedInt > 0 ? Math.round((revenue / attendedInt) * 100) / 100 : null,
      })
      summary.push({ day, revenue: revenueRounded, attended: attendedInt })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${day}: ${msg}`)
    }
  }

  return { summary, errors, reportId }
}

export type RunRevenueBackfillOptions = {
  from?: string
  to?: string
  /** Limite de dias por chamada (API serverless). Default: sem limite. */
  maxDays?: number
  includePaymentMix?: boolean
  materializeMonths?: boolean
}

/**
 * Puxa 0088 (+ opcional 0081) para o intervalo.
 * Default: 1º de janeiro do ano corrente → hoje (SP).
 * Com `maxDays`, processa um chunk e devolve `next_from` para continuar.
 */
export async function runRevenueBackfill(
  opts: RunRevenueBackfillOptions = {},
): Promise<RevenueBackfillResult> {
  const today = todayIsoLocal()
  const rangeFrom = opts.from?.trim() || yearStartOf(today)
  const rangeTo = opts.to?.trim() || today
  if (rangeTo < rangeFrom) {
    throw new Error(`TO (${rangeTo}) < FROM (${rangeFrom})`)
  }

  const allDays = listDaysInclusive(rangeFrom, rangeTo)
  const maxDays =
    opts.maxDays != null && Number.isFinite(opts.maxDays) && opts.maxDays > 0
      ? Math.floor(opts.maxDays)
      : allDays.length
  const chunkDays = allDays.slice(0, maxDays)
  const from = chunkDays[0]!
  const to = chunkDays[chunkDays.length - 1]!
  const nextFrom =
    chunkDays.length < allDays.length ? addCalendarDays(to, 1) : null

  const revenue = await backfillRevenueDays(from, to)

  const payStats = {
    snapshots_saved: 0,
    errors: [] as string[],
    warnings: [] as string[],
    p2_rows: 0,
  }
  if (opts.includePaymentMix !== false) {
    await syncPaymentMixRecent(payStats, undefined, 0, { from, to })
  }

  const monthsMaterialized: string[] = []
  if (opts.materializeMonths !== false) {
    for (const month of uniqueMonths(from, to)) {
      try {
        await materializeSalonMonthMetrics(month)
        monthsMaterialized.push(month)
      } catch {
        // materialização é best-effort; métricas diárias já estão no banco
      }
    }
  }

  const withRev = revenue.summary.filter((r) => r.revenue > 0)
  return {
    from,
    to,
    next_from: nextFrom,
    done: nextFrom == null,
    report_id: revenue.reportId,
    days: revenue.summary,
    days_with_revenue: withRev.length,
    sum_revenue: Math.round(withRev.reduce((a, b) => a + b.revenue, 0) * 100) / 100,
    revenue_errors: revenue.errors.slice(0, 24),
    payment_errors: payStats.errors.slice(0, 24),
    payment_snapshots: payStats.snapshots_saved,
    months_materialized: monthsMaterialized,
  }
}
