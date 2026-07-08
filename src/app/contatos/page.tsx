'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Phone, Search } from 'lucide-react'

interface Contact {
  id: string
  name: string | null
  phone: string | null
  channel: string
  status: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

const STATUS_STYLE: Record<string, string> = {
  novo: 'bg-gold/15 text-gold',
  em_atendimento: 'bg-blue-500/15 text-blue-300',
  agendado: 'bg-purple-500/15 text-purple-300',
  convertido: 'bg-green-500/15 text-green-300',
  perdido: 'bg-red-500/15 text-red-300',
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  avec: 'Avec',
  instagram: 'Instagram',
  manual: 'Manual',
}

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  async function load() {
    try {
      const res = await fetch('/api/contacts')
      const json = await res.json()
      if (json.error) setError(json.error)
      else setContacts(json.data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setContacts(json.data ?? [])
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const statusOptions = Array.from(new Set(contacts.map((c) => c.status)))
  const channelOptions = Array.from(new Set(contacts.map((c) => c.channel)))
  const hasFilters = statusOptions.length > 0 || channelOptions.length > 0

  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const filtered = contacts.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    if (!q) return true
    const nameMatch = c.name?.toLowerCase().includes(q) ?? false
    const phoneMatch = qDigits.length > 0 && (c.phone?.replace(/\D/g, '').includes(qDigits) ?? false)
    return nameMatch || phoneMatch
  })

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] backdrop-blur">
        <p className="mb-1 text-[0.65rem] uppercase tracking-[0.2em] text-gold">ROM Club</p>
        <h1 className="text-xl font-semibold">Contatos</h1>
        <p className="mt-0.5 text-xs text-muted">
          {loading
            ? 'Últimos 50 contatos, todos os canais'
            : `${filtered.length} de ${contacts.length} ${contacts.length === 1 ? 'contato' : 'contatos'}`}
        </p>
      </header>

      {!loading && contacts.length > 0 && (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Buscar por nome ou telefone"
              placeholder="Buscar por nome ou telefone"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-10 text-base outline-none focus:border-gold"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted active:text-foreground"
              >
                <X size={18} />
              </button>
            )}
          </div>
          {hasFilters && (
            <>
              <FilterRow
                label="Status"
                options={statusOptions.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))}
                active={statusFilter}
                onSelect={setStatusFilter}
              />
              <FilterRow
                label="Canal"
                options={channelOptions.map((c) => ({ value: c, label: CHANNEL_LABEL[c] ?? c }))}
                active={channelFilter}
                onSelect={setChannelFilter}
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 py-6">
        {error && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
            Não foi possível carregar ({error}). Confirme se o Supabase está configurado.
          </div>
        )}

        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[4.5rem] animate-pulse rounded-xl border border-border bg-card" />
          ))}

        {!loading && contacts.length === 0 && !error && (
          <p className="py-12 text-center text-sm text-muted">Nenhum contato ainda. Toque em + para adicionar.</p>
        )}

        {!loading && contacts.length > 0 && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted">Nenhum contato encontrado.</p>
        )}

        {!loading &&
          filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name || c.phone || 'Sem nome'}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <span>{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                  {c.phone && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} />
                        {c.phone}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${
                  STATUS_STYLE[c.status] ?? 'bg-border text-muted'
                }`}
              >
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>
          ))}
      </div>

      <button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Novo contato"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1.25rem,calc(50%-13.75rem))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-background shadow-lg shadow-black/40 active:scale-95 transition-transform"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {formOpen && <NewContactSheet onClose={() => setFormOpen(false)} onCreated={load} />}
    </main>
  )
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: { value: string; label: string }[]
  active: string
  onSelect: (value: string) => void
}) {
  const chips = [{ value: 'all', label: 'Todos' }, ...options]
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[0.6rem] uppercase tracking-wide text-muted">{label}</span>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {chips.map((chip) => {
          const isActive = active === chip.value
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onSelect(chip.value)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-border bg-card text-muted active:text-foreground'
              }`}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NewContactSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, notes: notes || undefined }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setFormError(json.error ?? 'Erro ao salvar')
        return
      }
      onCreated()
      onClose()
    } catch (err) {
      setFormError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-border bg-card p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Novo contato</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="Nome do cliente"
            />
          </Field>
          <Field label="Telefone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              inputMode="tel"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="(11) 90000-0000"
            />
          </Field>
          <Field label="Observações (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="Ex.: quer agendar coloração"
            />
          </Field>

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full rounded-xl bg-gold py-3.5 text-base font-semibold text-background active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Salvar contato'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}
