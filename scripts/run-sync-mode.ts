/**
 * Usage: npx tsx scripts/run-sync-mode.ts fast|full
 */
import { runAvecSync, type AvecSyncMode } from '../src/lib/avec/sync'

async function main() {
  const mode = (process.argv[2] === 'fast' ? 'fast' : 'full') as AvecSyncMode
  const run = await runAvecSync(mode)
  console.log(
    JSON.stringify(
      {
        id: run.id,
        kind: run.kind,
        status: run.status,
        error: run.error,
        stats: {
          clients_upserted: run.stats?.clients_upserted,
          appointments_synced: run.stats?.appointments_synced,
          attendances_synced: run.stats?.attendances_synced,
          services_created: run.stats?.services_created,
          services_completed: run.stats?.services_completed,
          revenue_rows: run.stats?.revenue_rows,
          warnings: (run.stats?.warnings || []).slice(0, 8),
          errors: (run.stats?.errors || []).slice(0, 12),
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
