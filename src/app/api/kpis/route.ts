import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'

export const maxDuration = 20
import { cachedFetch } from '@/lib/cache'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { eachDayInclusive } from '@/lib/salon/contact-kpi-chart'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month')?.trim()
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const data = await cachedFetch(
        `kpis:contacts:v1:${month}`,
        async () => {
          const { from, to } = monthToDateRange(month)
          const days = eachDayInclusive(from, to).length
          const raw = await fetchContactKpis(Math.max(1, days), to)
          return {
            ...raw,
            byDay: raw.byDay.filter((r) => r.day >= from && r.day <= to),
            window: { from, to, days },
          }
        },
        45,
      )
      return ok(data)
    }

    const data = await cachedFetch('kpis:contacts:v1:30d', () => fetchContactKpis(30), 45)
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
