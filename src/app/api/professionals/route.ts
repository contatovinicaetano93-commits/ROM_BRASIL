import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import {
  listProfessionals,
  upsertProfessionalByName,
  linkTelegramChat,
  unlinkTelegramChat,
} from '@/lib/professionals'

const createSchema = z.object({
  name: z.string().min(1),
  avec_pro_id: z.string().optional().nullable(),
  daily_goal: z.number().positive().optional().nullable(),
})

const linkSchema = z.object({
  professional_id: z.string().uuid(),
  telegram_chat_id: z.string().min(1),
})

const unlinkSchema = z.object({
  professional_id: z.string().uuid(),
})

/** GET /api/professionals — lista (admin) */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const all = req.nextUrl.searchParams.get('all') === '1'
    const rows = await listProfessionals(!all)
    return ok({ professionals: rows })
  } catch (e) {
    return handleError(e)
  }
}

/** POST /api/professionals — cria profissional ou vincula Telegram */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = await req.json().catch(() => null)
    const action = typeof body?.action === 'string' ? body.action : 'create'

    if (action === 'link') {
      const parsed = linkSchema.safeParse(body)
      if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)
      const pro = await linkTelegramChat(parsed.data.professional_id, parsed.data.telegram_chat_id)
      if (!pro) return err('Profissional não encontrado', 404)
      return ok({ professional: pro, linked: true })
    }

    if (action === 'unlink') {
      const parsed = unlinkSchema.safeParse(body)
      if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)
      const pro = await unlinkTelegramChat(parsed.data.professional_id)
      if (!pro) return err('Profissional não encontrado', 404)
      return ok({ professional: pro, linked: false })
    }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)

    const pro = await upsertProfessionalByName({
      name: parsed.data.name,
      avecProId: parsed.data.avec_pro_id,
      dailyGoal: parsed.data.daily_goal,
    })
    return ok({ professional: pro })
  } catch (e) {
    return handleError(e)
  }
}
