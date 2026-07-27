import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { todayIso } from '@/lib/salon/format'

/**
 * TM mês/trimestre.
 * Sem `month`: ancora em hoje.
 * Com `month=YYYY-MM`: ancora no fim do mês (ou hoje, se mês corrente).
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')?.trim()
    const referenceDay =
      month && /^\d{4}-\d{2}$/.test(month) ? monthToDateRange(month).to : todayIso()
    const data = await fetchTmComparison(referenceDay)
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
