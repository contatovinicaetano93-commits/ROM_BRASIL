import { formatCurrency } from '@/lib/salon/format'
import type { FinanceKpiBucket } from '@/lib/finance'

/** Texto do /financeiro — mês acumulado + receita de hoje + formas de pagamento. */
export function formatFinanceTelegramSummary(opts: {
  month: FinanceKpiBucket
  todayRevenue: number | null
}): string {
  const { month, todayRevenue } = opts
  const lines = [
    `💰 *Financeiro — ${month.label}*`,
    `Receita hoje: ${formatCurrency(todayRevenue ?? 0)}`,
    `Receita mês (acumulado): ${formatCurrency(month.revenue)}`,
    `Despesas: ${formatCurrency(month.expenses)}`,
    `Margem bruta: ${month.gross_margin != null ? `${month.gross_margin}%` : '—'}`,
    `Fluxo: ${formatCurrency(month.cash_flow)}`,
    `Atendidos no mês: ${month.attended}`,
    `Ticket médio: ${month.ticket_avg != null ? formatCurrency(month.ticket_avg) : '—'}`,
  ]

  if (month.payment_mix.length > 0) {
    lines.push('', '*Formas de pagamento (mês):*')
    for (const p of month.payment_mix.slice(0, 8)) {
      lines.push(`• ${p.method}: ${formatCurrency(p.amount)} (${p.share}%)`)
    }
  }

  if (month.revenue === 0) {
    lines.push('', '_Receita ainda não sincronizada pela Avec esse mês._')
  }

  return lines.join('\n')
}
