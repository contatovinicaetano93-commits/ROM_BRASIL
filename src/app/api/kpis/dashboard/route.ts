import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { monthToDateRange, computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { eachDayInclusive } from '@/lib/salon/contact-kpi-chart'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { todayIso } from '@/lib/salon/format'
import {
  getLatestSalonP1Daily,
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import {
  resolveMonthWindow,
  resolveComparableWindow,
} from '@/lib/salon/month-window'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { asJsonArray } from '@/lib/sql-json'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

function normalizeProName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Bootstrap da Visão: um lambda, queries sequenciais.
 * Evita waterfall de 4 rotas × pooler max:1 no browser.
 */
export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const monthRaw = req.nextUrl.searchParams.get('month')?.trim()
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null
    const compareRaw = req.nextUrl.searchParams.get('compare')?.trim()
    const compareMonth = compareRaw && /^\d{4}-\d{2}$/.test(compareRaw) ? compareRaw : null

    const data = await ttlGetOrSet(
      `kpis:dashboard:v4:${month ?? 'latest'}:cmp=${compareMonth ?? 'yoy'}`,
      45_000,
      async () => {
        // 1) Contact KPIs
        let kpis
        if (month) {
          const { from, to } = monthToDateRange(month)
          const days = eachDayInclusive(from, to).length
          const raw = await fetchContactKpis(Math.max(1, days), to)
          kpis = {
            ...raw,
            byDay: raw.byDay.filter((r) => r.day >= from && r.day <= to),
            window: { from, to, days },
          }
        } else {
          kpis = await fetchContactKpis(30)
        }

        // 2) TM
        const referenceDay = month ? monthToDateRange(month).to : todayIso()
        const tm = {
          ...(await fetchTmComparison(referenceDay, compareMonth)),
          note: 'Média da duração real do atendimento (início/fim no 0002) — catálogo 0223 não entra no KPI.',
        }

        // 3) Ranking profissionais
        const latest = month
          ? await getSalonP1DailyNear(monthToDateRange(month).to, { maxSkewDays: 14 })
          : await getLatestSalonP1Daily()

        let performance: {
          month: string | null
          reference_day: string | null
          compare_day: string | null
          compare_label: string | null
          compare_mtd_aligned: boolean
          professionals: Array<
            P1ProfessionalRow & {
              delta: { revenue: number; attended: number; occupancy: number | null } | null
            }
          >
        }

        if (!latest) {
          performance = {
            month,
            reference_day: null,
            compare_day: null,
            compare_label: null,
            compare_mtd_aligned: false,
            professionals: [],
          }
        } else {
          const professionalsRaw = asJsonArray<P1ProfessionalRow>(latest.professionals)
          // YoY (ou mês escolhido) — mesmo dia se MTD.
          const window = resolveMonthWindow(month ?? latest.day.slice(0, 7), latest.day)
          const prevWindow = resolveComparableWindow(window, compareMonth)
          const compare = await getSalonP1DailyNear(prevWindow.to, { maxSkewDays: 3 })
          const comparePros = asJsonArray<P1ProfessionalRow>(compare?.professionals)
          const compareByName = new Map(comparePros.map((p) => [normalizeProName(p.name), p]))

          const professionals = professionalsRaw
            .map((p) => {
              const prev = compareByName.get(normalizeProName(p.name))
              return {
                ...p,
                delta: prev
                  ? {
                      revenue: p.revenue - prev.revenue,
                      attended: p.attended - prev.attended,
                      occupancy:
                        p.occupancy != null && prev.occupancy != null
                          ? p.occupancy - prev.occupancy
                          : null,
                    }
                  : null,
              }
            })
            .sort((a, b) => b.revenue - a.revenue || compareByNamePtBr(a.name, b.name))

          performance = {
            month,
            reference_day: latest.day,
            compare_day: compare && compare.day !== latest.day ? compare.day : null,
            compare_label: prevWindow.label,
            compare_mtd_aligned: prevWindow.mtd_aligned,
            professionals,
          }
        }

        // 4) Período + sync
        const periodBase = await computePeriodAnalytics({
          month: month ?? undefined,
          compareMonth,
        })
        const sync = await loadAvecSyncMeta()
        const period = { ...periodBase, sync }

        return { kpis, tm, performance, period }
      },
    )

    return okCached(data, 45)
  } catch (e) {
    return handleError(e)
  }
}
