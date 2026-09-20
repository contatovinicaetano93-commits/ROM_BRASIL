import { describe, expect, it } from 'vitest'
import { isDbPoolExhaustedError, peekIntranetDatabaseUrl, resolveDatabaseUrl } from '@/lib/db'

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

describe('peekIntranetDatabaseUrl', () => {
  it('prefere INTRANET_DATABASE_URL quando existe', () => {
    expect(
      peekIntranetDatabaseUrl({
        INTRANET_DATABASE_URL: 'postgres://intranet/db',
        DATABASE_URL: 'postgres://salon/db',
      }),
    ).toBe('postgres://intranet/db')
  })

  it('cai no DATABASE_URL do salão se a intranet não foi configurada', () => {
    expect(
      peekIntranetDatabaseUrl({
        DATABASE_URL: 'postgres://salon/db',
      }),
    ).toBe('postgres://salon/db')
  })

  it('retorna null quando nenhum banco existe', () => {
    expect(peekIntranetDatabaseUrl({})).toBeNull()
  })
})
