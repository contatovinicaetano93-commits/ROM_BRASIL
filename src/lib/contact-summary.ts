import { CONTACT_STATUSES, type ContactRow, type ContactStatus } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
import { compareByOverdueThenName, urgencyForServices } from '@/lib/salon/urgency'

export interface ContactListItem extends ContactRow {
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

export interface ListContactsWithSummaryOpts {
  limit?: number
  /** Busca server-side por nome (ilike) ou telefone (dígitos). */
  query?: string | null
  /** Só contatos com pending_actions > 0 (calcula sobre toda a base de serviços). */
  pendingOnly?: boolean
  /** Filtro de status do funil (ex.: novo, importado) — server-side, não só no top urgente. */
  status?: string | null
}

function withUrgency(
  contacts: ContactRow[],
  byContact: Map<string, ClientService[]>,
): ContactListItem[] {
  return contacts.map((c) => {
    const u = urgencyForServices(byContact.get(c.id) ?? [])
    return {
      ...c,
      overdue: u.overdue,
      max_overdue_days: u.max_overdue_days,
      due_soon: u.due_soon,
      scheduled_soon: u.scheduled_soon,
      pending_actions: u.pending_actions,
      urgency_score: u.urgency_score,
      top_action: u.top_action,
    }
  })
}

async function fetchContactsByIds(ids: string[]): Promise<ContactRow[]> {
  if (ids.length === 0) return []
  const sql = getSql()
  // postgres.js exige o helper sql(ids) para expandir IN (...).
  return (await sql`
    select * from contacts where id in ${sql(ids)}
  `) as ContactRow[]
}

/** Carrega serviços só dos contatos pedidos — evita scan full de client_services. */
async function loadServicesByContactIds(ids: string[]): Promise<Map<string, ClientService[]>> {
  const byContact = new Map<string, ClientService[]>()
  if (ids.length === 0) return byContact
  const sql = getSql()
  const services = (await sql`
    select * from client_services
    where active = true and contact_id in ${sql(ids)}
  `) as ClientService[]
  for (const s of services) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }
  return byContact
}

function parseStatus(raw: string | null | undefined): ContactStatus | null {
  if (!raw || raw === 'all') return null
  return (CONTACT_STATUSES as readonly string[]).includes(raw) ? (raw as ContactStatus) : null
}

async function orderContactsByUrgency(
  ids: string[],
  byContact: Map<string, ClientService[]>,
): Promise<ContactRow[]> {
  const contacts = await fetchContactsByIds(ids)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const ordered = ids.map((id) => byId.get(id)).filter((c): c is ContactRow => Boolean(c))
  ordered.sort((a, b) => {
    const ua = urgencyForServices(byContact.get(a.id) ?? [])
    const ub = urgencyForServices(byContact.get(b.id) ?? [])
    return compareByOverdueThenName(
      { max_overdue_days: ua.max_overdue_days, name: a.name },
      { max_overdue_days: ub.max_overdue_days, name: b.name },
    )
  })
  return ordered
}

/**
 * Contatos com sinal de urgência (atraso / vencendo / agendado em 7d),
 * ranqueados no SQL — sem carregar a tabela inteira de serviços.
 */
async function rankUrgentContactIds(limit: number): Promise<string[]> {
  const sql = getSql()
  const rows = (await sql`
    with svc as (
      select
        contact_id,
        scheduled_at,
        case
          when cadence_days is null then null
          else coalesce(last_done_at, created_at) + (cadence_days * interval '1 day')
        end as next_due
      from client_services
      where active = true
    ),
    per_contact as (
      select
        contact_id,
        count(*) filter (where next_due is not null and next_due < now())::int as overdue,
        coalesce(
          max(
            case
              when next_due is not null and next_due < now()
                then ceil(extract(epoch from (now() - next_due)) / 86400.0)
            end
          ),
          0
        )::int as max_overdue_days,
        count(*) filter (
          where next_due is not null
            and next_due >= now()
            and next_due <= now() + interval '7 days'
        )::int as due_soon,
        count(*) filter (
          where scheduled_at is not null
            and scheduled_at >= now()
            and scheduled_at <= now() + interval '7 days'
        )::int as scheduled_soon
      from svc
      group by contact_id
    )
    select contact_id
    from per_contact
    where overdue + due_soon + scheduled_soon > 0
    order by max_overdue_days desc, overdue desc, due_soon desc, scheduled_soon desc
    limit ${limit}
  `) as { contact_id: string }[]
  return rows.map((r) => r.contact_id)
}

/**
 * Lista contatos com resumo de urgência.
 * Sem busca: prioriza quem tem atraso/ação pendente (não corta overdue
 * só porque o contato é antigo e caiu fora do top-N por created_at).
 * Com busca: filtra no servidor por nome/telefone em toda a base.
 * Com status: lista o funil real (ex.: Novo lead / Importado), não só o top urgente.
 */
export async function listContactsWithSummary(
  limitOrOpts: number | ListContactsWithSummaryOpts = 100,
): Promise<ContactListItem[]> {
  const opts: ListContactsWithSummaryOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 2000)
  const rawQuery = (opts.query ?? '').trim()
  const q = rawQuery.toLowerCase()
  const qDigits = rawQuery.replace(/\D/g, '')
  const pendingOnly = opts.pendingOnly === true
  const status = parseStatus(opts.status)

  const sql = getSql()

  // Status do funil (Novo lead / Importado / …): busca na base inteira, não no top urgente.
  if (status && !(q || qDigits.length >= 3)) {
    const contacts = (await sql`
      select * from contacts
      where status = ${status}
      order by created_at desc
      limit ${Math.min(limit * (pendingOnly ? 4 : 1), 2000)}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    let items = withUrgency(contacts, byContact)
    if (pendingOnly) items = items.filter((c) => c.pending_actions > 0)
    items.sort(compareByOverdueThenName)
    return items.slice(0, limit)
  }

  if (pendingOnly && !(q || qDigits.length >= 3)) {
    const pendingIds = await rankUrgentContactIds(limit)
    const byContact = await loadServicesByContactIds(pendingIds)
    const ordered = await orderContactsByUrgency(pendingIds, byContact)
    return withUrgency(ordered, byContact)
  }

  if (q || qDigits.length >= 3) {
    const namePattern = q ? `%${q}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const contacts = (await sql`
      select * from contacts
      where
        (${status}::text is null or status = ${status})
        and (
          (${namePattern}::text is not null and lower(coalesce(name, '')) like ${namePattern})
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${phonePattern}
          )
        )
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    const withU = withUrgency(contacts, byContact)
    return pendingOnly ? withU.filter((c) => c.pending_actions > 0) : withU
  }

  // Contatos com urgência > 0 — ranking no SQL, serviços só dos IDs retornados.
  const urgentIds = await rankUrgentContactIds(limit)
  const byContact = await loadServicesByContactIds(urgentIds)
  const orderedUrgent = await orderContactsByUrgency(urgentIds, byContact)

  if (orderedUrgent.length >= limit) {
    return withUrgency(orderedUrgent.slice(0, limit), byContact)
  }

  const remaining = limit - orderedUrgent.length
  const recent =
    urgentIds.length === 0
      ? ((await sql`
          select * from contacts order by created_at desc limit ${remaining}
        `) as ContactRow[])
      : ((await sql`
          select * from contacts
          where id not in ${sql(urgentIds)}
          order by created_at desc
          limit ${remaining}
        `) as ContactRow[])

  const recentByContact = await loadServicesByContactIds(recent.map((c) => c.id))
  for (const [id, list] of recentByContact) byContact.set(id, list)

  return withUrgency([...orderedUrgent, ...recent], byContact)
}
