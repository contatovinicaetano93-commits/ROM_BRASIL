import 'server-only'
import postgres, { type Sql as PostgresSql } from 'postgres'

// Prefer IPv4 (Supabase direct host is often IPv6-only; pooler is IPv4).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // older Node / non-Node
}

/** Compatível com o uso anterior do neon tagged-template + query + transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (query: string, params?: any[]) => Promise<any[]>
  transaction: <T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (txn: Sql) => Array<Promise<T>> | Promise<Array<Promise<T>>>,
  ) => Promise<T[]>
}

const clients = new Map<string, PostgresSql>()

function getClient(databaseUrl: string): PostgresSql {
  let client = clients.get(databaseUrl)
  if (!client) {
    client = postgres(databaseUrl, {
      ssl: 'require',
      max: 1,
      // Transaction pooler (6543) does not support prepared statements.
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 30,
    })
    clients.set(databaseUrl, client)
  }
  return client
}

function wrap(sql: PostgresSql): Sql {
  const tagged = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as never[]))) as unknown as Sql

  tagged.query = async (query: string, params: unknown[] = []) => {
    return sql.unsafe(query, params as never[]) as unknown as unknown[]
  }

  tagged.transaction = async (fn) => {
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

  return tagged
}

/**
 * Cliente Postgres (Supabase pooler / Neon TCP) — só em route handlers (server-side).
 * DATABASE_URL: preferir Transaction pooler (porta 6543) no Vercel.
 */
export function getSql(databaseUrl?: string): Sql {
  const url = (databaseUrl ?? process.env.DATABASE_URL)?.trim()
  if (!url) throw new Error('DATABASE_URL não configurada')
  return wrap(getClient(url))
}
