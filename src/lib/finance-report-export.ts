import type { FinanceKpiBucket, FinanceKpis } from '@/lib/finance'
import {
  formatCurrency,
  formatDateBr,
  formatNumberBr,
  formatPercentPoints,
} from '@/lib/salon/format'

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
      cur.cash_flow != null && prev.cash_flow != null
        ? csvMoney(cur.cash_flow - prev.cash_flow)
        : '—',
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

export function downloadFinanceCompareCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
