/** Utilitário puro — seguro para importar em Client Components. */
export function sanitizeRedirectPath(next: string | null | undefined, fallback = '/dashboard') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (next.includes('://') || next.includes('\\')) return fallback
  return next
}
