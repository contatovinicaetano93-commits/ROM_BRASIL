import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { computeStockKpis } from '@/lib/stock'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const kpis = await cachedFetch('stock:kpis:v1', () => computeStockKpis(), 60)
    return ok(kpis)
  } catch (e) {
    return handleError(e)
  }
}
