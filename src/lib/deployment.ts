import { getBrand, getRomPanelId, type RomPanelId } from '@/lib/brand'

export interface DeploymentContext {
  panel: RomPanelId
  display_name: string
  product_name: string
  /** Host da instância (ex.: rom-iguatemi.vercel.app) — útil para auditar qual deploy rodou o sync. */
  host: string | null
  vercel_env: string | null
  vercel_url: string | null
}

export interface DeploymentValidation {
  ok: boolean
  warnings: string[]
}

function readServerPanel(): RomPanelId | null {
  const raw = process.env.ROM_PANEL?.trim()
  if (!raw) return null
  return raw.toLowerCase() === 'iguatemi' || raw.toLowerCase() === 'iguatuemi' ? 'iguatemi' : 'brasil'
}

function readPublicPanel(): RomPanelId | null {
  const raw = process.env.NEXT_PUBLIC_ROM_PANEL?.trim()
  if (!raw) return null
  return raw.toLowerCase() === 'iguatemi' || raw.toLowerCase() === 'iguatuemi' ? 'iguatemi' : 'brasil'
}

/** Contexto da instância — cada projeto Vercel deve ter painel, banco e Avec próprios. */
export function getDeploymentContext(): DeploymentContext {
  const brand = getBrand()
  return {
    panel: brand.panel,
    display_name: brand.displayName,
    product_name: brand.productName,
    host: process.env.VERCEL_URL ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_url: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null,
  }
}

/** Detecta configuração perigosa antes de misturar Brasil e Iguatemi. */
export function validateDeploymentEnv(): DeploymentValidation {
  const warnings: string[] = []
  const serverPanel = readServerPanel()
  const publicPanel = readPublicPanel()

  if (serverPanel && publicPanel && serverPanel !== publicPanel) {
    warnings.push(
      `ROM_PANEL (${serverPanel}) ≠ NEXT_PUBLIC_ROM_PANEL (${publicPanel}). Faça redeploy após alinhar as variáveis — o frontend pode exibir o painel errado.`
    )
  }

  if (!process.env.DATABASE_URL?.trim()) {
    warnings.push('DATABASE_URL ausente — use um banco Neon dedicado por unidade (nunca compartilhe entre Brasil e Iguatemi).')
  }

  if (!process.env.AVEC_API_TOKEN?.trim() && process.env.AVEC_MOCK !== '1' && process.env.AVEC_MOCK !== 'true') {
    warnings.push('AVEC_API_TOKEN ausente — cada unidade precisa do token Avec da própria loja.')
  }

  return { ok: warnings.length === 0, warnings }
}

export function deploymentLabel(): string {
  const ctx = getDeploymentContext()
  const host = ctx.host ? ` · ${ctx.host}` : ''
  return `${ctx.display_name}${host}`
}
