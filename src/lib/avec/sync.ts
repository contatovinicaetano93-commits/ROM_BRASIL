import { getSql } from '@/lib/db'
import { upsertContact, updateContact, logEvent } from '@/lib/contacts'
import { listServices, addService, scheduleService, markServiceDone } from '@/lib/services'
import { fetchAllAvecReport, isAvecConfigured, periodRange } from '@/lib/avec/client'
import {
  normalizeClientRow,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  guessServiceCategory,
} from '@/lib/avec/normalize'

export interface AvecSyncStats {
  clients_upserted: number
  appointments_synced: number
  attendances_synced: number
  services_created: number
  services_scheduled: number
  services_completed: number
  errors: string[]
}

export interface AvecSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: AvecSyncStats
  error: string | null
  created_at: string
}

async function recordSyncRun(kind: string, status: AvecSyncRun['status'], stats: AvecSyncStats, error?: string) {
  const sql = getSql()
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats, error)
    values (${kind}, ${status}, ${JSON.stringify(stats)}::jsonb, ${error ?? null})
    returning *
  `) as AvecSyncRun[]
  return rows[0]
}

export async function getLastAvecSync(): Promise<AvecSyncRun | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from avec_sync_runs order by created_at desc limit 1
  `) as AvecSyncRun[]
  return rows[0] ?? null
}

async function findOrCreateService(contactId: string, serviceName: string) {
  const services = await listServices(contactId)
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  if (match) return match

  const created = await addService(contactId, {
    name: serviceName,
    category: guessServiceCategory(serviceName),
  })
  return created
}

async function syncClients(stats: AvecSyncStats) {
  const rows = await fetchAllAvecReport('0004', { limit: 250 })
  for (const row of rows) {
    try {
      const c = normalizeClientRow(row)
      if (!c) continue
      await upsertContact({
        avecClientId: c.avecClientId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        channel: 'avec',
        source: 'avec_sync_clients',
      })
      stats.clients_upserted++
    } catch (e) {
      stats.errors.push(`cliente: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

async function syncAppointments(stats: AvecSyncStats) {
  const { inicio, fim } = periodRange(1, 21)
  const rows = await fetchAllAvecReport('0051', {
    inicio,
    fim,
    site: '',
    profissional_id: '',
    limit: 250,
  })

  for (const row of rows) {
    try {
      const appt = normalizeAppointmentRow(row)
      if (!appt) continue

      const contact = await upsertContact({
        avecClientId: appt.avecClientId ?? undefined,
        name: appt.clientName,
        email: appt.email,
        phone: appt.phone,
        channel: 'avec',
        source: 'avec_sync_appointments',
        status: 'agendado',
      })

      if (appt.serviceName && appt.scheduledAt) {
        const existing = await listServices(contact.id)
        const had = existing.some((s) => s.name.toLowerCase() === appt.serviceName!.toLowerCase())
        const service = await findOrCreateService(contact.id, appt.serviceName)
        if (!had) stats.services_created++
        if (!service.scheduled_at || service.scheduled_at !== appt.scheduledAt) {
          await scheduleService(service.id, appt.scheduledAt)
          stats.services_scheduled++
        }
      }

      stats.appointments_synced++
    } catch (e) {
      stats.errors.push(`agendamento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function servicesCreatedRecently(service: { created_at: string }) {
  return Date.now() - new Date(service.created_at).getTime() < 5000
}

async function syncAttendances(stats: AvecSyncStats) {
  const { inicio, fim } = periodRange(7, 0)
  const rows = await fetchAllAvecReport('0002', {
    inicio,
    fim,
    como_conheceu: '',
    limit: 250,
  })

  for (const row of rows) {
    try {
      const att = normalizeAttendanceRow(row)
      if (!att) continue

      const contact = await upsertContact({
        avecClientId: att.avecClientId ?? undefined,
        name: att.clientName,
        phone: att.phone,
        channel: 'avec',
        source: 'avec_sync_attended',
      })

      await updateContact(contact.id, { status: 'convertido' })

      if (att.serviceName) {
        const service = await findOrCreateService(contact.id, att.serviceName)
        const isNew = servicesCreatedRecently(service)
        if (isNew) stats.services_created++
        await markServiceDone(service.id)
        stats.services_completed++
      }

      stats.attendances_synced++
    } catch (e) {
      stats.errors.push(`atendimento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

// Sync completo: clientes + agendamentos futuros + atendimentos recentes.
export async function runAvecSync(): Promise<AvecSyncRun> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_URL e AVEC_API_TOKEN')
  }

  const stats: AvecSyncStats = {
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    errors: [],
  }

  try {
    await syncClients(stats)
    await syncAppointments(stats)
    await syncAttendances(stats)

    const status: AvecSyncRun['status'] =
      stats.errors.length > 0 && stats.clients_upserted + stats.appointments_synced === 0
        ? 'error'
        : stats.errors.length > 0
          ? 'partial'
          : 'ok'

    const run = await recordSyncRun('full', status, stats)

    await logEvent({
      contactId: null,
      channel: 'avec',
      direction: 'in',
      handledBy: 'system',
      payload: { avec_sync: stats, status },
    })

    return run
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    stats.errors.push(msg)
    return recordSyncRun('full', 'error', stats, msg)
  }
}
