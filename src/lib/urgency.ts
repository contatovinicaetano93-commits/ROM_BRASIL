import type { ClientService } from '@/lib/services'
import { enrichServices, computeRecommendations } from '@/lib/recommendations'
import { DAY_MS } from '@/lib/format'

export interface ContactUrgency {
  overdue: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

export function countScheduledSoon(services: ClientService[], withinDays = 7) {
  const now = Date.now()
  const window = withinDays * DAY_MS
  return services.filter((s) => {
    if (!s.scheduled_at) return false
    const t = new Date(s.scheduled_at).getTime()
    return t >= now && t - now <= window
  }).length
}

/** Resumo de urgência de um contato — base única para listas, APIs e ordenação. */
export function urgencyForContact(services: ClientService[]): ContactUrgency {
  const enriched = enrichServices(services)
  const recommendations = computeRecommendations(enriched)
  const now = Date.now()

  const overdue = enriched.filter((s) => s.state === 'overdue').length
  const due_soon = enriched.filter((s) => s.state === 'due_soon').length
  const scheduled_soon = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    const t = new Date(s.scheduled_at).getTime()
    return t >= now && t - now <= 7 * DAY_MS
  }).length
  const scheduled_today = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    return new Date(s.scheduled_at).toDateString() === new Date().toDateString()
  }).length

  const urgentRecs = recommendations.filter((r) =>
    ['overdue', 'due_soon', 'scheduled'].includes(r.type)
  )
  const pending_actions =
    overdue + due_soon + scheduled_soon > 0 ? overdue + due_soon + scheduled_soon : recommendations.length

  const urgency_score =
    overdue * 1000 + due_soon * 100 + scheduled_today * 50 + scheduled_soon * 10

  const top = urgentRecs[0] ?? recommendations[0]

  return {
    overdue,
    due_soon,
    scheduled_soon,
    pending_actions,
    urgency_score,
    top_action: top ? top.title : null,
  }
}
