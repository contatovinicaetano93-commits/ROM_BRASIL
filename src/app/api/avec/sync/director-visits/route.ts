import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
import {
  isDirectorVisitQuarterKey,
  syncDirectorVisits,
} from '@/lib/avec/sync-director-visits'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { authorizeAvecSync } from '@/lib/avec/sync-http'
import { getDeploymentContext } from '@/lib/deployment'
import {
  isVisitCoverageReady,
  listVisitCoverage,
  probe0011FromDb,
} from '@/lib/director-report/from-db'
import { previousQuarterKey } from '@/lib/director-report/local-0011'
import { currentQuarterKeySp } from '@/lib/director-report/period'
import type { QuarterKey } from '@/lib/director-report/types'

/**
 * Sync só das visitas 0002 → salon_client_visits (Relatório gerência offline).
 * Este é proxy de última visita 0002 para o 0011, não 0011 event-level da Avec.
 * Separado do full/agenda para não depender do min-gap nem do budget das outras etapas.
 *
 * Query: `?status=1` só cobertura · `?quarter=2026-Q2` um trimestre · `?force=1` refaz.
 */
export const maxDuration = 800

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
    director_visits_upserted: 0,
  }
}

function parseQuarterParam(req: NextRequest): QuarterKey[] | undefined {
  const raw = req.nextUrl.searchParams.get('quarter')
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const bad = parts.find((p) => !isDirectorVisitQuarterKey(p))
  if (bad) throw Object.assign(new Error(`Trimestre inválido: ${bad}`), { status: 400 })
  return parts as QuarterKey[]
}

function default0011CoverageStatus(coverage: Awaited<ReturnType<typeof listVisitCoverage>>['coverage']) {
  const current = currentQuarterKeySp()
  const selected = previousQuarterKey(current)
  const compare = previousQuarterKey(selected)
  const quarters = [...new Set([
    selected,
    previousQuarterKey(selected),
    compare,
    previousQuarterKey(compare),
  ])]
  const byQuarter = new Map(coverage.map((c) => [c.period_key, c]))
  const missing = quarters.filter((q) => !isVisitCoverageReady(byQuarter.get(q)))
  const lastSyncedAt = coverage
    .map((c) => c.synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  return {
    ready_for_default_0011: missing.length === 0,
    default_0011_quarters: quarters,
    default_0011_missing: missing,
    last_synced_at: lastSyncedAt,
  }
}

/** GET — cron/admin: sincroniza visitas. `?status=1` só consulta cobertura. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (req.nextUrl.searchParams.get('status') === '1') {
      // Status leve: não pode competir com sync longo / pool esgotado.
      const status = await Promise.race([
        listVisitCoverage(),
        new Promise<Awaited<ReturnType<typeof listVisitCoverage>>>((resolve) => {
          setTimeout(() => resolve({ coverage: [], visit_rows: -1 }), 12_000)
        }),
      ])
      const timedOut = status.visit_rows < 0
      const coverage = timedOut ? [] : status.coverage
      const defaultStatus = default0011CoverageStatus(coverage)
      const probe =
        !timedOut &&
        (req.nextUrl.searchParams.get('probe_0011') === '1' ||
          req.nextUrl.searchParams.get('probe_0011') === 'true')
      let report_probe: Awaited<ReturnType<typeof probe0011FromDb>> | null = null
      if (probe) {
        const selectedRaw = req.nextUrl.searchParams.get('selected')
        const selected: QuarterKey =
          selectedRaw && isDirectorVisitQuarterKey(selectedRaw)
            ? selectedRaw
            : previousQuarterKey(currentQuarterKeySp())
        const compareRaw = req.nextUrl.searchParams.get('compare')
        const compare: QuarterKey =
          compareRaw && isDirectorVisitQuarterKey(compareRaw)
            ? compareRaw
            : previousQuarterKey(selected)
        report_probe = await Promise.race([
          probe0011FromDb(selected, compare),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
        ])
      }
      return ok({
        coverage,
        visit_rows: timedOut ? 0 : status.visit_rows,
        ...defaultStatus,
        // ready = default 0011 utilizável (não “qualquer trimestre ok”).
        ready: defaultStatus.ready_for_default_0011,
        report_probe,
        timed_out: timedOut || undefined,
        note: timedOut
          ? 'Status parcial — banco ocupado/timeout curto. Tente de novo em alguns segundos.'
          : probe
            ? 'Cobertura + probe do proxy última visita 0002 (Na lista / taxas).'
            : 'Cobertura do proxy última visita 0002 para Relatório gerência. POST ou GET sem status=1 para sincronizar. Use probe_0011=1 para totais.',
      })
    }

    return await runSync(req)
  } catch (e) {
    return handleError(e)
  }
}

/** POST — força sync das visitas do Relatório gerência. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await runSync(req)
  } catch (e) {
    return handleError(e)
  }
}

async function runSync(req: NextRequest) {
  if (!isAvecConfigured()) {
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  let quarters: QuarterKey[] | undefined
  try {
    quarters = parseQuarterParam(req)
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 400
    return err(e instanceof Error ? e.message : 'Trimestre inválido', status)
  }

  const force =
    req.nextUrl.searchParams.get('force') === '1' ||
    req.nextUrl.searchParams.get('force') === 'true'

  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {})

  const stats = emptyStats()
  await syncDirectorVisits(stats, undefined, { quarters, force })
  const status = await listVisitCoverage()

  const okRun = stats.errors.length === 0
  return ok({
    ran: true,
    status: okRun ? (stats.warnings.some((w) => /truncado/i.test(w)) ? 'partial' : 'ok') : 'error',
    director_visits_upserted: stats.director_visits_upserted ?? 0,
    quarters: quarters ?? null,
    force,
    warnings: stats.warnings,
    errors: stats.errors,
    coverage: status.coverage,
    visit_rows: status.visit_rows,
    note: 'Relatório gerência usa este warehouse como proxy última visita 0002 quando a cobertura dos trimestres necessários não está truncada.',
  })
}
