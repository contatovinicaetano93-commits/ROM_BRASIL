import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { getContactById, logEvent } from '@/lib/contacts'
import { listServices } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'
import { getContactRecommendations } from '@/lib/salon/recommendations'
import { resolveBriefCache } from '@/lib/salon/brief-cache'
import { generateBrief } from '@/lib/brief'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)

    const services = enrichServices(await listServices(id))
    const { recommendations } = await getContactRecommendations(id)

    const cached = await resolveBriefCache(contact, services, recommendations, () =>
      generateBrief(contact, services, recommendations)
    )

    if (!cached.from_cache) {
      await logEvent({
        contactId: id,
        channel: 'manual',
        direction: 'out',
        handledBy: cached.source === 'ai' ? 'ai' : 'system',
        payload: { brief: cached.brief, source: cached.source },
      }).catch(() => {})
    }

    return ok({
      brief: cached.brief,
      source: cached.source,
      from_cache: cached.from_cache,
      recommendations,
    })
  } catch (e) {
    return handleError(e)
  }
}
