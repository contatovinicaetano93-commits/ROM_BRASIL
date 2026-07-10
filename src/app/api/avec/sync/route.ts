import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { getDeploymentContext } from '@/lib/deployment'

/** Sync Avec pode demorar (vários relatórios). */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return true
  if (await isAuthorized(req)) return true
  if (!process.env.CRON_SECRET?.trim() && !isProduction()) return true
  return false
}

function parseMode(req: NextRequest, cronFallback: AvecSyncMode = 'fast'): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

const MIN_GAP_MS = 45_000

async function executeSync(req: NextRequest, opts?: { force?: boolean; defaultMode?: AvecSyncMode }) {
  if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)

  const mode = parseMode(req, opts?.defaultMode ?? 'fast')

  // Evita sobrepor syncs quando o cron dispara a cada minuto.
  if (!opts?.force) {
    const last = await getLastAvecSync(mode)
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < MIN_GAP_MS) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode,
          last,
          schedule: mode === 'fast' ? 'intraday' : 'full',
          note: `Último sync ${mode} há ${Math.round(age / 1000)}s — aguardando janela de ${MIN_GAP_MS / 1000}s`,
        })
      }
    }
  }

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
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    // Manual / admin: default full; ?mode=fast possível
    return await executeSync(req, { force: !isCronAuthorized(req), defaultMode: 'full' })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)

    // Cron Vercel = GET → fast a cada 5 min (P1–P3 só no full manual / modo=full)
    if (isCronAuthorized(req)) {
      return await executeSync(req, { defaultMode: 'fast' })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        schedule: '*/5 * * * *',
        mode: 'fast',
        cadence: 'fast a cada 5 min — full via POST ?mode=full ou webhook',
        path: '/api/avec/sync',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
