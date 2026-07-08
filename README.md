# ROM Brasil — Onboarding & Painel de KPIs

Sistema interno da **unidade ROM Brasil** (ecossistema ROM Club): recebe contatos
por WhatsApp (IA de primeiro atendimento), Telegram (secretária da equipe) e
Avec (sync de agenda/clientes), e centraliza tudo num painel de KPIs.

**Unidade:** defaults em `SALON_UNIT_NAME=ROM Brasil` / `rom-brasil`.
Este repositório é **somente ROM Brasil**. Não compartilhe banco Neon, token
Avec, bot Telegram, WhatsApp ou domínio com o ROM Iguatemi (repo/pasta separados).

Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless),
API-first (front-end só fala com `/api/*`). Acesso ao banco por SQL direto
(`@neondatabase/serverless`).

**Interface adaptativa:** mobile-first no celular (bottom bar, drawer) e layout
desktop completo a partir de `lg` (sidebar fixa, conteúdo em largura total até
1600px, painel em duas colunas).

## Separação de unidades

| | ROM Brasil (este repo) | ROM Iguatemi |
|--|------------------------|--------------|
| Repo | `ROM_BRASIL` | `ROM-IGUATEMI` |
| Pasta local | `/Downloads/ROM` | `/Downloads/ROM-IGUATEMI` |
| Vercel | `rom-club` | projeto próprio |
| Neon | banco dedicado | banco dedicado |
| Unidade | `ROM Brasil` / `rom-brasil` | `ROM Iguatemi` / `rom-iguatemi` |

Não aninhe o código do Iguatemi dentro desta pasta. Não reutilize
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET` ou `AVEC_API_TOKEN`.

## Como funciona

- `src/app/api/webhooks/avec` — webhook push (agendamento, atendimento, cliente).
- `src/app/api/avec/sync` — sincronização com a API de Relatórios Avec
  (clientes `0004`, agendamentos `0051`, atendidos `0002`). Roda via cron
  1x/dia (8h) ou manualmente com `CRON_SECRET`. Ver `docs/avec-sync-rom-brasil.md`.
- `src/app/api/webhooks/whatsapp` — recebe mensagem do provedor WhatsApp
  (Evolution API), responde com IA (primeiro atendimento guiado) e loga tudo.
- `src/app/api/webhooks/telegram` — bot "secretária": equipe pergunta em
  linguagem natural, a IA responde puxando os KPIs do Neon.
- `src/app/dashboard` — painel com contatos por dia, por canal, por status e
  taxa de conversão.
- `src/app/contatos` — lista dos últimos contatos (todos os canais) e formulário
  pra registrar contato manual (`GET`/`POST /api/contacts`).
- `src/lib/whatsapp/adapter.ts` — interface de mensageria. Hoje implementada
  com Evolution API; trocar para WhatsApp Cloud API oficial no futuro é só
  implementar a interface de novo, sem mexer no resto.

Resiliência: todo evento (mensagem recebida, resposta da IA, erro) vira uma
linha em `contact_events` — nada se perde silenciosamente, dá pra reprocessar
ou investigar depois.

## PENDENTE — você precisa fazer manualmente

1. **Criar um projeto Neon dedicado ao ROM Brasil** e copiar a `DATABASE_URL`
   (connection string com `sslmode=require`) pro `.env.local`.
2. **Rodar `db/schema.sql`** no SQL Editor do Neon (ou `psql`).
3. **Claude (Anthropic)** — `ANTHROPIC_API_KEY` em [console.anthropic.com](https://console.anthropic.com)
   para briefings IA, WhatsApp e Telegram. Modelo padrão: `claude-sonnet-4-20250514`.
4. **Avec** — gerar `AVEC_API_TOKEN` no painel Avec. A URL padrão já é
   `https://api.avec.beauty` ([documentação Postman](https://documenter.getpostman.com/view/12527228/2sA2xmUWJo)).
   Opcional: `CRON_SECRET` (sync automático 8h) e `AVEC_WEBHOOK_SECRET` (webhook push).
5. **Decidir o provedor de WhatsApp**: Evolution API (rápido, roda em minutos,
   mas usa número real em modo não-oficial) ou WhatsApp Cloud API oficial
   (mais lento pra configurar — verificação Meta Business — porém mais
   resiliente a longo prazo). O código já está pronto pros dois, só falta a
   decisão + credenciais.
6. **Criar um bot Telegram dedicado ao ROM Brasil** via `@BotFather` (2 min, token na
   hora) e configurar o `setWebhook` apontando para
   `/api/webhooks/telegram` com um `secret_token`.
7. Preencher `.env.local` com base no `.env.example`.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencher as chaves
npm run dev
```
