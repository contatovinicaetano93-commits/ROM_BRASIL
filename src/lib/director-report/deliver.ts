import type { DirectorReport } from './types'
import { reactivationCsv, returnCsv, revenueCsv } from './csv'
import { sendDirectorReportEmail, getDirectorReportRecipients } from './email'
import { slugPeriod } from './period'
import { sendTelegramDocument, sendTelegramMessage } from '@/lib/telegram/bot'
import { formatCurrency, formatPercent } from '@/lib/salon/format'

function managementChatId() {
  return process.env.TELEGRAM_STAFF_CHAT_IDS?.split(',')[0]?.trim() || null
}

export async function deliverDirectorReport(report: DirectorReport) {
  const email = await sendDirectorReportEmail(report)
  const slug = slugPeriod(report)

  let telegram: { ok: boolean; error?: string; chat?: string } | null = null
  const chat = managementChatId()
  if (chat && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const caption = [
        `ROM Brasil · Relatório diretoria`,
        `Período: ${report.period.label}`,
        `Data ref.: ${report.period.reference_date}`,
        `${report.summary.professionals} profissionais`,
        `Retorno médio ${formatPercent(report.summary.avg_return_rate, 1)}`,
        `Fat. mês ${formatCurrency(report.summary.total_revenue_selected_month)}`,
        `Ticket ${formatCurrency(report.summary.avg_ticket_selected_month)}`,
        email.ok
          ? `E-mail OK → ${email.to.join(', ')}`
          : `E-mail pendente: ${email.error}`,
      ].join('\n')

      await sendTelegramMessage(chat, caption)
      await sendTelegramDocument(
        chat,
        `faturamento-ticket_${slug}.csv`,
        '\uFEFF' + revenueCsv(report),
        `0021 · ${report.period.selected_month}`
      )
      await sendTelegramDocument(
        chat,
        `retorno-trimestre_${slug}.csv`,
        '\uFEFF' + returnCsv(report),
        `0011 · ${report.period.selected_quarter} vs ${report.period.compare_quarter}`
      )
      await sendTelegramDocument(
        chat,
        `0011-lista-clientes_${slug}.csv`,
        '\uFEFF' + reactivationCsv(report),
        `0011 · lista · ref. ${report.period.reference_date}`
      )
      telegram = { ok: true, chat }
    } catch (e) {
      telegram = { ok: false, chat, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    email,
    telegram,
    recipients: getDirectorReportRecipients(),
    period: report.period,
  }
}
