/**
 * Meta Romeu BR — harness pronto para quando a Fopag Brasil chegar.
 * Fonte atual: aba Bonus (Sep/2026). Base Folha BR ainda sem líquido.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { romeuAssistantMetaTopUp } from '@/lib/folha/exceptions'
import { assistantServiceTaxRate } from '@/lib/folha/rules'

type BonusRow = {
  name: string
  q1: number
  q2: number
  total: number
  sheet_col_e: number | null
  motor_top_up: number | null
  note?: string
}

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/bonus-romeu-sep-2026.json',
)

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  brasil: BonusRow[]
  iguatemi: BonusRow[]
}

describe('Bonus Romeu BR Sep/2026 — motor pronto para Fopag BR', () => {
  it('W do profissional no BR é 3% (Fopag coluna TAXA 3%)', () => {
    expect(assistantServiceTaxRate('brasil')).toBe(0.03)
    expect(assistantServiceTaxRate('iguatemi')).toBe(0.04)
  })

  it('cada linha Bonus BR: motor_top_up = faixa × (rate − 30%)', () => {
    for (const row of fixture.brasil) {
      const got = romeuAssistantMetaTopUp(row.total)
      if (row.motor_top_up == null) {
        expect(got.topUp).toBeNull()
        continue
      }
      expect(got.topUp).toBeCloseTo(row.motor_top_up, 5)
    }
  })

  it('Q2 BR: top-up entra no proposed_pay; Q1 não', () => {
    const jefferson = fixture.brasil.find((r) =>
      r.name.toLowerCase().includes('jefferson'),
    )
    expect(jefferson).toBeTruthy()
    const q2 = buildFolhaDraftLine(
      'brasil',
      {
        name: 'JEFFERSON POLICARPO DOS SANTOS',
        role: 'MULTIPLICADOR',
        charged: null,
        service_share: 400,
        product_share: 0,
        other_share: 0,
        tip: 0,
        product_spend: 0,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: 0,
        other_discounts: 0,
        net_payable: 1000,
        house_share: 630,
      },
      { acumulado_mes: jefferson!.total },
      { applyTaxExtras: false },
    )
    expect(q2.folha_extras.romeu_comissao_parcela).toBeCloseTo(1795.805, 5)
    expect(q2.proposed_pay).toBeCloseTo(1000 + 1795.805, 2)

    const q1 = buildFolhaDraftLine(
      'brasil',
      {
        name: 'JEFFERSON POLICARPO DOS SANTOS',
        role: 'MULTIPLICADOR',
        charged: null,
        service_share: 4000,
        product_share: 0,
        other_share: 0,
        tip: 0,
        product_spend: 0,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: 0,
        other_discounts: 0,
        net_payable: 1000,
        house_share: 5000,
      },
      { acumulado_mes: jefferson!.total },
      { applyTaxExtras: true },
    )
    expect(q1.folha_extras.romeu_comissao_parcela).toBeNull()
    expect(q1.proposed_pay).toBe(1000)
  })

  it('Nicole BR 2049.99 fica na faixa 30% (top-up 0); Jonathan 600.01 fora da faixa', () => {
    expect(romeuAssistantMetaTopUp(2049.99).topUp).toBe(0)
    expect(romeuAssistantMetaTopUp(600.01).topUp).toBeNull()
  })

  it('stub: Base Folha BR ainda sem Y — swap fixture quando Fopag BR fechar', () => {
    // Placeholder para o sweep completo (mesmo formato do fopag-ig-q2-sweep).
    expect(fixture.brasil).toHaveLength(6)
    expect(fixture.iguatemi.length).toBeGreaterThan(0)
  })
})
