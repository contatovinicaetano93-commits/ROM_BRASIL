import type { NextRequest } from 'next/server'
import { getSession, isAuthEnabled, requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'

function isPreviewDeploy() {
  return process.env.VERCEL_ENV === 'preview'
}

function isDeployedEnv() {
  return isProduction() || isPreviewDeploy()
}

/**
 * Backfills admin/cron: exige CRON_SECRET ou sessão financeiro/admin.
 * Preview/produção nunca rodam anônimo; dev local sem auth segue aberto.
 */
export async function authorizeCronOrFinance(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }

  if (isDeployedEnv()) {
    if (!isAuthEnabled()) {
      return { ok: false as const, status: 401 as const, message: 'Não autorizado' }
    }
    const session = await getSession(req)
    if (session?.role === 'admin' || session?.role === 'financeiro') {
      return { ok: true as const }
    }
    return { ok: false as const, status: 401 as const, message: 'Não autorizado' }
  }

  if (!isAuthEnabled()) return { ok: true as const }
  return requireFinance(req)
}
