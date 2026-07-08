// Normalização defensiva — colunas dos relatórios Avec variam por unidade/versão.

function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

function pickNested(row: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = row
    for (const p of path) {
      if (!cur || typeof cur !== 'object') {
        cur = null
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (cur !== null && cur !== undefined) {
      const s = String(cur).trim()
      if (s) return s
    }
  }
  return null
}

export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.length === 11 || digits.length === 10) return `+55${digits}`
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  return `+${digits}`
}

export interface NormalizedAvecClient {
  avecClientId: string
  name: string | null
  email: string | null
  phone: string | null
}

export interface NormalizedAvecAppointment {
  avecClientId: string | null
  clientName: string | null
  phone: string | null
  email: string | null
  serviceName: string | null
  scheduledAt: string | null
  professional: string | null
  status: string | null
}

export interface NormalizedAvecAttendance {
  avecClientId: string | null
  clientName: string | null
  phone: string | null
  serviceName: string | null
  attendedAt: string | null
}

// Tenta parsear data/hora em formatos comuns BR + ISO.
export function parseAvecDateTime(datePart: string | null, timePart?: string | null): string | null {
  if (!datePart) return null
  const d = datePart.trim()
  const t = timePart?.trim()

  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const iso = t ? `${d.split('T')[0]}T${t}` : d
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2]) - 1
    let year = Number(m[3])
    if (year < 100) year += 2000
    const time = t ?? m[4] ?? '10:00'
    const [hh, mm, ss] = time.split(':').map(Number)
    const parsed = new Date(year, month, day, hh || 10, mm || 0, ss || 0)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function normalizeClientRow(row: Record<string, unknown>): NormalizedAvecClient | null {
  const avecClientId =
    pick(row, [
      'cliente_id',
      'client_id',
      'id_cliente',
      'codigo_cliente',
      'cod_cliente',
      'id',
      'codigo',
      'importacao_id',
    ]) ?? pickNested(row, [['cliente', 'id'], ['client', 'id']])

  if (!avecClientId) return null

  const name = pick(row, ['nome', 'name', 'cliente', 'nome_cliente', 'cliente_nome'])
  const email = pick(row, ['email', 'e_mail', 'e-mail'])
  const phone = normalizePhone(
    pick(row, ['celular', 'telefone', 'phone', 'mobile', 'fone', 'tel']) ??
      pickNested(row, [['cliente', 'celular'], ['cliente', 'telefone']])
  )

  return { avecClientId, name, email, phone }
}

export function normalizeAppointmentRow(row: Record<string, unknown>): NormalizedAvecAppointment | null {
  const avecClientId = pick(row, ['cliente_id', 'client_id', 'id_cliente', 'codigo_cliente', 'cod_cliente'])
  const clientName = pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_nome', 'name'])
  const phone = normalizePhone(pick(row, ['celular', 'telefone', 'phone', 'fone']))
  const email = pick(row, ['email', 'e_mail'])
  const serviceName = pick(row, [
    'servico',
    'serviço',
    'procedimento',
    'service',
    'nome_servico',
    'servico_nome',
    'descricao',
  ])
  const datePart = pick(row, ['data', 'data_agendamento', 'agendamento', 'dia', 'date'])
  const timePart = pick(row, ['hora', 'horario', 'horário', 'time', 'hora_agendamento'])
  const scheduledAt = parseAvecDateTime(datePart, timePart)
  const professional = pick(row, ['profissional', 'profissional_nome', 'nome_profissional'])
  const status = pick(row, ['status', 'situacao', 'situação'])

  if (!avecClientId && !clientName && !phone) return null

  return { avecClientId, clientName, phone, email, serviceName, scheduledAt, professional, status }
}

export function normalizeAttendanceRow(row: Record<string, unknown>): NormalizedAvecAttendance | null {
  const avecClientId = pick(row, ['cliente_id', 'client_id', 'id_cliente', 'codigo_cliente'])
  const clientName = pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_nome'])
  const phone = normalizePhone(pick(row, ['celular', 'telefone', 'phone']))
  const serviceName = pick(row, ['servico', 'serviço', 'procedimento', 'service', 'item', 'descricao'])
  const datePart = pick(row, ['data', 'data_atendimento', 'data_realizacao', 'dia', 'date'])
  const timePart = pick(row, ['hora', 'horario', 'horário'])
  const attendedAt = parseAvecDateTime(datePart, timePart)

  if (!avecClientId && !clientName && !phone) return null

  return { avecClientId, clientName, phone, serviceName, attendedAt }
}

// Mapeia nome de serviço Avec → categoria ROM (heurística simples).
export function guessServiceCategory(name: string): 'corte' | 'tratamento' | 'coloracao' | 'bem_estar' | 'outro' {
  const n = name.toLowerCase()
  if (n.includes('corte') || n.includes('cabeleir')) return 'corte'
  if (n.includes('color') || n.includes('mecha') || n.includes('tintura')) return 'coloracao'
  if (n.includes('massag') || n.includes('spa') || n.includes('pedi')) return 'bem_estar'
  if (n.includes('hidrat') || n.includes('nutri') || n.includes('trat') || n.includes('escova')) return 'tratamento'
  return 'outro'
}
