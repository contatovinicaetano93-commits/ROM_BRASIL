/**
 * Rascunho Folha — motor FOPAG ROM (apresentações RH 27/10/2026).
 * proposed_pay = passos 1–6 (Avec + alíquota Planilha Base) ± manuais.
 */
import { describe, expect, it } from 'vitest'
import {
  buildFolhaDraftFrom8123,
  buildFolhaDraftLine,
  deriveReport041From8123,
  proposePayFromFopagRom,
} from '@/lib/folha/draft-from-8123'
import { roundFopagRom } from '@/lib/folha/fopag-rom-calc'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function pro(
  partial: Partial<CommissionProfessionalRow> & { name: string },
): CommissionProfessionalRow {
  return {
    name: partial.name,
    role: partial.role ?? 'Cabeleireiro',
    charged: partial.charged ?? null,
    service_share: partial.service_share ?? null,
    product_share: partial.product_share ?? null,
    other_share: partial.other_share ?? null,
    tip: partial.tip ?? null,
    product_spend: partial.product_spend ?? null,
    card_fee: partial.card_fee ?? null,
    admin_fee: partial.admin_fee ?? null,
    assistant_discount: partial.assistant_discount ?? null,
    other_discounts: partial.other_discounts ?? null,
    net_payable: partial.net_payable ?? null,
    house_share: partial.house_share ?? null,
  }
}

describe('deriveReport041From8123', () => {
  it('inverte taxa 5% do rateio de produtos', () => {
    expect(deriveReport041From8123(100)).toBeCloseTo(2000, 5)
  })
  it('sem rateio → 0', () => {
    expect(deriveReport041From8123(null)).toBe(0)
  })
})

describe('proposePayFromFopagRom — PDF exemplo via 8123', () => {
  it('FL/LP com alíquota 50% e manuais', () => {
    // 0123=20000, 041=2000 → product_share = 100; 029=-400; 026=-300
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'ADRIANA ROSA DE JESUS ABRANCHES', // 50% na Planilha Base
      cargo: 'Cabeleireiro',
      charged: 20_000,
      productShare: 100,
      cardFee: -400,
      productSpend: -300,
      extras: {
        parc: null,
        darf: null,
        das: 100,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        consumo_baru: 50,
        produtos_black: null,
        servicos_assistente_como_pro: null,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        romeu_comissao_parcela: null,
        devolucao_taxa_adm_q1: null,
        acumulado_mes: null,
        faturado_mes: null,
        faturado_mesmo_periodo_ano_anterior: null,
        taxa_adm_q1: null,
        liquido_referencia: null,
        fat_liquido_referencia: null,
        faturado_referencia: null,
      },
    })
    // FL 10500 − 026 300 − adm 5%×20000 − DAS 100 − Baru 50 = 9050
    expect(roundFopagRom(pay, 2)).toBe(9_050)
  })

  it('Walter sem V explícito: remessa 30%, não 20%', () => {
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'WALTER MARTINHO LEAL FILHO CABELEIREIRO',
      cargo: 'Cabeleireiro',
      charged: 10_000,
      productShare: 0,
      cardFee: 0,
      productSpend: 0,
      extras: {
        parc: null,
        darf: null,
        das: null,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        consumo_baru: null,
        produtos_black: null,
        servicos_assistente_como_pro: 1000,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        romeu_comissao_parcela: null,
        devolucao_taxa_adm_q1: null,
        acumulado_mes: null,
        faturado_mes: null,
        faturado_mesmo_periodo_ano_anterior: null,
        taxa_adm_q1: null,
        liquido_referencia: null,
        fat_liquido_referencia: null,
        faturado_referencia: null,
      },
    })
    // 60% × 10000 + 30% × 1000 − adm 5%×10000 = 5800
    expect(roundFopagRom(pay, 2)).toBe(5_800)
  })

  it('multiplicador: U/V/W não entram no pay', () => {
    const extras = {
      parc: null,
      darf: null,
      das: null,
      div_ativa: null,
      mensalidade_contabilidade: null,
      descontos_diversos: null,
      consumo_baru: null,
      produtos_black: null,
      servicos_assistente_como_pro: 1000,
      valor_a_pagar_profissional: 200,
      taxa_servicos: 30,
      taxa_administrativa: null,
      esteticista_bonus: null,
      romeu_comissao_parcela: null,
      devolucao_taxa_adm_q1: null,
      acumulado_mes: null,
      faturado_mes: null,
      faturado_mesmo_periodo_ano_anterior: null,
      taxa_adm_q1: null,
      liquido_referencia: null,
      fat_liquido_referencia: null,
      faturado_referencia: null,
    }
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'JEFFERSON POLICARPO DOS SANTOS',
      cargo: 'MULTIPLICADOR',
      charged: 12_000,
      productShare: 0,
      cardFee: 0,
      productSpend: -100,
      extras,
    })
    // 15% × 12000 − produto 100. Sem +200 −30.
    expect(roundFopagRom(pay, 2)).toBe(1_700)
  })

  it('sem alíquota RH → null', () => {
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'PROFISSIONAL INEXISTENTE XYZ',
      charged: 10_000,
      productShare: 0,
      cardFee: -100,
      productSpend: null,
      extras: {
        parc: null,
        darf: null,
        das: null,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        consumo_baru: null,
        produtos_black: null,
        servicos_assistente_como_pro: null,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        romeu_comissao_parcela: null,
        devolucao_taxa_adm_q1: null,
        acumulado_mes: null,
        faturado_mes: null,
        faturado_mesmo_periodo_ano_anterior: null,
        taxa_adm_q1: null,
        liquido_referencia: null,
        fat_liquido_referencia: null,
        faturado_referencia: null,
      },
    })
    expect(pay).toBeNull()
  })

  it('029 desconto assistente: −K + 50% crédito (não confundir com cartão)', () => {
    const emptyExtras = {
      parc: null,
      darf: null,
      das: null,
      div_ativa: null,
      mensalidade_contabilidade: null,
      descontos_diversos: null,
      consumo_baru: null,
      produtos_black: null,
      servicos_assistente_como_pro: null,
      valor_a_pagar_profissional: null,
      taxa_servicos: null,
      taxa_administrativa: null,
      esteticista_bonus: null,
      romeu_comissao_parcela: null,
      devolucao_taxa_adm_q1: null,
      acumulado_mes: null,
      faturado_mes: null,
      faturado_mesmo_periodo_ano_anterior: null,
      taxa_adm_q1: null,
      liquido_referencia: null,
      fat_liquido_referencia: null,
      faturado_referencia: null,
    }
    // Adriana 50%: FL 10500 − 026 300 − adm 1000 = 9200
    const without = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'ADRIANA ROSA DE JESUS ABRANCHES',
      cargo: 'Cabeleireiro',
      charged: 20_000,
      productShare: 100,
      cardFee: -400,
      productSpend: -300,
      assistantDiscount: null,
      extras: emptyExtras,
    })
    expect(roundFopagRom(without, 2)).toBe(9_200)
    // Com K=1000 → 9200 − 1000 + 500 = 8700
    const withAssist = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'ADRIANA ROSA DE JESUS ABRANCHES',
      cargo: 'Cabeleireiro',
      charged: 20_000,
      productShare: 100,
      cardFee: -400,
      productSpend: -300,
      assistantDiscount: -1_000,
      extras: emptyExtras,
    })
    expect(roundFopagRom(withAssist, 2)).toBe(8_700)
  })
})

describe('buildFolhaDraftLine — FOPAG ROM', () => {
  it('Alan BR 55%: proposed_pay pelo motor, não pelo a_pagar', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        role: 'Cabeleireiro',
        charged: 20_000,
        product_share: 100,
        card_fee: -400,
        product_spend: -300,
        net_payable: 1, // a_pagar ignorado pelo motor novo
      }),
    )
    // FL 11400 − 026 300 − adm 5%×20000 = 10100
    expect(line.proposed_pay).toBeCloseTo(10_100, 2)
  })

  it('impostos/Baru digitados abatem', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        charged: 20_000,
        product_share: 100,
        card_fee: -400,
        product_spend: null,
        net_payable: 9999,
      }),
      { das: 200, consumo_baru: 50 },
    )
    // FL 11400 − adm 1000 − DAS 200 − Baru 50 = 10150
    expect(line.proposed_pay).toBeCloseTo(10_150, 2)
  })

  it('multiplicador com U: colunas V/W ficam; pay não credita remessa', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'JEFFERSON POLICARPO DOS SANTOS',
        role: 'MULTIPLICADOR',
        charged: 12_000,
        product_share: 0,
        product_spend: -100,
        card_fee: 0,
        net_payable: 5000,
      }),
      { servicos_assistente_como_pro: 1000 },
    )
    expect(line.folha_extras.valor_a_pagar_profissional).toBeCloseTo(200, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(30, 2)
    expect(line.proposed_pay).toBeCloseTo(1_700, 2)
  })

  it('a_pagar fechado não apaga DAS digitado', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        charged: 20_000,
        product_share: 0,
        card_fee: -400,
        net_payable: 9_600,
      }),
      { das: 200 },
    )
    // FL 10600 − adm 1000 − DAS 200 = 9400
    expect(line.proposed_pay).toBeCloseTo(9_400, 2)
  })

  it('crédito residual do olerite não debita o pay ROM', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        charged: 10_000,
        product_share: 0,
        card_fee: 0,
        assistant_discount: -2_000,
        other_discounts: 700,
        net_payable: 1,
      }),
    )
    // FL 5500 − K+meio (−2000+1000) − adm 500; residual olerite não entra.
    expect(line.proposed_pay).toBeCloseTo(4_000, 2)
  })
})

describe('buildFolhaDraftFrom8123', () => {
  it('monta rascunho com nomes da Planilha Base', () => {
    const draft = buildFolhaDraftFrom8123({
      panel: 'brasil',
      referenceDay: '2026-09-15',
      professionals: [
        pro({
          name: 'ALAN FERNADO DE ALBUQUERQUE',
          charged: 10_000,
          product_share: 0,
          card_fee: -100,
          net_payable: 50,
        }),
      ],
    })
    expect(draft.source).toBe('8123')
    expect(draft.line_count).toBe(1)
    expect(draft.lines[0].proposed_pay).not.toBeNull()
    expect(draft.total_proposed_pay).not.toBeNull()
  })
})
