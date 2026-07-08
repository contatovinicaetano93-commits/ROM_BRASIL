import { normalizeSearchText } from '@/lib/search'

export type WhatsAppIntent = 'saudacao' | 'agendar' | 'preco' | 'remarcar' | 'humano' | 'duvida'

export function detectIntent(text: string): WhatsAppIntent {
  const t = normalizeSearchText(text).toLowerCase()

  if (/(atendente|humano|pessoa|falar com|alguem|recepcionista|equipe)/.test(t)) return 'humano'
  if (/(agendar|marcar|horario|reservar|agenda|quero marcar)/.test(t)) return 'agendar'
  if (/(remarcar|reagendar|mudar horario|alterar horario|trocar horario)/.test(t)) return 'remarcar'
  if (/(preco|valor|quanto custa|quanto e|quanto fica|tabela)/.test(t)) return 'preco'
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem|hey|hi)\b/.test(t)) return 'saudacao'

  return 'duvida'
}
