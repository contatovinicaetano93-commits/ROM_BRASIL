import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import { getHealthStatus, getPublicHealthStatus } from '@/lib/health'
import { isAuthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    if (await isAuthorized(req)) return ok(await getHealthStatus())
    return ok(await getPublicHealthStatus())
  } catch (e) {
    return handleError(e)
  }
}
