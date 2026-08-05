import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { getLastAvecSync } from '@/lib/avec/sync'
import { getDeploymentContext } from '@/lib/deployment'
import {
  authorizeAvecSync,
  executeAvecSync,
  parseAvecSyncMode,
} from '@/lib/avec/sync-http'

/** Sync Avec pode demorar (vários relatórios). Pro permite até 800s. */
export const maxDuration = 800

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    const webhook = req.headers.get('x-rom-sync-reason') === 'webhook'
    return await executeAvecSync(req, {
      force: !auth.cron,
      defaultMode: 'full',
      cron: auth.cron,
      webhook,
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (auth.cron) {
      return await executeAvecSync(req, {
        defaultMode: parseAvecSyncMode(req, 'fast'),
        cron: true,
      })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        fast: { schedule: '5,25,45 * * * *', mode: 'fast', path: '/api/avec/sync' },
        full: {
          schedule: 'ops/agenda/catalog 2×/dia (10h/22h UTC)',
          mode: 'full',
          path: '/api/avec/sync/full/{ops,agenda,catalog}',
          note: 'min-gap 5h ok / 45m partial·error; catalog dump 0004 + 20h gap; /full monolítico só admin',
        },
        purge: {
          schedule: '10 7 * * *',
          path: '/api/avec/purge-snapshots',
          note: '04:10 America/Sao_Paulo — mantém 1 snapshot/report + limpa payloads legados',
        },
        cadence:
          'fast a cada 20 min · ops/agenda/catalog 2×/dia · director-visits 2×/dia · purge diário — webhook só fast',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
