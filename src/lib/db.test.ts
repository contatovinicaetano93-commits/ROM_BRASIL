import { describe, expect, it } from 'vitest'
import { isDbPoolExhaustedError, resolveDatabaseUrl } from '@/lib/db'

describe('resolveDatabaseUrl', () => {
  it('reescreve Supabase session pooler 5432 → transaction 6543', () => {
    const raw =
      'postgresql://user:pass@aws-1-us-west-2.pooler.supabase.com:5432/postgres'
    const out = resolveDatabaseUrl(raw)
    expect(out).toContain(':6543/')
    expect(out).not.toContain(':5432/')
  })

  it('não mexe em URL já em 6543 ou host direto', () => {
    const tx =
      'postgresql://user:pass@aws-1-us-west-2.pooler.supabase.com:6543/postgres'
    expect(resolveDatabaseUrl(tx)).toBe(tx)
    const direct = 'postgresql://user:pass@db.xxx.supabase.co:5432/postgres'
    expect(resolveDatabaseUrl(direct)).toBe(direct)
  })
})

describe('isDbPoolExhaustedError', () => {
  it('detecta EMAXCONNSESSION', () => {
    expect(
      isDbPoolExhaustedError(
        new Error('(EMAXCONNSESSION) max clients reached in session mode'),
      ),
    ).toBe(true)
    expect(isDbPoolExhaustedError(new Error('syntax error'))).toBe(false)
  })
})
