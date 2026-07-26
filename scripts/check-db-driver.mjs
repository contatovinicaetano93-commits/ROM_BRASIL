#!/usr/bin/env node
/**
 * Guard against regressing ROM Brasil to Neon HTTP.
 * neon() (@neondatabase/serverless) cannot talk to *.supabase.com / pooler hosts —
 * production BR uses Supabase + postgres.js. Iguatemi stays on Neon separately.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const dbTs = readFileSync(join(root, 'src/lib/db.ts'), 'utf8')

const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const errors = []

if (!deps.postgres) {
  errors.push('package.json must depend on `postgres` (postgres.js) for Supabase')
}
if (deps['@neondatabase/serverless']) {
  errors.push(
    '`@neondatabase/serverless` must not be a dependency — neon() fails against *.supabase.com',
  )
}
if (!/\bfrom\s+['"]postgres['"]/.test(dbTs) && !/\bimport\s+postgres\b/.test(dbTs)) {
  errors.push('src/lib/db.ts must import postgres.js')
}
const codeOnly = dbTs
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
if (
  /\bfrom\s+['"]@neondatabase\/serverless['"]/.test(codeOnly) ||
  /\bneon\s*\(/.test(codeOnly)
) {
  errors.push('src/lib/db.ts must not use neon() / @neondatabase/serverless')
}

if (errors.length) {
  console.error('check-db-driver FAILED:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('check-db-driver OK: postgres.js driver present; neon HTTP absent')
