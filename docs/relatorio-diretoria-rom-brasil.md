# Relatório diretoria — ROM Brasil

Painel: `/admin/relatorio-diretoria` (somente `ADMIN-BRASIL`).

## Fontes Avec

| Código | Uso |
|--------|-----|
| **0011** | Retorno de clientes por profissional · comparativo trimestre |
| **0021** | Faturamento + ticket médio por profissional · mês a mês |

## Agenda

- Cron Vercel: terça **08:00** America/Sao_Paulo → `POST /api/director-report` (`0 11 * * 2` UTC)
- Auth: `Authorization: Bearer $CRON_SECRET` ou sessão admin

## Fonte de dados

Com `AVEC_API_TOKEN` (e sem `AVEC_MOCK=1` / `?mock=1`):

- **0021** — faturamento/ticket por mês calendário (`inicio`/`fim` dd/mm/yyyy)
- **0011** — lista de reativação no trimestre (+ taxa se a linha trouxer; senão fallback **0007**)
- Match profissional: `avec_pro_id` ou nome (normalizado)
- Override do código 0011: `AVEC_REPORT_DIRECTOR_RETURN`

Sem token (ou falha Avec / `forceMock`): fixture — série **FATURAMENTOVITOR** + lista Dani embutida.

## Export / envio

- `csv-revenue` — faturamento + ticket (modelo planilha)
- `csv-return` — taxa de retorno por trimestre
- `csv-reactivation` — lista 0011 (Cliente, E-mail, Telefone, Celular, Sexo, Data ultima comanda)

### E-mail

```
DIRECTOR_REPORT_EMAIL=contato.vinicaetano93@gmail.com
RESEND_API_KEY=re_...
DIRECTOR_REPORT_FROM=ROM CLUB BRASIL <onboarding@resend.dev>
```

Sem `RESEND_API_KEY`, o POST ainda envia os CSVs no Telegram da gestão.

### Fixture 0011

Exemplo real Dani Mariniello: `fixtures/avec/0011-dani-mariniello-1tri-2tri-2026.xlsx`  
(lista embutida em `src/lib/director-report/fixtures/0011-dani-mariniello.json`)
