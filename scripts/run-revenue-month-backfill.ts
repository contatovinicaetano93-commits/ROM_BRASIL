/**
 * One-shot: backfill receita (0088) + formas de pagamento (0081).
 * Default: 1º de janeiro do ano corrente → hoje (America/Sao_Paulo).
 *
 * Usage:
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... \
 *     npx tsx scripts/run-revenue-month-backfill.ts
 *
 * Opcional: FROM=2026-01-01 TO=2026-07-26 MAX_DAYS=31
 * (sem MAX_DAYS processa o intervalo inteiro de uma vez)
 */
import { runRevenueBackfill, yearStartOf } from '../src/lib/avec/revenue-backfill'

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  const today = todayIsoLocal()
  const from = process.env.FROM?.trim() || yearStartOf(today)
  const to = process.env.TO?.trim() || today
  const maxDaysRaw = process.env.MAX_DAYS?.trim()
  const maxDays = maxDaysRaw ? Number(maxDaysRaw) : undefined

  console.log('backfill', {
    from,
    to,
    maxDays: maxDays ?? 'all',
    unit: process.env.AVEC_UNIT_ID ?? null,
  })

  let cursor: string | undefined = from
  let chunks = 0
  let totalDays = 0
  let totalRevenue = 0

  while (cursor) {
    const result = await runRevenueBackfill({
      from: cursor,
      to,
      maxDays: Number.isFinite(maxDays) && (maxDays as number) > 0 ? maxDays : undefined,
    })
    chunks++
    totalDays += result.days.length
    totalRevenue += result.sum_revenue
    console.log(
      'chunk',
      JSON.stringify({
        from: result.from,
        to: result.to,
        days: result.days.length,
        days_with_revenue: result.days_with_revenue,
        sum_revenue: result.sum_revenue,
        next_from: result.next_from,
        revenue_errors: result.revenue_errors.slice(0, 8),
        payment_errors: result.payment_errors.slice(0, 8),
        months_materialized: result.months_materialized,
      }),
    )
    if (result.done || !result.next_from) break
    if (maxDays == null) break
    cursor = result.next_from
  }

  console.log(
    'OK revenue-year-backfill',
    JSON.stringify({ chunks, totalDays, totalRevenue: Math.round(totalRevenue) }),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
