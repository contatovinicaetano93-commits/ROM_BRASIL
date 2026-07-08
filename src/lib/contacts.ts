import { getSql } from '@/lib/db'

type Channel = 'whatsapp' | 'telegram' | 'avec' | 'instagram' | 'manual'

interface UpsertContactInput {
  phone?: string | null
  name?: string | null
  email?: string | null
  channel: Channel
  source: string
  avecClientId?: string | null
  status?: ContactStatus
}

export const CONTACT_STATUSES = ['novo', 'em_atendimento', 'agendado', 'convertido', 'perdido'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export interface ContactRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  channel: string
  source: string
  status: string
  avec_client_id: string | null
  notes: string | null
  first_contact_at: string
  last_contact_at: string
  created_at: string
}

// Fluxo guiado: todo contato novo entra como "novo", sobe pro mesmo registro
// se o telefone já existir (evita duplicar KPI de canais diferentes falando
// com a mesma pessoa).
export async function upsertContact(input: UpsertContactInput): Promise<ContactRow> {
  const sql = getSql()

  if (input.avecClientId) {
    const byAvec = (await sql`
      select id from contacts where avec_client_id = ${input.avecClientId} limit 1
    `) as { id: string }[]

    if (byAvec.length > 0) {
      const rows = (await sql`
        update contacts
        set last_contact_at = now(),
            name = coalesce(${input.name ?? null}, name),
            email = coalesce(${input.email ?? null}, email),
            phone = coalesce(${input.phone ?? null}, phone),
            status = coalesce(${input.status ?? null}, status)
        where id = ${byAvec[0].id}
        returning *
      `) as ContactRow[]
      return rows[0]
    }
  }

  if (input.phone) {
    const existing = (await sql`
      select id from contacts where phone = ${input.phone} limit 1
    `) as { id: string }[]

    if (existing.length > 0) {
      const rows = (await sql`
        update contacts
        set last_contact_at = now(),
            name = coalesce(${input.name ?? null}, name),
            email = coalesce(${input.email ?? null}, email),
            avec_client_id = coalesce(${input.avecClientId ?? null}, avec_client_id),
            status = coalesce(${input.status ?? null}, status)
        where id = ${existing[0].id}
        returning *
      `) as ContactRow[]
      return rows[0]
    }
  }

  const rows = (await sql`
    insert into contacts (name, phone, email, channel, source, avec_client_id, status)
    values (
      ${input.name ?? null},
      ${input.phone ?? null},
      ${input.email ?? null},
      ${input.channel},
      ${input.source},
      ${input.avecClientId ?? null},
      ${input.status ?? 'novo'}
    )
    returning *
  `) as ContactRow[]

  return rows[0]
}

export async function getContactByAvecId(avecClientId: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from contacts where avec_client_id = ${avecClientId} limit 1
  `) as ContactRow[]
  return rows[0] ?? null
}

export async function getContactById(id: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`select * from contacts where id = ${id} limit 1`) as ContactRow[]
  return rows[0] ?? null
}

export interface ContactEventRow {
  id: string
  contact_id: string | null
  channel: string
  direction: 'in' | 'out'
  handled_by: 'ai' | 'human' | 'system'
  payload: Record<string, unknown>
  error: string | null
  created_at: string
}

export async function listEvents(contactId: string, limit = 50): Promise<ContactEventRow[]> {
  const sql = getSql()
  return (await sql`
    select * from contact_events
    where contact_id = ${contactId}
    order by created_at desc
    limit ${limit}
  `) as ContactEventRow[]
}

interface UpdateContactInput {
  name?: string
  email?: string
  phone?: string
  status?: ContactStatus
  notes?: string
}

// Atualização parcial e guiada: só mexe nos campos enviados (coalesce mantém o resto).
export async function updateContact(id: string, patch: UpdateContactInput): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`
    update contacts set
      name = coalesce(${patch.name ?? null}, name),
      email = coalesce(${patch.email ?? null}, email),
      phone = coalesce(${patch.phone ?? null}, phone),
      status = coalesce(${patch.status ?? null}, status),
      notes = coalesce(${patch.notes ?? null}, notes),
      last_contact_at = now()
    where id = ${id}
    returning *
  `) as ContactRow[]
  return rows[0] ?? null
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
  const sql = getSql()
  await sql`
    insert into contact_events (contact_id, channel, direction, handled_by, payload, error)
    values (
      ${input.contactId},
      ${input.channel},
      ${input.direction},
      ${input.handledBy},
      ${JSON.stringify(input.payload)}::jsonb,
      ${input.error ?? null}
    )
  `
}
