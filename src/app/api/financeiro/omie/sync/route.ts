import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { normalizeMonthKey } from '@/lib/finance'
import {
  isOmieConfigured,
  isOmieMock,
  OMIE_CNPJ_KINDS,
  type OmieCnpjKind,
} from '@/lib/omie/client'
import {
  syncOmieExpensesForMonth,
  syncOmieExpensesRecent,
  syncOmieExpensesYearToDate,
} from '@/lib/omie/sync'
import { isSyncLockBusyError } from '@/lib/sync-lock'

export const maxDuration = 300

function parseOmieKind(raw: string | null | undefined): OmieCnpjKind | null | undefined {
  if (raw == null || raw === '') return undefined
  if ((OMIE_CNPJ_KINDS as string[]).includes(raw)) return raw as OmieCnpjKind
  return null
}

async function execute(opts: {
  cron: boolean
  monthParam: string | null
  scope: 'ytd' | 'month' | null
  kind?: OmieCnpjKind
}) {
  if (!isOmieConfigured() && !isOmieMock()) {
    if (opts.cron) {
      return ok({ skipped: true, reason: 'aguardando_omie_credentials' })
    }
    return err(
      'Omie não configurado (OMIE_SERVICOS_APP_KEY/SECRET e OMIE_COMERCIO_APP_KEY/SECRET)',
      503,
    )
  }

  try {
    // Mês explícito: um mês (opcionalmente 1 CNPJ). Senão YTD — MoM fidedigno no ano.
    if (opts.monthParam && opts.scope !== 'ytd') {
      const month = normalizeMonthKey(opts.monthParam)
      if (!month) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
      const run = await syncOmieExpensesForMonth(
        month,
        opts.kind ? { kind: opts.kind } : undefined,
      )
      return ok(run)
    }

    if (opts.cron) {
      const result = await syncOmieExpensesRecent()
      return ok(result)
    }

    const result = await syncOmieExpensesYearToDate()
    return ok(result)
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Outro sync Omie já está em execução (lock distribuído)',
      })
    }
    throw e
  }
}

/** Vercel Cron — Authorization: Bearer CRON_SECRET. Sync Omie YTD (jan→mês corrente). */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) return err('Não autorizado', 401)
    const scopeRaw = req.nextUrl.searchParams.get('scope')
    const scope = scopeRaw === 'ytd' ? 'ytd' : scopeRaw === 'month' ? 'month' : null
    const kind = parseOmieKind(req.nextUrl.searchParams.get('kind'))
    if (kind === null) return err('Parâmetro kind inválido (servicos|comercio)', 422)
    return await execute({
      cron: true,
      monthParam: req.nextUrl.searchParams.get('month'),
      scope,
      kind,
    })
  } catch (e) {
    return handleError(e)
  }
}

/** Trigger manual — admin / financeiro. Body/query: { month?, scope?, kind? }. */
export async function POST(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)
    if (!cron) {
      const auth = await requireFinance(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const queryMonth = req.nextUrl.searchParams.get('month')
    const queryScope = req.nextUrl.searchParams.get('scope')
    const queryKind = req.nextUrl.searchParams.get('kind')
    const body = (await req.json().catch(() => ({}))) as {
      month?: string
      scope?: string
      kind?: string
    }
    const scopeRaw = queryScope ?? body.scope ?? null
    const scope = scopeRaw === 'ytd' ? 'ytd' : scopeRaw === 'month' ? 'month' : null
    const kind = parseOmieKind(queryKind ?? body.kind)
    if (kind === null) return err('Parâmetro kind inválido (servicos|comercio)', 422)
    return await execute({
      cron,
      monthParam: queryMonth ?? body.month ?? null,
      scope,
      kind,
    })
  } catch (e) {
    return handleError(e)
  }
}
