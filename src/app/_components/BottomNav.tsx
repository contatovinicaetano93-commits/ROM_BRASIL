'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users } from 'lucide-react'

const TABS = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/contatos', label: 'Contatos', icon: Users },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? 'text-gold' : 'text-muted active:text-foreground'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span className="tracking-wide">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
