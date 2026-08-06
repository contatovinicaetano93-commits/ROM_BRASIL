import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { authorizeCronOrFinance } from '@/lib/admin-backfill-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { runRevenueBackfill, yearStartOf } from '@/lib/avec/revenue-backfill'

/** Backfill pode cobrir dezenas de dias (Avec 0088 + 0081). */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  return authorizeCronOrFinance(req)
}

function parseIsoDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  return v
}

/**
 * POST — puxa receita/atendidos (0088) + payment_mix (0081) para o banco.
 * Default: 1º jan do ano → hoje, em chunks de 31 dias (continue com `next_from`).
 *
 * Body opcional: { from, to, maxDays, includePaymentMix }
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

    const from = parseIsoDay(body.from)
    const to = parseIsoDay(body.to)
    const maxDaysRaw = body.maxDays
    const maxDays =
      typeof maxDaysRaw === 'number' && Number.isFinite(maxDaysRaw)
        ? Math.floor(maxDaysRaw)
        : typeof maxDaysRaw === 'string' && maxDaysRaw.trim()
          ? Math.floor(Number(maxDaysRaw))
          : 31

    if (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 62) {
      return err('maxDays deve ser entre 1 e 62', 400)
    }

    const result = await runRevenueBackfill({
      from,
      to,
      maxDays,
      includePaymentMix: body.includePaymentMix !== false,
      materializeMonths: body.materializeMonths !== false,
    })

    return ok({
      ...result,
      note: result.done
        ? 'Backfill completo para o intervalo solicitado.'
        : `Chunk ok até ${result.to}. Chame de novo com from=${result.next_from} para continuar.`,
      default_year_start: yearStartOf(),
    })
  } catch (e) {
    return handleError(e)
  }
}

/** GET — documentação rápida do endpoint. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    return ok({
      endpoint: '/api/admin/revenue-backfill',
      method: 'POST',
      default: {
        from: yearStartOf(),
        to: 'hoje (America/Sao_Paulo)',
        maxDays: 31,
      },
      body: {
        from: 'YYYY-MM-DD opcional',
        to: 'YYYY-MM-DD opcional',
        maxDays: '1–62 (default 31)',
        includePaymentMix: 'boolean (default true)',
      },
      note: 'Repita POST com from=next_from até done=true para cobrir o ano inteiro.',
    })
  } catch (e) {
    return handleError(e)
  }
}
