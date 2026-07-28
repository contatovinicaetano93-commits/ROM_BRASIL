import { getLastAvecSync } from '@/lib/avec/sync'
import { kpiSourceFromSyncStatus } from '@/lib/kpi-source'

export type AvecSyncMeta = {
  status: string | null
  created_at: string | null
  stale: boolean
  hint: string | null
  /** Último fast (caixa/Hoje). */
  fast_created_at: string | null
  fast_stale: boolean
}

/**
 * Metadados de sync para banners em Visão/Financeiro/Relatórios.
 * Full >24h OU fast >1h → stale (caixa pode estar velho mesmo com full ok).
 */
export async function loadAvecSyncMeta(): Promise<AvecSyncMeta> {
  const [full, fast] = await Promise.all([
    getLastAvecSync('full', { finishedOnly: true }).catch(() => null),
    getLastAvecSync('fast', { finishedOnly: true }).catch(() => null),
  ])

  const fullAgeHours =
    full?.created_at != null
      ? (Date.now() - new Date(full.created_at).getTime()) / 3_600_000
      : null
  const fastAgeHours =
    fast?.created_at != null
      ? (Date.now() - new Date(fast.created_at).getTime()) / 3_600_000
      : null

  const fullStale = fullAgeHours != null && fullAgeHours > 24
  const fastStale = fastAgeHours != null && fastAgeHours > 1
  const stale = fullStale || fastStale

  // Prefer the more recent finished run so a failed/partial fast is not hidden by an older full ok.
  const latest =
    full && fast
      ? new Date(fast.created_at).getTime() >= new Date(full.created_at).getTime()
        ? fast
        : full
      : (full ?? fast)
  const syncStatus = latest?.status ?? null
  const created_at = latest?.created_at ?? null

  return {
    status: syncStatus,
    created_at,
    stale,
    hint: kpiSourceFromSyncStatus(stale ? 'stale' : syncStatus),
    fast_created_at: fast?.created_at ?? null,
    fast_stale: fastStale,
  }
}
