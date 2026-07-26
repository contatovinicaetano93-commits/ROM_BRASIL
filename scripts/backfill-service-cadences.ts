/**
 * Preenche cadence_days nulo em client_services com defaults por categoria.
 * Desbloqueia Contatos "ações pendentes" / overdue após sync Avec sem cadência.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/backfill-service-cadences.ts
 *   DATABASE_URL=... npx tsx scripts/backfill-service-cadences.ts --dry-run
 */
import { getSql } from '../src/lib/db'
import { defaultCadenceDaysForCategory, type AvecServiceCategory } from '../src/lib/avec/normalize'

const DRY = process.argv.includes('--dry-run')

const CATEGORIES: AvecServiceCategory[] = [
  'corte',
  'tratamento',
  'coloracao',
  'bem_estar',
  'outro',
]

async function main() {
  const sql = getSql()
  const before = await sql`
    select
      count(*)::int as total,
      count(*) filter (where cadence_days is null)::int as missing
    from client_services
    where active = true
  `
  console.log('before', before[0])

  if (DRY) {
    for (const cat of CATEGORIES) {
      const n = await sql`
        select count(*)::int as n from client_services
        where active = true and cadence_days is null and category = ${cat}
      `
      console.log(`dry-run would set ${cat} → ${defaultCadenceDaysForCategory(cat)}d for ${n[0]?.n ?? 0} rows`)
    }
    return
  }

  let updated = 0
  for (const cat of CATEGORIES) {
    const days = defaultCadenceDaysForCategory(cat)
    const rows = await sql`
      update client_services
      set cadence_days = ${days}
      where active = true and cadence_days is null and category = ${cat}
      returning id
    `
    updated += rows.length
    console.log(`updated ${cat}: ${rows.length} → ${days}d`)
  }

  const after = await sql`
    select
      count(*)::int as total,
      count(*) filter (where cadence_days is null)::int as missing,
      count(*) filter (where cadence_days is not null and last_done_at is not null)::int as due_ready
    from client_services
    where active = true
  `
  console.log('after', after[0], { updated })
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
