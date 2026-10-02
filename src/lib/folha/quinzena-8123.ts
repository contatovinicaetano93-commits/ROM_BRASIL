/**
 * Janela 8123 da Folha (quinzena) vs snapshot Neon MTD.
 *
 * `salon_commissions_daily` guarda MTD do mês (01→âncora). Usar esse
 * snapshot cru numa Q2 infla faturado bruto (C) e todos os descontos
 * derivados (adm, meio, etc.). Aqui: diff MTD(fim) − MTD(dia antes do
 * início) e heurística de “rascunho semeado com MTD”.
 */

import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import type { FolhaQuinzena } from '@/lib/folha/period'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

const MONEY_KEYS = [
  'charged',
  'service_share',
  'product_share',
  'other_share',
  'tip',
  'product_spend',
  'card_fee',
  'admin_fee',
  'assistant_discount',
  'other_discounts',
  'net_payable',
  'house_share',
] as const

type MoneyKey = (typeof MONEY_KEYS)[number]

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function moneyOrNull(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const r = round4(v)
  return Math.abs(r) < 0.00005 ? 0 : r
}

function subMoney(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return moneyOrNull((a ?? 0) - (b ?? 0))
}

function proKey(name: string): string {
  return occupancyMergeKey(name) || name.trim().toLowerCase()
}

/** Dia ISO anterior (UTC noon — só calendário). */
export function isoDayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Fatia de quinzena a partir de dois snapshots MTD:
 * - Q1: o MTD no fim da Q1 (~dia 15) ≈ janela 01–15 → devolve `end` cru.
 * - Q2: MTD(fim) − MTD(dia 15) ≈ janela 16–fim.
 */
export function sliceQuinzenaFromMtdSnapshots(args: {
  quinzena: FolhaQuinzena
  endProfessionals: readonly CommissionProfessionalRow[]
  /** Snapshot MTD no dia imediatamente anterior ao `from` (Q2: dia 15). */
  priorProfessionals?: readonly CommissionProfessionalRow[] | null
}): CommissionProfessionalRow[] {
  if (args.quinzena.half === 1 || !args.priorProfessionals?.length) {
    return args.endProfessionals.map((p) => ({ ...p }))
  }
  return diffMtdCommissionRows(args.endProfessionals, args.priorProfessionals)
}

/** end − prior por profissional (nome). Quem só existe no prior some. */
export function diffMtdCommissionRows(
  endRows: readonly CommissionProfessionalRow[],
  priorRows: readonly CommissionProfessionalRow[],
): CommissionProfessionalRow[] {
  const priorByKey = new Map<string, CommissionProfessionalRow>()
  for (const p of priorRows) {
    if (!p.name?.trim()) continue
    priorByKey.set(proKey(p.name), p)
  }

  const out: CommissionProfessionalRow[] = []
  for (const end of endRows) {
    if (!end.name?.trim()) continue
    const prior = priorByKey.get(proKey(end.name))
    if (!prior) {
      out.push({ ...end })
      continue
    }
    const row: CommissionProfessionalRow = {
      name: end.name,
      role: end.role ?? prior.role,
      charged: null,
      service_share: null,
      product_share: null,
      other_share: null,
      tip: null,
      product_spend: null,
      card_fee: null,
      admin_fee: null,
      assistant_discount: null,
      other_discounts: null,
      net_payable: null,
      house_share: null,
    }
    for (const k of MONEY_KEYS) {
      row[k] = subMoney(end[k], prior[k])
    }
    const hasSignal = MONEY_KEYS.some((k) => {
      const v = row[k]
      return v != null && Math.abs(v) > 0.02
    })
    if (hasSignal) out.push(row)
  }
  return out
}

/**
 * True se o 8123 persistido na Folha parece o MTD do fim do mês
 * (não a fatia da quinzena). Usado para auto-corrigir rascunhos sticky.
 */
export function draftLikelySeededFromMtd(
  source: readonly CommissionProfessionalRow[],
  mtdEnd: readonly CommissionProfessionalRow[],
): boolean {
  const mtdByKey = new Map<string, CommissionProfessionalRow>()
  for (const p of mtdEnd) {
    if (!p.name?.trim()) continue
    mtdByKey.set(proKey(p.name), p)
  }

  let compared = 0
  let close = 0
  for (const s of source) {
    if (!s.name?.trim() || s.charged == null) continue
    const m = mtdByKey.get(proKey(s.name))
    if (!m || m.charged == null) continue
    if (Math.abs(m.charged) < 200) continue
    compared += 1
    const rel = Math.abs(s.charged - m.charged) / Math.abs(m.charged)
    if (rel <= 0.02) close += 1
  }
  return compared >= 5 && close / compared >= 0.7
}

export type Quinzena8123MoneyKey = MoneyKey
