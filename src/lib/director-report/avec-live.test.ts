import { describe, expect, it } from 'vitest'
import { monthRangeBr, quarterRangeBr } from './avec-live'

describe('monthRangeBr', () => {
  it('fecha o mês corretamente', () => {
    expect(monthRangeBr('2026-02')).toEqual({ inicio: '01/02/2026', fim: '28/02/2026' })
    expect(monthRangeBr('2026-03')).toEqual({ inicio: '01/03/2026', fim: '31/03/2026' })
  })
})

describe('quarterRangeBr', () => {
  it('cobre 1º e 2º tri', () => {
    expect(quarterRangeBr('2026-Q1')).toEqual({ inicio: '01/01/2026', fim: '31/03/2026' })
    expect(quarterRangeBr('2026-Q2')).toEqual({ inicio: '01/04/2026', fim: '30/06/2026' })
  })
})
