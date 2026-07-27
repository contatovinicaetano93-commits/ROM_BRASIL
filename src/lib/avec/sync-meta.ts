import { getLastAvecSync } from '@/lib/avec/sync'
import { kpiSourceFromSyncStatus } from '@/lib/kpi-source'

export type AvecSyncMeta = {
  status: string | null
  created_at: string | null
  stale: boolean
  hint: string | null
}

/** Metadados do último sync Avec full — banners de staleness em Visão/Financeiro/Relatórios. */
export async function loadAvecSyncMeta(): Promise<AvecSyncMeta> {
  const lastSync = await getLastAvecSync('full').catch(() => null)
  const syncStatus = lastSync?.status ?? null
  const ageHours =
    lastSync?.created_at != null
      ? (Date.now() - new Date(lastSync.created_at).getTime()) / 3_600_000
      : null
  const stale = ageHours != null && ageHours > 24
  return {
    status: syncStatus,
    created_at: lastSync?.created_at ?? null,
    stale,
    hint: kpiSourceFromSyncStatus(stale ? 'stale' : syncStatus),
  }
}
