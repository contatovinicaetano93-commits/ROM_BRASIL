/** Domínio puro: solicitação / retirada nos pontos ROM (P1–P3). */

export const WITHDRAWAL_STATUSES = [
  'solicitado',
  'em_separacao',
  'pronto',
  'retirado',
  'baixado_avec',
  'cancelado',
] as const

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number]

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  solicitado: 'Solicitado',
  em_separacao: 'Em separação',
  pronto: 'Pronto para retirada',
  retirado: 'Retirado (ROM)',
  baixado_avec: 'Baixado no Avec',
  cancelado: 'Cancelado',
}

/** Transições permitidas no V1 (controlador do ponto / gestor). */
const TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  solicitado: ['em_separacao', 'cancelado'],
  em_separacao: ['pronto', 'cancelado'],
  pronto: ['retirado', 'cancelado'],
  retirado: ['baixado_avec'],
  baixado_avec: [],
  cancelado: [],
}

export function isWithdrawalStatus(value: unknown): value is WithdrawalStatus {
  return typeof value === 'string' && (WITHDRAWAL_STATUSES as readonly string[]).includes(value)
}

export function canTransitionWithdrawal(
  from: WithdrawalStatus,
  to: WithdrawalStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransitionOk(from: WithdrawalStatus, to: WithdrawalStatus): string | null {
  if (from === to) return 'Status já é este'
  if (!canTransitionWithdrawal(from, to)) {
    return `Não é possível ir de ${WITHDRAWAL_STATUS_LABEL[from]} para ${WITHDRAWAL_STATUS_LABEL[to]}`
  }
  return null
}

/** Débito físico no ponto ROM só na confirmação de retirada. */
export function shouldDebitPointOnStatus(to: WithdrawalStatus): boolean {
  return to === 'retirado'
}

export type CreateWithdrawalInput = {
  productId: string
  locationId: string
  quantity: number
  unitLabel?: string | null
  note?: string | null
  professionalName?: string | null
}

export function validateCreateWithdrawal(input: CreateWithdrawalInput): string | null {
  if (!input.productId?.trim()) return 'Produto obrigatório'
  if (!input.locationId?.trim()) return 'Ponto de retirada obrigatório'
  const qty = Number(input.quantity)
  if (!Number.isFinite(qty) || !(qty > 0)) return 'Quantidade deve ser maior que zero'
  return null
}

/** Pedidos retirados sem baixa Avec — janela de conferência (horas). */
export function isPendingAvecBail(
  status: WithdrawalStatus,
  withdrawnAt: string | null | undefined,
  hours = 24,
  now = Date.now(),
): boolean {
  if (status !== 'retirado') return false
  if (!withdrawnAt) return true
  const t = Date.parse(withdrawnAt)
  if (!Number.isFinite(t)) return true
  return now - t >= hours * 3600_000
}
