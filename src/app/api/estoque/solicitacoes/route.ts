import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { lookupEmployeeStockPointCode } from '@/lib/stock-point-scope'
import { listWithdrawalRequests } from '@/lib/stock-withdrawal-db'
import { isWithdrawalStatus } from '@/lib/stock-withdrawal'

/** Fila do ponto (filtrada por stock_point_code do colaborador). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const url = new URL(req.url)
    const statusRaw = url.searchParams.get('status')
    const status = isWithdrawalStatus(statusRaw) ? statusRaw : null
    const pendingAvec = url.searchParams.get('pendingAvec') === '1'
    const pointCode = await lookupEmployeeStockPointCode(auth.session.employeeId)

    const requests = await listWithdrawalRequests({
      stockPointCode: pointCode,
      status: pendingAvec ? 'retirado' : status,
      pendingAvecOnly: pendingAvec,
      limit: 200,
    })
    return ok({
      requests,
      stockPointCode: pointCode,
      scope: pointCode ? `ponto:${pointCode}` : 'todos',
    })
  } catch (e) {
    return handleError(e)
  }
}
