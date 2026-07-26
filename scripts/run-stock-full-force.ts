/**
 * One-shot estoque full forçando release do lock stock_sync (uso operacional).
 */
import { getSql } from '../src/lib/db'
import { runStockSync } from '../src/lib/avec/sync-stock'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')
  const sql = getSql()
  await sql`delete from sync_locks where key = ${'stock_sync'}`
  console.log('stock_sync lock cleared')
  console.log('stock full start')
  const result = await runStockSync('full')
  console.log(
    JSON.stringify(
      {
        status: result.status,
        error: result.error,
        positions_synced: result.stats?.positions_synced,
        movements_synced: result.stats?.movements_synced,
        alerts_active: result.stats?.alerts_active,
        errors: (result.stats?.errors || []).slice(0, 20),
        warnings: (result.stats?.warnings || []).slice(0, 12),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
