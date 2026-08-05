import { describe, expect, it } from 'vitest'
import { fmtSignedCurrency, fmtSignedNumber, momCompareLine } from '@/lib/salon/mom-delta'

describe('momCompareLine', () => {
  it('formats currency delta', () => {
    const line = momCompareLine(3000, 2000, 'Jun/2026')
    expect(line?.text).toContain('Jun/2026')
    expect(line?.positive).toBe(true)
  })

  it('invertGood treats decrease as positive', () => {
    const down = momCompareLine(100, 200, 'Jun/2026', { invertGood: true })
    expect(down?.positive).toBe(true)
    const up = momCompareLine(300, 200, 'Jun/2026', { invertGood: true })
    expect(up?.positive).toBe(false)
  })

  it('returns null when current or previous is absent', () => {
    expect(momCompareLine(null, 100, 'Jun/2026')).toBeNull()
    expect(momCompareLine(100, null, 'Jun/2026')).toBeNull()
    expect(momCompareLine(undefined, 100, 'Jun/2026')).toBeNull()
  })

  it('fmt helpers keep typographic signs', () => {
    expect(fmtSignedCurrency(-10)).toMatch(/^−/)
    expect(fmtSignedNumber(3)).toMatch(/^\+/)
  })
})
