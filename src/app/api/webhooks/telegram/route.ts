import { NextRequest } from 'next/server'
import { ok } from '@/lib/api-response'
import { createSupabaseServer } from '@/lib/supabase/server'
import { sendTelegramMessage } from '@/lib/telegram/bot'
import { askAI } from '@/lib/ai/openai'

const SECRETARIA_PROMPT = `Você é a secretária virtual do ROM Club para a equipe interna.
Responda perguntas práticas sobre os KPIs de contato do salão (quantidade de
contatos, canal, status) usando SOMENTE os dados fornecidos no contexto abaixo.
Seja direta, em português, no máximo 4 linhas. Se a pergunta não tiver relação
com os dados fornecidos, diga que só responde sobre KPIs de contato por enquanto.`

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return ok({ ignored: true }, undefined, 200)
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  const chatId = update?.message?.chat.id
  const text = update?.message?.text

  if (!chatId || !text) return ok({ ignored: true })

  try {
    const db = createSupabaseServer()
    const [{ data: byDay }, { data: byStatus }, { data: conversion }] = await Promise.all([
      db.from('v_kpi_daily').select('*').limit(7),
      db.from('v_kpi_status').select('*'),
      db.from('v_kpi_conversion').select('*').maybeSingle(),
    ])

    const context = JSON.stringify({ byDay, byStatus, conversion })
    const reply = await askAI(SECRETARIA_PROMPT, `Pergunta: ${text}\n\nDados: ${context}`)

    await sendTelegramMessage(chatId, reply || 'Não consegui puxar essa informação agora.')
    return ok({ replied: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    await sendTelegramMessage(chatId, 'Tive um problema pra consultar os dados agora, já registrei o erro.').catch(
      () => {}
    )
    return ok({ replied: false, error: message })
  }
}
