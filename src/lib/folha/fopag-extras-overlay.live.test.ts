import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import type { FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import fopagClosedFixture from '@/lib/folha/fixtures/fopag-ig-q2-parsed.json'
import { rehydrateFolhaDraftFromPeriod } from '@/lib/folha/workflow'

const LIVE = '/tmp/folha-q2-live.json'

describe.skipIf(!existsSync(LIVE))('overlay Fopag on live BR Q2 dump', () => {
  it('fecha os gaps sticky vs Y da planilha', () => {
    const dump = JSON.parse(readFileSync(LIVE, 'utf8')) as {
      id: string
      year_month: string
      half: 1 | 2
      to_day: string
      reference_day: string | null
      lines: FolhaDraftLine[]
      source_professionals: unknown
    }
    const yByKey = new Map<string, number>()
    for (const row of (
      fopagClosedFixture as {
        fopag_br_q2?: Array<{ name: string; liquido: number }>
      }
    ).fopag_br_q2 ?? []) {
      const key = occupancyMergeKey(row.name)
      if (key) yByKey.set(key, row.liquido)
    }
    const diffOf = (name: string, pay: number | null) => {
      const y = yByKey.get(occupancyMergeKey(name))
      if (pay == null || y == null) return null
      return pay - y
    }
    const before = dump.lines
      .map((line) => ({
        name: line.name,
        diff: diffOf(line.name, line.proposed_pay),
      }))
      .filter((row) => row.diff != null && Math.abs(row.diff) > 1.5)

    const { lines } = rehydrateFolhaDraftFromPeriod('brasil', {
      id: dump.id,
      year_month: dump.year_month,
      half: dump.half,
      to_day: dump.to_day,
      reference_day: dump.reference_day,
      lines: dump.lines,
      source_professionals: dump.source_professionals as never,
    })
    const after = lines
      .map((line) => ({
        name: line.name,
        pay: line.proposed_pay,
        diff: diffOf(line.name, line.proposed_pay),
      }))
      .filter((row) => row.diff != null && Math.abs(row.diff) > 1.5)

    const out = {
      n: lines.length,
      gaps_before: before.length,
      gaps_after: after.length,
      before,
      after,
    }
    try {
      writeFileSync(
        '/opt/cursor/artifacts/folha-q2-overlay-sim.json',
        JSON.stringify(out, null, 2),
      )
    } catch {
      /* CI */
    }

    expect(before.length).toBeGreaterThan(5)
    expect(after.length).toBe(0)
  })
})
