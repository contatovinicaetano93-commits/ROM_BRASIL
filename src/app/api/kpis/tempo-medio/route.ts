import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { todayIso } from '@/lib/salon/format'

/**
 * TM mês/trimestre — média do tempo cadastrado (Avec 0223), não duração cronometrada da visita.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month')?.trim()
    const referenceDay =
      month && /^\d{4}-\d{2}$/.test(month) ? monthToDateRange(month).to : todayIso()
    const data = await fetchTmComparison(referenceDay)
    return ok({
      ...data,
      note: 'Média do tempo cadastrado no Avec (0223) — não é duração cronometrada do atendimento.',
    })
  } catch (e) {
    return handleError(e)
  }
}
