import { getSql } from '@/lib/db'
import { upsertContact, updateContact, logEvent } from '@/lib/contacts'
import { addService, scheduleService } from '@/lib/services'
import { getDefaultSeedPreset, parseSeedPreset, type RomSeedPreset } from '@/lib/brand'
import { brasilSeedPreset } from '@/lib/seed/presets/brasil'
import { iguatemiSeedPreset } from '@/lib/seed/presets/iguatemi'
import type { SeedResult } from '@/lib/seed/types'

export type { SeedResult } from '@/lib/seed/types'

const PRESETS = {
  brasil: brasilSeedPreset,
  iguatemi: iguatemiSeedPreset,
} as const

export function listSeedPresets() {
  return Object.values(PRESETS).map((p) => ({ id: p.id, label: p.label }))
}

export async function runSeed(options?: { preset?: RomSeedPreset }): Promise<SeedResult> {
  const preset = options?.preset ?? getDefaultSeedPreset()
  const config = PRESETS[preset]

  const sql = getSql()
  const existing = (await sql`select count(*)::int as n from contacts`) as { n: number }[]
  if ((existing[0]?.n ?? 0) > 0) {
    return {
      preset,
      contacts: 0,
      services: 0,
      message: `Banco já tem contatos — seed ${config.label} ignorado para não duplicar.`,
    }
  }

  let contactCount = 0
  let serviceCount = 0

  for (const d of config.contacts) {
    const contact = await upsertContact({
      name: d.name,
      phone: d.phone,
      email: d.email,
      channel: d.channel,
      source: d.source,
      status: d.status,
      avecClientId: d.avecClientId,
    })
    contactCount++

    if (d.notes) await updateContact(contact.id, { notes: d.notes })

    for (const s of d.services) {
      const svc = await addService(contact.id, {
        name: s.name,
        category: s.category,
        cadenceDays: s.cadenceDays,
      })
      serviceCount++

      if (s.overdue) {
        const past = new Date()
        past.setDate(past.getDate() - (s.cadenceDays + 5))
        const sql2 = getSql()
        await sql2`update client_services set last_done_at = ${past.toISOString()} where id = ${svc.id}`
      } else if (s.dueSoon) {
        const past = new Date()
        past.setDate(past.getDate() - (s.cadenceDays - 3))
        const sql2 = getSql()
        await sql2`update client_services set last_done_at = ${past.toISOString()} where id = ${svc.id}`
      }

      if (s.scheduleTomorrow) {
        const when = new Date()
        when.setDate(when.getDate() + 1)
        when.setHours(10, 30, 0, 0)
        await scheduleService(svc.id, when.toISOString())
      }
      if (s.scheduleToday) {
        const when = new Date()
        when.setHours(15, 0, 0, 0)
        if (when.getTime() < Date.now()) when.setDate(when.getDate() + 1)
        await scheduleService(svc.id, when.toISOString())
      }
    }

    await logEvent({
      contactId: contact.id,
      channel: d.channel,
      direction: 'in',
      handledBy: 'system',
      payload: { seed: true, preset, name: d.name },
    })
  }

  return {
    preset,
    contacts: contactCount,
    services: serviceCount,
    message: `${config.label}: ${contactCount} contatos e ${serviceCount} serviços de demonstração criados.`,
  }
}

export function resolveSeedPresetFromBody(value: unknown): RomSeedPreset | undefined {
  if (typeof value !== 'string') return undefined
  return parseSeedPreset(value) ?? undefined
}
