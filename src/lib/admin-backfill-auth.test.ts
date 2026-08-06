import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { authorizeCronOrFinance } from '@/lib/admin-backfill-auth'

const ENV_KEYS = [
  'VERCEL_ENV',
  'ROM_ADMIN_PASSWORD',
  'ROM_ACCESS_TOKEN',
  'ROM_FINANCE_PASSWORD',
  'CRON_SECRET',
] as const
const snapshot = new Map<string, string | undefined>()

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (!snapshot.has(key)) snapshot.set(key, process.env[key])
    const value = vars[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function req(headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/admin/revenue-backfill', { headers })
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prev = snapshot.get(key)
    if (prev === undefined) delete process.env[key]
    else process.env[key] = prev
  }
  snapshot.clear()
  vi.restoreAllMocks()
})

describe('authorizeCronOrFinance', () => {
  it('aceita Bearer CRON_SECRET', async () => {
    setEnv({ CRON_SECRET: 'cron-secret' })
    const auth = await authorizeCronOrFinance(
      req({ authorization: 'Bearer cron-secret' }),
    )
    expect(auth.ok).toBe(true)
  })

  it('bloqueia Preview sem CRON_SECRET nem sessão', async () => {
    setEnv({ VERCEL_ENV: 'preview' })
    const auth = await authorizeCronOrFinance(req())
    expect(auth.ok).toBe(false)
  })

  it('permite dev local sem auth configurado', async () => {
    setEnv({ VERCEL_ENV: 'development' })
    const auth = await authorizeCronOrFinance(req())
    expect(auth.ok).toBe(true)
  })
})
