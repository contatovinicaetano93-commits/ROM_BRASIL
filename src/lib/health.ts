import { getSql } from '@/lib/db'
import { Logger } from '@/lib/logger'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl } from '@/lib/avec/client'
import { isAuthEnabled, isFinanceAuthConfigured, isStockAuthConfigured } from '@/lib/auth'
import { isAiConfigured } from '@/lib/ai/client'
import { getBrand, getRomPanelId } from '@/lib/brand'
import { getLastUsableAvecSync, getRecentHardPlatformTimeoutFullRuns } from '@/lib/avec/sync'
import { getLastStockSync } from '@/lib/avec/sync-stock'
import {
  computePanelSyncOk,
  computeCommissions8123Health,
  hardTimeoutHealthMessage,
  isClassic300sHardTimeout,
  isHardPlatformTimeoutAvecRun,
} from '@/lib/avec/sync-run-health'
import { getDeploymentContext, validateDeploymentEnv } from '@/lib/deployment'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'
import { probeAvecTokenHealth } from '@/lib/avec/token-store'
import { isProduction } from '@/lib/env'

const logger = new Logger('Health')

function envOk(name: string) {
  return Boolean(process.env[name]?.trim())
}

async function probeDatabase() {
  let connected = false
  let error: string | null = null
  let db_quota = false
  try {
    const sql = getSql()
    await sql`select 1 as ok`
    connected = true
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    db_quota = isDbQuotaError(e)
    if (db_quota) error = dbQuotaUserMessage(e)
  }
  return { connected, error, db_quota }
}

async function probeKpiLayers() {
  try {
    const sql = getSql()
    const rows = (await sql`
      select 'p1' as layer, count(*)::int as n from salon_p1_daily
      union all select 'p2', count(*)::int from salon_p2_daily
      union all select 'p3', count(*)::int from salon_p3_daily
    `) as { layer: string; n: number }[]
    return Object.fromEntries(rows.map((r) => [r.layer, r.n]))
  } catch (e) {
    logger.warn('Failed to probe KPI layers', { error: e instanceof Error ? e.message : String(e) })
    return { p1: null, p2: null, p3: null }
  }
}

/** Resposta mínima — segura para monitoramento externo sem login. */
export async function getPublicHealthStatus() {
  const { connected, db_quota } = await probeDatabase()
  let sync_ok = connected
  let sync_reason: string | null = connected ? null : 'database disconnected'
  let hard_timeout_ok = true
  let commissions_ok: boolean | null = null
  if (connected) {
    try {
      const [lastFast, lastFullOps, lastFullAny, hardTimeoutHits] = await Promise.all([
        getLastUsableAvecSync('fast'),
        getLastUsableAvecSync('full', { stage: 'ops' }),
        getLastUsableAvecSync('full'),
        getRecentHardPlatformTimeoutFullRuns(24),
      ])
      const lastFull = lastFullOps ?? lastFullAny
      const sync = computePanelSyncOk(lastFast, lastFull)
      sync_ok = sync.ok
      sync_reason = sync.reason
      const hardHits = hardTimeoutHits.filter(isHardPlatformTimeoutAvecRun)
      hard_timeout_ok = hardHits.length === 0
      const commissions = computeCommissions8123Health(lastFull?.stats ?? null)
      commissions_ok = commissions.ok
      if (commissions.ok === false) sync_ok = false
      if (commissions.ok === false && !sync_reason) {
        sync_reason = commissions.message
      }
    } catch (e) {
      logger.warn('public health sync probe failed', {
        error: e instanceof Error ? e.message : String(e),
      })
      sync_ok = false
      sync_reason = 'sync probe failed'
    }
  }
  let token_ok = true
  try {
    const token = await probeAvecTokenHealth()
    token_ok = token.ok || isAvecMock()
  } catch {
    token_ok = isAvecMock() || isAvecConfigured()
  }
  return {
    ok: connected && sync_ok && hard_timeout_ok && commissions_ok !== false && token_ok,
    db_quota,
    sync_ok,
    sync_reason,
    hard_timeout_ok,
    commissions_8123_ok: commissions_ok,
    token_ok,
  }
}

export async function getHealthStatus() {
  const { connected, error, db_quota } = await probeDatabase()

  const brand = getBrand()
  const deployment = getDeploymentContext()
  const validation = validateDeploymentEnv()

  // Sequencial: Promise.all de 5 leituras no pooler (max:1) competia com outras
  // lambdas e o /api/health estourava → HTML de timeout → SyntaxError no Safari.
  let lastFast = null
  let lastFull = null
  let kpiLayers: Record<string, number | null> = { p1: null, p2: null, p3: null }
  let stockLastFast = null
  let stockLastFull = null
  let hardTimeoutHits: Awaited<ReturnType<typeof getRecentHardPlatformTimeoutFullRuns>> = []
  try {
    lastFast = await getLastUsableAvecSync('fast')
  } catch (e) {
    logger.warn('health last_fast failed', { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    lastFull =
      (await getLastUsableAvecSync('full', { stage: 'ops' })) ??
      (await getLastUsableAvecSync('full'))
  } catch (e) {
    logger.warn('health last_full failed', { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    kpiLayers = await probeKpiLayers()
  } catch (e) {
    logger.warn('health kpi layers failed', { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    stockLastFast = await getLastStockSync('stock_fast')
  } catch (e) {
    logger.warn('health stock_fast failed', { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    stockLastFull = await getLastStockSync('stock_full')
  } catch (e) {
    logger.warn('health stock_full failed', { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    hardTimeoutHits = await getRecentHardPlatformTimeoutFullRuns(24)
  } catch (e) {
    logger.warn('health hard_timeout probe failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const hardHits = hardTimeoutHits.filter(isHardPlatformTimeoutAvecRun)
  const classic300 = hardHits.filter(isClassic300sHardTimeout).length
  const hard_timeout = {
    ok: hardHits.length === 0,
    hits_24h: hardHits.length,
    classic_300s_hits: classic300,
    message: hardTimeoutHealthMessage({ count: hardHits.length, classic300 }),
    latest_id: hardHits[0]?.id ?? null,
    latest_created_at: hardHits[0]?.created_at ?? null,
  }
  const syncProbe = computePanelSyncOk(lastFast, lastFull)
  const sync_ok = syncProbe.ok
  const commissions_8123 = computeCommissions8123Health(lastFull?.stats ?? null)
  /** Só falha quando há sinal vermelho explícito — null (desconhecido) não inventa verde nem vermelho no gate. */
  const commissionsOk = commissions_8123.ok !== false

  const awaitingToken = !isAvecConfigured() && !isAvecMock()
  let tokenHealth: Awaited<ReturnType<typeof probeAvecTokenHealth>> = {
    ok: !awaitingToken,
    hours_left: null,
    login_configured: false,
    source: 'none',
    last_refresh_error: null,
    last_refresh_at: null,
  }
  try {
    tokenHealth = await probeAvecTokenHealth()
  } catch (e) {
    logger.warn('health token probe failed', { error: e instanceof Error ? e.message : String(e) })
  }
  const token_ok = isAvecMock() || tokenHealth.ok
  const webhook_ready = envOk('AVEC_WEBHOOK_SECRET')
  // Webhook é complementário ao cron — só RED em prod se secret sumir (push morto + config quebrada).
  const webhook_ok = !isProduction() || webhook_ready

  return {
    ok: connected && validation.ok && hard_timeout.ok && sync_ok && commissionsOk && token_ok && webhook_ok,
    sync_ok,
    sync_reason: syncProbe.reason,
    token_ok,
    webhook_ok,
    deployment,
    validation,
    readiness: {
      awaiting_avec_token: awaitingToken,
      cron_ready: envOk('CRON_SECRET'),
      webhook_ready,
      unit_id_set: envOk('AVEC_UNIT_ID'),
      token_ok,
    },
    panel: {
      id: getRomPanelId(),
      display_name: brand.displayName,
      seed_preset: process.env.ROM_SEED_PRESET?.trim() || getRomPanelId(),
    },
    database: { configured: envOk('DATABASE_URL'), connected, error, db_quota },
    claude: {
      configured: isAiConfigured(),
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',
    },
    avec: {
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      token: envOk('AVEC_API_TOKEN'),
      token_health: tokenHealth,
      webhook_secret: envOk('AVEC_WEBHOOK_SECRET'),
      webhook_url: '/api/webhooks/avec',
      last_fast: lastFast,
      last_full: lastFull,
      kpi_layers: kpiLayers,
      /** RED quando full morre por kill duro (~300s) sem aborted limpo — Fluid/maxDuration. */
      hard_timeout,
      /**
       * Saúde do 8123 (Meu faturamento). ok=false quando pulado por budget ou erro.
       * ok=null = sem sinal no last full — não inventa verde.
       */
      commissions_8123,
    },
    whatsapp: {
      configured:
        envOk('WHATSAPP_CLOUD_TOKEN') && envOk('WHATSAPP_PHONE_NUMBER_ID'),
      webhook_secret: envOk('WHATSAPP_APP_SECRET') || envOk('WHATSAPP_WEBHOOK_SECRET'),
      provider: 'whatsapp_cloud',
    },
    telegram: {
      configured: envOk('TELEGRAM_BOT_TOKEN'),
      webhook_secret: envOk('TELEGRAM_WEBHOOK_SECRET'),
      staff_whitelist: envOk('TELEGRAM_STAFF_CHAT_IDS'),
      finance_bot_configured: envOk('TELEGRAM_FINANCE_BOT_TOKEN'),
      finance_bot_webhook_secret: envOk('TELEGRAM_FINANCE_WEBHOOK_SECRET'),
      finance_bot_whitelist: envOk('TELEGRAM_FINANCE_CHAT_IDS'),
    },
    cron: { configured: envOk('CRON_SECRET') },
    omie: {
      configured: envOk('OMIE_SERVICOS_APP_KEY') || envOk('OMIE_APP_KEY'),
      servicos:
        (envOk('OMIE_SERVICOS_APP_KEY') && envOk('OMIE_SERVICOS_APP_SECRET')) ||
        (envOk('OMIE_APP_KEY') && envOk('OMIE_APP_SECRET')),
      comercio: envOk('OMIE_COMERCIO_APP_KEY') && envOk('OMIE_COMERCIO_APP_SECRET'),
      mock: process.env.OMIE_MOCK === '1' || process.env.OMIE_MOCK === 'true',
    },
    auth: {
      enabled: isAuthEnabled(),
      password: envOk('ROM_ADMIN_PASSWORD') || envOk('ROM_ACCESS_TOKEN'),
      user: envOk('ROM_ADMIN_USER'),
      staff_user: envOk('ROM_STAFF_USER'),
      staff_password: envOk('ROM_STAFF_PASSWORD'),
      finance_configured: isFinanceAuthConfigured(),
      stock_configured: isStockAuthConfigured(),
      session_secret: envOk('ROM_SESSION_SECRET'),
    },
    webhooks: {
      avec_secret: envOk('AVEC_WEBHOOK_SECRET'),
    },
    stock: {
      last_fast: stockLastFast,
      last_full: stockLastFull,
    },
  }
}
