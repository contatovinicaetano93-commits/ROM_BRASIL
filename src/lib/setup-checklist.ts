export interface SetupItem {
  id: string
  label: string
  envVars: string[]
  priority: 'agora' | 'quando_tiver' | 'opcional'
  steps: string[]
  link?: { href: string; label: string }
}

export const SETUP_ITEMS: SetupItem[] = [
  {
    id: 'auth',
    label: 'Login do painel',
    envVars: ['ROM_ADMIN_USER', 'ROM_ADMIN_PASSWORD'],
    priority: 'agora',
    steps: [
      'Vercel → Settings → Environment Variables',
      'ROM_ADMIN_USER = admin',
      'ROM_ADMIN_PASSWORD = sua senha forte',
      'Protege dashboard, contatos e todas as APIs internas',
      'Redeploy do projeto',
    ],
  },
  {
    id: 'cron',
    label: 'CRON_SECRET',
    envVars: ['CRON_SECRET'],
    priority: 'agora',
    steps: [
      'Gere um segredo: openssl rand -hex 32',
      'Vercel → CRON_SECRET = o valor gerado',
      'Obrigatório em produção — protege sync automático (8h) e manual',
      'Redeploy',
    ],
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    envVars: ['ANTHROPIC_API_KEY'],
    priority: 'quando_tiver',
    steps: [
      'Crie conta em console.anthropic.com',
      'API Keys → Create Key',
      'Vercel → ANTHROPIC_API_KEY = sk-ant-...',
      'Ativa: briefings IA, WhatsApp bot e Telegram secretária',
    ],
    link: { href: 'https://console.anthropic.com/settings/keys', label: 'Anthropic API Keys' },
  },
  {
    id: 'avec',
    label: 'Avec token',
    envVars: ['AVEC_API_TOKEN'],
    priority: 'quando_tiver',
    steps: [
      'Pedir token ao suporte Avec (relatórios 0004, 0051, 0002)',
      'Vercel → AVEC_API_TOKEN = token recebido',
      'Remova AVEC_MOCK da Vercel (se existir)',
      'Admin → Testar conexão → Rodar sync',
    ],
    link: {
      href: 'https://documenter.getpostman.com/view/12527228/2sA2xmUWJo',
      label: 'Docs Postman Avec',
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp (Evolution)',
    envVars: ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_API_INSTANCE', 'WHATSAPP_WEBHOOK_SECRET'],
    priority: 'quando_tiver',
    steps: [
      'Subir ou contratar instância Evolution API',
      'Criar instância e conectar número WhatsApp (QR code)',
      'Vercel: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_API_INSTANCE',
      'Gere WHATSAPP_WEBHOOK_SECRET e configure no webhook Evolution (header x-webhook-secret)',
      'Webhook → https://seu-dominio/api/webhooks/whatsapp',
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram bot (equipe)',
    envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'],
    priority: 'opcional',
    steps: [
      'Telegram → @BotFather → /newbot → copie o token',
      'Vercel → TELEGRAM_BOT_TOKEN = token do bot',
      'Gere TELEGRAM_WEBHOOK_SECRET (string aleatória)',
      'Descubra chat IDs da equipe (getUpdates) e configure TELEGRAM_ALLOWED_CHAT_IDS',
      'setWebhook: https://seu-dominio/api/webhooks/telegram + secret_token',
    ],
    link: { href: 'https://t.me/BotFather', label: '@BotFather' },
  },
]

export function isItemConfigured(
  id: string,
  health: {
    database: { connected: boolean }
    claude: { configured: boolean }
    avec: { token: boolean }
    whatsapp: { configured: boolean; webhook_secret?: boolean }
    telegram: { configured: boolean; webhook_secret?: boolean; allowlist?: boolean }
    cron: { configured: boolean }
    auth: { enabled: boolean }
  }
) {
  switch (id) {
    case 'auth':
      return health.auth.enabled
    case 'cron':
      return health.cron.configured
    case 'claude':
      return health.claude.configured
    case 'avec':
      return health.avec.token
    case 'whatsapp':
      return health.whatsapp.configured && Boolean(health.whatsapp.webhook_secret)
    case 'telegram':
      return (
        health.telegram.configured &&
        Boolean(health.telegram.webhook_secret) &&
        Boolean(health.telegram.allowlist)
      )
    default:
      return false
  }
}
