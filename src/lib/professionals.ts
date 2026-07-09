import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'

export interface Professional {
  id: string
  avec_pro_id: string | null
  name: string
  telegram_chat_id: string | null
  active: boolean
  daily_goal: number | null
  created_at: string
}

export interface ProfessionalScheduleRow {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  scheduled_at: string
  avec_professional_name: string | null
}

export async function listProfessionals(activeOnly = true): Promise<Professional[]> {
  const sql = getSql()
  if (activeOnly) {
    return (await sql`
      select * from professionals where active = true order by name asc
    `) as Professional[]
  }
  return (await sql`select * from professionals order by name asc`) as Professional[]
}

export async function getProfessionalByTelegramChatId(
  chatId: number | string
): Promise<Professional | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from professionals
    where telegram_chat_id = ${String(chatId)} and active = true
    limit 1
  `) as Professional[]
  return rows[0] ?? null
}

export async function getProfessionalById(id: string): Promise<Professional | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from professionals where id = ${id} limit 1
  `) as Professional[]
  return rows[0] ?? null
}

/** Cria ou atualiza profissional pelo nome (manual / pré-Avec). */
export async function upsertProfessionalByName(input: {
  name: string
  avecProId?: string | null
  dailyGoal?: number | null
}): Promise<Professional> {
  const sql = getSql()
  const name = input.name.trim()
  if (!name) throw new Error('Nome do profissional é obrigatório')
  const avecProId = input.avecProId?.trim() || null

  if (avecProId) {
    const byAvec = (await sql`
      select * from professionals where avec_pro_id = ${avecProId} limit 1
    `) as Professional[]
    if (byAvec[0]) {
      const rows = (await sql`
        update professionals set
          name = ${name},
          daily_goal = coalesce(${input.dailyGoal ?? null}, daily_goal),
          active = true
        where id = ${byAvec[0].id}
        returning *
      `) as Professional[]
      return rows[0]
    }
  }

  const existing = (await sql`
    select * from professionals
    where lower(name) = lower(${name})
    limit 1
  `) as Professional[]

  if (existing[0]) {
    const rows = (await sql`
      update professionals set
        avec_pro_id = coalesce(${avecProId}, avec_pro_id),
        daily_goal = coalesce(${input.dailyGoal ?? null}, daily_goal),
        active = true
      where id = ${existing[0].id}
      returning *
    `) as Professional[]
    return rows[0]
  }

  const rows = (await sql`
    insert into professionals (name, avec_pro_id, daily_goal)
    values (${name}, ${avecProId}, ${input.dailyGoal ?? null})
    returning *
  `) as Professional[]
  return rows[0]
}

export async function linkTelegramChat(
  professionalId: string,
  chatId: number | string
): Promise<Professional | null> {
  const sql = getSql()
  // Libera o chat se já estiver em outro profissional
  await sql`
    update professionals set telegram_chat_id = null
    where telegram_chat_id = ${String(chatId)} and id <> ${professionalId}
  `
  const rows = (await sql`
    update professionals set telegram_chat_id = ${String(chatId)}
    where id = ${professionalId}
    returning *
  `) as Professional[]
  return rows[0] ?? null
}

export async function unlinkTelegramChat(professionalId: string): Promise<Professional | null> {
  const sql = getSql()
  const rows = (await sql`
    update professionals set telegram_chat_id = null
    where id = ${professionalId}
    returning *
  `) as Professional[]
  return rows[0] ?? null
}

export async function listProfessionalSchedulesForDay(
  professionalId: string,
  day = todayIso(),
  limit = 30
): Promise<ProfessionalScheduleRow[]> {
  const sql = getSql()
  return (await sql`
    select
      cs.id,
      cs.contact_id,
      c.name as contact_name,
      cs.name,
      cs.scheduled_at,
      cs.avec_professional_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and cs.professional_id = ${professionalId}
      and cs.scheduled_at is not null
      and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    order by cs.scheduled_at asc
    limit ${limit}
  `) as ProfessionalScheduleRow[]
}

export async function listProfessionalUpcoming(
  professionalId: string,
  days = 7,
  limit = 20
): Promise<ProfessionalScheduleRow[]> {
  const sql = getSql()
  return (await sql`
    select
      cs.id,
      cs.contact_id,
      c.name as contact_name,
      cs.name,
      cs.scheduled_at,
      cs.avec_professional_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and cs.professional_id = ${professionalId}
      and cs.scheduled_at is not null
      and cs.scheduled_at >= now()
      and cs.scheduled_at < now() + (${days}::int || ' days')::interval
    order by cs.scheduled_at asc
    limit ${limit}
  `) as ProfessionalScheduleRow[]
}
