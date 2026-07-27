import { describe, expect, it } from 'vitest'
import { monthsNeedingAnalyticsBackfill } from '@/lib/avec/analytics-backfill'

describe('monthsNeedingAnalyticsBackfill', () => {
  it('lista Jan–mês anterior ao referência', () => {
    expect(monthsNeedingAnalyticsBackfill({ referenceDay: '2026-07-27' })).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('respeita throughMonth', () => {
    expect(
      monthsNeedingAnalyticsBackfill({
        referenceDay: '2026-07-27',
        throughMonth: '2026-03',
      }),
    ).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})
