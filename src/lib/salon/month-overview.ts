import { computeFinanceKpis, type FinanceKpis, EMPTY_CMV_COVERAGE } from '@/lib/finance'
import { getBrand } from '@/lib/brand'
import {
  computePeriodAnalytics,
  estimateLostRevenue,
  type PeriodAnalytics,
} from '@/lib/salon/period-analytics'
import {
  getMonthCompleteness,
  getSalonMonthMetrics,
  labelMonthPt,
  materializeSalonMonthMetrics,
  monthKeyFromDay,
  monthRange,
  statusLabelPt,
  type MonthCloseStatus,
  type MonthCompleteness,
  type SalonMonthMetricsRow,
} from '@/lib/salon/month-metrics'
import { resolveMonthWindow, resolveComparableWindow, yearAgoMonthKey } from '@/lib/salon/month-window'
import { todayIso } from '@/lib/salon/format'

export interface MonthOverviewSourceNote {
  field: string
  source: 'rom_daily' | 'rom_manual' | 'avec_snapshot'
  note: string
}

export interface MonthOverview {
  unit: string
  panel: string
  month: string
  label: string
  generated_at: string
  completeness: MonthCompleteness
  status_label: string
  finance: FinanceKpis['current']
  analytics: PeriodAnalytics
  closing: {
    revenue: number | null
    attended: number | null
    cancelled: number
    no_shows: number
    ticket_avg: number | null
    expenses: number
    cmv: number
    cash_flow: number | null
    days_expected: number
    days_present: number
    days_missing: string[]
    status: MonthCloseStatus
    materialized_at: string | null
  }
  /** Totais do mês comparado (MTD alinhado) — para deltas nos cards de Relatórios. */
  previous_label: string
  previous_closing: {
    revenue: number | null
    attended: number | null
    cancelled: number
    no_shows: number
    ticket_avg: number | null
    expenses: number
    cmv: number
    cash_flow: number | null
    lost_revenue: number | null
    occupancy_avg: number | null
  }
  source_notes: MonthOverviewSourceNote[]
  /** true quando fechamento veio de salon_month_metrics (leitura rápida). */
  from_cache?: boolean
}

const SOURCE_NOTES: MonthOverviewSourceNote[] = [
  {
    field: 'receita / atendidos / ticket / cancelamentos',
    source: 'rom_daily',
    note: 'Soma de salon_daily_metrics (fechamento ROM). Alimentado pelo sync Avec + histórico.',
  },
  {
    field: 'despesas',
    source: 'rom_manual',
    note: 'Omie Contas a Pagar (por vencimento, CNPJs serviços/comércio) + lançamentos manuais. Exclui não-operacionais.',
  },
  {
    field: 'CMV',
    source: 'rom_daily',
    note: 'Proxy: custo das saídas de estoque no mês (Avec 0044 → stock_movements).',
  },
  {
    field: 'ocupação / top serviços / aquisição / canais / pacotes / retorno / novos',
    source: 'avec_snapshot',
    note: 'Snapshot Avec (P1/P2/P3) mais próximo do fim do mês — não é soma diária ROM.',
  },
]

function metricOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function stubFinanceFromRow(row: SalonMonthMetricsRow): FinanceKpis['current'] {
  const revenueRaw = metricOrNull(row.revenue)
  const expenses = metricOrNull(row.expenses) ?? 0
  const cmv = metricOrNull(row.cmv) ?? 0
  const attendedRaw = metricOrNull(row.attended)
  const revenue = revenueRaw ?? 0
  const attended = attendedRaw ?? 0
  const gross_margin =
    revenueRaw != null && revenueRaw > 0
      ? Math.round(((revenueRaw - expenses) / revenueRaw) * 1000) / 10
      : null
  const margin_after_cmv =
    revenueRaw != null && revenueRaw > 0
      ? Math.round(((revenueRaw - expenses - cmv) / revenueRaw) * 1000) / 10
      : null
  const range = monthRange(row.month)
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from: range.from,
    to: range.to,
    revenue,
    revenue_source: revenueRaw == null ? 'empty' : revenueRaw > 0 ? 'metrics' : 'empty',
    expenses,
    expenses_by_cnpj: {
      total: expenses,
      servicos: 0,
      comercio: 0,
      manual: expenses,
    },
    attended,
    ticket_avg: row.ticket_avg != null ? Number(row.ticket_avg) : null,
    daily: [],
    cmv,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE, cmv },
    margin_after_cmv,
    gross_margin,
    cash_flow:
      revenueRaw != null && revenueRaw > 0
        ? Math.round((revenueRaw - expenses) * 100) / 100
        : null,
    payment_mix: [],
    payment_reconciliation: {
      revenue: revenueRaw ?? 0,
      payments_total: 0,
      delta: revenueRaw != null ? -revenueRaw : 0,
      tolerance: revenueRaw != null ? Math.max(1, Math.round(revenueRaw * 0.01 * 100) / 100) : 1,
      status: revenueRaw != null && revenueRaw > 0 ? 'missing_payments' : 'aligned',
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
  }
}

function emptyFinanceBucket(monthKey: string): FinanceKpis['current'] {
  const range = monthRange(monthKey)
  return {
    month: monthKey,
    label: labelMonthPt(monthKey),
    from: range.from,
    to: range.to,
    revenue: 0,
    revenue_source: 'empty',
    expenses: 0,
    expenses_by_cnpj: { total: 0, servicos: 0, comercio: 0, manual: 0 },
    attended: 0,
    ticket_avg: null,
    daily: [],
    cmv: 0,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE },
    margin_after_cmv: null,
    gross_margin: null,
    cash_flow: null,
    payment_mix: [],
    payment_reconciliation: {
      revenue: 0,
      payments_total: 0,
      delta: 0,
      tolerance: 1,
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
  }
}

function completenessFromRow(row: SalonMonthMetricsRow): MonthCompleteness {
  const from = String(row.from_day).slice(0, 10)
  const to = String(row.to_day).slice(0, 10)
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from,
    to,
    check_through: to,
    days_expected: Number(row.days_expected) || 0,
    days_present: Number(row.days_present) || 0,
    days_missing: Array.isArray(row.days_missing) ? row.days_missing.map(String) : [],
    status: row.status,
  }
}

/** Payload gravado por `materializeSalonMonthMetrics({ analytics, finance })`. */
export function analyticsFromMonthPayload(payload: unknown): PeriodAnalytics | null {
  if (!payload || typeof payload !== 'object') return null
  const analytics = (payload as { analytics?: PeriodAnalytics }).analytics
  if (!analytics || typeof analytics !== 'object') return null
  if (typeof analytics.month !== 'string' || typeof analytics.label !== 'string') return null
  // BR: previous pode ser null (mês sem comparável).
  return analytics
}

/** Analytics mínimo a partir da linha de fechamento — sem bater P1/P2/P3 ao vivo. */
export function analyticsFromMonthRow(row: SalonMonthMetricsRow): PeriodAnalytics {
  const window = resolveMonthWindow(row.month)
  const revenue = metricOrNull(row.revenue)
  const attended = metricOrNull(row.attended)
  const cancelled = metricOrNull(row.cancelled) ?? 0
  const no_shows = metricOrNull(row.no_shows) ?? 0
  const ticket_avg = row.ticket_avg != null ? Number(row.ticket_avg) : null
  const monthRevenue =
    revenue == null && attended == null
      ? null
      : (revenue ?? 0) > 0 || (attended ?? 0) > 0
        ? (revenue ?? 0)
        : null
  const monthAttended =
    revenue == null && attended == null
      ? null
      : (revenue ?? 0) > 0 || (attended ?? 0) > 0
        ? (attended ?? 0)
        : null
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from: window.from,
    to: window.to,
    snapshot_day: null,
    snapshot_missing: true,
    occupancy_avg: null,
    cancelled,
    no_shows,
    ticket_avg,
    lost_revenue: estimateLostRevenue(cancelled, no_shows, ticket_avg),
    packages: [],
    packages_sold: null,
    packages_revenue: null,
    booking_channels: [],
    acquisition: [],
    return_rate: null,
    new_clients_period: Number(row.new_clients) || 0,
    top_professionals: [],
    top_services: [],
    month_revenue: monthRevenue,
    month_attended: monthAttended,
    mtd: window.mtd,
    previous: null,
  }
}

function buildOverview(args: {
  brand: ReturnType<typeof getBrand>
  month: string
  finance: FinanceKpis
  analytics: PeriodAnalytics
  completeness: MonthCompleteness
  materializedAt: string | null
  fromCache?: boolean
}): MonthOverview {
  const { brand, month, finance, analytics, completeness, materializedAt, fromCache } = args
  const prevAnalytics = analytics.previous
  return {
    unit: brand.displayName,
    panel: brand.panel,
    month,
    label: labelMonthPt(month),
    generated_at: new Date().toISOString(),
    completeness,
    status_label: statusLabelPt(completeness.status),
    finance: finance.current,
    analytics,
    closing: {
      revenue: analytics.month_revenue,
      attended: analytics.month_attended,
      cancelled: analytics.cancelled,
      no_shows: analytics.no_shows,
      ticket_avg: finance.current.ticket_avg,
      expenses: finance.current.expenses,
      cmv: finance.current.cmv,
      cash_flow:
        analytics.month_revenue != null && analytics.month_revenue > 0
          ? Math.round((analytics.month_revenue - finance.current.expenses) * 100) / 100
          : null,
      days_expected: completeness.days_expected,
      days_present: completeness.days_present,
      days_missing: completeness.days_missing,
      status: completeness.status,
      materialized_at: materializedAt,
    },
    previous_label: finance.previous.label,
    previous_closing: {
      revenue: prevAnalytics?.revenue ?? null,
      attended: prevAnalytics?.attended ?? null,
      cancelled: prevAnalytics?.cancelled ?? 0,
      no_shows: prevAnalytics?.no_shows ?? 0,
      ticket_avg: finance.previous.ticket_avg,
      expenses: finance.previous.expenses,
      cmv: finance.previous.cmv,
      cash_flow:
        prevAnalytics?.revenue != null && prevAnalytics.revenue > 0
          ? Math.round((prevAnalytics.revenue - finance.previous.expenses) * 100) / 100
          : null,
      lost_revenue: prevAnalytics?.lost_revenue ?? null,
      occupancy_avg: prevAnalytics?.occupancy_avg ?? null,
    },
    source_notes: SOURCE_NOTES,
    from_cache: fromCache,
  }
}

function overviewFromCachedRows(args: {
  brand: ReturnType<typeof getBrand>
  month: string
  cached: SalonMonthMetricsRow
  cachedPrev: SalonMonthMetricsRow | null
}): MonthOverview {
  const { brand, month, cached, cachedPrev } = args
  const baseAnalytics =
    analyticsFromMonthPayload(cached.payload) ?? analyticsFromMonthRow(cached)
  const previous = cachedPrev
    ? stubFinanceFromRow(cachedPrev)
    : emptyFinanceBucket(yearAgoMonthKey(month))
  // Se o payload não trouxe MoM e temos mês anterior materializado, preenche deltas.
  let analytics = baseAnalytics
  if (cachedPrev && (baseAnalytics.previous == null || baseAnalytics.previous.revenue == null)) {
    const prevWindow = resolveMonthWindow(cachedPrev.month)
    const prevTicket =
      cachedPrev.ticket_avg != null ? Number(cachedPrev.ticket_avg) : null
    const prevRevenue = metricOrNull(cachedPrev.revenue)
    const prevAttended = metricOrNull(cachedPrev.attended)
    analytics = {
      ...baseAnalytics,
      previous: {
        month: cachedPrev.month,
        label: labelMonthPt(cachedPrev.month),
        from: prevWindow.from,
        to: prevWindow.to,
        revenue:
          prevRevenue != null && (prevRevenue > 0 || (prevAttended ?? 0) > 0) ? prevRevenue : prevRevenue,
        attended:
          prevAttended != null && (prevAttended > 0 || (prevRevenue ?? 0) > 0)
            ? prevAttended
            : prevAttended,
        cancelled: metricOrNull(cachedPrev.cancelled) ?? 0,
        no_shows: metricOrNull(cachedPrev.no_shows) ?? 0,
        ticket_avg: prevTicket,
        lost_revenue: estimateLostRevenue(
          metricOrNull(cachedPrev.cancelled) ?? 0,
          metricOrNull(cachedPrev.no_shows) ?? 0,
          prevTicket,
        ),
        occupancy_avg: null,
        packages_revenue: null,
        new_clients_period: Number(cachedPrev.new_clients) || 0,
        return_rate: null,
      },
    }
  }
  return buildOverview({
    brand,
    month,
    finance: { current: stubFinanceFromRow(cached), previous },
    analytics,
    completeness: completenessFromRow(cached),
    materializedAt: cached.materialized_at,
    fromCache: true,
  })
}

/**
 * Overview do mês.
 * UI (`materialize=false`): só leitura rápida de `salon_month_metrics`
 * (nunca `computeFinanceKpis` / analytics ao vivo — isso estourava 120s no IG).
 * Sem cache: materializa fechamento leve a partir do diário e devolve.
 * `materialize=true` ("Atualizar fechamento"): finance + analytics completos.
 */
export async function computeMonthOverview(opts?: {
  month?: string
  materialize?: boolean
  compareMonth?: string | null
}): Promise<MonthOverview> {
  const month = opts?.month ?? monthKeyFromDay(todayIso())
  const brand = getBrand()
  const wantMaterialize = opts?.materialize === true
  const prevMonth = resolveComparableWindow(resolveMonthWindow(month), opts?.compareMonth).month

  if (!wantMaterialize) {
    let cached = await getSalonMonthMetrics(month)
    const cachedPrev = await getSalonMonthMetrics(prevMonth)

    if (!cached) {
      // Fecha o mês a partir do diário (leve) para a próxima leitura ser cache hit.
      try {
        cached = await materializeSalonMonthMetrics(month, null)
      } catch {
        cached = null
      }
    }

    if (cached) {
      return overviewFromCachedRows({ brand, month, cached, cachedPrev })
    }

    // Último recurso: completeness vazia (UI pede Atualizar fechamento).
    const completeness = await getMonthCompleteness(month)
    const emptyAnalytics = analyticsFromMonthRow({
      month,
      from_day: completeness.from,
      to_day: completeness.to,
      days_expected: completeness.days_expected,
      days_present: completeness.days_present,
      days_missing: completeness.days_missing,
      status: completeness.status,
      revenue: 0,
      attended: 0,
      cancelled: 0,
      no_shows: 0,
      appointments: 0,
      new_clients: 0,
      returning_clients: 0,
      ticket_avg: null,
      expenses: 0,
      cmv: 0,
      cash_flow: 0,
      payload: null,
      materialized_at: '',
      updated_at: '',
    })
    return buildOverview({
      brand,
      month,
      finance: {
        current: emptyFinanceBucket(month),
        previous: emptyFinanceBucket(prevMonth),
      },
      analytics: emptyAnalytics,
      completeness,
      materializedAt: null,
      fromCache: false,
    })
  }

  // Atualizar fechamento — caminho completo (pode levar ~1–2 min no IG).
  // Sequencial: finance e analytics juntos saturavam o pooler e davam timeout.
  const finance = await computeFinanceKpis({ month, compareMonth: opts?.compareMonth ?? undefined })
  const analytics = await computePeriodAnalytics({ month, compareMonth: opts?.compareMonth })
  const completeness = await getMonthCompleteness(month)

  let materializedAt: string | null = null
  try {
    const row = await materializeSalonMonthMetrics(month, {
      analytics,
      finance: {
        revenue: finance.current.revenue,
        expenses: finance.current.expenses,
        cmv: finance.current.cmv,
        payment_mix: finance.current.payment_mix,
      },
    })
    materializedAt = row.materialized_at
  } catch {
    materializedAt = null
  }

  return buildOverview({
    brand,
    month,
    finance,
    analytics,
    completeness,
    materializedAt,
    fromCache: false,
  })
}
