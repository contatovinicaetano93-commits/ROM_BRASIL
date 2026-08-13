import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { todayIso } from '@/lib/salon/format'

/**
 * TM mês/trimestre — 1ª vista aberta no salão → 1ª vista Pago; catálogo 0223 não entra no KPI.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month')?.trim()
    const referenceDay =
      month && /^\d{4}-\d{2}$/.test(month) ? monthToDateRange(month).to : todayIso()
    const cacheKey = `kpis:tm:v2:${referenceDay}`
    const data = await ttlGetOrSet(cacheKey, 120_000, () => fetchTmComparison(referenceDay))
    return okCached(
      {
        ...data,
        note: 'TM = 1ª vista no salão (ou após hora marcada) até o 0051 só mostrar Pago. Não fecha se ainda houver linha aberta no mesmo dia. Catálogo 0223 não entra.',
      },
      60,
    )
  } catch (e) {
    return handleError(e)
  }
}
