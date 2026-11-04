import { describe, expect, it } from 'vitest'
import {
  assertTransitionOk,
  canTransitionWithdrawal,
  isPendingAvecBail,
  isWithdrawalStatus,
  shouldDebitPointOnStatus,
  validateCreateWithdrawal,
  WITHDRAWAL_STATUSES,
} from '@/lib/stock-withdrawal'

describe('stock-withdrawal domain', () => {
  it('reconhece status válidos', () => {
    for (const s of WITHDRAWAL_STATUSES) {
      expect(isWithdrawalStatus(s)).toBe(true)
    }
    expect(isWithdrawalStatus('foo')).toBe(false)
  })

  it('fluxo feliz até baixa Avec', () => {
    expect(canTransitionWithdrawal('solicitado', 'em_separacao')).toBe(true)
    expect(canTransitionWithdrawal('em_separacao', 'pronto')).toBe(true)
    expect(canTransitionWithdrawal('pronto', 'retirado')).toBe(true)
    expect(canTransitionWithdrawal('retirado', 'baixado_avec')).toBe(true)
    expect(assertTransitionOk('solicitado', 'retirado')).toMatch(/Não é possível/)
  })

  it('débito no ponto só em retirado', () => {
    expect(shouldDebitPointOnStatus('retirado')).toBe(true)
    expect(shouldDebitPointOnStatus('pronto')).toBe(false)
    expect(shouldDebitPointOnStatus('baixado_avec')).toBe(false)
  })

  it('valida criação', () => {
    expect(
      validateCreateWithdrawal({
        productId: '',
        locationId: 'loc',
        quantity: 1,
      }),
    ).toMatch(/Produto/)
    expect(
      validateCreateWithdrawal({
        productId: 'p',
        locationId: 'loc',
        quantity: 0,
      }),
    ).toMatch(/Quantidade/)
    expect(
      validateCreateWithdrawal({
        productId: 'p',
        locationId: 'loc',
        quantity: 1.5,
      }),
    ).toBeNull()
  })

  it('conferência: retirado sem baixa após janela', () => {
    const now = Date.parse('2026-11-04T12:00:00.000Z')
    expect(isPendingAvecBail('retirado', '2026-11-03T10:00:00.000Z', 24, now)).toBe(true)
    expect(isPendingAvecBail('retirado', '2026-11-04T11:00:00.000Z', 24, now)).toBe(false)
    expect(isPendingAvecBail('baixado_avec', '2026-11-03T10:00:00.000Z', 24, now)).toBe(false)
  })
})
