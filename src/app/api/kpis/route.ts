import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { eachDayInclusive } from '@/lib/salon/contact-kpi-chart'

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')?.trim()
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { from, to } = monthToDateRange(month)
      const days = eachDayInclusive(from, to).length
      const data = await fetchContactKpis(Math.max(1, days), to)
      // Garante alinhamento ao calendário do mês (janela âncora em `to`).
      return ok({
        ...data,
        byDay: data.byDay.filter((r) => r.day >= from && r.day <= to),
        window: { from, to, days },
      })
    }

    const data = await fetchContactKpis(30)
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
