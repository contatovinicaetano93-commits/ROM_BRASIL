import { describe, expect, it } from 'vitest'
import { resolveMonthWindow } from '@/lib/salon/month-window'

describe('resolveMonthWindow', () => {
  it('mês fechado usa 1º→último dia', () => {
    expect(resolveMonthWindow('2026-04', '2026-07-27')).toEqual({
      month: '2026-04',
      from: '2026-04-01',
      to: '2026-04-30',
      mtd: false,
    })
  })

  it('mês corrente é MTD até referenceDay', () => {
    expect(resolveMonthWindow('2026-07', '2026-07-27')).toEqual({
      month: '2026-07',
      from: '2026-07-01',
      to: '2026-07-27',
      mtd: true,
    })
  })
})
