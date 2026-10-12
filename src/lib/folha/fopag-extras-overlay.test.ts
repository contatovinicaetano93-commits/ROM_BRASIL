import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { overlayClosedFopagExtras } from '@/lib/folha/fopag-extras-overlay'
import { rehydrateFolhaDraftFromPeriod } from '@/lib/folha/workflow'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function avecRow(
  name: string,
  role: string,
  fields: Partial<CommissionProfessionalRow> &
    Pick<CommissionProfessionalRow, 'charged' | 'net_payable'>,
): CommissionProfessionalRow {
  return {
    name,
    role,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: null,
    card_fee: null,
    admin_fee: 0,
    assistant_discount: null,
    other_discounts: null,
    house_share: null,
    ...fields,
  }
}

describe('overlayClosedFopagExtras', () => {
  it('não mexe em rascunho 8123 puro (sem referência Fopag)', () => {
    const source = avecRow('AMAURI BAPTISTA BEZERRA', 'Cabeleireiro', {
      charged: 9120,
      net_payable: 3482.29,
    })
    const line = buildFolhaDraftLine('iguatemi', source)
    const { changed, lines } = overlayClosedFopagExtras({
      panel: 'iguatemi',
      periodId: '2026-09-q2',
      lines: [line],
    })
    expect(changed).toBe(false)
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeNull()
  })

  it('Bruna: U sticky some quando a Fopag tem U=0', () => {
    const source = avecRow('BRUNA DA SILVA MELO DOMINGUES', 'Cabeleireiro', {
      charged: 10000,
      net_payable: 4000,
    })
    const stale = buildFolhaDraftLine(
      'brasil',
      source,
      {
        servicos_assistente_como_pro: 9999,
        liquido_referencia: 3392.7,
        faturado_referencia: 10000,
        fat_liquido_referencia: 4000,
      },
      { applyTaxExtras: false },
    )
    expect(stale.proposed_pay).toBeGreaterThan(5000)

    const { lines } = rehydrateFolhaDraftFromPeriod('brasil', {
      id: '2026-09-q2',
      year_month: '2026-09',
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-10-05',
      lines: [stale],
      source_professionals: [source],
    })
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeNull()
    expect(lines[0]?.folha_extras.valor_a_pagar_profissional).toBeNull()
    expect(lines[0]?.proposed_pay).toBeCloseTo(3392.7, 0)
  })

  it('Alberto: Baru Zig sticky some quando a Fopag não tem Baru', () => {
    const source = avecRow('ALBERTO DO NASCIMENTO TAVARES', 'MULTIPLICADOR', {
      charged: 20000,
      net_payable: 5000,
    })
    const stale = buildFolhaDraftLine(
      'brasil',
      source,
      {
        consumo_baru: 888,
        descontos_diversos: 100,
        liquido_referencia: 3341.05,
        faturado_referencia: 20000,
        fat_liquido_referencia: 5000,
      },
      { applyTaxExtras: false },
    )
    expect(stale.proposed_pay).toBeGreaterThan(3500)

    const { lines } = rehydrateFolhaDraftFromPeriod('brasil', {
      id: '2026-09-q2',
      year_month: '2026-09',
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-10-05',
      lines: [stale],
      source_professionals: [source],
    })
    expect(lines[0]?.folha_extras.consumo_baru).toBeNull()
    expect(lines[0]?.proposed_pay).toBeCloseTo(3341.05, 0)
  })

  it('Alison: mantém U da Fopag e o líquido Y', () => {
    const source = avecRow('ALISON ALVAREZ', 'Cabeleireiro', {
      charged: 40200,
      net_payable: 14941.715,
    })
    const line = buildFolhaDraftLine(
      'brasil',
      source,
      {
        servicos_assistente_como_pro: 4020,
        liquido_referencia: 14941.715,
        faturado_referencia: 40200,
        fat_liquido_referencia: 14941.715,
      },
      { applyTaxExtras: false },
    )
    const { lines } = overlayClosedFopagExtras({
      panel: 'brasil',
      periodId: '2026-09-q2',
      lines: [line],
    })
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeCloseTo(
      4020,
      2,
    )
  })

  it('Marcia: overlay alinha net/líquido à Fopag (fat_líq − produto)', () => {
    const source = avecRow('MARCIA FERRONATO', 'Assistente', {
      charged: 12400,
      product_spend: -7.42,
      net_payable: 1594.23,
    })
    const stale = buildFolhaDraftLine(
      'brasil',
      source,
      {
        consumo_baru: 51.98,
        servicos_assistente_como_pro: 750,
        liquido_referencia: 1527.25,
        faturado_referencia: 12400,
        fat_liquido_referencia: 1601.65,
        produto_referencia: 7.42,
        taxa_administrativa: 15,
      },
      { applyTaxExtras: false },
    )
    const { lines } = rehydrateFolhaDraftFromPeriod('brasil', {
      id: '2026-09-q2',
      year_month: '2026-09',
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-10-05',
      lines: [stale],
      source_professionals: [source],
    })
    // Fixture BR Q2: fat_liquido 1601.65 − produto 7.42 = 1594.23; líquido sheet 1527.25.
    expect(lines[0]?.avec.net_payable).toBeCloseTo(1594.23, 1)
    expect(lines[0]?.proposed_pay).toBeCloseTo(1527.25, 0)
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeCloseTo(750, 2)
  })

  it('Outubro+ é no-op — fechamento nativo sem cola Fopag', () => {
    const source = avecRow('WALTER FERREIRA DA SILVA', 'Cabeleireiro', {
      charged: 10000,
      net_payable: 4000,
    })
    const line = buildFolhaDraftLine('brasil', source, {
      consumo_baru: 50,
      liquido_referencia: 9999,
      faturado_referencia: 10000,
    })
    const { changed, lines } = overlayClosedFopagExtras({
      panel: 'brasil',
      periodId: '2026-10-q1',
      lines: [line],
    })
    expect(changed).toBe(false)
    expect(lines[0]?.folha_extras.consumo_baru).toBe(50)
    expect(lines[0]?.folha_extras.liquido_referencia).toBe(9999)
  })
})
