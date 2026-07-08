import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { upsertContact, logEvent } from '@/lib/contacts'

// Payload genérico até confirmarmos o formato real do webhook/API do Avec.
// Ajustar o schema assim que o suporte deles confirmar a documentação.
const schema = z.object({
  client_id: z.string(),
  name: z.string().optional(),
  phone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-avec-secret')
    if (secret !== process.env.AVEC_WEBHOOK_SECRET) {
      return err('Não autorizado', 401)
    }

    const body = await req.json()
    const payload = schema.parse(body)

    const contact = await upsertContact({
      phone: payload.phone,
      name: payload.name,
      channel: 'avec',
      source: 'avec_webhook',
      avecClientId: payload.client_id,
    })

    await logEvent({
      contactId: contact.id,
      channel: 'avec',
      direction: 'in',
      handledBy: 'system',
      payload: body,
    })

    return ok({ contact_id: contact.id })
  } catch (e) {
    return handleError(e)
  }
}
