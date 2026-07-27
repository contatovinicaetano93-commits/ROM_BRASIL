import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { requireAdmin, isAuthEnabled } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { getDeploymentContext } from '@/lib/deployment'
import { isSyncLockBusyError } from '@/lib/sync-lock'

/** Sync Avec pode demorar (vários relatórios). */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const, cron: true as const }
  const admin = await requireAdmin(req)
  if (admin.ok) return { ok: true as const, cron: false as const }
  // Dev sem senha: permite status/sync local.
  if (!isProduction() && !isAuthEnabled()) {
    return { ok: true as const, cron: false as const }
  }
  return { ok: false as const, status: admin.status, message: admin.message }
}

function parseMode(req: NextRequest, cronFallback: AvecSyncMode = 'fast'): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

/** Espaçamento mínimo mesmo se o cron Vercel for reconfigurado à força. */
const FAST_MIN_GAP_MS = 12 * 60_000
const FULL_MIN_GAP_MS = 5 * 60 * 60_000

async function executeSync(
  req: NextRequest,
  opts?: { force?: boolean; defaultMode?: AvecSyncMode; cron?: boolean },
) {
  const mode = parseMode(req, opts?.defaultMode ?? 'fast')

  if (!isAvecConfigured()) {
    if (opts?.cron) {
      return ok({
        skipped: true,
        reason: 'aguardando_avec_token',
        mode,
        note: 'AVEC_API_TOKEN ausente — cron ignorado até terça',
      })
    }
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  const minGap = mode === 'full' ? FULL_MIN_GAP_MS : FAST_MIN_GAP_MS

  if (!opts?.force) {
    const last = await getLastAvecSync(mode)
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < minGap) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode,
          last,
          schedule: mode === 'fast' ? 'intraday' : 'full',
          note: `Último sync ${mode} há ${Math.round(age / 1000)}s — aguardando janela de ${minGap / 1000}s`,
        })
      }
    }
  }

  try {
    const run = await runAvecSync(mode)
    return ok({
      ...run,
      skipped: false,
      mode,
      schedule: mode === 'fast' ? 'intraday' : 'full',
      note:
        mode === 'fast'
          ? 'Sync fast — agenda/caixa do dia (sem P1–P3)'
          : 'Sync full — catálogo + P1/P2/P3',
    })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        mode,
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Outro sync Avec já está em execução (lock distribuído)',
      })
    }
    throw e
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await executeSync(req, { force: !auth.cron, defaultMode: 'full', cron: auth.cron })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (auth.cron) {
      return await executeSync(req, { defaultMode: parseMode(req, 'fast'), cron: true })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        fast: { schedule: '*/15 * * * *', mode: 'fast', path: '/api/avec/sync' },
        full: { schedule: '20 10,22 * * *', mode: 'full', path: '/api/avec/sync?mode=full' },
        cadence:
          'fast a cada 15 min · full 2×/dia (UTC 10:20 e 22:20 ≈ 07:20/19:20 BRT) — tempo real via webhook',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
