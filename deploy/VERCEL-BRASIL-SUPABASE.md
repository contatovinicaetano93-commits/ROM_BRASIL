# Vercel — Brasil → Supabase only (checklist)

Brasil must not use the dead Neon project (`ep-long-sun-*.neon.tech`).
Iguatemi stays on Neon — do not change IG URLs.

## rom-brasil (Production)

| Variable | Expected | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Supabase pooler `*.pooler.supabase.com:5432` (session) or `:6543` (tx) | App reads this. `sslmode=require`. postgres.js: `prepare:false`. |
| `DATABASE_URL_UNPOOLED` | **unused** by app | Neon-era leftover. Safe to remove in Vercel UI after health check. |
| Neon integration | none | Disconnect Neon from the Vercel project if still linked. |

Verify:

```bash
# host only — never paste full passwords into chat/PR
npx vercel env run -e production -- node -e \
  "const u=process.env.DATABASE_URL||''; const m=u.match(/@([^/:?]+)/); console.log(m&&m[1])"
# expect: aws-*-pooler.supabase.com
ROM_PANEL=brasil DATABASE_URL="$DATABASE_URL" npm run check:brasil-db-host
```

## cerebro-rom (Production)

| Variable | Expected | Notes |
|----------|----------|-------|
| `NEON_BRASIL_DATABASE_URL` | Supabase pooler (same BR DB) | Name kept for compat; value must be Supabase, not Neon BR. |
| `NEON_IGUATEMI_DATABASE_URL` | Neon Iguatemi | Leave alone. |
| `CEREBRO_DATABASE_URL` | Cérebro Neon (own) | Leave alone. |
| `DATABASE_URL` / `UNPOOLED` | Cérebro Neon (`ep-small-poetry-…`) | Not the Brasil unit DB — leave alone. |

## Local helpers (not in git)

- `/tmp/rom-dbs/supabase-brasil.env` — canonical BR Supabase SESSION + TX
- `/tmp/rom-dbs/env` — `DATABASE_URL_BRASIL` = SESSION; IG/RomSales = Neon
- `/tmp/rom-dbs/brasil-supabase.env.note` — ops notes
