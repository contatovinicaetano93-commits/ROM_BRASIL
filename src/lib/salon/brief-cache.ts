import { getSql } from '@/lib/db'
import { hashContactContext } from '@/lib/salon/context-builder'
import type { ContactRow } from '@/lib/contacts'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface CachedBrief {
  brief: string
  source: 'ai' | 'rules'
  created_at: string
  from_cache: boolean
}

function isCacheUnavailableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  return (
    msg.includes('contact_brief_cache') ||
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('undefined table')
  )
}

export async function getCachedBrief(contactId: string, contextHash: string): Promise<CachedBrief | null> {
  try {
    const sql = getSql()
    const rows = (await sql`
      select brief, source, created_at from contact_brief_cache
      where contact_id = ${contactId} and context_hash = ${contextHash}
      limit 1
    `) as { brief: string; source: 'ai' | 'rules'; created_at: string }[]

    const row = rows[0]
    if (!row) return null
    if (Date.now() - new Date(row.created_at).getTime() > CACHE_TTL_MS) return null

    return { brief: row.brief, source: row.source, created_at: row.created_at, from_cache: true }
  } catch (e) {
    if (isCacheUnavailableError(e)) return null
    throw e
  }
}

export async function setCachedBrief(
  contactId: string,
  contextHash: string,
  brief: string,
  source: 'ai' | 'rules'
) {
  try {
    const sql = getSql()
    await sql`
      insert into contact_brief_cache (contact_id, brief, source, context_hash, created_at)
      values (${contactId}, ${brief}, ${source}, ${contextHash}, now())
      on conflict (contact_id) do update set
        brief = excluded.brief,
        source = excluded.source,
        context_hash = excluded.context_hash,
        created_at = now()
    `
  } catch (e) {
    if (isCacheUnavailableError(e)) return
    throw e
  }
}

export async function resolveBriefCache(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[],
  generate: () => Promise<{ brief: string; source: 'ai' | 'rules' }>
): Promise<CachedBrief> {
  const hash = hashContactContext(contact, services, recs)
  const cached = await getCachedBrief(contact.id, hash)
  if (cached) return cached

  const { brief, source } = await generate()
  await setCachedBrief(contact.id, hash, brief, source)
  return { brief, source, created_at: new Date().toISOString(), from_cache: false }
}
