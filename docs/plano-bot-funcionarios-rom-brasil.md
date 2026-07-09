# Plano — Bot de funcionários + KPIs por profissional (ROM Brasil)

> Unidade: **ROM Brasil** · Repo: `ROM_BRASIL` · Produção: https://rom-club.vercel.app  
> Status: **esqueleto implementado** (webhook + tabela + API). Agenda real depende de `AVEC_API_TOKEN`.  
> Guia operacional: [`bot-staff-rom-brasil.md`](bot-staff-rom-brasil.md)

## Objetivo

1. KPIs por profissional na plataforma (agenda Avec sincronizada).
2. Bot Telegram **separado** só para funcionários — cada um vê **apenas a própria agenda**.

O bot atual (`TELEGRAM_BOT_TOKEN` / `@Romvinibot`) continua da **gestão/recepção**.  
Funcionários usam outro bot (`TELEGRAM_STAFF_BOT_TOKEN`).

---

## Pré-requisitos

| Item | Status |
|------|--------|
| App + Neon + cron fast 1 min | ✅ |
| `AVEC_API_TOKEN` | ⬜ bloqueio |
| Relatórios 0051 / 0002 com campo profissional | ⬜ validar no primeiro sync real |
| Bot Telegram novo (BotFather) | ⬜ criar quando for a fase 3 |

O código já tenta ler `profissional` / `profissional_nome` em `src/lib/avec/normalize.ts`.  
No sync, `profissional_id` ainda vai vazio — precisa passar o ID Avec quando soubermos o formato.

---

## Modelo de dados (Neon)

```sql
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  avec_pro_id text unique,
  name text not null,
  telegram_chat_id text unique,
  active boolean not null default true,
  daily_goal numeric(12,2),
  created_at timestamptz not null default now()
);

-- Agenda / serviços passam a guardar referência ao profissional
-- (delta em client_services ou tabela schedule_items)
alter table client_services
  add column if not exists professional_id uuid references professionals(id),
  add column if not exists avec_professional_name text;
```

Métricas diárias por profissional (opcional, fase 2):

```sql
create table if not exists professional_daily_metrics (
  day date not null,
  professional_id uuid not null references professionals(id),
  appointments int not null default 0,
  attended int not null default 0,
  no_shows int not null default 0,
  revenue numeric(12,2) not null default 0,
  primary key (day, professional_id)
);
```

---

## Sync Avec

1. No `mode=fast` / `full`, ao processar 0051 e 0002:
   - upsert `professionals` por `avec_pro_id` (ou nome normalizado se ID não vier)
   - gravar `professional_id` em cada serviço/agendamento
2. Recomputar `professional_daily_metrics` do dia (SP timezone).
3. Não sincronizar 700 relatórios — só os Tier A já usados + campos de profissional.

---

## KPIs na plataforma (fase 2)

Tela leve **Equipe** (ou bloco em `/hoje` só para admin):

| KPI | Cálculo |
|-----|---------|
| Agenda hoje | count agendamentos do pro |
| Ocupação | agendados ÷ capacidade do pro (ou do salão / N) |
| Atendidos / no-shows | do dia |
| Faturamento | se o relatório de receita trouxer profissional |

UI: lista compacta, **sem** dashboard complexo. Detalhe no clique / Telegram gestão.

---

## Bot funcionários (fase 3)

### Env (ROM Brasil)

```
TELEGRAM_STAFF_BOT_TOKEN=...          # bot novo
TELEGRAM_STAFF_WEBHOOK_SECRET=...
# webhook: https://rom-club.vercel.app/api/webhooks/telegram-staff
```

Gestão continua em:

```
TELEGRAM_BOT_TOKEN=...                # @Romvinibot
TELEGRAM_STAFF_CHAT_IDS=...           # whitelist gestão (nome legado)
```

### Segurança

- Fail-closed: sem `telegram_chat_id` mapeado → mensagem “peça ao admin”.
- Toda query filtra `WHERE professional_id = :pro_do_chat`.
- Nunca listar outros profissionais.
- Secret do webhook obrigatório (igual ao bot gestão).

### Comandos

| Comando | Resposta |
|---------|----------|
| `/start` | Boas-vindas ROM Brasil + nome do profissional |
| `/hoje` | Horários de hoje (só dele) |
| `/agenda` | Próximos N horários |
| `/meta` | Progresso da meta dele (se `daily_goal` setado) |

Admin mapeia chat: painel admin ou comando interno `/vincular <avec_pro_id>` no bot gestão.

---

## Web self-service (fase 4, opcional)

- Rota `/eu` com login por código/senha do profissional (não o admin).
- Mesmo filtro `professional_id` — só agenda própria.

---

## Rollout

1. **Token Avec** + validar campo profissional nos relatórios  
2. **KPIs por profissional** na UI (Equipe)  
3. **Bot funcionários** + mapeamento chat ↔ pro  
4. **`/eu`** no painel (se fizer sentido)

---

## Fora de escopo agora

- Um único bot misturando gestão e funcionários  
- Funcionário ver KPIs do salão inteiro  
- Sync de todos os 700 relatórios Avec  

---

## Referências

- Sync atual: `docs/avec-sync-rom-brasil.md`
- Normalize profissional: `src/lib/avec/normalize.ts`
- Bot gestão: `src/app/api/webhooks/telegram/route.ts`
