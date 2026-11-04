import 'server-only'

import { getSql, type Sql } from '@/lib/db'
import { listRomLocations } from '@/lib/stock-points-db'
import type { StockPointCode } from '@/lib/stock-point-scope'
import {
  assertTransitionOk,
  validateCreateWithdrawal,
  type CreateWithdrawalInput,
  type WithdrawalStatus,
  isWithdrawalStatus,
} from '@/lib/stock-withdrawal'

export type WithdrawalRequestRow = {
  id: string
  product_id: string
  product_name: string
  location_id: string
  location_name: string
  location_rom_code: string | null
  quantity: number
  unit_label: string | null
  note: string | null
  status: WithdrawalStatus
  requested_by_employee_id: string | null
  requested_by_name: string
  professional_name: string | null
  prepared_by_name: string | null
  delivered_by_name: string | null
  avec_bailed_at: string | null
  avec_ref: string | null
  requested_at: string
  prepared_at: string | null
  ready_at: string | null
  withdrawn_at: string | null
  cancelled_at: string | null
  updated_at: string
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /stock_withdrawal_requests|does not exist|relation/i.test(msg)
}

function mapRow(row: Record<string, unknown>): WithdrawalRequestRow {
  const status = isWithdrawalStatus(row.status) ? row.status : 'solicitado'
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    product_name: String(row.product_name ?? ''),
    location_id: String(row.location_id),
    location_name: String(row.location_name ?? ''),
    location_rom_code:
      typeof row.location_rom_code === 'string' ? row.location_rom_code : null,
    quantity: Number(row.quantity) || 0,
    unit_label: typeof row.unit_label === 'string' ? row.unit_label : null,
    note: typeof row.note === 'string' ? row.note : null,
    status,
    requested_by_employee_id:
      typeof row.requested_by_employee_id === 'string' ? row.requested_by_employee_id : null,
    requested_by_name: String(row.requested_by_name ?? ''),
    professional_name:
      typeof row.professional_name === 'string' ? row.professional_name : null,
    prepared_by_name: typeof row.prepared_by_name === 'string' ? row.prepared_by_name : null,
    delivered_by_name:
      typeof row.delivered_by_name === 'string' ? row.delivered_by_name : null,
    avec_bailed_at: row.avec_bailed_at ? String(row.avec_bailed_at) : null,
    avec_ref: typeof row.avec_ref === 'string' ? row.avec_ref : null,
    requested_at: String(row.requested_at ?? ''),
    prepared_at: row.prepared_at ? String(row.prepared_at) : null,
    ready_at: row.ready_at ? String(row.ready_at) : null,
    withdrawn_at: row.withdrawn_at ? String(row.withdrawn_at) : null,
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : null,
    updated_at: String(row.updated_at ?? ''),
  }
}

const SELECT_JOIN = `
  select r.*,
    p.name as product_name,
    l.name as location_name,
    l.rom_code as location_rom_code
  from stock_withdrawal_requests r
  join stock_products p on p.id = r.product_id
  join stock_locations l on l.id = r.location_id
`

export async function createWithdrawalRequest(input: {
  create: CreateWithdrawalInput
  requestedByEmployeeId: string | null
  requestedByName: string
  professionalName?: string | null
}): Promise<WithdrawalRequestRow> {
  const err = validateCreateWithdrawal(input.create)
  if (err) throw new Error(err)

  const locations = await listRomLocations()
  const loc = locations.find((l) => l.id === input.create.locationId)
  if (!loc) throw new Error('Ponto de retirada inválido')
  if (loc.rom_kind !== 'piso') {
    throw new Error('Retirada só nos pisos P1, P2 ou P3 — Almox é distribuição, não retirada')
  }

  const sql = getSql()
  const products = (await sql`
    select id from stock_products where id = ${input.create.productId}::uuid limit 1
  `) as { id: string }[]
  if (!products[0]) throw new Error('Produto não encontrado')

  const qty = Math.round(Number(input.create.quantity) * 1000) / 1000
  const unit =
    typeof input.create.unitLabel === 'string' && input.create.unitLabel.trim()
      ? input.create.unitLabel.trim()
      : null
  const note =
    typeof input.create.note === 'string' && input.create.note.trim()
      ? input.create.note.trim()
      : null
  const proName =
    (typeof input.professionalName === 'string' && input.professionalName.trim()
      ? input.professionalName.trim()
      : null) ||
    (typeof input.create.professionalName === 'string' && input.create.professionalName.trim()
      ? input.create.professionalName.trim()
      : null)

  try {
    const inserted = (await sql`
      insert into stock_withdrawal_requests (
        product_id, location_id, quantity, unit_label, note,
        requested_by_employee_id, requested_by_name, professional_name
      ) values (
        ${input.create.productId}::uuid,
        ${input.create.locationId}::uuid,
        ${qty},
        ${unit},
        ${note},
        ${input.requestedByEmployeeId},
        ${input.requestedByName.trim() || '—'},
        ${proName}
      )
      returning id
    `) as { id: string }[]
    const id = inserted[0]?.id
    if (!id) throw new Error('Falha ao criar solicitação')
    const rows = (await sql.query(`${SELECT_JOIN} where r.id = $1::uuid`, [id])) as Array<
      Record<string, unknown>
    >
    return mapRow(rows[0]!)
  } catch (error) {
    if (isMissingRelation(error)) {
      throw new Error(
        'Schema de solicitação ainda não aplicado neste banco. Rode as migrations (048_estoque_solicitacao).',
      )
    }
    throw error
  }
}

export async function listWithdrawalRequests(filter: {
  /** Filtra pela fila do ponto (rom_code). null = todos. */
  stockPointCode?: StockPointCode | null
  locationId?: string | null
  status?: WithdrawalStatus | null
  requestedByEmployeeId?: string | null
  pendingAvecOnly?: boolean
  limit?: number
}): Promise<WithdrawalRequestRow[]> {
  const sql = getSql()
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  try {
    const clauses: string[] = []
    const params: unknown[] = []
    let i = 1

    if (filter.stockPointCode) {
      clauses.push(`l.rom_code = $${i++}`)
      params.push(filter.stockPointCode)
    }
    if (filter.locationId) {
      clauses.push(`r.location_id = $${i++}::uuid`)
      params.push(filter.locationId)
    }
    if (filter.status) {
      clauses.push(`r.status = $${i++}`)
      params.push(filter.status)
    }
    if (filter.requestedByEmployeeId) {
      clauses.push(`r.requested_by_employee_id = $${i++}::uuid`)
      params.push(filter.requestedByEmployeeId)
    }
    if (filter.pendingAvecOnly) {
      clauses.push(`r.status = 'retirado'`)
    }

    const where = clauses.length ? `where ${clauses.join(' and ')}` : ''
    params.push(limit)
    const q = `${SELECT_JOIN} ${where} order by r.requested_at desc limit $${i}`
    const rows = (await sql.query(q, params)) as Array<Record<string, unknown>>
    return rows.map(mapRow)
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

/**
 * Débito do piso e status `retirado` na mesma transação.
 * O pedido fica travado (`for update`) e o update só casa `status = 'pronto'`,
 * então retry ou dois operadores não subtraem o saldo duas vezes.
 */
async function confirmRetirado(sql: Sql, input: { id: string; actor: string }): Promise<void> {
  await sql.transaction(async (txn) => {
    const locked = (await txn`
      select status, product_id, location_id, quantity::float as quantity
      from stock_withdrawal_requests
      where id = ${input.id}::uuid
      for update
    `) as { status: string; product_id: string; location_id: string; quantity: number }[]
    const row = locked[0]
    if (!row) throw new Error('Solicitação não encontrada')
    const status = isWithdrawalStatus(row.status) ? row.status : 'solicitado'
    const transitionErr = assertTransitionOk(status, 'retirado')
    if (transitionErr) throw new Error(transitionErr)

    const debited = (await txn`
      update stock_point_balances b
      set qty = b.qty - r.quantity,
          updated_at = now()
      from stock_withdrawal_requests r
      where r.id = ${input.id}::uuid
        and r.status = 'pronto'
        and b.product_id = r.product_id
        and b.location_id = r.location_id
        and b.qty >= r.quantity
      returning b.qty::float as qty
    `) as { qty: number }[]
    if (!debited[0]) {
      const have = (await txn`
        select qty::float as qty
        from stock_point_balances
        where product_id = ${row.product_id}::uuid
          and location_id = ${row.location_id}::uuid
        limit 1
      `) as { qty: number }[]
      const fromQty = Number(have[0]?.qty ?? 0)
      const quantity = Number(row.quantity)
      throw new Error(
        `Saldo insuficiente no ponto (tem ${fromQty}, pedido ${quantity}). Reponha antes de confirmar a retirada.`,
      )
    }

    const marked = (await txn`
      update stock_withdrawal_requests
      set status = 'retirado',
          delivered_by_name = ${input.actor},
          withdrawn_at = now(),
          updated_at = now()
      where id = ${input.id}::uuid
        and status = 'pronto'
      returning id
    `) as { id: string }[]
    if (!marked[0]) throw new Error('Solicitação mudou de status durante a retirada')
    return []
  })
}

export async function transitionWithdrawalRequest(input: {
  id: string
  toStatus: WithdrawalStatus
  actorName: string
  /** Se o operador tem ponto fixo, só pode mexer na fila dele. null = todos. */
  actorStockPointCode?: StockPointCode | null
  avecRef?: string | null
}): Promise<WithdrawalRequestRow> {
  const sql = getSql()
  let current: WithdrawalRequestRow
  try {
    const rows = (await sql.query(`${SELECT_JOIN} where r.id = $1::uuid`, [input.id])) as Array<
      Record<string, unknown>
    >
    if (!rows[0]) throw new Error('Solicitação não encontrada')
    current = mapRow(rows[0])
  } catch (error) {
    if (isMissingRelation(error)) {
      throw new Error('Schema de solicitação ainda não aplicado neste banco.')
    }
    throw error
  }

  if (
    input.actorStockPointCode &&
    current.location_rom_code &&
    current.location_rom_code !== input.actorStockPointCode
  ) {
    throw new Error('Esta solicitação é de outro ponto — você só vê a fila do seu piso')
  }

  const transitionErr = assertTransitionOk(current.status, input.toStatus)
  if (transitionErr) throw new Error(transitionErr)

  const actor = input.actorName.trim() || '—'
  const avecRef =
    typeof input.avecRef === 'string' && input.avecRef.trim() ? input.avecRef.trim() : null

  if (input.toStatus === 'retirado') {
    await confirmRetirado(sql, { id: input.id, actor })
  } else if (input.toStatus === 'em_separacao') {
    await sql`
      update stock_withdrawal_requests
      set status = 'em_separacao',
          prepared_by_name = ${actor},
          prepared_at = now(),
          updated_at = now()
      where id = ${input.id}::uuid
    `
  } else if (input.toStatus === 'pronto') {
    await sql`
      update stock_withdrawal_requests
      set status = 'pronto',
          prepared_by_name = coalesce(prepared_by_name, ${actor}),
          ready_at = now(),
          updated_at = now()
      where id = ${input.id}::uuid
    `
  } else if (input.toStatus === 'baixado_avec') {
    await sql`
      update stock_withdrawal_requests
      set status = 'baixado_avec',
          avec_bailed_at = now(),
          avec_ref = coalesce(${avecRef}, avec_ref),
          updated_at = now()
      where id = ${input.id}::uuid
    `
  } else if (input.toStatus === 'cancelado') {
    await sql`
      update stock_withdrawal_requests
      set status = 'cancelado',
          cancelled_at = now(),
          updated_at = now()
      where id = ${input.id}::uuid
    `
  }

  const updated = (await sql.query(`${SELECT_JOIN} where r.id = $1::uuid`, [input.id])) as Array<
    Record<string, unknown>
  >
  return mapRow(updated[0]!)
}
