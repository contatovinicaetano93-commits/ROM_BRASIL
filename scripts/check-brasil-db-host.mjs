#!/usr/bin/env node
/**
 * Fail if ROM_PANEL=brasil but DATABASE_URL points at Neon (unidades usam Supabase).
 * Brasil must use Supabase pooler (*.supabase.com). Iguatemi may stay on neon.tech.
 *
 * Usage:
 *   ROM_PANEL=brasil DATABASE_URL=... node scripts/check-brasil-db-host.mjs
 *   npm run check:brasil-db-host
 */
const panel = (process.env.ROM_PANEL || process.env.NEXT_PUBLIC_ROM_PANEL || '')
  .trim()
  .toLowerCase()
const url = (process.env.DATABASE_URL || '').trim()

if (panel !== 'brasil') {
  console.log(`check-brasil-db-host SKIP: ROM_PANEL=${panel || '(unset)'} (only enforces brasil)`)
  process.exit(0)
}

if (!url) {
  console.error('check-brasil-db-host FAILED: ROM_PANEL=brasil but DATABASE_URL is empty')
  process.exit(1)
}

let host = ''
try {
  const m = url.match(/@([^/:?]+)/)
  host = m?.[1] || ''
} catch {
  host = ''
}

if (!host) {
  console.error('check-brasil-db-host FAILED: could not parse host from DATABASE_URL')
  process.exit(1)
}

if (/neon\.tech$/i.test(host) || /\.neon\.tech$/i.test(host)) {
  console.error(
    `check-brasil-db-host FAILED: Brasil DATABASE_URL host is Neon (${host}).`,
  )
  console.error(
    '  Use Supabase pooler (aws-*.pooler.supabase.com:5432 session or :6543 tx), ssl require, prepare:false.',
  )
  process.exit(1)
}

if (!/supabase\.com$/i.test(host) && !/\.supabase\.com$/i.test(host)) {
  console.warn(
    `check-brasil-db-host WARN: host ${host} is not *.supabase.com — confirm this is intentional for Brasil.`,
  )
}

console.log(`check-brasil-db-host OK: Brasil host=${host}`)
