import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { getSql } from '@/lib/db'
import { getSalonMetrics, recomputeSalonMetricsFromRom } from '@/lib/salon/metrics'
import { computeSalonIntelligence } from '@/lib/salon/intelligence'
import { listActionItems } from '@/lib/salon/recommendations'
import {
  countOverdueContacts,
  countOverdueServices,
  slicePlaybookForRole,
} from '@/lib/salon/playbook'
import { listTodaySchedules } from '@/lib/services'
import { getLastAvecSync } from '@/lib/avec/sync'
import { isAvecConfigured } from '@/lib/avec/client'
import { todayIso } from '@/lib/salon/format'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import { getReactivationKpis } from '@/lib/salon/reactivation-kpi'

const METRICS_FRESH_MS = 2 * 60 * 60 * 1000
/** 30s: 2ª visita fluida; caixa Avec ainda atualiza ao longo do dia. */
const HOJE_CACHE_TTL_SEC = 30

function metricsAreFresh(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false
  const t = new Date(updatedAt).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t < METRICS_FRESH_MS
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const role = auth.session.role
    const canViewRevenue = auth.session.can_view_revenue
    const day = todayIso()

    const payload = await cachedFetch(
      `hoje:v2:${day}:${role}:${canViewRevenue ? 'rev' : 'norev'}`,
      async () => {
        const existing = await getSalonMetrics(day)
        if (!metricsAreFresh(existing?.updated_at)) {
          await recomputeSalonMetricsFromRom(day).catch(() => {})
        }

        const sql = getSql()

        // Sequencial no pooler max:1 — Promise.all competia consigo mesmo e com outras lambdas.
        const salonRaw = await getSalonMetrics(day)
        const playbookAll = await listActionItems({ limit: 60 })
        const scheduleRaw = await listTodaySchedules(day, 150)
        const leadRows = (await sql`
          select
            count(*) filter (where status = 'novo')::int as novos,
            count(*) filter (where status = 'novo' and channel = 'whatsapp')::int as whatsapp_novos
          from contacts
        `) as { novos: number; whatsapp_novos: number }[]
        const avecLast = await getLastAvecSync()
        const reactivation = await getReactivationKpis().catch(() => ({
          window_days: 21,
          contacted: 0,
          reactivated: 0,
          rate: null as number | null,
        }))

        const playbookSlice = slicePlaybookForRole(playbookAll, role)
        const playbook = playbookSlice.items

        const scheduleToday = [...scheduleRaw].sort(compareScheduleByTimeThenName)
        const leads = leadRows[0]
        const salonBase = salonRaw ?? {
          day,
          revenue: 0,
          appointments: scheduleToday.length,
          attended: 0,
          no_shows: 0,
          cancelled: 0,
          new_clients: leads.novos,
          returning_clients: 0,
          ticket_avg: null,
          service_duration_sum_minutes: 0,
          service_duration_count: 0,
          updated_at: new Date().toISOString(),
        }

        const tmTodayMinutes =
          salonBase.service_duration_count > 0
            ? Math.round(
                (salonBase.service_duration_sum_minutes / salonBase.service_duration_count) * 10,
              ) / 10
            : null

        const salon = canViewRevenue
          ? salonBase
          : {
              ...salonBase,
              revenue: null,
              ticket_avg: null,
            }

        const intelligence = canViewRevenue ? computeSalonIntelligence(salonBase) : null

        return {
          day,
          salon,
          tm_today: { avg_minutes: tmTodayMinutes, sample_count: salonBase.service_duration_count },
          intelligence,
          can_view_revenue: canViewRevenue,
          role,
          playbook,
          playbook_focus: playbookSlice.focus,
          playbook_audience: playbookSlice.audience,
          scheduleToday,
          leads: {
            novos: leads.novos,
            whatsapp_sem_resposta: leads.whatsapp_novos,
          },
          overdue_contacts: countOverdueContacts(playbook),
          overdue_total: countOverdueServices(playbook),
          reactivation,
          avec: {
            configured: isAvecConfigured(),
            last: avecLast,
          },
        }
      },
      HOJE_CACHE_TTL_SEC,
    )

    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
