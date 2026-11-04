import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getSql } from '@/lib/db'
import { hasPanelModule } from '@/lib/intranet/modules'
import { listRomLocations } from '@/lib/stock-points-db'

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

/** Catálogo leve: pisos + produtos (sem exigir módulo estoque completo). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSolicitacaoAccess(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const locations = (await listRomLocations()).filter((l) => l.rom_kind === 'piso')
    const sql = getSql()
    const products = (await sql`
      select id, name, sku
      from stock_products
      order by lower(name)
      limit 500
    `) as Array<{ id: string; name: string; sku: string | null }>

    return ok({
      locations,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
      })),
    })
  } catch (e) {
    return handleError(e)
  }
}
