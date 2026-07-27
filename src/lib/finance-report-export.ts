import type { FinanceKpiBucket, FinanceKpis } from '@/lib/finance'
import {
  formatCurrency,
  formatDateBr,
  formatNumberBr,
  formatPercentPoints,
} from '@/lib/salon/format'
import { openPrintHtml } from '@/lib/salon/month-overview-export'

export interface FinanceExpenseRow {
  expense_date: string
  description: string
  category_name: string
  amount: number
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(...cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(';')
}

function csvMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return formatCurrency(n)
}

function csvPercentPoints(n: number | null | undefined): string {
  if (n == null) return '—'
  return formatPercentPoints(n)
}

function reconciliationStatusPt(
  status: FinanceKpiBucket['payment_reconciliation']['status'],
): string {
  switch (status) {
    case 'aligned':
      return 'Conciliado'
    case 'divergent':
      return 'Divergente'
    case 'missing_payments':
      return 'Sem formas de pagamento'
    case 'missing_revenue':
      return 'Sem receita'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function revenueSourceNote(bucket: FinanceKpiBucket): string {
  switch (bucket.revenue_source) {
    case 'metrics':
      return 'métricas diárias (salon_daily_metrics)'
    case 'payments_0081':
      return 'fallback 0081 (métricas do mês vazias — rode backfill de receita)'
    case 'empty':
      return 'sem receita em métricas nem 0081'
    default: {
      const _exhaustive: never = bucket.revenue_source
      return _exhaustive
    }
  }
}

/** CSV do relatório financeiro com mês atual × comparado. */
export function buildFinanceCompareCsv(opts: {
  kpis: FinanceKpis
  expenses: FinanceExpenseRow[]
  legend: { term: string; meaning: string }[]
  generatedAt?: Date
}): string {
  const { kpis, expenses, legend } = opts
  const cur = kpis.current
  const prev = kpis.previous
  const generatedAt = opts.generatedAt ?? new Date()
  const rec = cur.payment_reconciliation
  const fiscal = cur.fiscal_split

  const lines: string[] = [
    csvRow('Relatório financeiro ROM'),
    csvRow('Gerado em', generatedAt.toLocaleString('pt-BR')),
    csvRow('Período', cur.label, 'vs', prev.label),
    csvRow('Fonte receita', cur.label, revenueSourceNote(cur)),
    csvRow('Fonte receita', prev.label, revenueSourceNote(prev)),
    csvRow('Valores em Real (R$) — formato brasileiro: milhar com ponto, decimal com vírgula'),
    '',
    csvRow('=== RESUMO ==='),
    csvRow('Métrica', cur.label, prev.label, 'Variação'),
    csvRow('Receita', csvMoney(cur.revenue), csvMoney(prev.revenue), csvMoney(cur.revenue - prev.revenue)),
    csvRow(
      'Atendidos',
      formatNumberBr(cur.attended, 0),
      formatNumberBr(prev.attended, 0),
      formatNumberBr(cur.attended - prev.attended, 0),
    ),
    csvRow(
      'Ticket médio',
      csvMoney(cur.ticket_avg),
      csvMoney(prev.ticket_avg),
      cur.ticket_avg != null && prev.ticket_avg != null
        ? csvMoney(cur.ticket_avg - prev.ticket_avg)
        : '—',
    ),
    csvRow(
      'Despesas',
      csvMoney(cur.expenses),
      csvMoney(prev.expenses),
      csvMoney(cur.expenses - prev.expenses),
    ),
    csvRow(
      'Margem bruta (%)',
      csvPercentPoints(cur.gross_margin),
      csvPercentPoints(prev.gross_margin),
      cur.gross_margin != null && prev.gross_margin != null
        ? csvPercentPoints(cur.gross_margin - prev.gross_margin)
        : '—',
    ),
    csvRow(
      'Fluxo (receita − despesas)',
      csvMoney(cur.cash_flow),
      csvMoney(prev.cash_flow),
      csvMoney(cur.cash_flow - prev.cash_flow),
    ),
    csvRow('CMV (saídas de estoque)', csvMoney(cur.cmv), csvMoney(prev.cmv), csvMoney(cur.cmv - prev.cmv)),
    csvRow(
      'Cobertura CMV — custo na saída (%)',
      csvPercentPoints(cur.cmv_coverage.movement_cost_pct),
      csvPercentPoints(prev.cmv_coverage.movement_cost_pct),
      '—',
    ),
    csvRow(
      'Cobertura CMV — com algum custo (%)',
      csvPercentPoints(cur.cmv_coverage.any_cost_pct),
      csvPercentPoints(prev.cmv_coverage.any_cost_pct),
      '—',
    ),
    csvRow(
      'CMV saídas (movimento / produto / zero)',
      `${cur.cmv_coverage.with_movement_cost}/${cur.cmv_coverage.with_product_fallback}/${cur.cmv_coverage.with_zero}`,
      `${prev.cmv_coverage.with_movement_cost}/${prev.cmv_coverage.with_product_fallback}/${prev.cmv_coverage.with_zero}`,
      '—',
    ),
    csvRow(
      'Margem após CMV (%)',
      csvPercentPoints(cur.margin_after_cmv),
      csvPercentPoints(prev.margin_after_cmv),
      cur.margin_after_cmv != null && prev.margin_after_cmv != null
        ? csvPercentPoints(cur.margin_after_cmv - prev.margin_after_cmv)
        : '—',
    ),
    '',
    csvRow('=== CONCILIAÇÃO DE PAGAMENTOS (Avec 0081) ==='),
    csvRow('Status', reconciliationStatusPt(rec.status)),
    csvRow('Receita (métricas/fallback)', csvMoney(rec.revenue)),
    csvRow('Soma formas de pagamento', csvMoney(rec.payments_total)),
    csvRow('Diferença (pagamentos − receita)', csvMoney(rec.delta)),
    csvRow('Tolerância', csvMoney(rec.tolerance)),
    '',
    csvRow(`=== FORMAS DE PAGAMENTO — ${cur.label} ===`),
    csvRow('Método', 'Valor', '% do total'),
    ...(cur.payment_mix.length > 0
      ? cur.payment_mix.map((p) => csvRow(p.method, csvMoney(p.amount), csvPercentPoints(p.share)))
      : [csvRow('(sem dados 0081 neste mês)')]),
    '',
    csvRow(`=== FORMAS DE PAGAMENTO — ${prev.label} ===`),
    csvRow('Método', 'Valor', '% do total'),
    ...(prev.payment_mix.length > 0
      ? prev.payment_mix.map((p) => csvRow(p.method, csvMoney(p.amount), csvPercentPoints(p.share)))
      : [csvRow('(sem dados 0081 neste mês)')]),
    '',
    csvRow(`=== SPLIT FISCAL — ${cur.label} ===`),
    csvRow('Bruto pago', csvMoney(fiscal.gross_paid)),
    csvRow('CBS retido', csvMoney(fiscal.cbs_retained)),
    csvRow('IBS retido', csvMoney(fiscal.ibs_retained)),
    csvRow('Líquido recebido', csvMoney(fiscal.net_received)),
    csvRow('Settlements', `${fiscal.settled_count} liquidados / ${fiscal.pending_count} pendentes`),
    '',
    csvRow(`=== RECEITA DIÁRIA — ${cur.label} ===`),
    csvRow('Data', 'Receita', 'Atendidos', 'Ticket médio'),
    ...(cur.daily.length > 0
      ? cur.daily.map((d) =>
          csvRow(
            formatDateBr(d.day),
            csvMoney(d.revenue),
            formatNumberBr(d.attended, 0),
            csvMoney(d.ticket_avg),
          ),
        )
      : [csvRow('(sem receita diária)')]),
    '',
    csvRow(`=== RECEITA DIÁRIA — ${prev.label} ===`),
    csvRow('Data', 'Receita', 'Atendidos', 'Ticket médio'),
    ...(prev.daily.length > 0
      ? prev.daily.map((d) =>
          csvRow(
            formatDateBr(d.day),
            csvMoney(d.revenue),
            formatNumberBr(d.attended, 0),
            csvMoney(d.ticket_avg),
          ),
        )
      : [csvRow('(sem receita diária — rode backfill do mês comparado)')]),
    '',
    csvRow(`=== DESPESAS — ${cur.label} ===`),
    csvRow('Data', 'Descrição', 'Categoria', 'Valor'),
    ...(expenses.length > 0
      ? expenses.map((e) =>
          csvRow(
            formatDateBr(e.expense_date),
            e.description,
            e.category_name,
            csvMoney(e.amount),
          ),
        )
      : [csvRow('(nenhuma despesa lançada)')]),
    '',
    csvRow('=== LEGENDA ==='),
    csvRow('Termo', 'Significado'),
    ...legend.map((item) => csvRow(item.term, item.meaning)),
    '',
    csvRow(
      'Observação',
      'ROM é a fonte de fechamento do mês. Se o mês comparado vier zerado em receita, o sync Avec só cobre ~7 dias — rode o backfill do mês (scripts/run-revenue-month-backfill) ou amplie AVEC_REVENUE_DAYS_BACK.',
    ),
  ]

  return '\uFEFF' + lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function barPair(label: string, a: number, b: number, aLabel: string, bLabel: string): string {
  const max = Math.max(a, b, 1)
  const wa = Math.round((a / max) * 100)
  const wb = Math.round((b / max) * 100)
  return `<div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="bars">
      <div class="bar-row"><span class="bar-name">${escapeHtml(aLabel)}</span>
        <div class="track"><div class="fill cur" style="width:${wa}%"></div></div>
        <span class="bar-val">${escapeHtml(formatCurrency(a))}</span></div>
      <div class="bar-row"><span class="bar-name">${escapeHtml(bLabel)}</span>
        <div class="track"><div class="fill prev" style="width:${wb}%"></div></div>
        <span class="bar-val">${escapeHtml(formatCurrency(b))}</span></div>
    </div>
  </div>`
}

function barPairNumber(
  label: string,
  a: number,
  b: number,
  aLabel: string,
  bLabel: string,
  format: (n: number) => string = (n) => formatNumberBr(n, 0),
): string {
  const max = Math.max(a, b, 1)
  const wa = Math.round((a / max) * 100)
  const wb = Math.round((b / max) * 100)
  return `<div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="bars">
      <div class="bar-row"><span class="bar-name">${escapeHtml(aLabel)}</span>
        <div class="track"><div class="fill cur" style="width:${wa}%"></div></div>
        <span class="bar-val">${escapeHtml(format(a))}</span></div>
      <div class="bar-row"><span class="bar-name">${escapeHtml(bLabel)}</span>
        <div class="track"><div class="fill prev" style="width:${wb}%"></div></div>
        <span class="bar-val">${escapeHtml(format(b))}</span></div>
    </div>
  </div>`
}

/** HTML imprimível: resumo + página de gráficos Jul vs mês comparado. */
export function buildFinanceComparePrintHtml(opts: {
  kpis: FinanceKpis
  unit: string
}): string {
  const cur = opts.kpis.current
  const prev = opts.kpis.previous
  const deltaPct =
    prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10 : null

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Financeiro ${escapeHtml(cur.label)} vs ${escapeHtml(prev.label)} — ${escapeHtml(opts.unit)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 28px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; margin: 22px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  .warn { background: #fff7e6; border: 1px solid #e6c200; padding: 8px 10px; font-size: 12px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 5px 6px; border-bottom: 1px solid #eee; }
  .metric { margin: 0 0 14px; }
  .metric-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; color: #444; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .bar-name { width: 72px; font-size: 12px; color: #555; }
  .track { flex: 1; height: 14px; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
  .fill { height: 100%; border-radius: 3px; }
  .fill.cur { background: #1f6f5b; }
  .fill.prev { background: #8a8a8a; }
  .bar-val { width: 110px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
  .page-break { page-break-before: always; }
  .note { font-size: 11px; color: #666; margin-top: 18px; }
  @media print { body { margin: 12mm; } .page-break { page-break-before: always; } }
</style>
</head>
<body>
  <h1>Relatório financeiro — ${escapeHtml(opts.unit)}</h1>
  <div class="meta">${escapeHtml(cur.label)} vs ${escapeHtml(prev.label)} · gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
  ${
    prev.revenue_source !== 'metrics'
      ? `<div class="warn"><strong>${escapeHtml(prev.label)}:</strong> ${escapeHtml(revenueSourceNote(prev))}. Comparativo de receita pode estar incompleto até o backfill do mês.</div>`
      : ''
  }

  <h2>Resumo</h2>
  <table>
    <tr><th>Métrica</th><th>${escapeHtml(cur.label)}</th><th>${escapeHtml(prev.label)}</th><th>Δ</th></tr>
    <tr><td>Receita</td><td>${escapeHtml(formatCurrency(cur.revenue))}</td><td>${escapeHtml(formatCurrency(prev.revenue))}</td><td>${escapeHtml(formatCurrency(cur.revenue - prev.revenue))}${deltaPct != null ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct}%)` : ''}</td></tr>
    <tr><td>Atendidos</td><td>${escapeHtml(formatNumberBr(cur.attended, 0))}</td><td>${escapeHtml(formatNumberBr(prev.attended, 0))}</td><td>${escapeHtml(formatNumberBr(cur.attended - prev.attended, 0))}</td></tr>
    <tr><td>Ticket médio</td><td>${cur.ticket_avg != null ? escapeHtml(formatCurrency(cur.ticket_avg)) : '—'}</td><td>${prev.ticket_avg != null ? escapeHtml(formatCurrency(prev.ticket_avg)) : '—'}</td><td>—</td></tr>
    <tr><td>Despesas</td><td>${escapeHtml(formatCurrency(cur.expenses))}</td><td>${escapeHtml(formatCurrency(prev.expenses))}</td><td>${escapeHtml(formatCurrency(cur.expenses - prev.expenses))}</td></tr>
    <tr><td>CMV</td><td>${escapeHtml(formatCurrency(cur.cmv))}</td><td>${escapeHtml(formatCurrency(prev.cmv))}</td><td>${escapeHtml(formatCurrency(cur.cmv - prev.cmv))}</td></tr>
    <tr><td>Fluxo</td><td>${escapeHtml(formatCurrency(cur.cash_flow))}</td><td>${escapeHtml(formatCurrency(prev.cash_flow))}</td><td>${escapeHtml(formatCurrency(cur.cash_flow - prev.cash_flow))}</td></tr>
  </table>

  <div class="page-break"></div>
  <h1>Gráficos — ${escapeHtml(cur.label)} × ${escapeHtml(prev.label)}</h1>
  <div class="meta">Barras comparativas (valores absolutos)</div>
  ${barPair('Receita', cur.revenue, prev.revenue, cur.label, prev.label)}
  ${barPairNumber('Atendidos', cur.attended, prev.attended, cur.label, prev.label)}
  ${barPair('Ticket médio', cur.ticket_avg ?? 0, prev.ticket_avg ?? 0, cur.label, prev.label)}
  ${barPair('CMV', cur.cmv, prev.cmv, cur.label, prev.label)}
  ${barPair('Despesas', cur.expenses, prev.expenses, cur.label, prev.label)}
  ${barPair('Fluxo', cur.cash_flow, prev.cash_flow, cur.label, prev.label)}

  <p class="note">
    Fonte receita ${escapeHtml(cur.label)}: ${escapeHtml(revenueSourceNote(cur))}.
    Fonte receita ${escapeHtml(prev.label)}: ${escapeHtml(revenueSourceNote(prev))}.
    Se o mês comparado estiver vazio nas métricas diárias, rode o backfill de receita do mês.
  </p>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`
}

export function downloadFinanceCompareCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function printFinanceCompareReport(kpis: FinanceKpis, unit: string) {
  return openPrintHtml(buildFinanceComparePrintHtml({ kpis, unit }))
}
