import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { validateDeploymentEnv } from '@/lib/deployment'

describe('validateDeploymentEnv', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('alerta quando ROM_PANEL e NEXT_PUBLIC_ROM_PANEL divergem', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'brasil'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(false)
    expect(result.warnings.some((w) => w.includes('ROM_PANEL'))).toBe(true)
  })

  it('ok quando painel e integrações estão alinhados', () => {
    process.env.ROM_PANEL = 'brasil'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'brasil'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'
    process.env.ROM_SESSION_SECRET = 'test-session-secret'
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(true)
  })

  it('alerta iguatemi em host rom-club', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'
    process.env.VERCEL_URL = 'rom-club.vercel.app'

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(false)
    expect(result.warnings.some((w) => w.includes('rom-club'))).toBe(true)
  })
})