import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

/** KPIs comerciais/operacionais do período — Visão analítica (admin). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const payload = await ttlGetOrSet(`kpis:periodo:v1:${month ?? 'cur'}`, 60_000, async () => {
      const data = await computePeriodAnalytics({ month })
      const sync = await loadAvecSyncMeta()
      return { ...data, sync }
    })

    return okCached(payload, 45)
  } catch (e) {
    return handleError(e)
  }
}
