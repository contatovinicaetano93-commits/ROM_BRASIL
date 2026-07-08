import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled, isAuthMisconfigured } from '@/lib/auth'

const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isProtectedPage(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hoje' ||
    pathname === '/dashboard' ||
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  )
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith('/api/') && !isPublicApi(pathname)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/login') return NextResponse.next()

  const needsAuth = isProtectedPage(pathname) || isProtectedApi(pathname)
  if (!needsAuth) return NextResponse.next()

  // Produção sem ROM_ADMIN_PASSWORD: bloqueia (fail-closed).
  if (isAuthMisconfigured()) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json(
        { error: 'Auth não configurada (ROM_ADMIN_PASSWORD)' },
        { status: 503 }
      )
    }
    return new NextResponse('Auth não configurada. Defina ROM_ADMIN_PASSWORD na Vercel.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  // Dev local sem senha: aberto.
  if (!isAuthEnabled()) return NextResponse.next()

  if (await isAuthorized(req)) return NextResponse.next()

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const login = new URL('/login', req.url)
  login.searchParams.set('next', pathname === '/' ? '/hoje' : pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/', '/hoje', '/dashboard', '/contatos', '/contatos/:path*', '/admin', '/admin/:path*', '/api/:path*'],
}
