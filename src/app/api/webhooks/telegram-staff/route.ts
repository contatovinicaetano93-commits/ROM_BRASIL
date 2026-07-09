import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { sendStaffBotMessage, isStaffBotConfigured } from '@/lib/telegram/staff-bot'
import {
  getProfessionalByTelegramChatId,
  listProfessionalSchedulesForDay,
  listProfessionalUpcoming,
} from '@/lib/professionals'
import { todayIso, fmtSchedule, formatCurrency } from '@/lib/salon/format'

const UNLINKED_MESSAGE = `Oi! Sou o bot da equipe ROM Brasil.

Seu Telegram ainda não está vinculado a um profissional.
Peça à recepção/admin para vincular seu chat no painel.`

const HELP_MESSAGE = `Comandos (só a sua agenda):

/hoje — horários de hoje
/agenda — próximos 7 dias
/meta — sua meta do dia (se configurada)
/start — esta mensagem

Você não tem acesso aos KPIs do salão neste bot.`

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

function formatAgenda(
  rows: { contact_name: string | null; name: string; scheduled_at: string }[],
  emptyLabel: string
) {
  if (rows.length === 0) return emptyLabel
  return rows
    .map((r, i) => `${i + 1}. ${fmtSchedule(r.scheduled_at)} — ${r.contact_name ?? 'Cliente'} · ${r.name}`)
    .join('\n')
}

export async function POST(req: NextRequest) {
  if (!isStaffBotConfigured()) {
    return err('Bot staff não configurado (TELEGRAM_STAFF_BOT_TOKEN)', 503)
  }

  const expected = process.env.TELEGRAM_STAFF_WEBHOOK_SECRET?.trim()
  if (!expected) {
    return err('Webhook staff não configurado (TELEGRAM_STAFF_WEBHOOK_SECRET)', 503)
  }

  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== expected) {
    return ok({ ignored: true }, undefined, 200)
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  const chatId = update?.message?.chat.id
  const text = update?.message?.text?.trim()
  if (!chatId || !text) return ok({ ignored: true })

  const pro = await getProfessionalByTelegramChatId(chatId)
  if (!pro) {
    await sendStaffBotMessage(chatId, UNLINKED_MESSAGE).catch(() => {})
    return ok({ replied: true, mode: 'unlinked' })
  }

  try {
    if (/^\/start\b/i.test(text) || /^\/help\b/i.test(text)) {
      await sendStaffBotMessage(
        chatId,
        `Oi, ${pro.name}! 👋\nBot da equipe · ROM Brasil\n\n${HELP_MESSAGE}`
      )
      return ok({ replied: true, mode: 'start', professional_id: pro.id })
    }

    if (/^\/hoje\b/i.test(text)) {
      const day = todayIso()
      const rows = await listProfessionalSchedulesForDay(pro.id, day)
      const body = formatAgenda(rows, 'Nenhum horário seu para hoje.')
      await sendStaffBotMessage(chatId, `📅 Sua agenda hoje (${pro.name})\n\n${body}`)
      return ok({ replied: true, mode: 'hoje', count: rows.length })
    }

    if (/^\/agenda\b/i.test(text)) {
      const rows = await listProfessionalUpcoming(pro.id, 7, 20)
      const body = formatAgenda(rows, 'Nenhum horário nos próximos 7 dias.')
      await sendStaffBotMessage(chatId, `🗓 Próximos horários (${pro.name})\n\n${body}`)
      return ok({ replied: true, mode: 'agenda', count: rows.length })
    }

    if (/^\/meta\b/i.test(text)) {
      if (pro.daily_goal == null) {
        await sendStaffBotMessage(
          chatId,
          `Meta individual ainda não configurada para ${pro.name}.\nPeça à recepção para definir.`
        )
      } else {
        await sendStaffBotMessage(
          chatId,
          `🎯 Meta do dia (${pro.name}): ${formatCurrency(Number(pro.daily_goal))}\n\nO faturamento individual entra quando o sync Avec estiver ativo.`
        )
      }
      return ok({ replied: true, mode: 'meta' })
    }

    await sendStaffBotMessage(
      chatId,
      `Não entendi. Use /hoje, /agenda ou /meta.\n\n(Este bot não responde perguntas gerais do salão.)`
    )
    return ok({ replied: true, mode: 'unknown' })
  } catch (e) {
    console.error('[telegram-staff]', e)
    await sendStaffBotMessage(chatId, 'Erro ao processar. Tente de novo em instantes.').catch(
      () => {}
    )
    return ok({ replied: true, mode: 'error' })
  }
}
