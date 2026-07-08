import { ok } from '@/lib/api-response'
import { AUTH_COOKIE } from '@/lib/auth'

export async function POST() {
  const res = ok({ auth: 'logged_out' })
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
