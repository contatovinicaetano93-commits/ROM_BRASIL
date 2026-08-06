# ROM — Onboarding & Painel de KPIs

Sistema interno da frente de caixa do ROM Club: recebe contatos de clientes por
WhatsApp (canal principal da equipe — IA de primeiro atendimento e alertas) e
Avec (sync de agenda/clientes), e centraliza tudo num painel de KPIs. Telegram
é opcional/legado (bot de consulta para quem ainda usa).

Stack: Next.js (App Router) + TypeScript + Tailwind + Postgres (Supabase via
`postgres.js`), API-first (front-end só fala com `/api/*`). Acesso ao banco por
SQL direto. Brasil e Iguatemi usam Supabase; apenas o Cérebro usa Neon.

**Interface adaptativa:** mobile-first no celular (bottom bar, drawer) e layout
desktop completo a partir de `lg` (sidebar fixa, conteúdo em largura total até
1600px, painel em duas colunas).

## Como funciona

- `src/app/api/webhooks/avec` — **tempo real** (push): agendamento, atendimento, cliente.
  Header `x-avec-secret` = `AVEC_WEBHOOK_SECRET`. Dispara sync fast `scope=kpi` (caixa/KPI — não full).
- `src/app/api/avec/sync` — sync de backup com a API de Relatórios Avec.
  **fast** (`5,25,45 * * * *`): 0051 ontem→amanhã, 0002, 0052, revenue. **full fatiado**:
  ops/agenda/catalog **2×/dia** (dump 0004 no catalog):
  `/api/avec/sync/full/{ops,agenda,catalog}` (agenda = +21d para Contatos Agendados +7d).
  Estoque: `/api/estoque/sync` (`5 */3 * * *` + full diário). Manual com `CRON_SECRET`.
- `src/app/api/webhooks/whatsapp` — recebe mensagem do WhatsApp Cloud API
  (Meta), responde com IA (primeiro atendimento guiado) e loga tudo.
- `src/app/api/webhooks/telegram` — legado/opcional: bot de consulta KPIs para
  quem ainda usa Telegram (a equipe opera pelo WhatsApp).
- `src/app/dashboard` — painel com contatos por dia, por canal, por status e
  taxa de conversão.
- `src/app/contatos` — lista dos últimos contatos (todos os canais) e formulário
  pra registrar contato manual (`GET`/`POST /api/contacts`).
- `src/lib/whatsapp/adapter.ts` — interface de mensageria. Implementada com
  WhatsApp Cloud API oficial (Meta Graph).

Resiliência: todo evento (mensagem recebida, resposta da IA, erro) vira uma
linha em `contact_events` — nada se perde silenciosamente, dá pra reprocessar
ou investigar depois.

## PENDENTE — você precisa fazer manualmente

1. **Criar um projeto Supabase (Postgres) dedicado ao ROM Brasil** e copiar a
   `DATABASE_URL` (pooler Session `:5432` ou Transaction `:6543`, `sslmode=require`)
   pro `.env.local`. Client: `ssl:'require'` + `prepare:false`.
2. **Rodar `db/schema.sql`** no SQL Editor do Supabase (ou `psql`).
   Iguatemi: Supabase — ver `deploy/SETUP-IGUATEMI.md`.
3. **Claude (Anthropic)** — `ANTHROPIC_API_KEY` em [console.anthropic.com](https://console.anthropic.com)
   para briefings IA e WhatsApp. Modelo padrão: `claude-sonnet-4-20250514`.
4. **Avec** — gerar `AVEC_API_TOKEN` no painel Avec. A URL padrão já é
   `https://api.avec.beauty` ([documentação Postman](https://documenter.getpostman.com/view/12527228/2sA2xmUWJo)).
   Tempo real: `AVEC_WEBHOOK_SECRET` + URL `/api/webhooks/avec` (sync fast `scope=kpi` apenas).
   Backup: `CRON_SECRET` (cron fast `5,25,45` + ops/agenda/catalog 2×/dia).
5. **WhatsApp Cloud API oficial** — no Meta Developer:
   `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
   `WHATSAPP_APP_SECRET`. Webhook → `/api/webhooks/whatsapp` (campo `messages`).
   Alertas internos (estoque/financeiro): `FINANCE_WHATSAPP_NUMBER`, `ADMIN_WHATSAPP_NUMBER`.
   Para aftercare fora da janela 24h: template aprovado em
   `WHATSAPP_TEMPLATE_AFTERCARE`.
6. **Telegram (opcional)** — bot legado via `@BotFather` + `setWebhook` em
   `/api/webhooks/telegram` com `secret_token`. A operação do dia é WhatsApp.
7. Preencher `.env.local` com base no `.env.example`.
8. **Produção:** configure `ROM_ADMIN_PASSWORD`, `ROM_STAFF_USER` / `ROM_STAFF_PASSWORD`
   (funcionário: painel sem faturamento), `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET`
   e `FINANCE_WHATSAPP_NUMBER` / `ADMIN_WHATSAPP_NUMBER` (alertas) — sem eles,
   webhooks e sync ficam bloqueados ou sem alertas em produção.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencher as chaves
npm run dev
```
