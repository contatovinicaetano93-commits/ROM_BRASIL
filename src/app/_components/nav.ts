import { LayoutDashboard, Users } from 'lucide-react'

export const APP_NAV = [
  { href: '/dashboard', label: 'Visão geral', shortLabel: 'Painel', icon: LayoutDashboard },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users },
] as const

export function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith('/contatos/')) return 'Perfil do cliente'
  if (pathname.startsWith('/contatos')) return 'Contatos'
  return 'Visão geral'
}
