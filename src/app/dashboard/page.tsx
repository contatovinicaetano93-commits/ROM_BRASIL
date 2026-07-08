'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Users, TrendingUp, MessageCircle } from 'lucide-react'

interface KpiData {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: { conversion_rate: number; total_contacts: number } | null
}

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  avec: 'Avec',
  instagram: 'Instagram',
  manual: 'Manual',
}

function aggregateByDay(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = row.day.slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + row.contacts_count)
  }
  return Array.from(map.entries())
    .map(([day, total]) => ({ day: day.slice(5), total }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

function aggregateByChannel(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.channel, (map.get(row.channel) ?? 0) + row.contacts_count)
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

export default function DashboardPage() {
  const [data, setData] = useState<KpiData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kpis')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setData(json.data)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const totalContacts = data?.conversion?.total_contacts ?? 0
  const conversionRate = data?.conversion?.conversion_rate ?? 0
  const chartData = data ? aggregateByDay(data.byDay) : []
  const channelData = data ? aggregateByChannel(data.byDay) : []

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] backdrop-blur">
        <p className="mb-1 text-[0.65rem] uppercase tracking-[0.2em] text-gold">ROM Club</p>
        <h1 className="text-xl font-semibold">Painel de Contatos</h1>
        <p className="mt-0.5 text-xs text-muted">Todos os canais, em tempo real</p>
      </header>

      <div className="flex flex-col gap-8 px-5 py-6">
        {error && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
            Não foi possível carregar os dados ({error}). Confirme se o Supabase está configurado.
          </div>
        )}

        <section className="grid grid-cols-2 gap-3">
          <KpiCard icon={<Users size={16} />} label="Contatos" value={totalContacts.toString()} loading={loading} />
          <KpiCard
            icon={<TrendingUp size={16} />}
            label="Conversão"
            value={`${(conversionRate * 100).toFixed(1)}%`}
            loading={loading}
          />
          <KpiCard
            className="col-span-2"
            icon={<MessageCircle size={16} />}
            label="Canais ativos"
            value={new Set(data?.byDay.map((d) => d.channel)).size.toString()}
            loading={loading}
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs uppercase tracking-wide text-muted">Contatos por dia</h2>
          <div className="h-52 rounded-xl border border-border bg-card p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--foreground)',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <ListSection
          title="Status dos contatos"
          rows={(data?.byStatus ?? []).map((r) => ({ label: STATUS_LABEL[r.status] ?? r.status, value: r.contacts_count }))}
          empty={!!data && data.byStatus.length === 0}
        />

        <ListSection
          title="Contatos por canal"
          rows={channelData.map(([channel, count]) => ({ label: CHANNEL_LABEL[channel] ?? channel, value: count }))}
          empty={channelData.length === 0}
        />
      </div>
    </main>
  )
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  className = '',
}: {
  icon: React.ReactNode
  label: string
  value: string
  loading?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[0.65rem] uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-border" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      )}
    </div>
  )
}

function ListSection({
  title,
  rows,
  empty,
}: {
  title: string
  rows: { label: string; value: number }[]
  empty: boolean
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wide text-muted">{title}</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between px-4 py-3.5 text-sm">
            <span>{row.label}</span>
            <span className="font-medium tabular-nums text-gold">{row.value}</span>
          </div>
        ))}
        {empty && <p className="px-4 py-6 text-center text-sm text-muted">Nenhum contato registrado ainda.</p>}
      </div>
    </section>
  )
}
