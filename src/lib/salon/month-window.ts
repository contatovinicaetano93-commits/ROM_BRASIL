/**
 * Janela de mês unificada para Visão analítica, Financeiro, TM e Relatórios.
 * Mês corrente: 1º → hoje (MTD). Mês fechado: 1º → último dia.
 */
import { todayIso } from '@/lib/salon/format'

export type MonthWindow = { from: string; to: string; month: string; mtd: boolean }

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function calendarMonthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * Resolve YYYY-MM → { from, to }.
 * Sempre MTD no mês corrente (alinha Visão/Financeiro/TM/Relatórios).
 */
export function resolveMonthWindow(
  monthKey: string,
  referenceDay = todayIso(),
): MonthWindow {
  const month = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonthKey(referenceDay)
  const range = calendarMonthRange(month)
  const mtd = month === currentMonthKey(referenceDay)
  return {
    month,
    from: range.from,
    to: mtd ? referenceDay : range.to,
    mtd,
  }
}
