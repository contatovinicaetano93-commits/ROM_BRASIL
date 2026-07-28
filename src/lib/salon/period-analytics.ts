import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import { asJsonArray } from '@/lib/sql-json'
import {
  getSalonP1DailyNear,
  type P1AcquisitionRow,
  type P1ProfessionalRow,
  type P1ServiceRow,
} from '@/lib/salon/p1-metrics'
import {
  getSalonP2DailyNear,
  type P2ChannelRow,
  type P2PackageRow,
} from '@/lib/salon/p2-metrics'
import { getSalonP3DailyNear } from '@/lib/salon/p3-metrics'
import { resolveMonthWindow, resolvePreviousComparableWindow } from '@/lib/salon/month-window'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** @deprecated use resolveMonthWindow — mantido para imports existentes. */
export function monthToDateRange(
  monthKey: string,
  referenceDay = todayIso(),
): { from: string; to: string } {
  const w = resolveMonthWindow(monthKey, referenceDay)
  return { from: w.from, to: w.to }
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

/**
 * Coerce ocupação para fração (≥0), sem clipar overbooking.
 * Snapshot já vem de parsePct (0.8 / 1.063); só corrige legado em pontos (ex.: 67.79).
 */
export function coerceOccupancyFraction(raw: number): number | null {
  if (!Number.isFinite(raw) || raw < 0) return null
  return raw > 2 ? raw / 100 : raw
}

/** Média de ocupação 0–1+ a partir do 0126 (ponderada por atendidos). */
export function averageOccupancy(professionals: P1ProfessionalRow[]): number | null {
  if (!professionals.length) return null
  let weighted = 0
  let weight = 0
  let simple = 0
  let count = 0
  for (const p of professionals) {
    if (p.occupancy == null) continue
    const occ = coerceOccupancyFraction(Number(p.occupancy))
    if (occ == null) continue
    simple += occ
    count += 1
    const w = Math.max(0, Number(p.attended) || 0)
    if (w > 0) {
      weighted += occ * w
      weight += w
    }
  }
  if (count === 0) return null
  const avg = weight > 0 ? weighted / weight : simple / count
  return Math.round(avg * 1000) / 1000
}

/** Receita perdida estimada: (cancelados + no-shows) × ticket médio. */
export function estimateLostRevenue(
  cancelled: number,
  noShows: number,
  ticketAvg: number | null,
): number {
  if (ticketAvg == null || !(ticketAvg > 0)) return 0
  const lost = (Math.max(0, cancelled) + Math.max(0, noShows)) * ticketAvg
  return Math.round(lost * 100) / 100
}

async function sumRevenueAndAttended(
  from: string,
  to: string,
): Promise<{ revenue: number; attended: number }> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(revenue), 0)::float as revenue,
        coalesce(sum(attended), 0)::int as attended
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as { revenue: number; attended: number }[]
    return {
      revenue: Math.round(Number(rows[0]?.revenue ?? 0) * 100) / 100,
      attended: Number(rows[0]?.attended ?? 0) || 0,
    }
  } catch {
    return { revenue: 0, attended: 0 }
  }
}

async function sumAttendanceLoss(
  from: string,
  to: string,
): Promise<{ cancelled: number; no_shows: number }> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(cancelled), 0)::int as cancelled,
        coalesce(sum(no_shows), 0)::int as no_shows
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as { cancelled: number; no_shows: number }[]
    return {
      cancelled: Number(rows[0]?.cancelled ?? 0) || 0,
      no_shows: Number(rows[0]?.no_shows ?? 0) || 0,
    }
  } catch {
    return { cancelled: 0, no_shows: 0 }
  }
}

export interface PeriodMonthTotals {
  month: string
  label: string
  from: string
  to: string
  revenue: number
  attended: number
  cancelled: number
  no_shows: number
  lost_revenue: number
  /** Ticket médio do período comparável (null se sem atendidos). */
  ticket_avg: number | null
  /** Snapshot KPIs — null se P1/P2/P3 ausente no mês anterior. */
  occupancy_avg: number | null
  packages_revenue: number | null
  new_clients_period: number | null
  return_rate: number | null
}

export interface PeriodAnalytics {
  month: string
  label: string
  from: string
  to: string
  /** Snapshot P1 day used for rankings / occupancy / acquisition. */
  snapshot_day: string | null
  /** true se P1/P2/P3 perto do fim da janela estão ausentes. */
  snapshot_missing: boolean
  occupancy_avg: number | null
  cancelled: number
  no_shows: number
  ticket_avg: number | null
  lost_revenue: number
  packages: P2PackageRow[]
  packages_sold: number
  packages_revenue: number
  booking_channels: P2ChannelRow[]
  acquisition: P1AcquisitionRow[]
  return_rate: number | null
  new_clients_period: number
  top_professionals: P1ProfessionalRow[]
  top_services: P1ServiceRow[]
  /** Totais do mês em salon_daily_metrics (receita/atendidos). */
  month_revenue: number
  month_attended: number
  /** true se a janela atual é MTD (mês corrente). */
  mtd: boolean
  /** Mês anterior alinhado (MTD→mesmo dia; mês fechado→mês cheio). */
  previous: PeriodMonthTotals | null
}

/**
 * Analytics comercial/operacional do período (Visão analítica).
 * Usa snapshots Avec P1/P2/P3 + métricas diárias — não é extrato financeiro.
 */
export async function computePeriodAnalytics(opts?: {
  month?: string
}): Promise<PeriodAnalytics> {
  const window = resolveMonthWindow(opts?.month ?? todayIso().slice(0, 7))
  const { month, from, to } = window
  const prevWindow = resolvePreviousComparableWindow(window)
  const nearOpts = { maxSkewDays: 14 }
  // Sequencial no pooler max:1 — Promise.all(5) × 2 lotes competia com outras
  // lambdas e o Overview ficava em “Carregando…” até abortar.
  const totals = await sumRevenueAndAttended(from, to)
  const loss = await sumAttendanceLoss(from, to)
  const p1 = await getSalonP1DailyNear(to, nearOpts)
  const p2 = await getSalonP2DailyNear(to, nearOpts)
  const p3 = await getSalonP3DailyNear(to, nearOpts)
  const prevTotals = await sumRevenueAndAttended(prevWindow.from, prevWindow.to)
  const prevLoss = await sumAttendanceLoss(prevWindow.from, prevWindow.to)
  const prevP1 = await getSalonP1DailyNear(prevWindow.to, nearOpts)
  const prevP2 = await getSalonP2DailyNear(prevWindow.to, nearOpts)
  const prevP3 = await getSalonP3DailyNear(prevWindow.to, nearOpts)
  const ticket_avg =
    totals.attended > 0 ? Math.round((totals.revenue / totals.attended) * 100) / 100 : null
  const prevTicket =
    prevTotals.attended > 0
      ? Math.round((prevTotals.revenue / prevTotals.attended) * 100) / 100
      : null
  const professionals = asJsonArray<P1ProfessionalRow>(p1?.professionals)
  const prevProfessionals = asJsonArray<P1ProfessionalRow>(prevP1?.professionals)
  const allPackages = asJsonArray<P2PackageRow>(p2?.packages)
  const prevPackages = asJsonArray<P2PackageRow>(prevP2?.packages)
  // revenue no snapshot 0061 já é faturamento da linha (não preço unitário).
  const packages_revenue =
    Math.round(allPackages.reduce((s, p) => s + Number(p.revenue || 0), 0) * 100) / 100
  const prevPackagesRevenue = prevP2
    ? Math.round(prevPackages.reduce((s, p) => s + Number(p.revenue || 0), 0) * 100) / 100
    : null
  const lost_revenue = estimateLostRevenue(loss.cancelled, loss.no_shows, ticket_avg)

  return {
    month,
    label: labelMonthPt(month),
    from,
    to,
    snapshot_day: p1?.day ?? p2?.day ?? p3?.day ?? null,
    snapshot_missing: !p1 && !p2 && !p3,
    occupancy_avg: averageOccupancy(professionals),
    cancelled: loss.cancelled,
    no_shows: loss.no_shows,
    ticket_avg,
    lost_revenue,
    packages: allPackages.slice(0, 10),
    packages_sold: Number(p2?.packages_sold ?? 0) || 0,
    packages_revenue,
    booking_channels: asJsonArray<P2ChannelRow>(p2?.booking_channels).slice(0, 10),
    acquisition: asJsonArray<P1AcquisitionRow>(p1?.acquisition).slice(0, 10),
    return_rate: p3 != null ? Number(p3.return_rate) : null,
    new_clients_period: Number(p3?.new_clients_period ?? 0) || 0,
    top_professionals: professionals.slice(0, 8),
    top_services: asJsonArray<P1ServiceRow>(p1?.services).slice(0, 8),
    month_revenue: totals.revenue,
    month_attended: totals.attended,
    mtd: window.mtd,
    previous: {
      month: prevWindow.month,
      label: prevWindow.label,
      from: prevWindow.from,
      to: prevWindow.to,
      revenue: prevTotals.revenue,
      attended: prevTotals.attended,
      cancelled: prevLoss.cancelled,
      no_shows: prevLoss.no_shows,
      lost_revenue: estimateLostRevenue(prevLoss.cancelled, prevLoss.no_shows, prevTicket),
      ticket_avg: prevTicket,
      occupancy_avg: prevP1 ? averageOccupancy(prevProfessionals) : null,
      packages_revenue: prevPackagesRevenue,
      new_clients_period: prevP3 != null ? Number(prevP3.new_clients_period ?? 0) || 0 : null,
      return_rate: prevP3 != null ? Number(prevP3.return_rate) : null,
    },
  }
}
