import type { DirectorReport, MonthKey, QuarterKey } from './types'

const MONTH_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function labelMonth(month: MonthKey): string {
  const [y, m] = month.split('-')
  const idx = Number(m) - 1
  if (!y || idx < 0 || idx > 11) return month
  return `${MONTH_PT[idx]}/${y}`
}

export function labelQuarter(quarter: QuarterKey): string {
  const [y, q] = quarter.split('-Q')
  if (!y || !q) return quarter
  return `${q}º tri/${y}`
}

/** Ex.: "Fat Mar/2026 · Retorno 1º tri/2026 vs 1º tri/2025" */
export function reportPeriodLabel(report: DirectorReport): string {
  const { selected_month, selected_quarter, compare_quarter } = report.period
  return `Fat ${labelMonth(selected_month)} · Retorno ${labelQuarter(selected_quarter)} vs ${labelQuarter(compare_quarter)}`
}

/** Data de referência do relatório (último dia do mês selecionado), pt-BR. */
export function reportReferenceDate(report: DirectorReport): string {
  const [y, m] = report.period.selected_month.split('-').map(Number)
  if (!y || !m) {
    return new Date(report.generated_at).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })
  }
  const last = new Date(Date.UTC(y, m, 0))
  return last.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

export function reportSubject(report: DirectorReport): string {
  return `ROM Brasil · Relatório diretoria · ${reportPeriodLabel(report)} · ref. ${reportReferenceDate(report)}`
}

export function slugPeriod(report: DirectorReport): string {
  const { selected_month, selected_quarter, compare_quarter } = report.period
  return `${selected_month}_${selected_quarter}_vs_${compare_quarter}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}
