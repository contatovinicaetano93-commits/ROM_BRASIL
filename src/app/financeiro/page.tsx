import { Wrench } from 'lucide-react'

export default function FinanceiroPage() {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Sprint 4 · Fase 2</p>
      <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Financeiro</h1>
      <p className="mt-2 text-sm text-muted">
        Login e painel próprios já estão isolados do resto do Cérebro — só admin e financeiro chegam aqui.
      </p>

      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-5">
        <Wrench size={18} className="mt-0.5 shrink-0 text-muted" />
        <div>
          <p className="text-sm font-medium text-foreground/90">MVP em construção</p>
          <p className="mt-1 text-sm text-muted">
            Próximo: cadastro manual de despesas e categorias, com KPIs de margem bruta e fluxo simples,
            além de comparação de período — sem integração externa ainda (premissa do Sprint 4 no plano).
          </p>
        </div>
      </div>
    </div>
  )
}
