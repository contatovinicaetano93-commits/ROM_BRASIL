import { createSupabaseServer } from '@/lib/supabase/server'

type Channel = 'whatsapp' | 'telegram' | 'avec' | 'instagram' | 'manual'

interface UpsertContactInput {
  phone?: string | null
  name?: string | null
  channel: Channel
  source: string
  avecClientId?: string | null
}

// Fluxo guiado: todo contato novo entra como "novo", sobe pro mesmo registro
// se o telefone já existir (evita duplicar KPI de canais diferentes falando
// com a mesma pessoa).
export async function upsertContact(input: UpsertContactInput) {
  const db = createSupabaseServer()

  if (input.phone) {
    const { data: existing } = await db
      .from('contacts')
      .select('id')
      .eq('phone', input.phone)
      .maybeSingle()

    if (existing) {
      const { data, error } = await db
        .from('contacts')
        .update({ last_contact_at: new Date().toISOString(), name: input.name ?? undefined })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }
  }

  const { data, error } = await db
    .from('contacts')
    .insert({
      name: input.name ?? null,
      phone: input.phone ?? null,
      channel: input.channel,
      source: input.source,
      avec_client_id: input.avecClientId ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

interface LogEventInput {
  contactId: string | null
  channel: Channel
  direction: 'in' | 'out'
  handledBy: 'ai' | 'human' | 'system'
  payload: Record<string, unknown>
  error?: string | null
}

// Resiliente por design: erro na IA/API externa nunca derruba o webhook —
// fica registrado aqui com o campo `error` pra reprocessar ou investigar depois.
export async function logEvent(input: LogEventInput) {
  const db = createSupabaseServer()
  const { error } = await db.from('contact_events').insert({
    contact_id: input.contactId,
    channel: input.channel,
    direction: input.direction,
    handled_by: input.handledBy,
    payload: input.payload,
    error: input.error ?? null,
  })
  if (error) throw new Error(error.message)
}
