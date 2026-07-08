import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter } from '@/lib/whatsapp/adapter'
import { handleWhatsAppMessage } from '@/lib/whatsapp/conversation'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'

function authorizeWebhook(req: NextRequest) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
  if (!secret) return true

  const header =
    req.headers.get('x-whatsapp-secret') ??
    req.headers.get('x-webhook-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  return header === secret
}

export async function POST(req: NextRequest) {
  if (!authorizeWebhook(req)) {
    return ok({ ignored: true }, undefined, 200)
  }

  const body = await req.json().catch(() => null)
  const parsed = parseWhatsAppPayload(body)
  if (!parsed) return err('Payload inválido', 422)

  const { from, text } = parsed

  try {
    const { contactId, reply, intent, handoff } = await handleWhatsAppMessage(from, text)

    await getWhatsAppAdapter().sendMessage(from, reply)

    await logEvent({
      contactId,
      channel: 'whatsapp',
      direction: 'out',
      handledBy: handoff ? 'system' : 'ai',
      payload: { text: reply, intent, handoff },
    })

    return ok({ replied: true, intent, handoff })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    await logEvent({
      contactId: null,
      channel: 'whatsapp',
      direction: 'in',
      handledBy: 'system',
      payload: { text, from },
      error: message,
    }).catch(() => {})

    return ok({ replied: false, error: message })
  }
}
