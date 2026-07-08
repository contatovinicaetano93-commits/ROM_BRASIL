import { NextRequest } from 'next/server'
import { ok } from '@/lib/api-response'
import { getAdminUser, isAuthEnabled, isAuthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const enabled = isAuthEnabled()
  const authenticated = enabled ? await isAuthorized(req) : false
  return ok({
    auth_enabled: enabled,
    authenticated,
    user: authenticated ? getAdminUser() : null,
  })
}
