import { isProductionRuntime } from '@/lib/auth'

export function getStaffChatIds(): string[] {
  // TELEGRAM_ALLOWED_CHAT_IDS = legado na Vercel (ROM Brasil); preferir STAFF
  const raw =
    process.env.TELEGRAM_STAFF_CHAT_IDS?.trim() ||
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim()
  if (!raw) return []
  return raw.split(/[,\s]+/).filter(Boolean)
}

/**
 * Whitelist da equipe.
 * Produção: sem IDs = nega todos (fail-closed).
 * Dev: sem IDs = aceita qualquer chat (conveniência local).
 */
export function isStaffChat(chatId: number | string): boolean {
  const ids = getStaffChatIds()
  if (ids.length === 0) return !isProductionRuntime()
  return ids.includes(String(chatId))
}

export function isStaffWhitelistEnabled() {
  return getStaffChatIds().length > 0
}
