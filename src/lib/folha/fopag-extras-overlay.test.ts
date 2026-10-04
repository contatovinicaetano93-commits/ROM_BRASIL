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

  it('Laudenilva: U sticky de cabeleireiro (Fopag U=0) sai do líquido', () => {
    const source = avecRow('LAUDENILVA DOS SANTOS SILVA', 'Cabeleireiro', {
      charged: 39709,
      product_spend: -680.19,
      assistant_discount: -3878.25,
      net_payable: 14736.45,
    })
    const stale = buildFolhaDraftLine(
      'brasil',
      source,
      {
        servicos_assistente_como_pro: 21610.03,
        liquido_referencia: 18363.83,
        fat_liquido_referencia: 19294.89,
        faturado_referencia: 39709,
        produto_referencia: 680.19,
        taxa_administrativa: 1985.45,
      },
      { applyTaxExtras: false },
    )
    expect(stale.proposed_pay).toBeGreaterThan(18000)

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
    expect(lines[0]?.proposed_pay).toBeCloseTo(14690.125, 0)
  })

  it('Luana: Baru Zig sticky some quando a Fopag não tem Baru', () => {
    const source = avecRow('LUANA LARISSA PINHEIRO DE SOUSA', 'MULTIPLICADOR', {
      charged: 41564.17,
      net_payable: 5403.34,
    })
    const stale = buildFolhaDraftLine(
      'brasil',
      source,
      {
        consumo_baru: 1097.95,
        descontos_diversos: 1000,
        liquido_referencia: 3305.39,
        faturado_referencia: 41564.17,
        fat_liquido_referencia: 5403.34,
      },
      { applyTaxExtras: false },
    )
    expect(stale.proposed_pay).toBeCloseTo(3305.39, 1)

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
    expect(lines[0]?.folha_extras.descontos_diversos).toBeCloseTo(1000, 2)
    expect(lines[0]?.proposed_pay).toBeCloseTo(4403.34, 0)
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

  it('Marcia: a_pagar sticky (G+V−W) volta para G−produto da Fopag', () => {
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
    expect(lines[0]?.avec.net_payable).toBeCloseTo(1352.13, 1)
    expect(lines[0]?.proposed_pay).toBeCloseTo(1285.15, 0)
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
