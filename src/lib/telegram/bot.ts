export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    throw new Error(`Telegram API respondeu ${res.status}: ${await res.text()}`)
  }
}
