export const DAY_MS = 86_400_000

/** Formata data/hora de agendamento para exibição em pt-BR. */
export function fmtSchedule(iso: string, opts?: { weekday?: boolean }) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return `Hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (opts?.weekday) {
    return d.toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
