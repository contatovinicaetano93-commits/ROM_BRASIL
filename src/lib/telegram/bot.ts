import { retryWithBackoff } from '@/lib/retry'

function shouldRetryHttp(e: Error): boolean {
  const status = (e as Error & { status?: number }).status
  return status === undefined || status >= 500
}

async function fetchWithRetry(url: string, init: RequestInit, errorPrefix: string): Promise<Response> {
  return retryWithBackoff(
    async () => {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) {
        const err = new Error(`${errorPrefix} ${res.status}: ${await res.text()}`)
        ;(err as Error & { status?: number }).status = res.status
        throw err
      }
      return res
    },
    { maxAttempts: 3, initialDelayMs: 1000, shouldRetry: shouldRetryHttp },
  )
}

export async function sendTelegramMessage(chatId: number | string, text: string, botToken?: string) {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado')

  await fetchWithRetry(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
    'Telegram API respondeu',
  )
}

/** Bot dedicado do financeiro — token e webhook próprios, separados do bot da equipe. */
export async function sendTelegramFinanceMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_FINANCE_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_FINANCE_BOT_TOKEN não configurado')

  await fetchWithRetry(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
    'Telegram API respondeu',
  )
}

/** Envia arquivo texto/CSV como documento. */
export async function sendTelegramDocument(
  chatId: number | string,
  filename: string,
  content: string,
  caption?: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado')

  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('document', new Blob([content], { type: 'text/csv;charset=utf-8' }), filename)
  if (caption) form.append('caption', caption.slice(0, 1024))

  await fetchWithRetry(
    `https://api.telegram.org/bot${token}/sendDocument`,
    { method: 'POST', body: form },
    'Telegram sendDocument',
  )
}
