/**
 * Backfill resumável de clientes Avec (relatório 0004) → contacts (status importado).
 *
 * Checkpoint em app_runtime_secrets (key=backfill_clients_0004_page).
 *
 * Usage:
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=40613 \
 *     npx tsx scripts/backfill-clients-0004.ts
 *   ... npx tsx scripts/backfill-clients-0004.ts --max-pages=40
 *   ... npx tsx scripts/backfill-clients-0004.ts --reset
 */
import { getSql } from '../src/lib/db'
import { upsertContact } from '../src/lib/contacts'
import { fetchAvecReport, AVEC_PAGE_LIMIT, extractRows } from '../src/lib/avec/client'
import { normalizeClientRow } from '../src/lib/avec/normalize'
import { avecSiteParam } from '../src/lib/brand'

const CHECKPOINT_KEY = 'backfill_clients_0004_page'

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

async function loadCheckpoint(): Promise<number> {
  const sql = getSql()
  await sql`
    create table if not exists app_runtime_secrets (
      key text primary key,
      value text not null,
      expires_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `
  const rows = (await sql`
    select value from app_runtime_secrets where key = ${CHECKPOINT_KEY} limit 1
  `) as { value: string }[]
  const n = Number(rows[0]?.value ?? 1)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

async function saveCheckpoint(page: number): Promise<void> {
  const sql = getSql()
  await sql`
    insert into app_runtime_secrets (key, value, updated_at)
    values (${CHECKPOINT_KEY}, ${String(page)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `
}

async function main() {
  if (!process.env.AVEC_API_TOKEN && !process.env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL e AVEC_API_TOKEN')
  }

  const reset = process.argv.includes('--reset')
  const maxPages = argNum('max-pages', 40)
  let page = reset ? 1 : await loadCheckpoint()
  if (reset) await saveCheckpoint(1)

  let upserted = 0
  let pages = 0
  let done = false

  console.log(JSON.stringify({ startPage: page, maxPages, site: avecSiteParam() ?? null }))

  while (pages < maxPages) {
    const payload = await fetchAvecReport('0004', {
      page,
      limit: AVEC_PAGE_LIMIT,
      site: avecSiteParam(),
    })
    const list = extractRows(payload)

    if (list.length === 0) {
      done = true
      break
    }

    for (const row of list) {
      const c = normalizeClientRow(row)
      if (!c) continue
      await upsertContact({
        avecClientId: c.avecClientId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        channel: 'avec',
        source: 'avec_backfill_clients_0004',
        status: 'importado',
      })
      upserted++
    }

    pages++
    const next = page + 1
    await saveCheckpoint(next)
    console.log(
      JSON.stringify({
        page,
        rows: list.length,
        upserted,
        nextPage: next,
        truncatedBatch: list.length >= AVEC_PAGE_LIMIT,
      }),
    )

    if (list.length < AVEC_PAGE_LIMIT) {
      done = true
      break
    }
    page = next
  }

  const sql = getSql()
  const counts = await sql`
    select
      count(*)::int as contacts,
      count(*) filter (where status = 'importado')::int as importado,
      count(*) filter (where avec_client_id is not null)::int as with_avec
    from contacts
  `
  console.log(
    JSON.stringify({
      done,
      pagesFetched: pages,
      upserted,
      nextPage: done ? null : page + (pages > 0 ? 0 : 0),
      checkpointPage: await loadCheckpoint(),
      contacts: counts[0],
      note: done
        ? 'Backfill 0004 completo nesta unidade'
        : 'Rode de novo para continuar (checkpoint persistido)',
    }),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
