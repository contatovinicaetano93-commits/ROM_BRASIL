import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled } from '@/lib/auth'
import { isPublicPath } from '@/lib/route-policy'

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (isPublicPath(pathname, req.method)) return NextResponse.next()

  if (await isAuthorized(req)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const login = new URL('/login', req.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
