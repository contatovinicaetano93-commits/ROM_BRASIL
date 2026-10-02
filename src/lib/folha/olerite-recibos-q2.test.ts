import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

const alison: CommissionProfessionalRow = {
  tip: 0,
  name: 'ALISON ALVAREZ',
  role: 'Cabeleireiro',
  charged: 41399.00002908707,
  card_fee: -588.0097188055515,
  admin_fee: 0,
  house_share: 20825.500014543533,
  net_payable: 14583.246296279132,
  other_share: 0,
  product_share: 0,
  product_spend: -1262.890000499785,
  service_share: 20573.500014543533,
  other_discounts: 0,
  assistant_discount: -4139.3539989590645,
}

describe('olerite recibo Alison BR Q2 × motor', () => {
  it('Alison: recibo 14258.32 — adm/meio embutidos; abate Baru', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      alison,
      { consumo_baru: 324.65 },
      { applyTaxExtras: false },
    )
    expect(line.proposed_pay).toBeCloseTo(14258.32, 0)
    expect(line.taxa_administrativa).toBeCloseTo(2069.95, 1)
    expect(line.meio_a_meio).toBeCloseTo(2069.68, 1)
    expect(line.folha_extras.consumo_baru).toBeCloseTo(324.65, 2)
  })
})
