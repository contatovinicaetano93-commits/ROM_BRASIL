import { createClient } from '@supabase/supabase-js'

// Service-role client — uso exclusivo em route handlers (server-side).
// Nunca importar isso em componentes client.
export function createSupabaseServer() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
