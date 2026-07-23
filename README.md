# ROM — Onboarding & Painel de KPIs

Sistema interno da frente de caixa do ROM Club: recebe contatos de clientes por
WhatsApp (IA de primeiro atendimento), Telegram (secretária de consulta prática
pra equipe) e Avec (sync de agenda/clientes), e centraliza tudo num painel de
KPIs.

Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless),
API-first (front-end só fala com `/api/*`). Acesso ao banco por SQL direto
(`@neondatabase/serverless`).

**Interface adaptativa:** mobile-first no celular (bottom bar, drawer) e layout
desktop completo a partir de `lg` (sidebar fixa, conteúdo em largura total até
1600px, painel em duas colunas).

## Como funciona

- `src/app/api/webhooks/avec` — **tempo real** (push): agendamento, atendimento, cliente.
  Header `x-avec-secret` = `AVEC_WEBHOOK_SECRET`.
- `src/app/api/avec/sync` — sync de backup com a API de Relatórios Avec
  (clientes `0004`, agendamentos `0051`, atendidos `0002`). Cron fast a cada 5 min,
  full a cada 10 min, ou tempo real via webhook. Manual com `CRON_SECRET`.
- `src/app/api/webhooks/whatsapp` — recebe mensagem do WhatsApp Cloud API
  (Meta), responde com IA (primeiro atendimento guiado) e loga tudo.
- `src/app/api/webhooks/telegram` — bot "secretária": equipe pergunta em
  linguagem natural, a IA responde puxando os KPIs do Neon.
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

1. **Criar um projeto Neon dedicado ao ROM** e copiar a `DATABASE_URL`
   (connection string com `sslmode=require`) pro `.env.local`.
2. **Rodar `db/schema.sql`** no SQL Editor do Neon (ou `psql`).
3. **Claude (Anthropic)** — `ANTHROPIC_API_KEY` em [console.anthropic.com](https://console.anthropic.com)
   para briefings IA, WhatsApp e Telegram. Modelo padrão: `claude-sonnet-4-20250514`.
4. **Avec** — gerar `AVEC_API_TOKEN` no painel Avec. A URL padrão já é
   `https://api.avec.beauty` ([documentação Postman](https://documenter.getpostman.com/view/12527228/2sA2xmUWJo)).
   Tempo real: `AVEC_WEBHOOK_SECRET` + URL `/api/webhooks/avec`. Backup: `CRON_SECRET` (cron fast 5 min + full 10 min).
5. **WhatsApp Cloud API oficial** — no Meta Developer:
   `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
   `WHATSAPP_APP_SECRET`. Webhook → `/api/webhooks/whatsapp` (campo `messages`).
   Para aftercare fora da janela 24h: template aprovado em
   `WHATSAPP_TEMPLATE_AFTERCARE`.
6. **Criar um bot Telegram dedicado ao ROM** via `@BotFather` (2 min, token na
   hora) e configurar o `setWebhook` apontando para
   `/api/webhooks/telegram` com um `secret_token`.
7. Preencher `.env.local` com base no `.env.example`.
8. **Produção:** configure `ROM_ADMIN_PASSWORD`, `ROM_STAFF_USER` / `ROM_STAFF_PASSWORD`
   (funcionário: painel sem faturamento), `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET`
   e `TELEGRAM_STAFF_CHAT_IDS` — sem eles, webhooks e sync ficam bloqueados em produção.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencher as chaves
npm run dev
```
