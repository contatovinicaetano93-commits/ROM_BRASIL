/** Bot Telegram dos funcionários (ROM Brasil) — separado do bot de gestão. */

export function isStaffBotConfigured() {
  return Boolean(process.env.TELEGRAM_STAFF_BOT_TOKEN?.trim())
}

export async function sendStaffBotMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_STAFF_BOT_TOKEN?.trim()
  if (!token) throw new Error('TELEGRAM_STAFF_BOT_TOKEN não configurado')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    throw new Error(`Telegram Staff API respondeu ${res.status}: ${await res.text()}`)
  }
}
