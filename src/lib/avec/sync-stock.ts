// Sync de Estoque — API-first: Avec é fonte da verdade (sem webhook, só pull/cron).
// fast: 0149 (saldo) + 0046 (alerta, já com sugestão de reposição da Avec).
// full: fast + 0044 (movimentos) + 0323 (enriquece origem) + valorização (0045/0242/0243/0142).
import { getSql } from '@/lib/db'
import { avecSiteParam } from '@/lib/brand'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'
import {
  fetchAllAvecReport,
  formatTruncationWarning,
  fmtAvecDate,
  isAvecFetchAbortError,
  periodRange,
  type AvecReportParams,
} from '@/lib/avec/client'
import {
  formatAvecErrorList,
  formatAvecUserMessage,
  hardAvecSyncWarnings,
  isAvecTokenExpiredError,
} from '@/lib/avec/messages'
import {
  normalizeStockPositionRow,
  normalizeStockAlertRow,
  normalizeStockMovementRow,
  normalizeStockPurchaseRow,
} from '@/lib/avec/normalize'
import { getStockReports, getFastStockReports, getFullStockReports } from '@/lib/avec/registry'
import { saveReportSnapshot, purgeAvecStorageBloat } from '@/lib/avec/snapshots'
import {
  upsertStockProductFromPosition,
  createStockDimCache,
  applyStockAlert,
  resolveStaleStockAlerts,
  applyStockMovement,
  enrichMovementWithPurchaseOrigin,
} from '@/lib/stock'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'

export type StockSyncMode = 'fast' | 'full'

export interface StockSyncStats {
  positions_synced: number
  alerts_active: number
  alerts_resolved: number
  movements_synced: number
  movements_skipped_duplicate: number
  purchases_enriched: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
  running?: boolean
  aborted?: boolean
}

export interface StockSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: StockSyncStats
  error: string | null
  created_at: string
}

/** Fast estoque no cron Vercel (~300s): páginas curtas + orçamento de parede. */
const STOCK_FAST_MAX_PAGES = 2
const STOCK_FAST_PAGE_LIMIT = 100
/** 200s: margem vs maxDuration 300s (upsert DB + 0046). */
const STOCK_FAST_BUDGET_MS = 200_000
/** 250s: margem vs maxDuration 300s e lock TTL 10min. */
const STOCK_FULL_BUDGET_MS = 250_000

function reportId(mapper: string): string | null {
  const def = getStockReports().find((r) => r.mapper === mapper)
  return def?.id ?? null
}

async function beginRun(kind: string, stats: StockSyncStats): Promise<StockSyncRun> {
  const sql = getSql()
  // Abort limpo de runs mortos (timeout/kill do cron) — status/error claros.
  await sql`
    update avec_sync_runs
    set
      status = 'error',
      error = coalesce(error, 'Sync estoque interrompido (timeout/kill)'),
      stats = coalesce(stats, '{}'::jsonb) || '{"running":false,"aborted":true}'::jsonb
    where kind = ${kind}
      and coalesce(stats->>'running', 'false') = 'true'
  `
  const starting = { ...stats, running: true as const }
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats)
    values (${kind}, 'partial', ${starting})
    returning *
  `) as StockSyncRun[]
  return rows[0]!
}

async function finishRun(
  id: string,
  status: StockSyncRun['status'],
  stats: StockSyncStats,
  error?: string
): Promise<StockSyncRun> {
  const sql = getSql()
  const finished = { ...stats, running: false as const }
  const rows = (await sql`
    update avec_sync_runs
    set status = ${status}, stats = ${finished}, error = ${error ?? null}
    where id = ${id}::uuid
    returning *
  `) as StockSyncRun[]
  return rows[0]!
}

export async function getLastStockSync(
  kind: 'stock_fast' | 'stock_full',
  opts?: { finishedOnly?: boolean },
): Promise<StockSyncRun | null> {
  const sql = getSql()
  const finishedOnly = opts?.finishedOnly === true
  const rows = finishedOnly
    ? ((await sql`
        select * from avec_sync_runs
        where kind = ${kind}
          and coalesce(stats->>'running', 'false') <> 'true'
        order by created_at desc
        limit 1
      `) as StockSyncRun[])
    : ((await sql`
        select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
      `) as StockSyncRun[])
  return rows[0] ?? null
}

async function snapshotSafe(
  id: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: StockSyncStats,
  syncRunId: string,
  keepPayload = false
) {
  try {
    await saveReportSnapshot(id, params, rows, syncRunId, { keepPayload, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings.push(`snapshot ${id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPositions(
  stats: StockSyncStats,
  syncRunId: string,
  opts: {
    maxPages: number
    pageLimit: number
    deadlineAt: number | null
    /** Fast com teto baixo: truncamento é esperado, não vira warning. */
    expectTruncation?: boolean
    skipSnapshot?: boolean
  },
) {
  const id = reportId('stock_position')
  if (!id) return
  if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
    stats.warnings.push('0149: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const params = {
    inicio: fmtAvecDate(new Date()),
    marca: '',
    linha: '',
    local: '',
    categoria: '',
    limit: opts.pageLimit,
    site: avecSiteParam(),
  }
  try {
    const result = await fetchAllAvecReport(id, params, opts.maxPages, {
      deadlineAt: opts.deadlineAt,
    })
    if (result.truncated && !opts.expectTruncation) {
      stats.warnings.push(formatTruncationWarning(id, result))
    }
    if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0149: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    if (
      opts.expectTruncation &&
      result.truncated &&
      result.rows.length > 0 &&
      opts.deadlineAt != null &&
      Date.now() >= opts.deadlineAt
    ) {
      // Truncamento por deadline no fetch — não é erro; segue com o batch parcial.
      stats.aborted = true
      stats.warnings.push(
        `0149: fetch parcial (${result.pagesFetched} pág., ${result.rows.length} linhas) — abort limpo`,
      )
    }
    if (!opts.skipSnapshot) {
      await snapshotSafe(id, params, result.rows, stats, syncRunId)
    }

    const dimCache = createStockDimCache()
    let parsedCount = 0
    for (const row of result.rows) {
      if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0149: orçamento esgotado após ${stats.positions_synced} posições (abort limpo)`,
        )
        break
      }
      const pos = normalizeStockPositionRow(row)
      if (!pos) continue
      parsedCount++
      await upsertStockProductFromPosition(pos, {
        dimCache,
        skipPreviousQty: true,
      })
      stats.positions_synced++
    }
    if (result.rows.length > 5 && parsedCount < result.rows.length * 0.5) {
      stats.warnings.push(
        `0149: só ${parsedCount}/${result.rows.length} linhas reconhecidas — possível mudança no formato do relatório`
      )
    }
  } catch (e) {
    if (isAvecFetchAbortError(e)) {
      stats.aborted = true
      stats.warnings.push(
        `0149: timeout/abort limpo — ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }
    stats.errors.push(`0149 (posição): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncAlerts(
  stats: StockSyncStats,
  syncRunId: string,
  opts: {
    maxPages: number
    pageLimit: number
    deadlineAt: number | null
    expectTruncation?: boolean
    skipSnapshot?: boolean
  },
) {
  const id = reportId('stock_alert')
  if (!id) return
  if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
    stats.warnings.push('0046: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const params = { site: avecSiteParam(), limit: opts.pageLimit }
  try {
    const result = await fetchAllAvecReport(id, params, opts.maxPages, {
      deadlineAt: opts.deadlineAt,
    })
    if (result.truncated && !opts.expectTruncation) {
      stats.warnings.push(formatTruncationWarning(id, result))
    }
    if (!opts.skipSnapshot) {
      await snapshotSafe(id, params, result.rows, stats, syncRunId)
    }

    const seenAvecProductIds: string[] = []
    let active = 0
    for (const row of result.rows) {
      if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0046: orçamento esgotado após ${active} alertas (abort limpo)`,
        )
        break
      }
      const alert = normalizeStockAlertRow(row)
      if (!alert) continue
      const applied = await applyStockAlert(alert)
      if (!applied) continue
      seenAvecProductIds.push(applied.avecProductId)
      active++
    }
    stats.alerts_active = active
    if (result.truncated) {
      stats.warnings.push(
        '0046: truncado — alertas stale NÃO resolvidos (evita limpar alertas das páginas omitidas)',
      )
    } else if (active > 0 || result.rows.length === 0) {
      stats.alerts_resolved = await resolveStaleStockAlerts(seenAvecProductIds)
    }
  } catch (e) {
    if (isAvecFetchAbortError(e)) {
      stats.aborted = true
      stats.warnings.push(
        `0046: timeout/abort limpo — ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }
    stats.errors.push(`0046 (alertas): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncMovements(stats: StockSyncStats, syncRunId: string, deadlineAt: number | null) {
  const id = reportId('stock_movement')
  if (!id) return
  if (deadlineAt != null && Date.now() >= deadlineAt) {
    stats.warnings.push('0044: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  // Janela com sobreposição (3 dias) — reprocessar não duplica (fingerprint
  // Avec em applyStockMovement).
  const { inicio, fim } = periodRange(3, 0)
  const params = { inicio, fim, site: avecSiteParam(), limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params, undefined, { deadlineAt })
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0044: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      if (deadlineAt != null && Date.now() >= deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0044: orçamento esgotado após ${stats.movements_synced} movimentos (abort limpo)`,
        )
        break
      }
      const mv = normalizeStockMovementRow(row)
      if (!mv) continue
      const inserted = await applyStockMovement(mv, 'avec_0044')
      if (inserted) stats.movements_synced++
      else stats.movements_skipped_duplicate++
    }
  } catch (e) {
    stats.errors.push(`0044 (movimentos): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPurchaseOrigin(stats: StockSyncStats, syncRunId: string, deadlineAt: number | null) {
  const id = reportId('stock_purchase')
  if (!id) return
  if (deadlineAt != null && Date.now() >= deadlineAt) {
    stats.warnings.push('0323: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const { inicio, fim } = periodRange(3, 0)
  const params = { inicio, fim, site: avecSiteParam(), limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params, undefined, { deadlineAt })
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0323: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      if (deadlineAt != null && Date.now() >= deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0323: orçamento esgotado após ${stats.purchases_enriched} compras (abort limpo)`,
        )
        break
      }
      const purchase = normalizeStockPurchaseRow(row)
      if (!purchase) continue
      const enriched = await enrichMovementWithPurchaseOrigin(purchase)
      if (enriched) stats.purchases_enriched++
    }
  } catch (e) {
    stats.errors.push(`0323 (origem compra): ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Valorização (0045/0242/0243/0142) — só snapshot bruto; normalização acontece na leitura (stock.ts). */
async function syncValuation(stats: StockSyncStats, syncRunId: string, deadlineAt: number | null) {
  const site = avecSiteParam()
  const jobs: { mapper: string; params: AvecReportParams }[] = [
    { mapper: 'stock_valuation_total', params: { tipo_produto: 'Todos', site, limit: 250 } },
    { mapper: 'stock_valuation_category', params: { site, limit: 250 } },
    { mapper: 'stock_valuation_brand', params: { site, limit: 250 } },
    { mapper: 'stock_valuation_category_pct', params: { ...periodRange(30, 0), site, limit: 250 } },
  ]
  for (const job of jobs) {
    const id = reportId(job.mapper)
    if (!id) continue
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      stats.warnings.push(`${id}: pulado — orçamento de tempo esgotado`)
      stats.aborted = true
      return
    }
    try {
      const result = await fetchAllAvecReport(id, job.params, undefined, { deadlineAt })
      if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
      if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
        stats.aborted = true
        stats.warnings.push(`${id}: orçamento esgotado durante fetch (abort limpo)`)
        return
      }
      await snapshotSafe(id, job.params, result.rows, stats, syncRunId, true)
    } catch (e) {
      stats.errors.push(`${id} (valorização): ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function emptyStats(): StockSyncStats {
  return {
    positions_synced: 0,
    alerts_active: 0,
    alerts_resolved: 0,
    movements_synced: 0,
    movements_skipped_duplicate: 0,
    purchases_enriched: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
  }
}

/**
 * full é um superset de fast (mesmo padrão de runAvecSync): sempre sincroniza
 * saldo+alerta; só busca movimentos/compras/valorização em full — evita gap
 * de saldo desatualizado entre os dois modos.
 */
export async function runStockSync(mode: StockSyncMode = 'fast'): Promise<StockSyncRun> {
  return withSyncLock(SYNC_LOCK_KEYS.stock, () => runStockSyncUnlocked(mode), {
    ttlMs: 10 * 60 * 1000,
    owner: `stock-${mode}`,
  })
}

async function runStockSyncUnlocked(mode: StockSyncMode): Promise<StockSyncRun> {
  const kind = mode === 'full' ? 'stock_full' : 'stock_fast'
  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {
    // fetchAvecReport ainda force-refresh no 401
  })
  const stats = emptyStats()
  const run = await beginRun(kind, stats)
  const deadlineAt =
    Date.now() + (mode === 'fast' ? STOCK_FAST_BUDGET_MS : STOCK_FULL_BUDGET_MS)
  const pageOpts = {
    maxPages: mode === 'fast' ? STOCK_FAST_MAX_PAGES : 40,
    pageLimit: mode === 'fast' ? STOCK_FAST_PAGE_LIMIT : 250,
    deadlineAt,
    expectTruncation: mode === 'fast',
    skipSnapshot: mode === 'fast',
  }

  try {
    // Alertas (0046) antes de 0149 — posição é pesada e não pode matar o ciclo antes. (paridade IG)
    await syncAlerts(stats, run.id, pageOpts)
    await syncPositions(stats, run.id, pageOpts)

    if (mode === 'full') {
      await syncMovements(stats, run.id, deadlineAt)
      await syncPurchaseOrigin(stats, run.id, deadlineAt)
      await syncValuation(stats, run.id, deadlineAt)
      try {
        await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 2 })
      } catch {
        /* ignore */
      }
    }

    stats.errors = formatAvecErrorList(stats.errors)

    const hardWarnings = hardAvecSyncWarnings(stats.warnings)
    const hadAnyData = stats.positions_synced > 0 || stats.movements_synced > 0
    const status: StockSyncRun['status'] =
      stats.errors.length > 0 && !hadAnyData
        ? 'error'
        : stats.errors.length > 0 || hardWarnings.length > 0 || stats.aborted
          ? 'partial'
          : 'ok'

    const authErr = stats.errors.find((e) => isAvecTokenExpiredError(e))
    const abortMsg = stats.aborted
      ? (stats.warnings.find((w) => /orçamento|abort|timeout/i.test(w)) ??
        'Sync estoque abortado por orçamento de tempo (evita timeout/kill)')
      : null
    // Abort limpo com dados parciais: partial + warning, sem error (Cérebro/Diagnóstico).
    const topError =
      status === 'error'
        ? (authErr ?? formatAvecUserMessage(stats.errors[0]) ?? stats.errors[0] ?? undefined)
        : (authErr ??
          (stats.aborted && !hadAnyData ? abortMsg : undefined) ??
          undefined)

    return await finishRun(run.id, status, stats, topError)
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = formatAvecUserMessage(raw) ?? raw
    stats.errors.push(msg)
    return await finishRun(run.id, 'error', stats, msg)
  }
}

/** Usado pela UI de onboarding/observabilidade — quais relatórios de estoque existem em cada camada. */
export function describeStockSyncPlan() {
  return {
    fast: getFastStockReports().map((r) => ({ id: r.id, name: r.name })),
    full: getFullStockReports().map((r) => ({ id: r.id, name: r.name })),
  }
}
