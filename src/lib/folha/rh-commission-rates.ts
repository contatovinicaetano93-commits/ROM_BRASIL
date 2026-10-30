/**
 * Alíquotas da Planilha Base RH (apresentação Folha).
 * Fonte: fixtures/rh-commission-rates.json (abas BRASIL / IGUATEMI).
 */

import type { RomPanelId } from '@/lib/brand'
import ratesJson from '@/lib/folha/fixtures/rh-commission-rates.json'

export type RhCommissionRow = {
  name: string
  cpf: string | null
  cnpj: string | null
  cargo: string | null
  comissao: number | null
}

type RatesFile = {
  brasil: RhCommissionRow[]
  iguatemi: RhCommissionRow[]
}

const RATES = ratesJson as RatesFile

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function listRhCommissionRates(panel: RomPanelId): readonly RhCommissionRow[] {
  return panel === 'iguatemi' ? RATES.iguatemi : RATES.brasil
}

/**
 * Fallback por cargo quando o nome não está na Planilha Base (moda da planilha).
 */
export function defaultComissaoForCargo(cargo: string | null | undefined): number | null {
  const s = (cargo ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('assist') || s.includes('multiplica')) return 0.1
  if (s.includes('color')) return 0.13
  if (s.includes('maqui')) return 0.6
  if (s.includes('manic')) return 0.5
  if (s.includes('estetic')) return 0.5
  if (s.includes('cabel') || s.includes('profissional')) return 0.5
  return null
}

/** Alíquota real. 0 (célula vazia da planilha) não é comissão. */
function positiveRate(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value) || value <= 0) return null
  return value
}

/**
 * CNPJ → CPF → nome. `zero` = a planilha gravou 0, não uma alíquota.
 * Null continua ausente (não marca zero) para o fallback de cargo.
 */
function lookupRhCommission(
  rows: readonly RhCommissionRow[],
  args: {
    name?: string | null
    cpf?: string | null
    cnpj?: string | null
  },
): { rate: number | null; zero: boolean } {
  const probes: Array<(row: RhCommissionRow) => boolean> = []
  const cnpj = digits(args.cnpj)
  if (cnpj.length >= 14) probes.push((r) => digits(r.cnpj) === cnpj)
  const cpf = digits(args.cpf)
  if (cpf.length >= 11) probes.push((r) => digits(r.cpf) === cpf)
  const key = foldName(args.name ?? '')
  if (key) probes.push((r) => foldName(r.name) === key)

  for (const pred of probes) {
    const hit = rows.find((r) => pred(r) && r.comissao != null)
    if (!hit) continue
    const rate = positiveRate(hit.comissao)
    if (rate != null) return { rate, zero: false }
    return { rate: null, zero: true }
  }
  return { rate: null, zero: false }
}

/**
 * Resolve alíquota do profissional na Planilha Base.
 * Ordem: CNPJ → CPF → nome normalizado → (se a célula é 0) a outra
 * unidade → fallback por cargo. 0 não vira 100% do salão.
 */
export function resolveRhCommissionRate(args: {
  panel: RomPanelId
  name: string | null | undefined
  cpf?: string | null
  cnpj?: string | null
  cargo?: string | null
}): number | null {
  const local = lookupRhCommission(listRhCommissionRates(args.panel), args)
  if (local.rate != null) return local.rate
  if (local.zero) {
    const other: RomPanelId = args.panel === 'iguatemi' ? 'brasil' : 'iguatemi'
    const sibling = lookupRhCommission(listRhCommissionRates(other), args).rate
    if (sibling != null) return sibling
  }
  return defaultComissaoForCargo(args.cargo)
}
