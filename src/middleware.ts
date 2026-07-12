import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled, getSession } from '@/lib/auth'

const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isFinancePath(pathname: string) {
  return pathname === '/financeiro' || pathname.startsWith('/financeiro/') || pathname.startsWith('/api/financeiro/')
}

function isProtectedPage(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hoje' ||
    pathname === '/dashboard' ||
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/financeiro' ||
    pathname.startsWith('/financeiro/')
  )
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith('/api/') && !isPublicApi(pathname)
}

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/login') return NextResponse.next()

  const needsAuth = isProtectedPage(pathname) || isProtectedApi(pathname)
  if (!needsAuth) return NextResponse.next()

  const allowHeaderTokens =
    pathname === '/api/avec/sync' || pathname === '/api/director-report'
  if (!(await isAuthorized(req, { allowHeaderTokens }))) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const login = new URL('/login', req.url)
    login.searchParams.set('next', pathname === '/' ? '/hoje' : pathname)
    return NextResponse.redirect(login)
  }

  // Isolamento do painel Financeiro (Sprint 4): financeiro só enxerga /financeiro,
  // e ninguém fora de admin/financeiro enxerga /financeiro.
  const session = await getSession(req)
  const role = session?.role
  const financePath = isFinancePath(pathname)

  if (role === 'financeiro' && (isProtectedPage(pathname) || isProtectedApi(pathname)) && !financePath) {
    return NextResponse.redirect(new URL('/financeiro', req.url))
  }
  if (financePath && role !== 'admin' && role !== 'financeiro') {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao financeiro' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/hoje', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/hoje',
    '/dashboard',
    '/contatos',
    '/contatos/:path*',
    '/admin',
    '/admin/:path*',
    '/financeiro',
    '/financeiro/:path*',
    '/api/:path*',
  ],
}
