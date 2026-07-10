'use client'

import { useEffect, useState } from 'react'
import { Shield, UserRound } from 'lucide-react'
import { LogoutButton } from './LogoutButton'

interface Session {
  auth_enabled: boolean
  authenticated: boolean
  user: string | null
  role: 'admin' | 'staff' | null
  can_view_revenue: boolean
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

  const isAdmin = session.role === 'admin'
  const Icon = isAdmin ? Shield : UserRound
  const label = isAdmin ? 'Sessão admin' : 'Sessão equipe'

  return (
    <div className={`rounded-xl border border-gold/25 bg-gold/5 p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} className="text-gold" />
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</p>
          <p className="truncate text-sm font-medium text-gold">{session.user ?? '—'}</p>
          {!isAdmin && (
            <p className="mt-0.5 text-[0.65rem] text-muted">Sem acesso a faturamento</p>
          )}
        </div>
      </div>
      <LogoutButton className="w-full" label="Sair do sistema" />
    </div>
  )
}
