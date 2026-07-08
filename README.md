# ROM — Onboarding & Painel de KPIs

Sistema interno da frente de caixa do ROM Club: recebe contatos de clientes por
WhatsApp (IA de primeiro atendimento), Telegram (secretária de consulta prática
pra equipe) e Avec (sync de agenda/clientes), e centraliza tudo num painel de
KPIs.

Stack: Next.js (App Router) + TypeScript + Tailwind + Supabase, API-first
(front-end só fala com `/api/*`) — mesmo padrão do app-thaise.

**Interface é web mobile-first** (não é app nativo): pensada pra abrir no
navegador do celular da equipe. Container limitado à largura de celular,
navegação por *bottom tab bar* (Painel / Contatos), `theme-color` e
`apple-web-app` pra ficar com cara de app quando salva na tela inicial.

## Como funciona

- `src/app/api/webhooks/avec` — recebe eventos do Avec (webhook simples até
  confirmarmos a API oficial deles).
- `src/app/api/webhooks/whatsapp` — recebe mensagem do provedor WhatsApp
  (Evolution API), responde com IA (primeiro atendimento guiado) e loga tudo.
- `src/app/api/webhooks/telegram` — bot "secretária": equipe pergunta em
  linguagem natural, a IA responde puxando os KPIs do Supabase.
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

1. **Criar um projeto novo no Supabase** (não reaproveitar o do app-thaise —
   dados de negócios diferentes). Copiar URL + service role key pro
   `.env.local`.
2. **Rodar `supabase/schema.sql`** no SQL Editor do projeto novo.
3. **Confirmar com o suporte do Avec** se existe API/webhook público. Não
   achei documentação pública — sem isso, o endpoint `/api/webhooks/avec` fica
   pronto mas sem gatilho real.
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
