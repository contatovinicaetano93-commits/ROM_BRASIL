'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, FileText, RefreshCw } from 'lucide-react'
import { MonthYearField } from '../_components/MonthYearField'
import { SectionCard } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'
import { formatCurrency, formatPercentPoints, todayIso } from '@/lib/salon/format'
import {
  buildMonthOverviewCsv,
  buildMonthOverviewPrintHtml,
  downloadTextFile,
  openPrintHtml,
} from '@/lib/salon/month-overview-export'
import type { MonthOverview } from '@/lib/salon/month-overview'
import type { AvecSyncMeta } from '@/lib/avec/sync-meta'

function currentMonthKey() {
  return todayIso().slice(0, 7)
}

type OverviewPayload = MonthOverview & { sync?: AvecSyncMeta }

function fmtMomDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  opts?: { currency?: boolean; invert?: boolean },
): { text: string; positive: boolean } | null {
  if (current == null || previous == null) return null
  const diff = current - previous
  if (!Number.isFinite(diff)) return null
  const abs = Math.abs(diff)
  const formatted = opts?.currency
    ? formatCurrency(abs)
    : abs % 1 === 0
      ? String(abs)
      : abs.toFixed(1)
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  return {
    text: `${sign}${formatted}`,
    positive: opts?.invert ? diff <= 0 : diff >= 0,
  }
}

export default function RelatoriosOverviewPage() {
  const brand = getBrand()
  const [month, setMonth] = useState(currentMonthKey)
  const [data, setData] = useState<OverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const load = useCallback(async (opts?: { materialize?: boolean }) => {
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    try {
      const params = new URLSearchParams({ month })
      if (opts?.materialize) params.set('materialize', '1')
      const res = await apiFetch(`/api/relatorios/overview?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.data as OverviewPayload)
    } catch (e) {
      setData(null)
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Overview demorou demais (>45s). Tente de novo ou use um mês já sincronizado.')
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      window.clearTimeout(timer)
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  function exportCsv() {
    if (!data) return
    setExporting('csv')
    try {
      downloadTextFile(`overview_${data.month}_${data.panel}.csv`, buildMonthOverviewCsv(data))
    } finally {
      setExporting(null)
    }
  }

  function exportPdf() {
    if (!data) return
    setExporting('pdf')
    try {
      const ok = openPrintHtml(buildMonthOverviewPrintHtml(data))
      if (!ok) setError('Permita pop-ups para gerar o PDF (imprimir / salvar como PDF).')
    } finally {
      setExporting(null)
    }
  }

  const incomplete = data?.completeness.status === 'incomplete'
  const inProgress = data?.completeness.status === 'in_progress'
  const prevLabel = data?.finance_previous?.label ?? data?.analytics.previous?.label ?? 'mês anterior'

  const closingCards = data
    ? [
        {
          label: 'Receita',
          value: formatCurrency(data.closing.revenue),
          mom: fmtMomDelta(data.closing.revenue, data.finance_previous?.revenue, { currency: true }),
        },
        {
          label: 'Atendidos',
          value: String(data.closing.attended),
          mom: fmtMomDelta(data.closing.attended, data.finance_previous?.attended),
        },
        {
          label: 'Ticket',
          value: formatCurrency(data.closing.ticket_avg),
          mom: fmtMomDelta(data.closing.ticket_avg, data.finance_previous?.ticket_avg, {
            currency: true,
          }),
        },
        {
          label: 'Fluxo',
          value: formatCurrency(data.closing.cash_flow),
          mom: fmtMomDelta(data.closing.cash_flow, data.finance_previous?.cash_flow, {
            currency: true,
          }),
        },
        {
          label: 'Despesas',
          value: formatCurrency(data.closing.expenses),
          mom: fmtMomDelta(data.closing.expenses, data.finance_previous?.expenses, {
            currency: true,
            invert: true,
          }),
        },
        {
          label: 'CMV',
          value: formatCurrency(data.closing.cmv),
          mom: fmtMomDelta(data.closing.cmv, data.finance_previous?.cmv, {
            currency: true,
            invert: true,
          }),
        },
        {
          label: 'Cancelamentos',
          value: String(data.closing.cancelled),
          mom: fmtMomDelta(data.closing.cancelled, data.analytics.previous?.cancelled, {
            invert: true,
          }),
        },
        {
          label: 'No-shows',
          value: String(data.closing.no_shows),
          mom: fmtMomDelta(data.closing.no_shows, data.analytics.previous?.no_shows, {
            invert: true,
          }),
        },
      ]
    : []

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Relatórios</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Overview do mês</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Fechamento oficial {brand.displayName} — dados acumulados no ROM (não Avec ao vivo).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <MonthYearField value={month} onChange={setMonth} aria-label="Mês do overview" />
          </label>
          <button
            type="button"
            onClick={() => void load({ materialize: true })}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-card disabled:opacity-50"
          >
            <RefreshCw size={14} /> Atualizar fechamento
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!data || exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {data?.sync && (data.sync.stale || data.sync.status === 'partial' || data.sync.status === 'error') && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {data.sync.stale
            ? data.sync.never_synced
              ? 'Nenhum sync Avec registrado ainda — confira Admin / cron.'
              : data.sync.fast_stale
                ? 'Sync Avec fast desatualizado (>1h) — números de caixa podem estar velhos.'
                : 'Sync Avec full desatualizado (>24h) — números podem estar velhos.'
            : data.sync.status === 'partial'
              ? 'Último sync Avec parcial — confira Admin.'
              : 'Último sync Avec com erro — confira Admin.'}
        </p>
      )}

      {data?.finance.revenue_source && data.finance.revenue_source !== 'metrics' && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong>{data.label}</strong>
          {data.finance.revenue_source === 'payments_0081'
            ? ' — receita via fallback 0081 (formas de pagamento), não métricas diárias.'
            : ' — sem receita nas métricas diárias.'}
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted">Carregando overview…</p>
      ) : data ? (
        <>
          <div
            className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              incomplete
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                : inProgress
                  ? 'border-border bg-card text-muted'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            {incomplete && <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Status: {data.status_label}</span>
                <span className="rounded-full border border-border px-2.5 py-1 text-[0.65rem] font-semibold text-muted">
                  {data.completeness.days_present}/{data.completeness.days_expected} dias
                </span>
              </div>
              <p className="mt-1 text-xs opacity-90">
                Checado até {data.completeness.check_through}.{' '}
                {incomplete
                  ? `Faltam métricas em: ${data.completeness.days_missing.slice(0, 12).join(', ')}${
                      data.completeness.days_missing.length > 12 ? '…' : ''
                    }`
                  : inProgress
                    ? 'Mês em andamento — o fechamento completa no último dia.'
                    : 'Mês sem buracos no acumulado diário ROM.'}
              </p>
              <p className="mt-1 text-[0.7rem] opacity-80">
                Deltas vs {prevLabel} (mês anterior ao mês base escolhido).
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {closingCards.map((kpi) => (
              <div
                key={kpi.label}
                className="min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-3"
              >
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">{kpi.label}</p>
                <p className="mt-1 max-w-full break-words text-lg font-semibold tabular-nums leading-tight [overflow-wrap:anywhere]">
                  {kpi.value}
                </p>
                {kpi.mom && (
                  <p
                    className={`mt-1 text-[0.7rem] font-medium ${
                      kpi.mom.positive ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {kpi.mom.text} vs {prevLabel}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Operação (Visão analítica)">
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Ocupação média</span>
                  <span className="min-w-0 text-right tabular-nums">
                    {data.analytics.occupancy_avg != null
                      ? formatPercentPoints(data.analytics.occupancy_avg * 100)
                      : '—'}
                    {(() => {
                      const mom = fmtMomDelta(
                        data.analytics.occupancy_avg != null
                          ? data.analytics.occupancy_avg * 100
                          : null,
                        data.analytics.previous?.occupancy_avg != null
                          ? data.analytics.previous.occupancy_avg * 100
                          : null,
                      )
                      return mom ? (
                        <span
                          className={`ml-2 text-[0.7rem] ${
                            mom.positive ? 'text-success' : 'text-warning'
                          }`}
                        >
                          {mom.text} pp
                        </span>
                      ) : null
                    })()}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Receita perdida (est.)</span>
                  <span className="min-w-0 text-right tabular-nums">
                    {data.analytics.lost_revenue != null
                      ? formatCurrency(data.analytics.lost_revenue)
                      : '—'}
                    {(() => {
                      const mom = fmtMomDelta(
                        data.analytics.lost_revenue,
                        data.analytics.previous?.lost_revenue,
                        { currency: true, invert: true },
                      )
                      return mom ? (
                        <span
                          className={`ml-2 text-[0.7rem] ${
                            mom.positive ? 'text-success' : 'text-warning'
                          }`}
                        >
                          {mom.text}
                        </span>
                      ) : null
                    })()}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Pacotes / receita</span>
                  <span className="min-w-0 break-words text-right tabular-nums [overflow-wrap:anywhere]">
                    {data.analytics.packages_sold != null && data.analytics.packages_revenue != null
                      ? `${data.analytics.packages_sold} · ${formatCurrency(data.analytics.packages_revenue)}`
                      : '—'}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Retorno / novos</span>
                  <span className="tabular-nums">
                    {data.analytics.return_rate != null
                      ? formatPercentPoints(data.analytics.return_rate * 100, 0)
                      : '—'}{' '}
                    ·{' '}
                    {data.analytics.new_clients_period != null
                      ? data.analytics.new_clients_period
                      : '—'}
                  </span>
                </li>
                <li className="text-xs text-muted">
                  Snapshot ops: {data.analytics.snapshot_day ?? '—'} (Avec P1–P3, não soma diária)
                </li>
              </ul>
            </SectionCard>

            <SectionCard title="Fontes">
              <ul className="flex flex-col gap-2 text-xs text-muted">
                {data.source_notes.map((n) => (
                  <li key={n.field}>
                    <span className="font-medium text-foreground">{n.field}</span>
                    <span className="mx-1 text-gold">{n.source}</span>
                    — {n.note}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <p className="text-xs text-muted">
            Caixa detalhado:{' '}
            <Link href="/financeiro" className="text-gold hover:underline">
              Financeiro
            </Link>
            {' · '}
            Relatório gerência (Avec 0011 / 0021):{' '}
            <Link href="/admin/relatorio-diretoria" className="text-gold hover:underline">
              abrir
            </Link>
          </p>
        </>
      ) : null}
    </main>
  )
}
