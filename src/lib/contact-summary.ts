import { getSql } from '@/lib/db'
import type { ContactRow } from '@/lib/contacts'
import type { ClientService } from '@/lib/services'
import { urgencyForContact } from '@/lib/urgency'

export interface ContactListItem extends ContactRow {
  overdue: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

// Lista contatos com resumo de urgência — base do filtro "só pendentes" e ordenação.
export async function listContactsWithSummary(limit = 500): Promise<ContactListItem[]> {
  const sql = getSql()
  const contacts = (await sql`
    select * from contacts order by created_at desc limit ${limit}
  `) as ContactRow[]

  if (contacts.length === 0) return []

  const services = (await sql`
    select * from client_services where active = true
  `) as ClientService[]

  const byContact = new Map<string, ClientService[]>()
  for (const s of services) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }

  return contacts.map((c) => {
    const u = urgencyForContact(byContact.get(c.id) ?? [])
    return { ...c, ...u }
  })
}
