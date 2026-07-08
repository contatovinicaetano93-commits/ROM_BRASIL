# ROM — Onboarding & Painel de KPIs

Sistema interno da frente de caixa do ROM Club: recebe contatos de clientes por
WhatsApp (IA de primeiro atendimento), Telegram (secretária de consulta prática
pra equipe) e Avec (sync de agenda/clientes), e centraliza tudo num painel de
KPIs.

Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless),
API-first (front-end só fala com `/api/*`). Acesso ao banco por SQL direto
(`@neondatabase/serverless`).

**Interface é web mobile-first** (não é app nativo): pensada pra abrir no
navegador do celular da equipe. Container limitado à largura de celular,
navegação por *bottom tab bar* (Painel / Contatos), `theme-color` e
`apple-web-app` pra ficar com cara de app quando salva na tela inicial.

## Como funciona

- `src/app/api/webhooks/avec` — webhook push (agendamento, atendimento, cliente).
- `src/app/api/avec/sync` — sincronização com a API de Relatórios Avec
  (clientes `0004`, agendamentos `0051`, atendidos `0002`). Roda via cron
  a cada 3h ou manualmente com `CRON_SECRET`.
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

1. **Criar um projeto Neon dedicado ao ROM** e copiar a `DATABASE_URL`
   (connection string com `sslmode=require`) pro `.env.local`.
2. **Rodar `db/schema.sql`** no SQL Editor do Neon (ou `psql`).
3. **Avec** — pedir ao suporte o `AVEC_API_URL` (base da API de relatórios)
   e gerar o token no painel da unidade. Preencher `AVEC_API_URL`,
   `AVEC_API_TOKEN` e `CRON_SECRET` (protege o sync automático). Opcional:
   `AVEC_WEBHOOK_SECRET` se configurarem webhook push para
   `/api/webhooks/avec`.
4. **Decidir o provedor de WhatsApp**: Evolution API (rápido, roda em minutos,
   mas usa número real em modo não-oficial) ou WhatsApp Cloud API oficial
   (mais lento pra configurar — verificação Meta Business — porém mais
   resiliente a longo prazo). O código já está pronto pros dois, só falta a
   decisão + credenciais.
5. **Criar um bot Telegram dedicado ao ROM** via `@BotFather` (2 min, token na
   hora) e configurar o `setWebhook` apontando para
   `/api/webhooks/telegram` com um `secret_token`.
6. Preencher `.env.local` com base no `.env.example`.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencher as chaves
npm run dev
```
