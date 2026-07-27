import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

/** KPIs comerciais/operacionais do período — Visão analítica (admin). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const [data, sync] = await Promise.all([
      computePeriodAnalytics({ month }),
      loadAvecSyncMeta(),
    ])

    return ok({
      ...data,
      sync,
    })
  } catch (e) {
    return handleError(e)
  }
}
