import { describe, expect, it } from 'vitest'
import { formatFinanceTelegramSummary } from '@/lib/telegram/finance-summary'
import { EMPTY_CMV_COVERAGE, type FinanceKpiBucket } from '@/lib/finance'

function bucket(partial: Partial<FinanceKpiBucket> = {}): FinanceKpiBucket {
  return {
    month: '2026-07',
    label: 'Jul/2026',
    from: '2026-07-01',
    to: '2026-07-31',
    revenue: 1000,
    expenses: 200,
    attended: 10,
    ticket_avg: 100,
    daily: [],
    cmv: 0,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE },
    margin_after_cmv: null,
    gross_margin: 80,
    cash_flow: 800,
    payment_mix: [
      { method: 'Pix', amount: 600, share: 60 },
      { method: 'Cartão', amount: 400, share: 40 },
    ],
    payment_reconciliation: {
      revenue: 1000,
      payments_total: 1000,
      delta: 0,
      tolerance: 10,
      status: 'aligned',
    },
    fiscal_split: {
      gross_paid: 0,
      cbs_retained: 0,
      ibs_retained: 0,
      net_received: 0,
      pending_count: 0,
      settled_count: 0,
      configured: false,
    },
    ...partial,
  }
}

describe('formatFinanceTelegramSummary', () => {
  it('mostra receita hoje e acumulado do mês', () => {
    const text = formatFinanceTelegramSummary({
      month: bucket(),
      todayRevenue: 150,
    })
    expect(text).toContain('Receita hoje')
    expect(text).toContain('Receita mês (acumulado)')
    expect(text).toContain('Jul/2026')
    expect(text).toContain('Pix')
  })

  it('avisa quando mês ainda está zerado', () => {
    const text = formatFinanceTelegramSummary({
      month: bucket({ revenue: 0, payment_mix: [] }),
      todayRevenue: 0,
    })
    expect(text).toContain('ainda não sincronizada')
  })
})
