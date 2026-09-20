import 'server-only'

import { getSql, type Sql } from '@/lib/db'
import {
  ROM_POINT_SEED,
  almoxQtyFromAvec,
  assertTransferOk,
  sumPointQtys,
  type PointBalanceRow,
  type RomPointKind,
} from '@/lib/stock-points'

export type RomLocation = {
  id: string
  name: string
  rom_code: string
  rom_kind: RomPointKind
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /stock_point_balances|stock_locations|rom_code|does not exist|relation/i.test(msg)
}

async function loadRomLocations(sql: Sql): Promise<RomLocation[]> {
  return (await sql`
    select id, name, rom_code, rom_kind
    from stock_locations
    where rom_code is not null
    order by case rom_code
      when 'almox' then 0
      when 'piso_1' then 1
      when 'piso_2' then 2
      when 'piso_3' then 3
      else 9
    end
  `) as RomLocation[]
}

/** Garante as 4 linhas ROM (idempotente). Só escreve se faltar ou divergir do seed. */
export async function ensureRomPoints(): Promise<RomLocation[]> {
  const sql = getSql()
  let rows = await loadRomLocations(sql)
  const byCode = new Map(rows.map((r) => [r.rom_code, r]))
  let changed = false
  for (const seed of ROM_POINT_SEED) {
    const existing = byCode.get(seed.rom_code)
    if (existing) {
      if (existing.name !== seed.name || existing.rom_kind !== seed.rom_kind) {
        await sql`
          update stock_locations
          set name = ${seed.name}, rom_kind = ${seed.rom_kind}
          where id = ${existing.id}::uuid
        `
        changed = true
      }
    } else {
      await sql`
        insert into stock_locations (name, rom_code, rom_kind)
        values (${seed.name}, ${seed.rom_code}, ${seed.rom_kind})
      `
      changed = true
    }
  }
  if (changed) rows = await loadRomLocations(sql)
  return rows
}

export async function listRomLocations(): Promise<RomLocation[]> {
  try {
    return await ensureRomPoints()
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

async function getBalance(sql: Sql, productId: string, locationId: string): Promise<number> {
  const rows = (await sql`
    select qty from stock_point_balances
    where product_id = ${productId}::uuid and location_id = ${locationId}::uuid
    limit 1
  `) as { qty: number }[]
  return Number(rows[0]?.qty ?? 0)
}

async function setBalance(sql: Sql, productId: string, locationId: string, qty: number): Promise<void> {
  const next = Math.max(0, Math.round(qty * 1000) / 1000)
  await sql`
    insert into stock_point_balances (product_id, location_id, qty, updated_at)
    values (${productId}::uuid, ${locationId}::uuid, ${next}, now())
    on conflict (product_id, location_id) do update
      set qty = excluded.qty, updated_at = now()
  `
}

function balancesFromRows(
  locations: RomLocation[],
  rows: { location_id: string; qty: number }[],
): PointBalanceRow[] {
  const byId = new Map(rows.map((r) => [r.location_id, Number(r.qty)]))
  return locations.map((loc) => ({
    location_id: loc.id,
    rom_code: loc.rom_code,
    rom_kind: loc.rom_kind,
    name: loc.name,
    qty: byId.get(loc.id) ?? 0,
  }))
}

export async function listBalancesForProduct(
  productId: string,
  locations?: RomLocation[],
): Promise<PointBalanceRow[]> {
  const sql = getSql()
  const locs = locations ?? (await ensureRomPoints())
  const rows = (await sql`
    select location_id, qty from stock_point_balances
    where product_id = ${productId}::uuid
  `) as { location_id: string; qty: number }[]
  return balancesFromRows(locs, rows)
}

/**
 * Depois do sync Avec: Almox absorve o restante (Avec − pisos).
 * Inventário nos pisos permanece até transferência ou inventário novo.
 */
export async function reconcileAlmoxAfterAvecQty(
  productId: string,
  avecQty: number,
): Promise<{ almox: number; drift: number }> {
  const locations = await ensureRomPoints()
  const almox = locations.find((l) => l.rom_code === 'almox')
  if (!almox) return { almox: 0, drift: 0 }
  const sql = getSql()
  let next = { almox: 0, drift: 0 }
  await sql.transaction(async (txn) => {
    await txn`select id from stock_products where id = ${productId}::uuid for update`
    const rows = (await txn`
      select location_id, qty from stock_point_balances
      where product_id = ${productId}::uuid
      for update
    `) as { location_id: string; qty: number }[]
    const floorsSum = sumPointQtys(balancesFromRows(locations, rows).filter((b) => b.rom_kind === 'piso'))
    next = almoxQtyFromAvec(avecQty, floorsSum)
    await setBalance(txn, productId, almox.id, next.almox)
    return []
  })
  return next
}

/** Inventário inicial / reset: tudo no Almox (= Avec). Pisos zeram. */
export async function allocateAllToAlmox(productId: string, avecQty: number): Promise<void> {
  const locations = await ensureRomPoints()
  const sql = getSql()
  await sql.transaction(async (txn) => {
    await txn`select id from stock_products where id = ${productId}::uuid for update`
    for (const loc of locations) {
      const qty = loc.rom_code === 'almox' ? Math.max(0, avecQty) : 0
      await setBalance(txn, productId, loc.id, qty)
    }
    return []
  })
}

export async function allocateAllProductsToAlmox(): Promise<{ updated: number }> {
  const sql = getSql()
  await ensureRomPoints()
  const countRows = (await sql`
    select count(*)::int as n from stock_products
  `) as { n: number }[]
  const updated = Number(countRows[0]?.n ?? 0)
  await sql.transaction((txn) => [
    txn`select id from stock_products for update`,
    txn`
      insert into stock_point_balances (product_id, location_id, qty, updated_at)
      select
        p.id,
        l.id,
        case
          when l.rom_code = 'almox' then greatest(coalesce(p.current_qty, 0), 0)
          else 0
        end,
        now()
      from stock_products p
      cross join stock_locations l
      where l.rom_code is not null
      on conflict (product_id, location_id) do update
        set qty = excluded.qty, updated_at = now()
    `,
  ])
  return { updated }
}

export async function transferBetweenPoints(input: {
  productId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
  createdBy?: string | null
  note?: string | null
}): Promise<{ fromQty: number; toQty: number }> {
  const locations = await ensureRomPoints()
  const from = locations.find((l) => l.id === input.fromLocationId)
  const to = locations.find((l) => l.id === input.toLocationId)
  if (!from || !to) throw new Error('Local ROM inválido')
  if (from.id === to.id) throw new Error('Origem e destino iguais')

  const sql = getSql()
  let nextFrom = 0
  let nextTo = 0
  await sql.transaction(async (txn) => {
    const locked = (await txn`
      select id from stock_products where id = ${input.productId}::uuid for update
    `) as { id: string }[]
    if (!locked[0]) throw new Error('Produto inválido')

    const fromQty = await getBalance(txn, input.productId, from.id)
    const err = assertTransferOk({
      fromKind: from.rom_kind,
      toKind: to.rom_kind,
      fromQty,
      quantity: input.quantity,
    })
    if (err) throw new Error(err)

    const toQty = await getBalance(txn, input.productId, to.id)
    nextFrom = fromQty - input.quantity
    nextTo = toQty + input.quantity
    await setBalance(txn, input.productId, from.id, nextFrom)
    await setBalance(txn, input.productId, to.id, nextTo)
    await txn`
      insert into stock_point_transfers (
        product_id, from_location_id, to_location_id, quantity, note, created_by
      ) values (
        ${input.productId}::uuid,
        ${from.id}::uuid,
        ${to.id}::uuid,
        ${input.quantity},
        ${input.note?.trim() || null},
        ${input.createdBy?.trim() || null}
      )
    `
    return []
  })
  return { fromQty: nextFrom, toQty: nextTo }
}

export async function listPointBoard(locationId?: string): Promise<
  Array<{
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    point_qty: number
    rom_sum: number
    drift: number
  }>
> {
  const sql = getSql()
  const locations = await ensureRomPoints()
  const products = (await sql`
    select id, name, sku, current_qty from stock_products order by lower(name)
  `) as { id: string; name: string; sku: string | null; current_qty: number }[]

  const balanceRows =
    products.length === 0
      ? []
      : ((await sql`
          select product_id, location_id, qty from stock_point_balances
        `) as { product_id: string; location_id: string; qty: number }[])

  const byProduct = new Map<string, { location_id: string; qty: number }[]>()
  for (const row of balanceRows) {
    const list = byProduct.get(row.product_id)
    if (list) list.push(row)
    else byProduct.set(row.product_id, [row])
  }

  const out: Array<{
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    point_qty: number
    rom_sum: number
    drift: number
  }> = []

  for (const p of products) {
    const balances = balancesFromRows(locations, byProduct.get(p.id) ?? [])
    const romSum = sumPointQtys(balances)
    const avec = Number(p.current_qty) || 0
    const pointQty = locationId
      ? balances.find((b) => b.location_id === locationId)?.qty ?? 0
      : romSum
    // Mantém leftover nos pisos mesmo com Avec/ponto selecionado em 0 (drift).
    if (locationId && pointQty === 0 && avec === 0 && romSum === 0) continue
    out.push({
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      avec_qty: avec,
      point_qty: pointQty,
      rom_sum: romSum,
      drift: Math.round((romSum - avec) * 1000) / 1000,
    })
  }
  return out
}
