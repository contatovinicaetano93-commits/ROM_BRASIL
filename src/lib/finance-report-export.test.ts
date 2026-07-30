import { describe, expect, it } from 'vitest'
import { EMPTY_CMV_COVERAGE, type FinanceKpis } from '@/lib/finance'
import { buildFinanceCompareCsv } from '@/lib/finance-report-export'

function bucket(partial: Partial<FinanceKpis['current']> = {}): FinanceKpis['current'] {
  return {
    month: '2026-07',
    label: 'Jul/2026',
    from: '2026-07-01',
    to: '2026-07-31',
    revenue: 1000,
    revenue_source: 'metrics',
    expenses: 100,
    expenses_by_cnpj: { total: 100, servicos: 100, comercio: 0, manual: 0 },
    attended: 10,
    ticket_avg: 100,
    daily: [{ day: '2026-07-01', revenue: 1000, attended: 10, ticket_avg: 100, expenses_servicos: 0, expenses_comercio: 0 }],
    cmv: 50,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE, cmv: 50 },
    margin_after_cmv: 85,
    gross_margin: 90,
    cash_flow: 900,
    payment_mix: [{ method: 'Pix', amount: 1000, share: 100 }],
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

describe('finance-report-export', () => {
  it('CSV inclui mês comparado e fonte da receita', () => {
    const csv = buildFinanceCompareCsv({
      kpis: {
        current: bucket(),
        previous: bucket({
          month: '2026-06',
          label: 'Jun/2026',
          from: '2026-06-01',
          to: '2026-06-30',
          revenue: 800,
          revenue_source: 'payments_0081',
          daily: [],
        }),
      },
      expenses: [],
      legend: [{ term: 'Receita', meaning: 'test' }],
      generatedAt: new Date('2026-07-27T12:00:00Z'),
    })
    expect(csv).toContain('Jun/2026')
    expect(csv).toContain('fallback 0081')
    expect(csv).toContain('=== RECEITA DIÁRIA — Jun/2026 ===')
    expect(csv).toContain('=== FORMAS DE PAGAMENTO — Jun/2026 ===')
  })
})
