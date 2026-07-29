# ROM CLUB IGUATEMI — deploy independente

Instância **100% isolada** do ROM CLUB BRASIL. Repositório, projeto Vercel e banco Supabase próprios.

## Isolamento garantido

| Recurso | Brasil | Iguatemi |
|---------|--------|----------|
| Repositório Git | `ROM` / `rom_brasil` | `ROM-iguatemi` |
| Projeto Vercel | `rom-club` / `rom-brasil` | `rom-iguatemi` |
| Banco | **Supabase** (pooler) | **Supabase** (pooler dedicado) |
| `DATABASE_URL` | exclusivo (Supabase BR) | exclusivo (Supabase IG) |
| `AVEC_API_TOKEN` | loja Brasil | loja Iguatemi |
| WhatsApp / Telegram | instância/bot Brasil | instância/bot Iguatemi |

> **Ambas as unidades usam Supabase.** Apenas o Cérebro (painel interno da Waltter) usa Neon.

## Passo 1 — Supabase

1. [supabase.com](https://supabase.com) → **New Project** → dedicado Iguatemi
2. SQL Editor → executar `db/schema.sql`
3. Connection string (Transaction pooler `:6543`) → `DATABASE_URL`
4. Session pooler (`:5432`) → `DATABASE_URL_UNPOOLED` (scripts)

## Passo 2 — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project**
2. Importar repositório `ROM-iguatemi`
3. Nome: `rom-iguatemi`
4. **Environment Variables (Production)** — usar `deploy/vercel-rom-club-iguatemi.env`
5. Deploy

## Passo 3 — Domínio

- Settings → Domains → `iguatemi.romclub.com.br` (ou equivalente)
- Anotar URL base para webhooks

## Passo 4 — Primeiro uso

1. `https://SEU-DOMINIO/login`
2. `/admin` → confirmar **ROM CLUB IGUATEMI** e sem warnings
3. Seed preset **Iguatemi** → Popular
4. Testar Avec → Sync

## Passo 5 — Integrações

### Telegram

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://SEU-DOMINIO/api/webhooks/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### WhatsApp (Cloud API oficial)

- `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` na Vercel
- `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` (webhook Meta)
- Opcional: `WHATSAPP_TEMPLATE_AFTERCARE` (template aftercare fora de 24h)
- Webhook Meta: `https://SEU-DOMINIO/api/webhooks/whatsapp` (subscribe: messages)

### Avec (opcional webhook push)

- URL: `https://SEU-DOMINIO/api/webhooks/avec`
- Header: `x-avec-secret`

## Validação

- [ ] Admin mostra `painel=iguatemi`
- [ ] Contatos do Brasil **não** aparecem
- [ ] Sync Avec stats com `panel: iguatemi`
- [ ] Briefing ✨ funciona em `/hoje`
