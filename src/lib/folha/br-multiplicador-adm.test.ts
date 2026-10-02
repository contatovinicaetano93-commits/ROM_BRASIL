import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  BR_ASSISTANT_AS_PRO_ADMIN_TAX,
  resolveAssistantAdminTaxRate,
} from '@/lib/folha/exceptions'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function row(
  p: Partial<CommissionProfessionalRow> & { name: string },
): CommissionProfessionalRow {
  return {
    name: p.name,
    role: p.role ?? null,
    charged: p.charged ?? null,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: p.product_spend ?? null,
    card_fee: p.card_fee ?? null,
    admin_fee: p.admin_fee ?? 0,
    assistant_discount: p.assistant_discount ?? null,
    other_discounts: p.other_discounts ?? null,
    net_payable: p.net_payable ?? null,
    house_share: null,
  }
}

describe('BR multiplicador: adm = U×2% (Fopag Av. Brasil)', () => {
  it('alíquota BR 2% / IG 3%', () => {
    expect(resolveAssistantAdminTaxRate('brasil', null)).toBe(
      BR_ASSISTANT_AS_PRO_ADMIN_TAX,
    )
    expect(resolveAssistantAdminTaxRate('iguatemi', null)).toBe(0.03)
  })

  it('Islayquiel: não inventa charged×3%; adm=U×2%; líquido Fopag', () => {
    // 8123 a_pagar ≈ G − produto − desc.assist; motor + meio − adm(U×2%).
    // Fopag Y cacheado 3301.4 (sem −W; motor assistente-like também zera W).
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'Islayquiel Rodrigues de Sena',
        role: 'MULTIPLICADOR',
        charged: 31276,
        product_spend: -80,
        assistant_discount: -80,
        net_payable: 3457.4 - 80 - 80,
      }),
      { servicos_assistente_como_pro: 1800 },
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(36, 2)
    expect(line.taxa_administrativa_rate).toBe(0.02)
    expect(line.folha_extras.taxa_adm_assistente).toBeCloseTo(36, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(54, 2)
    expect(line.proposed_pay).toBeCloseTo(3301.4, 1)
  })

  it('Marcelo Sabino: adm=U×2%; Baru abate; líquido Fopag', () => {
    // 8123 a_pagar ≈ G − produto − desc.assist; + meio − adm − Baru = Y.
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'MARCELO SABINO LUIS JUNIOR',
        role: 'MULTIPLICADOR',
        charged: 31129.5,
        product_spend: -31.33,
        assistant_discount: -40,
        net_payable: 4990.34 - 31.33 - 40,
      }),
      { servicos_assistente_como_pro: 5550, consumo_baru: 275.31 },
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(111, 2)
    expect(line.taxa_administrativa_rate).toBe(0.02)
    expect(line.folha_extras.taxa_adm_assistente).toBeCloseTo(111, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(166.5, 2)
    expect(line.proposed_pay).toBeCloseTo(4552.7, 1)
  })
})
