import { describe, expect, it } from 'vitest'
import { quinzenaForYearMonthHalf } from '@/lib/folha/period'
import {
  diffMtdCommissionRows,
  draftLikelySeededFromMtd,
  isoDayBefore,
  sliceQuinzenaFromMtdSnapshots,
} from '@/lib/folha/quinzena-8123'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function pro(
  name: string,
  charged: number,
  extras?: Partial<CommissionProfessionalRow>,
): CommissionProfessionalRow {
  return {
    name,
    role: 'Cabeleireiro',
    charged,
    service_share: charged / 2,
    product_share: 0,
    other_share: 0,
    tip: 0,
    product_spend: extras?.product_spend ?? 0,
    card_fee: extras?.card_fee ?? 0,
    admin_fee: extras?.admin_fee ?? 0,
    assistant_discount: extras?.assistant_discount ?? 0,
    other_discounts: extras?.other_discounts ?? 0,
    net_payable: extras?.net_payable ?? charged * 0.4,
    house_share: charged / 2,
    ...extras,
  }
}

describe('isoDayBefore', () => {
  it('dia 16 → 15', () => {
    expect(isoDayBefore('2026-09-16')).toBe('2026-09-15')
  })
})

describe('diffMtdCommissionRows', () => {
  it('Islay: MTD 30 − MTD 15 = charged Q2 2404', () => {
    const prior = [pro('ISLAYQUIEL RODRIGUES DE SENA', 1250, { net_payable: 1500.86 })]
    const end = [pro('ISLAYQUIEL RODRIGUES DE SENA', 3654, { net_payable: 4698.26 })]
    const slice = diffMtdCommissionRows(end, prior)
    expect(slice).toHaveLength(1)
    expect(slice[0]!.charged).toBeCloseTo(2404, 2)
    expect(slice[0]!.net_payable).toBeCloseTo(3197.4, 2)
  })

  it('profissional só no fim entra inteiro; só no prior some', () => {
    const prior = [pro('SO SO Q1', 1000)]
    const end = [pro('SO SO Q1', 1000), pro('NOVO Q2', 500)]
    const slice = diffMtdCommissionRows(end, prior)
    const names = slice.map((p) => p.name)
    expect(names).toContain('NOVO Q2')
    expect(names).not.toContain('SO SO Q1') // delta ~0 filtrado
  })
})

describe('sliceQuinzenaFromMtdSnapshots', () => {
  it('Q1 devolve MTD do fim sem diff', () => {
    const q1 = quinzenaForYearMonthHalf('2026-09', 1)
    const end = [pro('A', 10_000)]
    const prior = [pro('A', 1)]
    const sliced = sliceQuinzenaFromMtdSnapshots({
      quinzena: q1,
      endProfessionals: end,
      priorProfessionals: prior,
    })
    expect(sliced[0]!.charged).toBe(10_000)
  })

  it('Q2 faz diff', () => {
    const q2 = quinzenaForYearMonthHalf('2026-09', 2)
    const end = [pro('A', 3654)]
    const prior = [pro('A', 1250)]
    const sliced = sliceQuinzenaFromMtdSnapshots({
      quinzena: q2,
      endProfessionals: end,
      priorProfessionals: prior,
    })
    expect(sliced[0]!.charged).toBeCloseTo(2404, 2)
  })
})

describe('draftLikelySeededFromMtd', () => {
  it('detecta rascunho Q2 semeado com MTD do dia 30', () => {
    const mtd = [
      pro('ALISON ALVAREZ', 80_000),
      pro('BRUNNA', 90_000),
      pro('MAYKON', 40_000),
      pro('JOANIDES', 50_000),
      pro('DANIEL', 30_000),
      pro('WALTER', 70_000),
    ]
    expect(draftLikelySeededFromMtd(mtd, mtd)).toBe(true)
    const window = mtd.map((p) => ({
      ...p,
      charged: (p.charged ?? 0) * 0.45,
    }))
    expect(draftLikelySeededFromMtd(window, mtd)).toBe(false)
  })
})
