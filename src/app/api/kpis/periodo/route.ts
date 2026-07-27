import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { getLastAvecSync } from '@/lib/avec/sync'
import { kpiSourceFromSyncStatus } from '@/lib/kpi-source'

/** KPIs comerciais/operacionais do período — Visão analítica (admin). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const [data, lastSync] = await Promise.all([
      computePeriodAnalytics({ month }),
      getLastAvecSync('full').catch(() => null),
    ])
    const syncStatus = lastSync?.status ?? null
    const ageHours =
      lastSync?.created_at != null
        ? (Date.now() - new Date(lastSync.created_at).getTime()) / 3_600_000
        : null
    const stale = ageHours != null && ageHours > 24
    const syncHint = kpiSourceFromSyncStatus(stale ? 'stale' : syncStatus)

    return ok({
      ...data,
      sync: {
        status: syncStatus,
        created_at: lastSync?.created_at ?? null,
        stale,
        hint: syncHint,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
