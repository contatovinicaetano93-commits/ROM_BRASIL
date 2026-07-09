import type { ReactivationClient } from './types'
import { getBrand } from '@/lib/brand'

function firstName(full: string) {
  const part = full.trim().split(/\s+/)[0]
  return part || 'tudo bem'
}

function formatVisitDate(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** Texto pronto para recall 0011 — WhatsApp Web. */
export function buildRecallWhatsAppMessage(
  client: ReactivationClient,
  professionalName: string
): string {
  const brand = getBrand().displayName
  const nome = firstName(client.name)
  const visita = formatVisitDate(client.last_visit)
  const dias = client.days_since

  if (dias > 90) {
    return (
      `Oi, ${nome}! Aqui é a equipe do ${brand}.\n\n` +
      `Faz um tempinho desde sua última visita com ${professionalName} (${visita}) e sentimos sua falta.\n\n` +
      `Queremos te receber de novo — posso te ajudar a remarcar um horário que combine com você?`
    )
  }

  return (
    `Oi, ${nome}! Aqui é a equipe do ${brand}.\n\n` +
    `Sua última visita com ${professionalName} foi em ${visita}. ` +
    `Seria um prazer te receber novamente.\n\n` +
    `Posso te ajudar a remarcar no horário que preferir?`
  )
}
