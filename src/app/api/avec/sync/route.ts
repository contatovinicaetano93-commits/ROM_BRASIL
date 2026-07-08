import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { isProduction } from '@/lib/env'

async function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret) return true
  }

  if (await isAuthorized(req)) return true

  if (!secret && !isProduction()) return true

  return false
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)

    const run = await runAvecSync()
    return ok(run)
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
