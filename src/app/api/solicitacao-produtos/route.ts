import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule } from '@/lib/intranet/modules'
import {
  createWithdrawalRequest,
  listWithdrawalRequests,
} from '@/lib/stock-withdrawal-db'
import { isWithdrawalStatus } from '@/lib/stock-withdrawal'

async function requireSolicitacaoAccess(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return auth
  const { role, modules } = auth.session
  if (
    hasPanelModule(role, modules, 'solicitacao_produtos') ||
    hasPanelModule(role, modules, 'estoque')
  ) {
    return auth
  }
  return {
    ok: false as const,
    status: 403 as const,
    message: 'Acesso restrito à solicitação de produtos',
  }
}

/** GET — lista próprios pedidos (profissional) ou todos se tiver estoque. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSolicitacaoAccess(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const url = new URL(req.url)
    const mine = url.searchParams.get('mine') === '1'
    const statusRaw = url.searchParams.get('status')
    const status = isWithdrawalStatus(statusRaw) ? statusRaw : null
    const hasEstoque = hasPanelModule(auth.session.role, auth.session.modules, 'estoque')

    const rows = await listWithdrawalRequests({
      requestedByEmployeeId: mine || !hasEstoque ? auth.session.employeeId : null,
      status,
      limit: 100,
    })
    return ok({ requests: rows })
  } catch (e) {
    return handleError(e)
  }
}

/** POST — cria pedido de retirada no piso. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSolicitacaoAccess(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

    const productId = typeof body.productId === 'string' ? body.productId : ''
    const locationId = typeof body.locationId === 'string' ? body.locationId : ''
    const quantity = typeof body.quantity === 'number' ? body.quantity : Number(body.quantity)
    const unitLabel = typeof body.unitLabel === 'string' ? body.unitLabel : null
    const note = typeof body.note === 'string' ? body.note : null

    const row = await createWithdrawalRequest({
      create: { productId, locationId, quantity, unitLabel, note },
      requestedByEmployeeId: auth.session.employeeId,
      requestedByName: auth.session.displayName || auth.session.user,
      professionalName: auth.session.professionalName,
    })
    return ok({ request: row }, undefined, 201)
  } catch (e) {
    if (e instanceof Error) return err(e.message, 400)
    return handleError(e)
  }
}
