import { LogoutButton } from '../_components/LogoutButton'
import { getBrand } from '@/lib/brand'

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const brand = getBrand()

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4 lg:px-8">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold tracking-[0.2em] text-gold">
            {brand.shortMonogram}
          </span>
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">Financeiro</span>
        </div>
        <LogoutButton compact />
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  )
}
