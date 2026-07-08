'use client'

import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { LogoutButton } from './LogoutButton'

interface Session {
  auth_enabled: boolean
  authenticated: boolean
  user: string | null
}

export function AdminSessionBar({ className = '' }: { className?: string }) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setSession(json.data ?? null))
      .catch(() => setSession(null))
  }, [])

  if (!session?.auth_enabled || !session.authenticated) return null

  return (
    <div className={`rounded-xl border border-gold/25 bg-gold/5 p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <Shield size={14} className="text-gold" />
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted">Sessão admin</p>
          <p className="truncate text-sm font-medium text-gold">{session.user ?? 'admin'}</p>
        </div>
      </div>
      <LogoutButton className="w-full" label="Sair do sistema" />
    </div>
  )
}
