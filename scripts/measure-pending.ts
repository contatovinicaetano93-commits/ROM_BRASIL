import { getSql } from '../src/lib/db'
import { urgencyForServices } from '../src/lib/salon/urgency'
import type { ClientService } from '../src/lib/services'

async function main() {
  const sql = getSql()
  const services = (await sql`select * from client_services where active = true`) as ClientService[]
  const by = new Map<string, ClientService[]>()
  for (const s of services) {
    const list = by.get(s.contact_id) ?? []
    list.push(s)
    by.set(s.contact_id, list)
  }
  let pending = 0
  let overdue = 0
  let dueSoon = 0
  let urg = 0
  for (const [, list] of by) {
    const u = urgencyForServices(list)
    if (u.pending_actions > 0) pending++
    if (u.overdue > 0) overdue++
    if (u.due_soon > 0) dueSoon++
    if (u.urgency_score > 0) urg++
  }
  const contacts = await sql`select count(*)::int as n from contacts`
  console.log(
    JSON.stringify(
      {
        contacts: contacts[0]?.n,
        contactsWithServices: by.size,
        pending,
        overdue,
        dueSoon,
        urgencyGt0: urg,
        services: services.length,
        withCadence: services.filter((s) => s.cadence_days != null).length,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
