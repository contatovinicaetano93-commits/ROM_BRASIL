import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { upsertContact, logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter } from '@/lib/whatsapp/adapter'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'
import { askAI } from '@/lib/ai/client'
import { verifyWhatsAppWebhook } from '@/lib/webhooks'

const FIRST_CONTACT_PROMPT = `Você é a recepcionista virtual do salão ROM. Seja calorosa, direta e breve
(máx. 3 frases). Objetivo: entender se a pessoa quer agendar um horário, tirar
uma dúvida sobre serviço/preço, ou outra coisa — e guiar pro próximo passo.
Se a pergunta fugir do escopo do salão, diga que vai chamar uma atendente humana.`

export async function POST(req: NextRequest) {
  const auth = verifyWhatsAppWebhook(req)
  if (!auth.ok) return err(auth.reason, 401)

  const body = await req.json().catch(() => null)
  const parsed = parseWhatsAppPayload(body)
  if (!parsed) return err('Payload inválido', 422)

  const { from, text } = parsed

  let contactId: string | null = null

  try {
    const contact = await upsertContact({
      phone: from,
      channel: 'whatsapp',
      source: 'whatsapp_bot',
    })
    contactId = contact.id

    await logEvent({
      contactId,
      channel: 'whatsapp',
      direction: 'in',
      handledBy: 'ai',
      payload: { text },
    })

    const reply = await askAI(FIRST_CONTACT_PROMPT, text)

    await getWhatsAppAdapter().sendMessage(from, reply)

    await logEvent({
      contactId,
      channel: 'whatsapp',
      direction: 'out',
      handledBy: 'ai',
      payload: { text: reply },
    })

    return ok({ replied: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    await logEvent({
      contactId,
      channel: 'whatsapp',
      direction: 'in',
      handledBy: 'system',
      payload: { text },
      error: message,
    }).catch(() => {})

    return ok({ replied: false, error: message })
  }
}
