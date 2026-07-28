'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  Layers,
  TrendingUp,
  Users,
  Sparkles,
  Clock,
  Trophy,
  Percent,
  Package,
  AlertTriangle,
  Download,
  FileText,
} from 'lucide-react'
import { SectionCard, CountBadge, StatusPill, CHANNEL_LABEL } from '../_components/ui'
import { MonthYearField } from '../_components/MonthYearField'
import { formatCurrency, formatPercent, formatPercentPoints, todayIso } from '@/lib/salon/format'

import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'
import type { PeriodAnalytics } from '@/lib/salon/period-analytics'
import { buildContactsPerDayChart, contactKpiWindow } from '@/lib/salon/contact-kpi-chart'
import { displayServiceName, serviceTicketAvg } from '@/lib/salon/service-display'
import {
  buildPeriodAnalyticsCsv,
  buildPeriodAnalyticsPrintHtml,
  downloadTextFile,
  openPrintHtml,
} from '@/lib/salon/month-overview-export'

interface KpiData {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: {
    conversion_rate: number
    total_contacts: number
    funnel_contacts?: number
    imported_contacts?: number
  } | null
  window?: { from: string; to: string; days: number }
}

function aggregateByChannel(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.channel, (map.get(row.channel) ?? 0) + row.contacts_count)
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

interface TmBucket {
  key: string
  label: string
  avgMinutes: number | null
  sampleCount: number
}

interface TmComparison {
  month: { current: TmBucket; previous: TmBucket }
  quarter: { current: TmBucket; previous: TmBucket }
}

interface ProfessionalRanking {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  occupancy: number | null
  delta: { revenue: number; attended: number; occupancy: number | null } | null
}

interface PerformanceData {
  reference_day: string | null
  compare_day: string | null
  professionals: ProfessionalRanking[]
}

export default function DashboardPage() {
  const brand = getBrand()
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [data, setData] = useState<KpiData | null>(null)
  const [tm, setTm] = useState<TmComparison | null>(null)
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [period, setPeriod] = useState<(PeriodAnalytics & {
    sync?: {
      status: string | null
      created_at: string | null
      stale: boolean
      hint: string | null
      fast_stale?: boolean
      never_synced?: boolean
    }
  }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        setLoading(true)
        // Evita KPIs do mês anterior com rótulos do mês novo enquanto as requests resolvem.
        setTm(null)
        setPerformance(null)
        setPeriod(null)
        // Um lambda: evita waterfall de 4 rotas × pooler max:1.
        const dashRes = await apiFetch(`/api/kpis/dashboard?month=${month}`, {
          cache: 'no-store',
        })
        const dashJson = await dashRes.json()
        if (cancelled) return
        if (dashJson.error) {
          setError(dashJson.error)
          setWarn(null)
          return
        }

        const bundle = dashJson.data ?? {}
        setData(bundle.kpis ?? null)
        setTm(bundle.tm ?? null)
        setPerformance(bundle.performance ?? null)
        setPeriod(bundle.period ?? null)
        setError(null)

        const warnings: string[] = []
        const sync = bundle.period?.sync
        if (sync?.stale) {
          warnings.push(
            sync.never_synced
              ? 'Nenhum sync Avec registrado ainda — confira Admin / cron'
              : sync.fast_stale
                ? 'Sync Avec fast desatualizado (>1h) — números do dia podem estar velhos'
                : 'Sync Avec full desatualizado (>24h) — números podem estar velhos',
          )
        } else if (sync?.status === 'partial') warnings.push('Último sync Avec parcial — confira Admin')
        else if (sync?.status === 'error') warnings.push('Último sync Avec com erro — confira Admin')

        if (warnings.length) setWarn(warnings.join(' · '))
        else setWarn(null)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [month])

  function exportPeriodCsv() {
    if (!period) return
    downloadTextFile(
      `visao_analitica_${period.month}_${brand.panel}.csv`,
      buildPeriodAnalyticsCsv(period, brand.displayName),
    )
  }

  function exportPeriodPdf() {
    if (!period) return
    const ok = openPrintHtml(buildPeriodAnalyticsPrintHtml(period, brand.displayName))
    if (!ok) setWarn('Permita pop-ups para gerar o PDF (imprimir / salvar como PDF).')
  }

  const funnelContacts = data?.conversion?.funnel_contacts ?? 0
  const importedContacts = data?.conversion?.imported_contacts ?? 0
  const totalContacts = data?.conversion?.total_contacts ?? 0
  const conversionRate = data?.conversion?.conversion_rate ?? 0
  const crmWindow = data?.window ?? contactKpiWindow(30)
  const chartData = data
    ? buildContactsPerDayChart(data.byDay, crmWindow.from, crmWindow.to).map((p) => ({
        day: p.label,
        total: p.total,
      }))
    : []
  const channelData = data ? aggregateByChannel(data.byDay) : []
  const activeChannels = new Set(data?.byDay.map((d) => d.channel)).size
  const statusTotal = data?.byStatus.reduce((s, r) => s + r.contacts_count, 0) ?? 0
  const channelTotal = channelData.reduce((s, [, v]) => s + v, 0)
  const novos = data?.byStatus.find((s) => s.status === 'novo')?.contacts_count ?? 0
  const topChannel = channelData[0]
  const snapshotHint = period?.snapshot_day
    ? `Avec snapshot ${period.snapshot_day} · janela ~30 dias`
    : period?.snapshot_missing
      ? 'Sem snapshot Avec perto deste mês (rode analytics-backfill)'
      : 'Avec · janela ~30 dias'

  const dashValue = (v: string | null | undefined, empty = 'sem dado') => {
    if (loading || !period) return '—'
    if (v == null || v === '') return empty
    return v
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Visão analítica</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">{brand.dashboardTitle}</h1>
          <p className="mt-1 text-xs text-muted">
            Funil CRM real (sem dump Avec) + mês acumulado local + snapshots Avec ~30 dias. Operação do
            dia em Hoje · dinheiro em Financeiro · fechamento em Relatórios.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <MonthYearField value={month} onChange={setMonth} aria-label="Mês da visão analítica" />
          </label>
          <button
            type="button"
            onClick={exportPeriodCsv}
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={exportPeriodPdf}
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar os dados ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {warn && !error && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {warn}
        </div>
      )}

      {period?.snapshot_missing && !loading ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Sem snapshot Avec (P1/P2/P3) perto de {period.to}. Cards de ocupação/pacotes/ranking podem
          ficar vazios — rode analytics-backfill no Admin para o mês {period.month}.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <InsightCard
          icon={<TrendingUp size={15} />}
          label={`Receita · mês acum. · ${period?.label ?? '—'}`}
          value={
            loading || !period
              ? '—'
              : period.month_revenue > 0
                ? formatCurrency(period.month_revenue)
                : 'sem receita'
          }
          compare={momCurrency(period?.month_revenue, period?.previous?.revenue, period?.previous?.label)}
        />
        <InsightCard
          icon={<Users size={15} />}
          label="Atendidos · mês acum."
          value={loading || !period ? '—' : String(period.month_attended)}
          compare={momNumber(period?.month_attended, period?.previous?.attended, period?.previous?.label)}
        />
        <InsightCard
          icon={<TrendingUp size={15} />}
          label="Ticket médio · mês acum."
          value={
            loading || !period
              ? '—'
              : period.ticket_avg != null
                ? formatCurrency(period.ticket_avg)
                : 'sem ticket'
          }
          compare={momCurrency(period?.ticket_avg, period?.previous?.ticket_avg, period?.previous?.label)}
        />
        <InsightCard
          icon={<Percent size={15} />}
          label={`Ocupação · Avec 30d · ${period?.label ?? '—'}`}
          value={dashValue(
            period?.occupancy_avg != null
              ? formatPercentPoints(period.occupancy_avg * 100)
              : null,
            period?.snapshot_missing ? 'sem snapshot' : 'sem ocupação',
          )}
          compare={
            !loading &&
            period?.occupancy_avg != null &&
            period.previous?.occupancy_avg != null
              ? {
                  text: `${fmtSignedPp((period.occupancy_avg - period.previous.occupancy_avg) * 100)} vs ${period.previous.label}`,
                  positive: period.occupancy_avg - period.previous.occupancy_avg >= 0,
                }
              : null
          }
        />
        <InsightCard
          icon={<AlertTriangle size={15} />}
          label="Receita perdida · mês acum."
          value={
            loading || !period
              ? '—'
              : period.lost_revenue == null
                ? period.ticket_avg == null
                  ? 'sem ticket'
                  : '—'
                : formatCurrency(period.lost_revenue)
          }
          compare={momCurrency(
            period?.lost_revenue,
            period?.previous?.lost_revenue,
            period?.previous?.label,
            { invert: true },
          )}
        />
        <InsightCard
          icon={<Users size={15} />}
          label="Cancel. + no-show · mês acum."
          value={
            loading || !period
              ? '—'
              : String((period.cancelled ?? 0) + (period.no_shows ?? 0))
          }
          compare={
            !loading && period?.previous
              ? (() => {
                  const cur = (period.cancelled ?? 0) + (period.no_shows ?? 0)
                  const prev = period.previous.cancelled + period.previous.no_shows
                  return {
                    text: `${fmtSignedNumber(cur - prev)} vs ${period.previous.label}`,
                    positive: cur - prev <= 0,
                  }
                })()
              : null
          }
        />
      </div>

      {!loading && period?.previous ? (
        <p className="text-xs text-muted">
          Deltas em verde/laranja = vs {period.previous.label}
          {period.mtd ? ` (janela alinhada até dia ${period.to.slice(8)})` : ''}.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <InsightCard
          icon={<Package size={15} />}
          label="Pacotes · Avec 30d"
          value={dashValue(
            period?.packages_revenue != null ? formatCurrency(period.packages_revenue) : null,
            period?.snapshot_missing ? 'sem snapshot' : 'sem pacotes',
          )}
          compare={
            period?.packages_revenue != null
              ? momCurrency(
                  period.packages_revenue,
                  period.previous?.packages_revenue,
                  period.previous?.label,
                )
              : null
          }
        />
        <InsightCard
          icon={<Sparkles size={15} />}
          label="Novos · Avec 30d"
          value={dashValue(
            period?.new_clients_period != null ? String(period.new_clients_period) : null,
            period?.snapshot_missing ? 'sem snapshot' : 'sem P3',
          )}
          compare={
            period?.new_clients_period != null
              ? momNumber(
                  period.new_clients_period,
                  period.previous?.new_clients_period,
                  period.previous?.label,
                )
              : null
          }
        />
        <InsightCard
          icon={<TrendingUp size={15} />}
          label="Retorno · Avec 30d"
          value={dashValue(
            period?.return_rate != null
              ? formatPercentPoints(period.return_rate * 100, 0)
              : null,
            period?.snapshot_missing ? 'sem snapshot' : 'sem taxa',
          )}
          compare={
            !loading &&
            !period?.snapshot_missing &&
            period?.return_rate != null &&
            period.previous?.return_rate != null
              ? {
                  text: `${fmtSignedPp((period.return_rate - period.previous.return_rate) * 100)} vs ${period.previous.label}`,
                  positive: period.return_rate - period.previous.return_rate >= 0,
                }
              : null
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-8 lg:gap-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="animate-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-card p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-xs text-muted">Funil ativo (CRM · sem importado · {month})</p>
              {loading ? (
                <div className="mt-2 h-10 w-32 animate-pulse rounded-lg bg-border" />
              ) : (
                <p className="mt-1 text-4xl font-semibold tabular-nums">{funnelContacts}</p>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                  <TrendingUp size={13} />
                  {(conversionRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-muted">conversão no funil · {month}</span>
              </p>
              {!loading && (
                <p className="mt-2 text-[0.7rem] text-muted">
                  Importados na janela: {importedContacts.toLocaleString('pt-BR')} · total na janela:{' '}
                  {totalContacts.toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <InsightCard
              icon={<Users size={15} />}
              label={`Novos aguardando · funil · ${month}`}
              value={loading ? '—' : String(novos)}
            />
            <InsightCard
              icon={<Layers size={15} />}
              label={`Canais ativos · funil · ${month}`}
              value={loading ? '—' : String(activeChannels)}
            />
          </div>

          <SectionCard title={`Contatos por dia (funil · ${month})`}>
            <p className="mb-2 text-xs text-muted">
              Entradas reais no funil (exclui dump Avec / status importado) · {crmWindow.from} →{' '}
              {crmWindow.to}
            </p>
            <div className="h-52 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="var(--muted)"
                    fontSize={11}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      color: 'var(--foreground)',
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2.5} fill="url(#gold)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard
            title={`Tempo médio cadastrado (TM · ${month})`}
            badge={<Clock size={15} className="text-muted" />}
          >
            {tm ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TmCompareCol title="Mês" current={tm.month.current} previous={tm.month.previous} />
                <TmCompareCol title="Trimestre" current={tm.quarter.current} previous={tm.quarter.previous} />
              </div>
            ) : (
              <div className="h-16 animate-pulse rounded-2xl bg-card" />
            )}
            <p className="mt-3 text-[0.65rem] text-muted">
              Média do tempo cadastrado no Avec (0223) — não é duração cronometrada da visita.
            </p>
            {tm && tm.month.current.sampleCount === 0 && tm.month.previous.sampleCount === 0 && (
              <p className="mt-2 text-xs text-muted">
                Avec 0223 não tem campo <span className="font-medium">tempo</span> preenchido nos
                serviços (cadastro na Avec). Jan–jun de receita já estão no caixa — TM cadastrado só
                aparece depois que a unidade preencher duração nos serviços.
              </p>
            )}
          </SectionCard>

          {!loading && topChannel && channelTotal > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-gold" />
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-semibold text-gold">
                  {CHANNEL_LABEL[topChannel[0]] ?? topChannel[0]}
                </span>{' '}
                lidera entradas no funil em {month} ({topChannel[1]} de {channelTotal}) —
                dump Avec importado não entra nesta conta.
              </p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title={`Contatos por canal (funil · ${month})`}
              badge={<CountBadge value={`${channelTotal}`} />}
            >
              <div className="divide-y divide-border">
                {channelData.map(([channel, count]) => (
                  <div key={channel} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-foreground/90">{CHANNEL_LABEL[channel] ?? channel}</span>
                    <span className="font-semibold tabular-nums text-gold">{count}</span>
                  </div>
                ))}
                {channelData.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">
                    Nenhuma entrada de funil em {month}.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title={`Status no período · ${month}`}
              badge={<CountBadge value={`${statusTotal}`} />}
            >
              <p className="mb-2 text-xs text-muted">
                Contatos com 1º contato no mês (inclui importado Avec, se houver entrada na janela).
              </p>
              <div className="flex flex-col gap-2.5">
                {[...(data?.byStatus ?? [])]
                  .sort(
                    (a, b) =>
                      b.contacts_count - a.contacts_count ||
                      a.status.localeCompare(b.status, 'pt-BR'),
                  )
                  .map((row) => (
                    <div key={row.status} className="flex items-center justify-between">
                      <StatusPill status={row.status} />
                      <span className="text-sm font-semibold tabular-nums text-foreground/90">
                        {row.contacts_count}
                      </span>
                    </div>
                  ))}
                {data && data.byStatus.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">Nenhum contato registrado ainda.</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <SectionCard title={`Canais de agenda · ${period?.label ?? '—'}`}>
            <p className="mb-2 text-xs text-muted">{snapshotHint} · 0056.</p>
            {(period?.booking_channels.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">
                {period?.snapshot_missing
                  ? 'Sem snapshot 0056 para este mês.'
                  : 'Sem canais no snapshot Avec.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.booking_channels.map((c) => (
                  <li key={c.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Como nos conheceram">
            <p className="mb-2 text-xs text-muted">{snapshotHint} · 0003.</p>
            {(period?.acquisition.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">
                {period?.snapshot_missing
                  ? 'Sem snapshot 0003 para este mês.'
                  : 'Sem dados de aquisição no snapshot.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.acquisition.map((a) => (
                  <li key={a.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{a.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{a.clients}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Pacotes · ${period?.label ?? '—'}`}>
            <p className="mb-2 text-xs text-muted">
              {snapshotHint} · 0061 · {period?.packages_sold ?? 0} vendidos ·{' '}
              {period?.packages_revenue != null
                ? formatCurrency(period.packages_revenue)
                : '—'}{' '}
              (soma dos totais de
              linha; valor ≠ preço unitário × qtd)
            </p>
            {(period?.packages.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">
                {period?.snapshot_missing
                  ? 'Sem snapshot 0061 para este mês.'
                  : 'Sem pacotes no snapshot Avec.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.packages.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      total {formatCurrency(p.revenue)} · {p.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Top serviços">
            <p className="mb-2 text-xs text-muted">
              {snapshotHint} · 0032 · faturamento real ÷ qtd (ticket médio), não preço de tabela no
              nome.
            </p>
            {(period?.top_services.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">
                {period?.snapshot_missing
                  ? 'Sem snapshot 0032 para este mês.'
                  : 'Sem ranking de serviços no snapshot.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.top_services.map((s) => {
                  const ticket = serviceTicketAvg(s.revenue, s.quantity)
                  return (
                    <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{displayServiceName(s.name)}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatCurrency(s.revenue)} · {s.quantity}×
                        {ticket != null ? ` · ticket ${formatCurrency(ticket)}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>

          <p className="text-xs text-muted">
            Operação do dia:{' '}
            <Link href="/hoje" className="text-gold hover:underline">
              Hoje
            </Link>
            {' · '}
            Caixa:{' '}
            <Link href="/financeiro" className="text-gold hover:underline">
              Financeiro
            </Link>
            {' · '}
            Ranking completo:{' '}
            <Link href="/relatorios" className="text-gold hover:underline">
              Relatórios
            </Link>
          </p>
        </div>
      </div>

      <SectionCard
        title={`Ranking de profissionais (snapshot · ${month})`}
        badge={<Trophy size={15} className="text-muted" />}
      >
        {!performance || performance.professionals.length === 0 ? (
          <p className="text-xs text-muted">
            Sem ranking — depende do snapshot Avec 0021+0126 perto do fim do mês selecionado
            {period?.snapshot_missing ? ' (snapshot ausente agora)' : ''}. Detalhe em Relatórios ou
            rode analytics-backfill.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Profissional</th>
                  <th className="pb-2 font-medium">Faturamento</th>
                  <th className="pb-2 font-medium">Atendimentos</th>
                  <th className="pb-2 font-medium">Ticket médio</th>
                  <th className="pb-2 font-medium">Ocupação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {performance.professionals.slice(0, 10).map((p, i) => (
                  <tr key={p.name}>
                    <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                    <td className="py-2 font-medium text-foreground/90">{p.name}</td>
                    <td className="py-2 tabular-nums">
                      <div className="flex flex-col gap-0.5">
                        <span>{formatCurrency(p.revenue)}</span>
                        {p.delta && (
                          <DeltaUnder value={p.delta.revenue} suffix="" isCurrency />
                        )}
                      </div>
                    </td>
                    <td className="py-2 tabular-nums">
                      <div className="flex flex-col gap-0.5">
                        <span>{p.attended}</span>
                        {p.delta && <DeltaUnder value={p.delta.attended} suffix="" />}
                      </div>
                    </td>
                    <td className="py-2 tabular-nums">{formatCurrency(p.ticket_avg)}</td>
                    <td className="py-2 tabular-nums">
                      <div className="flex flex-col gap-0.5">
                        <span>{p.occupancy != null ? formatPercent(p.occupancy) : '—'}</span>
                        {p.delta?.occupancy != null && (
                          <DeltaUnder value={Math.round(p.delta.occupancy * 100)} suffix="pp" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {performance.compare_day && (
              <p className="mt-3 text-[0.65rem] text-muted">
                Comparação: snapshot {performance.reference_day} vs mês anterior (
                {performance.compare_day})
              </p>
            )}
            <p className="mt-2 text-[0.65rem] text-muted">
              Ocupação vem do Avec 0126 (pode passar de 100% com overbooking). Traço (—) =
              sem match de nome entre 0021 (faturamento) e 0126. Valores em verde/laranja =
              variação vs mês anterior.
            </p>
          </div>
        )}
      </SectionCard>
    </main>
  )
}

function fmtSignedCurrency(diff: number): string {
  const rounded = Math.round(diff * 100) / 100
  if (rounded === 0) return formatCurrency(0)
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(rounded))}`
}

function fmtSignedNumber(diff: number): string {
  if (diff === 0) return '0'
  const sign = diff > 0 ? '+' : '−'
  return `${sign}${Math.abs(diff)}`
}

function fmtSignedPp(diffPoints: number): string {
  const rounded = Math.round(diffPoints * 10) / 10
  if (rounded === 0) return '0pp'
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${Math.abs(rounded)}pp`
}

type MomCompare = { text: string; positive: boolean; muted?: boolean }

function momCurrency(
  current: number | null | undefined,
  previous: number | null | undefined,
  label: string | null | undefined,
  opts?: { invert?: boolean },
): MomCompare | null {
  if (current == null || previous == null || !label) return null
  const diff = current - previous
  return {
    text: `${fmtSignedCurrency(diff)} vs ${label}`,
    positive: opts?.invert ? diff <= 0 : diff >= 0,
  }
}

function momNumber(
  current: number | null | undefined,
  previous: number | null | undefined,
  label: string | null | undefined,
  opts?: { invert?: boolean },
): MomCompare | null {
  if (current == null || previous == null || !label) return null
  const diff = current - previous
  return {
    text: `${fmtSignedNumber(diff)} vs ${label}`,
    positive: opts?.invert ? diff <= 0 : diff >= 0,
  }
}

function InsightCard({
  icon,
  label,
  value,
  compare,
  emphasize,
}: {
  icon: React.ReactNode
  label: string
  value: string
  compare?: { text: string; positive: boolean; muted?: boolean } | null
  emphasize?: boolean
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-2xl border p-4 ${
        emphasize ? 'border-gold/30 bg-gradient-to-b from-gold/10 to-card' : 'border-border bg-card'
      }`}
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-muted">
        {icon}
        <span className="truncate text-[0.65rem] uppercase tracking-wide">{label}</span>
      </div>
      <p
        className="max-w-full break-words font-semibold tabular-nums leading-tight [overflow-wrap:anywhere] text-[clamp(0.95rem,2.6vw,1.5rem)]"
        title={value}
      >
        {value}
      </p>
      {compare ? (
        <p
          className={`mt-1.5 break-words text-[0.7rem] leading-snug [overflow-wrap:anywhere] ${
            compare.muted
              ? 'text-muted'
              : compare.positive
                ? 'font-medium text-success'
                : 'font-medium text-warning'
          }`}
        >
          {compare.text}
        </p>
      ) : null}
    </div>
  )
}

function DeltaUnder({
  value,
  suffix,
  isCurrency,
}: {
  value: number
  suffix: string
  isCurrency?: boolean
}) {
  if (value === 0) return null
  const positive = value > 0
  const formatted = isCurrency ? formatCurrency(Math.abs(value)) : `${Math.abs(value)}${suffix}`
  return (
    <span className={`text-[0.65rem] font-semibold ${positive ? 'text-success' : 'text-warning'}`}>
      {positive ? '+' : '−'}
      {formatted}
    </span>
  )
}

function TmCompareCol({
  title,
  current,
  previous,
}: {
  title: string
  current: TmBucket
  previous: TmBucket
}) {
  const delta =
    current.avgMinutes != null && previous.avgMinutes != null
      ? Math.round((current.avgMinutes - previous.avgMinutes) * 10) / 10
      : null
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums leading-tight">
        {current.avgMinutes != null ? `${current.avgMinutes} min` : '—'}
      </p>
      <p className="mt-0.5 text-xs text-muted">{current.label}</p>
      <p className="mt-2 text-xs text-muted">
        vs {previous.label}: {previous.avgMinutes != null ? `${previous.avgMinutes} min` : '—'}
      </p>
      {delta != null && (
        <p
          className={`mt-1 text-[0.7rem] font-semibold ${
            delta <= 0 ? 'text-success' : 'text-warning'
          }`}
        >
          {delta > 0 ? '+' : '−'}
          {Math.abs(delta)} min vs {previous.label}
        </p>
      )}
    </div>
  )
}
