import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { lookupEmployeeStockPointCode } from '@/lib/stock-point-scope'
import { transitionWithdrawalRequest } from '@/lib/stock-withdrawal-db'
import { isWithdrawalStatus } from '@/lib/stock-withdrawal'

/** Avança status da solicitação (fila do ponto). */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await context.params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

    const toStatus = body.status
    if (!isWithdrawalStatus(toStatus)) return err('Status inválido', 400)

    const pointCode = await lookupEmployeeStockPointCode(auth.session.employeeId)
    const avecRef = typeof body.avecRef === 'string' ? body.avecRef : null

    const request = await transitionWithdrawalRequest({
      id,
      toStatus,
      actorName: auth.session.displayName || auth.session.user,
      actorStockPointCode: pointCode,
      avecRef,
    })
    return ok({ request })
  } catch (e) {
    if (e instanceof Error) return err(e.message, 400)
    return handleError(e)
  }
}
