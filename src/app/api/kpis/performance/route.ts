import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import {
  getLatestSalonP1Daily,
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { asJsonArray } from '@/lib/sql-json'

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number; attended: number; occupancy: number | null } | null
}

/**
 * Ranking P1 (0021+0126).
 * Sem `month`: snapshot mais recente.
 * Com `month=YYYY-MM`: snapshot do fim do mês (ou o mais próximo ≤ fim do mês).
 * Delta = vs snapshot ~30 dias antes.
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')?.trim()
    const latest =
      month && /^\d{4}-\d{2}$/.test(month)
        ? await getSalonP1DailyNear(monthToDateRange(month).to)
        : await getLatestSalonP1Daily()

    if (!latest) {
      return ok({
        month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
        reference_day: null,
        compare_day: null,
        professionals: [],
      })
    }

    const professionalsRaw = asJsonArray<P1ProfessionalRow>(latest.professionals)
    const compareTarget = addDays(latest.day, -30)
    const compare = await getSalonP1DailyNear(compareTarget)
    const comparePros = asJsonArray<P1ProfessionalRow>(compare?.professionals)
    const compareByName = new Map(comparePros.map((p) => [p.name, p]))

    const professionals: ProfessionalWithDelta[] = professionalsRaw
      .map((p) => {
        const prev = compareByName.get(p.name)
        return {
          ...p,
          delta: prev
            ? {
                revenue: p.revenue - prev.revenue,
                attended: p.attended - prev.attended,
                occupancy:
                  p.occupancy != null && prev.occupancy != null ? p.occupancy - prev.occupancy : null,
              }
            : null,
        }
      })
      // Ranking por faturamento (KPI); empate A–Z
      .sort((a, b) => b.revenue - a.revenue || compareByNamePtBr(a.name, b.name))

    return ok({
      month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
      reference_day: latest.day,
      compare_day: compare && compare.day !== latest.day ? compare.day : null,
      professionals,
    })
  } catch (e) {
    return handleError(e)
  }
}
