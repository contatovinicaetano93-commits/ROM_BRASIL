import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import {
  getLatestSalonP1Daily,
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import {
  resolveMonthWindow,
  resolvePreviousComparableWindow,
} from '@/lib/salon/month-window'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { asJsonArray } from '@/lib/sql-json'

function normalizeProName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number; attended: number; occupancy: number | null } | null
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month')?.trim()
    const latest =
      month && /^\d{4}-\d{2}$/.test(month)
        ? await getSalonP1DailyNear(monthToDateRange(month).to, { maxSkewDays: 14 })
        : await getLatestSalonP1Daily()

    if (!latest) {
      return ok({
        month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
        reference_day: null,
        compare_day: null,
        compare_label: null,
        compare_mtd_aligned: false,
        professionals: [],
      })
    }

    const professionalsRaw = asJsonArray<P1ProfessionalRow>(latest.professionals)
    // MTD → mesmo dia do mês anterior; mês fechado → mês anterior cheio.
    const window = resolveMonthWindow(
      month && /^\d{4}-\d{2}$/.test(month) ? month : latest.day.slice(0, 7),
      latest.day,
    )
    const prevWindow = resolvePreviousComparableWindow(window)
    const compare = await getSalonP1DailyNear(prevWindow.to, { maxSkewDays: 3 })
    const comparePros = asJsonArray<P1ProfessionalRow>(compare?.professionals)
    const compareByName = new Map(comparePros.map((p) => [normalizeProName(p.name), p]))

    const professionals: ProfessionalWithDelta[] = professionalsRaw
      .map((p) => {
        const prev = compareByName.get(normalizeProName(p.name))
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
      .sort((a, b) => b.revenue - a.revenue || compareByNamePtBr(a.name, b.name))

    return ok({
      month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
      reference_day: latest.day,
      compare_day: compare && compare.day !== latest.day ? compare.day : null,
      compare_label: prevWindow.label,
      compare_mtd_aligned: prevWindow.mtd_aligned,
      professionals,
    })
  } catch (e) {
    return handleError(e)
  }
}
