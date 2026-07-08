/** Rotas públicas — única fonte para middleware e documentação. */
export function isPublicPath(pathname: string, method: string) {
  if (pathname === '/login') return true
  if (pathname.startsWith('/api/auth')) return true
  if (pathname.startsWith('/api/webhooks/')) return true
  if (pathname === '/api/health' && method === 'GET') return true
  return false
}
