import 'server-only'
import postgres, { type Sql as PostgresSql } from 'postgres'

// Prefer IPv4 (Supabase direct host is often IPv6-only; pooler is IPv4).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // older Node / non-Node
}

/**
 * Cliente postgres.js + helpers neon-compat (query / transaction).
 * Também expõe o helper de lista: sql`… where id in ${sql(ids)}`.
 *
 * Do NOT switch back to neon() from @neondatabase/serverless:
 * neon() is HTTP-only and fails against *.supabase.com / pooler hosts.
 * BR e IG usam Supabase; só o Cérebro usa Neon.
 */
export type Sql = {
  // Tagged template + helper sql(ids) para IN (...)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (first: TemplateStringsArray | readonly any[], ...rest: any[]): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (query: string, params?: any[]) => Promise<any[]>
  transaction: <T>(
    fn: (txn: Sql) => Array<Promise<T>> | Promise<Array<Promise<T>>>,
  ) => Promise<T[]>
}

const clients = new Map<string, PostgresSql>()

/**
 * Session pooler (5432) no Supabase tem poucas slots (EMAXCONNSESSION).
 * Em serverless (Vercel), transaction mode (6543) libera a conexão a cada query.
 */
export function resolveDatabaseUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const u = new URL(trimmed)
    const isSupabasePooler =
      u.hostname.includes('pooler.supabase.com') || u.hostname.includes('.pooler.supabase.')
    const port = u.port || '5432'
    if (isSupabasePooler && port === '5432') {
      u.port = '6543'
      return u.toString()
    }
  } catch {
    // URL inválida — deixa o postgres.js falhar com a string original.
  }
  return trimmed
}

export function isDbPoolExhaustedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /EMAXCONNSESSION|max clients reached|remaining connection slots|too many connections/i.test(
    msg,
  )
}

function getClient(databaseUrl: string): PostgresSql {
  const resolved = resolveDatabaseUrl(databaseUrl)
  let client = clients.get(resolved)
  if (!client) {
    client = postgres(resolved, {
      ssl: 'require',
      // 1 conn por isolate serverless — várias lambdas × max:3 estouravam o pooler.
      max: 1,
      // Transaction/Session pooler: prepared statements quebram no modo transaction.
      prepare: false,
      idle_timeout: 5,
      max_lifetime: 60 * 2,
      connect_timeout: 10,
    })
    clients.set(resolved, client)
  }
  return client
}

function wrap(sql: PostgresSql): Sql {
  // Reutiliza a função sql do postgres.js (tagged template + helper sql(ids)).
  const client = sql as unknown as Sql

  client.query = async (query: string, params: unknown[] = []) => {
    return sql.unsafe(query, params as never[]) as unknown as unknown[]
  }

  client.transaction = async (fn) => {
    return sql.begin(async (txn) => {
      const wrapped = wrap(txn as unknown as PostgresSql)
      const pending = await fn(wrapped)
      const results: unknown[] = []
      for (const item of pending) {
        results.push(await item)
      }
      return results as never
    }) as Promise<never[]>
  }

  return client
}

/**
 * Cliente Postgres (Supabase pooler) — só em route handlers (server-side).
 * DATABASE_URL: Session pooler (5432) é reescrito para Transaction (6543) quando Supabase.
 */
export function getSql(databaseUrl?: string): Sql {
  const url = (databaseUrl ?? process.env.DATABASE_URL)?.trim()
  if (!url) throw new Error('DATABASE_URL não configurada')
  return wrap(getClient(url))
}
