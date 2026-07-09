# Bot staff — ROM Brasil (funcionários)

Bot Telegram **separado** do bot de gestão (`@Romvinibot`).  
Cada profissional vê **só a própria agenda**.

## 1. Criar o bot

1. Telegram → [@BotFather](https://t.me/BotFather) → `/newbot`
2. Nome: `ROM Brasil Staff` (ou similar)
3. Username: ex. `rombrasil_staff_bot`
4. Copie o **token**

## 2. Variáveis na Vercel (`rom-club`)

```
TELEGRAM_STAFF_BOT_TOKEN=<token do BotFather>
TELEGRAM_STAFF_WEBHOOK_SECRET=<openssl rand -hex 32>
```

Redeploy após salvar.

## 3. Webhook

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_STAFF_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://rom-club.vercel.app/api/webhooks/telegram-staff",
    "secret_token": "'"${TELEGRAM_STAFF_WEBHOOK_SECRET}"'",
    "allowed_updates": ["message"]
  }'
```

## 4. Cadastrar e vincular profissional

Com sessão admin (cookie após login) ou Bearer do admin:

```bash
# Criar
curl -sS -X POST https://rom-club.vercel.app/api/professionals \
  -H 'Content-Type: application/json' \
  -H 'Cookie: rom_session=...' \
  -d '{"name":"Maria"}'

# Vincular chat ID do funcionário (ele manda /start no bot staff; admin pega o ID)
curl -sS -X POST https://rom-club.vercel.app/api/professionals \
  -H 'Content-Type: application/json' \
  -H 'Cookie: rom_session=...' \
  -d '{"action":"link","professional_id":"<uuid>","telegram_chat_id":"5508181160"}'
```

Como descobrir o chat ID: o funcionário manda `/start` no bot staff; se não estiver vinculado, o bot responde pedindo vínculo. O admin pode usar o mesmo método do bot gestão (logs) ou pedir o ID via `@userinfobot`.

## 5. Comandos do funcionário

| Comando | O que faz |
|---------|-----------|
| `/start` | Ajuda |
| `/hoje` | Agenda de hoje (só dele) |
| `/agenda` | Próximos 7 dias |
| `/meta` | Meta individual (se configurada) |

**Não** responde KPIs do salão nem `/cliente`.

## 6. Agenda real

Enquanto não houver `AVEC_API_TOKEN` + sync com `professional_id` nos serviços, `/hoje` pode vir vazio.  
Cadastro manual de profissionais e vínculo Telegram já funcionam.

## Isolamento

| Bot | Env | Endpoint | Público |
|-----|-----|----------|---------|
| Gestão | `TELEGRAM_BOT_TOKEN` | `/api/webhooks/telegram` | Admin / recepção |
| Staff | `TELEGRAM_STAFF_BOT_TOKEN` | `/api/webhooks/telegram-staff` | Só agenda própria |
