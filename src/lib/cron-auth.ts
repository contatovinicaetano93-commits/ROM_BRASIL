import type { NextRequest } from 'next/server'

/**
 * Autenticação de cron Vercel.
 * Só aceita Bearer / x-cron-secret = CRON_SECRET.
 * NÃO confiar só em x-vercel-cron (staff logado poderia forjar o header).
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  if (req.headers.get('x-cron-secret') === secret) return true
  return false
}
