import { describe, expect, it } from 'vitest'
import { previousCalendarMonthEnd } from '@/lib/salon/p1-metrics'

describe('previousCalendarMonthEnd', () => {
  it('volta para o EOM do mês anterior', () => {
    expect(previousCalendarMonthEnd('2026-07-25')).toBe('2026-06-30')
    expect(previousCalendarMonthEnd('2026-07-01')).toBe('2026-06-30')
    expect(previousCalendarMonthEnd('2026-03-15')).toBe('2026-02-28')
    expect(previousCalendarMonthEnd('2026-01-10')).toBe('2025-12-31')
  })
})
