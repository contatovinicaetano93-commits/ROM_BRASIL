import { ok, handleError } from '@/lib/api-response'
import { getSql } from '@/lib/db'
import { getSalonMetrics, recomputeSalonMetricsFromRom } from '@/lib/salon/metrics'
import { listActionItems } from '@/lib/salon/recommendations'
import { listUpcomingSchedules } from '@/lib/services'
import { getLastAvecSync } from '@/lib/avec/sync'
import { isAvecConfigured } from '@/lib/avec/client'

export async function GET() {
  try {
    await recomputeSalonMetricsFromRom().catch(() => {})

    const day = new Date().toISOString().slice(0, 10)
    const sql = getSql()

    const [salon, playbook, scheduleToday, leadRows, avecLast] = await Promise.all([
      getSalonMetrics(day),
      listActionItems(),
      listUpcomingSchedules(1, 15),
      sql`
        select
          count(*) filter (where status = 'novo')::int as novos,
          count(*) filter (where status = 'novo' and channel = 'whatsapp')::int as whatsapp_novos
        from contacts
      `,
      getLastAvecSync(),
    ])

    const leads = leadRows[0] as { novos: number; whatsapp_novos: number }

    return ok({
      day,
      salon: salon ?? {
        day,
        revenue: 0,
        appointments: scheduleToday.length,
        attended: 0,
        no_shows: 0,
        cancelled: 0,
        new_clients: leads.novos,
        returning_clients: 0,
        ticket_avg: null,
        updated_at: new Date().toISOString(),
      },
      playbook: playbook.slice(0, 8),
      scheduleToday,
      leads: {
        novos: leads.novos,
        whatsapp_sem_resposta: leads.whatsapp_novos,
      },
      overdue_total: playbook.reduce((s, a) => s + a.overdue, 0),
      avec: {
        configured: isAvecConfigured(),
        last: avecLast,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
