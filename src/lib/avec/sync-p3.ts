import {
  fetchAllAvecReport,
  formatTruncationWarning,
  periodRange,
  periodRangeEndingOn,
  type AvecReportFetchResult,
  withRequiredAvecReportParams,
} from '@/lib/avec/client'
import type { SyncKpiAnchorOpts } from '@/lib/avec/sync-p1'
import {
  isP3NonReturnerRow,
  normalizeP3CurveRow,
  normalizeP3NewClientsRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP3Daily } from '@/lib/salon/p3-metrics'
import { getSql } from '@/lib/db'

type SyncStatsLike = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  p3_rows?: number
}

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Taxa de retorno local: clientes com visita nos 45 dias antes do mês da âncora
 * que também tiveram visita no mês (até o dia âncora).
 */
async function computeLocalReturnRate(anchorDay = todayIsoLocal()): Promise<number | null> {
  const sql = getSql()
  const monthStart = `${anchorDay.slice(0, 7)}-01`
  const rows = (await sql`
    with bounds as (
      select
        (${monthStart}::date - 45) as p1_start,
        ${monthStart}::date as month_start,
        ${anchorDay}::date as today
    ),
    visited_p1 as (
      select distinct cs.contact_id
      from client_services cs, bounds b
      where cs.active = true
        and cs.last_done_at is not null
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date >= b.p1_start
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date < b.month_start
    ),
    returned as (
      select distinct cs.contact_id
      from client_services cs
      join visited_p1 v on v.contact_id = cs.contact_id
      cross join bounds b
      where cs.active = true
        and cs.last_done_at is not null
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date >= b.month_start
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date <= b.today
    )
    select
      (select count(*)::int from visited_p1) as cohort,
      (select count(*)::int from returned) as returned
  `) as { cohort: number; returned: number }[]
  const cohort = Number(rows[0]?.cohort ?? 0)
  const returned = Number(rows[0]?.returned ?? 0)
  if (cohort <= 0) return null
  return Math.round((returned / cohort) * 10000) / 10000
}

function asRows(result: unknown): Record<string, unknown>[] {
  // Validate array items are objects before casting
  if (Array.isArray(result)) {
    return result.every((item) => item && typeof item === 'object') ? (result as Record<string, unknown>[]) : []
  }
  if (result && typeof result === 'object') {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows) && rows.every((item) => item && typeof item === 'object')) {
      return rows as Record<string, unknown>[]
    }
  }
  return []
}

function warnIfTruncated(
  stats: SyncStatsLike,
  reportId: string,
  result: AvecReportFetchResult,
): boolean {
  if (!result.truncated) return false
  stats.warnings = stats.warnings ?? []
  stats.warnings.push(formatTruncationWarning(reportId, result))
  return true
}

async function snapshotSafe(
  reportId: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: SyncStatsLike,
  syncRunId?: string,
) {
  try {
    await saveReportSnapshot(reportId, params, rows, syncRunId, { keepPayload: false, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings?.push(`snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function resolveId(mapper: string): string | null {
  const def = getDailyReports().find((r) => r.mapper === mapper)
  if (!def) return null
  return resolveReportId(def)
}

/**
 * P3 — sync full: 0007, 0088, 0017 → salon_p3_daily
 * Com `anchorDay`, snapshot no fim do mês (backfill Visão analítica).
 */
export async function syncP3Kpis(
  stats: SyncStatsLike,
  syncRunId?: string,
  opts?: SyncKpiAnchorOpts,
) {
  const historical = Boolean(opts?.anchorDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.anchorDay))
  const day = historical ? opts!.anchorDay! : todayIsoLocal()
  const daysBack = opts?.daysBack ?? 30
  const { inicio, fim } = historical
    ? periodRangeEndingOn(day, daysBack)
    : periodRange(daysBack, 0)
  const params = { inicio, fim, limit: 250 }
  const monthStartIso = `${day.slice(0, 7)}-01`
  const returnRateParams = {
    inicio: historical
      ? `${monthStartIso.slice(8, 10)}/${monthStartIso.slice(5, 7)}/${monthStartIso.slice(0, 4)}`
      : undefined,
    fim: historical ? fim : undefined,
    limit: 250,
  }

  let return_rate = 0
  let returnRateOk = false
  let returnRateTruncated = false
  const id0007 = resolveId('return_rate')
  if (id0007) {
    try {
      // 0007 exige inicio1/fim1/inicio2/fim2 — withRequired deriva do mês da âncora.
      const reportParams = withRequiredAvecReportParams(id0007, {
        ...(returnRateParams.inicio && returnRateParams.fim
          ? { inicio: returnRateParams.inicio, fim: returnRateParams.fim }
          : {}),
        limit: 250,
      })
      const result = await fetchAllAvecReport(id0007, reportParams)
      const rows = asRows(result)
      returnRateTruncated = warnIfTruncated(stats, id0007, result)
      await snapshotSafe(id0007, reportParams, rows, stats, syncRunId)
      if (!returnRateTruncated) {
        let sum = 0
        let n = 0
        let nonReturners = 0
        for (const row of rows) {
          const r = normalizeP3ReturnRateRow(row)
          if (r != null) {
            stats.p3_rows = (stats.p3_rows ?? 0) + 1
            sum += r
            n++
            continue
          }
          if (isP3NonReturnerRow(row)) nonReturners++
        }
        if (n > 0) {
          return_rate = Math.round((sum / n) * 10000) / 10000
          returnRateOk = true
        } else if (nonReturners > 0) {
          // Lista 0007 = sem retorno. Taxa ≈ retornaram / (retornaram + lista),
          // usando cohort local (visitas no período 1 implícito via ROM).
          const local = await computeLocalReturnRate(day)
          if (local != null) {
            return_rate = local
            returnRateOk = true
            stats.p3_rows = (stats.p3_rows ?? 0) + nonReturners
          } else {
            stats.warnings?.push(
              `P3 0007: ${nonReturners} clientes sem retorno, sem taxa explícita — retorno local indisponível`,
            )
          }
        }
      }
    } catch (e) {
      stats.errors.push(`P3 0007: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Fallback ROM se 0007 falhou/vazio
  if (!returnRateOk && !returnRateTruncated) {
    try {
      const local = await computeLocalReturnRate(day)
      if (local != null) {
        return_rate = local
        returnRateOk = true
        stats.warnings?.push('P3 return_rate: usando cálculo local (client_services)')
      }
    } catch (e) {
      stats.warnings?.push(`P3 return_rate local: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let new_clients_period = 0
  let newClientsOk = false
  const id0017 = resolveId('new_clients_period')
  if (id0017) {
    try {
      const result = await fetchAllAvecReport(id0017, params)
      const rows = asRows(result)
      const truncated = warnIfTruncated(stats, id0017, result)
      await snapshotSafe(id0017, params, rows, stats, syncRunId)
      if (!truncated) {
        for (const row of rows) {
          const c = normalizeP3NewClientsRow(row)
          if (c == null) continue
          stats.p3_rows = (stats.p3_rows ?? 0) + 1
          new_clients_period += c
        }
        // Se o relatório for lista (1 linha = 1 cliente) e contagem veio 0, usa length
        if (new_clients_period === 0 && rows.length > 0) {
          new_clients_period = rows.length
          stats.p3_rows = (stats.p3_rows ?? 0) + rows.length
        }
        newClientsOk = true
      }
    } catch (e) {
      stats.errors.push(`P3 0017: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const revenue_curve: { day: string; revenue: number }[] = []
  let revenueCurveOk = false
  const id0088 = resolveId('revenue_curve')
  if (id0088) {
    try {
      const result = await fetchAllAvecReport(id0088, params)
      const rows = asRows(result)
      const truncated = warnIfTruncated(stats, id0088, result)
      await snapshotSafe(id0088, params, rows, stats, syncRunId)
      if (!truncated) {
        const byDay = new Map<string, number>()
        for (const row of rows) {
          const p = normalizeP3CurveRow(row)
          if (!p) continue
          stats.p3_rows = (stats.p3_rows ?? 0) + 1
          byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.revenue)
        }
        for (const [d, revenue] of byDay) {
          revenue_curve.push({ day: d, revenue: Math.round(revenue) })
        }
        revenue_curve.sort((a, b) => a.day.localeCompare(b.day))
        revenueCurveOk = true
      }
    } catch (e) {
      stats.errors.push(`P3 0088: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Só escreve os campos cujo relatório teve sucesso — evita apagar dados
  // válidos do dia quando outro relatório falha parcialmente.
  const patch: {
    return_rate?: number
    new_clients_period?: number
    revenue_curve?: { day: string; revenue: number }[]
  } = {}
  if (returnRateOk) patch.return_rate = return_rate
  if (newClientsOk) patch.new_clients_period = new_clients_period
  if (revenueCurveOk) patch.revenue_curve = revenue_curve.slice(-30)

  if (Object.keys(patch).length > 0) {
    try {
      await upsertSalonP3Daily(day, patch)
    } catch (e) {
      stats.errors.push(`P3 upsert: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
