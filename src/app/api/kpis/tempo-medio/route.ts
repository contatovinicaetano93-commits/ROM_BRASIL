import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { todayIso } from '@/lib/salon/format'

/**
 * TM mês/trimestre — duração real (Avec 0002 início/fim); catálogo 0223 não entra no KPI.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month')?.trim()
    const referenceDay =
      month && /^\d{4}-\d{2}$/.test(month) ? monthToDateRange(month).to : todayIso()
    const cacheKey = `kpis:tm:v1:${referenceDay}`
    const data = await ttlGetOrSet(cacheKey, 120_000, () => fetchTmComparison(referenceDay))
    return okCached(
      {
        ...data,
        note: 'Média da duração real do atendimento (início/fim no 0002) — catálogo 0223 não entra no KPI.',
      },
      60,
    )
  } catch (e) {
    return handleError(e)
  }
}
