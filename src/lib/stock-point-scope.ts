import 'server-only'

import { getIntranetSql } from '@/lib/db'
import { ensureIntranetSchema } from '@/lib/intranet/ensure-schema'
import { ROM_POINT_CODES, type RomPointCode } from '@/lib/stock-points'

export type StockPointCode = RomPointCode

export function parseStockPointCode(value: unknown): StockPointCode | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return (ROM_POINT_CODES as readonly string[]).includes(trimmed)
    ? (trimmed as StockPointCode)
    : null
}

/**
 * Ponto atribuído ao colaborador (controlador P1/P2/P3 / almox).
 * null = vê todos (Sidney, almox lead, admin sem ponto).
 * Falha de leitura (schema, timeout, conexão) propaga — null não é "erro".
 */
export async function lookupEmployeeStockPointCode(
  employeeId: string | null | undefined,
): Promise<StockPointCode | null> {
  if (!employeeId?.trim()) return null
  await ensureIntranetSchema().catch(() => {})
  const sql = getIntranetSql()
  const rows = (await sql`
    select stock_point_code
    from intranet_employees
    where id = ${employeeId}::uuid
    limit 1
  `) as Array<{ stock_point_code: string | null }>
  return parseStockPointCode(rows[0]?.stock_point_code)
}

export async function setEmployeeStockPointCode(
  employeeId: string,
  code: StockPointCode | null,
): Promise<void> {
  await ensureIntranetSchema()
  const sql = getIntranetSql()
  await sql`
    update intranet_employees
    set stock_point_code = ${code}, updated_at = now()
    where id = ${employeeId}::uuid
  `
}
