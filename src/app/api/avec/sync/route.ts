import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync } from '@/lib/avec/sync'

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev local sem segredo
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

// POST /api/avec/sync — sync manual ou via Vercel Cron (Authorization: Bearer CRON_SECRET)
export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) return err('Não autorizado', 401)
    if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_URL + AVEC_API_TOKEN)', 503)

    const run = await runAvecSync()
    return ok(run)
  } catch (e) {
    return handleError(e)
  }
}

// GET /api/avec/sync — status da última sincronização
export async function GET() {
  try {
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      last,
    })
  } catch (e) {
    return handleError(e)
  }
}
