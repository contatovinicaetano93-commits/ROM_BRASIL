import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { computeMonthOverview } from '@/lib/salon/month-overview'
import { buildMonthOverviewCsv } from '@/lib/salon/month-overview-export'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

/** Overview do mês — fechamento ROM (admin + financeiro). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
    }

    const format = req.nextUrl.searchParams.get('format')
    // Default: só leitura ao vivo. Materializar só com ?materialize=1 (botão Atualizar).
    const materialize = req.nextUrl.searchParams.get('materialize') === '1'

    const payload = await cachedFetch(
      `relatorios:overview:v2:${month ?? 'cur'}:mat=${materialize ? 1 : 0}`,
      async () => {
        const overview = await computeMonthOverview({ month, materialize })
        const sync = await loadAvecSyncMeta()
        return { ...overview, sync }
      },
      materialize ? 5 : 60,
    )

    if (format === 'csv') {
      const csv = buildMonthOverviewCsv(payload)
      const filename = `overview_${payload.month}_${payload.panel}.csv`
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
