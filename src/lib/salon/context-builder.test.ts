import { describe, expect, it } from 'vitest'
import {
  clipMonthEndToToday,
  fractionToPctPoints,
  salonContextForAI,
  type SalonContext,
} from '@/lib/salon/context-builder'
import { EMPTY_CMV_COVERAGE } from '@/lib/finance'
import { contactKpiWindow } from '@/lib/salon/contact-kpi-chart'

describe('fractionToPctPoints', () => {
  it('converte fração 0–1 em pontos percentuais', () => {
    expect(fractionToPctPoints(0.8)).toBe(80)
    expect(fractionToPctPoints(0.456)).toBe(45.6)
    expect(fractionToPctPoints(null)).toBeNull()
  })
})

describe('clipMonthEndToToday', () => {
  it('clipa fim do mês calendário ao dia corrente', () => {
    expect(clipMonthEndToToday('2026-07-31', '2026-07-27')).toBe('2026-07-27')
    expect(clipMonthEndToToday('2026-06-30', '2026-07-27')).toBe('2026-06-30')
  })
})

describe('salonContextForAI', () => {
  it('separa faturamento de hoje do acumulado do mês e normaliza %', () => {
    const ctx = {
      hoje: '2026-07-27',
      salon: {
        day: '2026-07-27',
        revenue: 150,
        appointments: 3,
        attended: 2,
        no_shows: 0,
        cancelled: 0,
        new_clients: 1,
        returning_clients: 1,
        ticket_avg: 75,
        service_duration_sum_minutes: 0,
        service_duration_count: 0,
        updated_at: '2026-07-27T12:00:00Z',
      },
      financeiro_mes: {
        current: {
          month: '2026-07',
          label: 'Jul/2026',
          from: '2026-07-01',
          to: '2026-07-31',
          revenue: 2873783,
          expenses: 100000,
          attended: 2855,
          ticket_avg: 1000,
          daily: [],
          cmv: 0,
          cmv_coverage: { ...EMPTY_CMV_COVERAGE },
          margin_after_cmv: null,
          gross_margin: 90,
          cash_flow: 2773783,
          payment_mix: [{ method: 'Pix', amount: 1000, share: 100 }],
          payment_reconciliation: {
            revenue: 2873783,
            payments_total: 1000,
            delta: -2872783,
            tolerance: 1,
            status: 'divergent' as const,
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
        },
        previous: null as unknown as SalonContext['financeiro_mes']['previous'],
      },
      visao_mes: {
        month: '2026-07',
        label: 'Jul/2026',
        from: '2026-07-01',
        to: '2026-07-27',
        snapshot_day: '2026-07-27',
        occupancy_avg: 0.8,
        cancelled: 10,
        no_shows: 5,
        ticket_avg: 1000,
        lost_revenue: 15000,
        packages: [],
        packages_sold: 0,
        packages_revenue: 5000,
        booking_channels: [],
        acquisition: [],
        return_rate: 0.4,
        new_clients_period: 20,
        top_professionals: [],
        top_services: [],
      },
      kpis_contato: {
        byDay: [],
        byStatus: [{ status: 'novo', contacts_count: 3 }],
        conversion: {
          conversion_rate: 0.5,
          total_contacts: 100,
          funnel_contacts: 10,
          imported_contacts: 90,
        },
        window: contactKpiWindow(30),
      },
      playbook_top5: [],
      agendamentos_proximos: [],
    } as unknown as SalonContext

    const parsed = JSON.parse(salonContextForAI(ctx)) as {
      salon_hoje: { faturamento: number }
      financeiro_mes: { receita_acumulada: number; label: string; ate: string }
      visao_analitica_mes: {
        ocupacao_media_pct: number
        taxa_retorno_pct: number
        receita_perdida: number
      }
    }

    expect(parsed.salon_hoje.faturamento).toBe(150)
    expect(parsed.financeiro_mes.receita_acumulada).toBe(2873783)
    expect(parsed.financeiro_mes.label).toBe('Jul/2026')
    expect(parsed.financeiro_mes.ate).toBe('2026-07-27')
    expect(parsed.visao_analitica_mes.ocupacao_media_pct).toBe(80)
    expect(parsed.visao_analitica_mes.taxa_retorno_pct).toBe(40)
    expect(parsed.visao_analitica_mes.receita_perdida).toBe(15000)
  })

  it('emite null nos blocos que falharam (não inventa zero)', () => {
    const ctx = {
      hoje: '2026-07-27',
      salon: {
        day: '2026-07-27',
        revenue: 150,
        appointments: 3,
        attended: 2,
        no_shows: 0,
        cancelled: 0,
        new_clients: 1,
        returning_clients: 1,
        ticket_avg: 75,
        service_duration_sum_minutes: 0,
        service_duration_count: 0,
        updated_at: '2026-07-27T12:00:00Z',
      },
      financeiro_mes: null,
      visao_mes: null,
      kpis_contato: {
        byDay: [],
        byStatus: [],
        conversion: null,
        window: contactKpiWindow(30),
      },
      playbook_top5: [],
      agendamentos_proximos: [],
    } as unknown as SalonContext

    const parsed = JSON.parse(salonContextForAI(ctx)) as {
      salon_hoje: { faturamento: number } | null
      financeiro_mes: unknown
      visao_analitica_mes: unknown
    }
    expect(parsed.salon_hoje?.faturamento).toBe(150)
    expect(parsed.financeiro_mes).toBeNull()
    expect(parsed.visao_analitica_mes).toBeNull()
  })
})
