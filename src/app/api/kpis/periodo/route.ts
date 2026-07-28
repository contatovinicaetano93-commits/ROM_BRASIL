import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

/** KPIs comerciais/operacionais do período — Visão analítica (admin). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const payload = await cachedFetch(
      `kpis:periodo:v1:${month ?? 'cur'}`,
      async () => {
        const data = await computePeriodAnalytics({ month })
        const sync = await loadAvecSyncMeta()
        return { ...data, sync }
      },
      45,
    )

    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
