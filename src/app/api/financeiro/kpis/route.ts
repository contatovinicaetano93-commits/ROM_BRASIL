import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { computeFinanceKpis } from '@/lib/finance'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const kpis = await computeFinanceKpis()
    return ok(kpis)
  } catch (e) {
    return handleError(e)
  }
}
