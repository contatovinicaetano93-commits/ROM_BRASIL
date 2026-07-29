# Vercel — Brasil & Iguatemi em Supabase

Brasil e Iguatemi usam **Supabase**. Apenas o Cérebro (painel interno da Waltter) usa Neon.
Confirme que nenhuma das duas unidades ROM aponta para neon.tech.

## ROM Brasil (Vercel project)

| Var | Valor | Notas |
|-----|-------|-------|
| `DATABASE_URL` | Supabase pooler BR | `*.pooler.supabase.com` session `:5432` ou tx `:6543` |
| `DATABASE_URL_UNPOOLED` | **unused** by app | Neon-era leftover. Safe to remove in Vercel UI after health check. |
| Neon integration | none | Disconnect Neon from the Vercel project if still linked. |

## ROM Iguatemi (Vercel project)

| Var | Valor | Notas |
|-----|-------|-------|
| `DATABASE_URL` | Supabase pooler IG | Mesmo padrão — projeto Supabase dedicado Iguatemi |
| Neon integration | none | Disconnect Neon from the IG Vercel project if still linked. |

## Cérebro (referência)

> Cérebro mantém Neon — não altere os valores abaixo.

| Var | Valor | Notas |
|-----|-------|-------|
| `NEON_BRASIL_DATABASE_URL` | Supabase pooler (BR DB) | Nome mantido por compatibilidade; valor deve ser Supabase, não Neon BR. |
| `NEON_IGUATEMI_DATABASE_URL` | Supabase pooler (IG DB) | Nome mantido por compatibilidade; valor deve ser Supabase IG, não Neon. |
| `UNIT_BRASIL_DATABASE_URL` / `UNIT_IGUATEMI_DATABASE_URL` | opcional | Preferidos quando presentes (aliases sem “Neon” no nome). |
| `CEREBRO_DATABASE_URL` | Neon (banco próprio do Cérebro) | Deixe como está — Cérebro usa Neon para seus dados internos. |
| `DATABASE_URL` / `UNPOOLED` | Neon Cérebro | Não é o banco das unidades ROM — deixe como está. |
