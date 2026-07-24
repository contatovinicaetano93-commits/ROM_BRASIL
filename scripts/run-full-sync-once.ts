/**
 * One-shot: runAvecSync('full') with env DATABASE_URL + AVEC_*.
 * Usage: npx tsx scripts/run-full-sync-once.ts
 */
import { runAvecSync } from '../src/lib/avec/sync'

async function main() {
  const stats = await runAvecSync('full')
  console.log(
    JSON.stringify(
      {
        id: stats.id,
        kind: stats.kind,
        status: stats.status,
        error: stats.error,
        stats: {
          revenue_rows: stats.stats?.revenue_rows,
          cancellation_rows: stats.stats?.cancellation_rows,
          snapshots_saved: stats.stats?.snapshots_saved,
          p1_rows: stats.stats?.p1_rows,
          p2_rows: stats.stats?.p2_rows,
          p3_rows: stats.stats?.p3_rows,
          clients_upserted: stats.stats?.clients_upserted,
          errors: (stats.stats?.errors || []).slice(0, 20),
          warnings: (stats.stats?.warnings || []).slice(0, 10),
        },
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
