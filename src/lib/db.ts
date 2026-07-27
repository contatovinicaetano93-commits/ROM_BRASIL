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
 * Iguatemi remains on Neon in its own repo.
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

function getClient(databaseUrl: string): PostgresSql {
  let client = clients.get(databaseUrl)
  if (!client) {
    client = postgres(databaseUrl, {
      ssl: 'require',
      max: 3,
      // Transaction/Session pooler: prepared statements quebram no modo transaction.
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      connect_timeout: 15,
    })
    clients.set(databaseUrl, client)
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
 * Cliente Postgres (Supabase pooler / Neon TCP) — só em route handlers (server-side).
 * DATABASE_URL: Session pooler (5432) ou Transaction (6543) no Vercel.
 */
export function getSql(databaseUrl?: string): Sql {
  const url = (databaseUrl ?? process.env.DATABASE_URL)?.trim()
  if (!url) throw new Error('DATABASE_URL não configurada')
  return wrap(getClient(url))
}
