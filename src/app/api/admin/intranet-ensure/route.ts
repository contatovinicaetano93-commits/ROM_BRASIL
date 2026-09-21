import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getIntranetSql, peekIntranetDatabaseUrl } from '@/lib/db'
import { ensureIntranetProLinkColumn } from '@/lib/intranet/ensure-schema'

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

function dbHost(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/@([^/:?]+)/)
  return match?.[1] ?? null
}

/** POST — só garante professional_name no banco da intranet (sem outras migrations). */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const host = dbHost(peekIntranetDatabaseUrl())
    await ensureIntranetProLinkColumn()

    const sql = getIntranetSql()
    const cols = (await sql.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'intranet_employees'
        and column_name = 'professional_name'
    `)) as { column_name: string }[]

    return ok({
      host,
      professionalNameReady: cols.length > 0,
      columns: cols.map((c) => c.column_name),
    })
  } catch (e) {
    return handleError(e)
  }
}
