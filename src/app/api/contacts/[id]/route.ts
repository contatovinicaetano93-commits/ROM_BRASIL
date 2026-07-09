import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import {
  getContactById,
  updateContact,
  logEvent,
  listEvents,
  CONTACT_STATUSES,
  setPreferredManicurist,
} from '@/lib/contacts'
import { listServices, autoCompleteServicesOnConversion, pickLastVisit } from '@/lib/services'
import { enrichServices, computeRecommendations } from '@/lib/recommendations'
import { isNailService } from '@/lib/avec/normalize'

type Ctx = { params: Promise<{ id: string }> }

function derivePreferredManicurist(
  services: { name: string; professional_name: string | null; last_done_at: string | null; scheduled_at: string | null }[]
): string | null {
  const nail = services
    .filter((s) => isNailService(s.name) && s.professional_name)
    .sort((a, b) => {
      const ta = a.last_done_at ?? a.scheduled_at ?? ''
      const tb = b.last_done_at ?? b.scheduled_at ?? ''
      return tb.localeCompare(ta)
    })
  return nail[0]?.professional_name ?? null
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    let contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)

    const rawServices = await listServices(id)
    if (!contact.preferred_manicurist) {
      const derived = derivePreferredManicurist(rawServices)
      if (derived) {
        await setPreferredManicurist(id, derived)
        contact = { ...contact, preferred_manicurist: derived }
      }
    }

    const services = enrichServices(rawServices)
    const recommendations = computeRecommendations(services)
    const events = await listEvents(id)
    const last_visit = pickLastVisit(rawServices)

    return ok({ contact, services, recommendations, events, last_visit })
  } catch (e) {
    return handleError(e)
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().min(8).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  notes: z.string().optional(),
  preferred_manicurist: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = patchSchema.parse(await req.json())

    const before = await getContactById(id)
    if (!before) return err('Contato não encontrado', 404)

    const patch = {
      name: body.name,
      email: body.email,
      phone: body.phone,
      status: body.status,
      notes: body.notes,
      ...(body.preferred_manicurist !== undefined
        ? { preferredManicurist: body.preferred_manicurist }
        : {}),
    }

    const updated = await updateContact(id, patch)
    if (!updated) return err('Contato não encontrado', 404)

    let autoDone: string[] = []
    if (body.status === 'convertido' && before.status !== 'convertido') {
      autoDone = await autoCompleteServicesOnConversion(id)
    }

    await logEvent({
      contactId: id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: {
        update: body,
        ...(autoDone.length > 0 ? { conversion_auto_done: autoDone } : {}),
      },
    })

    return ok({ ...updated, auto_completed_services: autoDone })
  } catch (e) {
    return handleError(e)
  }
}
