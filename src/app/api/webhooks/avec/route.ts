import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { upsertContact, updateContact, logEvent } from '@/lib/contacts'
import { listServices, addService, scheduleService, markServiceDone } from '@/lib/services'
import { guessServiceCategory } from '@/lib/avec/normalize'

// Webhook Avec — aceita eventos push (quando disponível) ou bridge manual.
// Também funciona como ingestão genérica até confirmarmos o formato oficial.
const baseSchema = z.object({
  event: z
    .enum(['client.upsert', 'appointment.created', 'appointment.updated', 'service.completed'])
    .optional(),
  client_id: z.string(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  service_name: z.string().optional(),
  scheduled_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  status: z.enum(['novo', 'em_atendimento', 'agendado', 'convertido', 'perdido']).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-avec-secret')
    if (!process.env.AVEC_WEBHOOK_SECRET || secret !== process.env.AVEC_WEBHOOK_SECRET) {
      return err('Não autorizado', 401)
    }

    const body = await req.json()
    const payload = baseSchema.parse(body)
    const event = payload.event ?? 'client.upsert'

    const contact = await upsertContact({
      phone: payload.phone,
      name: payload.name,
      email: payload.email,
      channel: 'avec',
      source: 'avec_webhook',
      avecClientId: payload.client_id,
      status: payload.status,
    })

    if (payload.status) {
      await updateContact(contact.id, { status: payload.status })
    }

    if (event === 'appointment.created' || event === 'appointment.updated') {
      if (payload.service_name && payload.scheduled_at) {
        const services = await listServices(contact.id)
        let service = services.find((s) => s.name.toLowerCase() === payload.service_name!.toLowerCase())
        if (!service) {
          service = await addService(contact.id, {
            name: payload.service_name,
            category: guessServiceCategory(payload.service_name),
          })
        }
        await scheduleService(service.id, payload.scheduled_at)
        await updateContact(contact.id, { status: 'agendado' })
      }
    }

    if (event === 'service.completed' && payload.service_name) {
      const services = await listServices(contact.id)
      let service = services.find((s) => s.name.toLowerCase() === payload.service_name!.toLowerCase())
      if (!service) {
        service = await addService(contact.id, {
          name: payload.service_name,
          category: guessServiceCategory(payload.service_name),
        })
      }
      await markServiceDone(service.id)
      await updateContact(contact.id, { status: 'convertido' })
    }

    await logEvent({
      contactId: contact.id,
      channel: 'avec',
      direction: 'in',
      handledBy: 'system',
      payload: { event, ...body },
    })

    return ok({ contact_id: contact.id, event })
  } catch (e) {
    return handleError(e)
  }
}
