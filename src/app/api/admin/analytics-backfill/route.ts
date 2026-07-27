import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import {
  monthsNeedingAnalyticsBackfill,
  runAnalyticsMonthBackfill,
} from '@/lib/avec/analytics-backfill'

/** P1+P2+P3 + cancelamentos do mês inteiro — pode levar alguns minutos. */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireFinance(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

function parseMonth(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!/^\d{4}-\d{2}$/.test(v)) return undefined
  return v
}

/**
 * POST — preenche Visão analítica de um mês (P1/P2/P3 + cancel/no-show).
 * Body: { month: "2026-04" }  OU  { months: ["2026-01","2026-02"] } (máx. 2 por chamada).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (!isAvecConfigured()) {
      return err('Avec não configurado (AVEC_API_TOKEN)', 503)
    }

    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }

    const single = parseMonth(body.month)
    const listRaw = Array.isArray(body.months) ? body.months : []
    const months = [
      ...(single ? [single] : []),
      ...listRaw.map(parseMonth).filter((m): m is string => Boolean(m)),
    ]
    const unique = [...new Set(months)]

    if (unique.length === 0) {
      return err('Informe month (YYYY-MM) ou months[]', 400)
    }
    if (unique.length > 2) {
      return err('Máximo 2 meses por chamada (evita timeout Avec/Vercel)', 400)
    }

    const results = []
    for (const month of unique) {
      results.push(await runAnalyticsMonthBackfill(month))
    }

    return ok({
      results,
      suggested_remaining: monthsNeedingAnalyticsBackfill().filter((m) => !unique.includes(m)),
      note: 'Repita POST com o próximo month até cobrir Jan–mês anterior.',
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    return ok({
      endpoint: '/api/admin/analytics-backfill',
      method: 'POST',
      body: {
        month: 'YYYY-MM (um mês)',
        months: 'string[] (máx. 2)',
      },
      suggested: monthsNeedingAnalyticsBackfill(),
      note: 'Preenche P1/P2/P3 no fim do mês + cancelamentos/no-shows do calendário.',
    })
  } catch (e) {
    return handleError(e)
  }
}
