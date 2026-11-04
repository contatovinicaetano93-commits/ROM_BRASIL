'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { isPendingAvecBail, type WithdrawalStatus } from '@/lib/stock-withdrawal'

type RequestRow = {
  id: string
  product_name: string
  location_name: string
  quantity: number
  unit_label: string | null
  status: WithdrawalStatus
  requested_by_name: string
  withdrawn_at: string | null
  avec_bailed_at: string | null
  avec_ref: string | null
}

async function readOk<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error ?? 'Falha na requisição')
  return json.data as T
}

export default function ConferenciaRetiradasPage() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await readOk<{ requests: RequestRow[] }>(
        await apiFetch('/api/estoque/solicitacoes?pendingAvec=1', {
          cache: 'no-store',
          clientCache: false,
        }),
      )
      setRows(data.requests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function markBaixado(row: RequestRow) {
    setBusyId(row.id)
    setError(null)
    try {
      const avecRef = window.prompt('Referência Avec (opcional)') ?? null
      await readOk(
        await apiFetch(`/api/estoque/solicitacoes/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'baixado_avec', avecRef }),
        }),
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar baixa')
    } finally {
      setBusyId(null)
    }
  }

  const stale = rows.filter((r) => isPendingAvecBail(r.status, r.withdrawn_at, 24))

  return (
    <IntranetPage
      kicker="Estoque"
      title="Conferência ROM × Avec"
      subtitle="Retirado no ROM e ainda sem baixa no Avec. Duas bases — não misture."
    >
      <p className="text-sm text-muted">
        <Link href="/estoque/fila-ponto" className="text-gold-strong hover:underline">
          ← Fila do ponto
        </Link>
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <SectionCard
        title="Aguardando baixa Avec"
        badge={<span className="text-xs text-muted">{rows.length}</span>}
      >
        {stale.length > 0 ? (
          <p className="mb-3 text-xs text-danger">
            {stale.length} pedido(s) com mais de 24h sem baixa Avec.
          </p>
        ) : null}
        <ul className="divide-y divide-border">
          {rows.length === 0 && (
            <li className="py-3 text-sm text-muted">Nada pendente — conferência em dia.</li>
          )}
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{row.product_name}</p>
                <p className="text-xs text-muted">
                  {row.quantity}
                  {row.unit_label ? ` ${row.unit_label}` : ''} · {row.location_name} ·{' '}
                  {row.requested_by_name}
                  {row.withdrawn_at
                    ? ` · retirado ${new Date(row.withdrawn_at).toLocaleString('pt-BR')}`
                    : ''}
                  {isPendingAvecBail(row.status, row.withdrawn_at, 24) ? (
                    <span className="text-danger"> · &gt;24h</span>
                  ) : null}
                </p>
              </div>
              <PanelButton
                type="button"
                disabled={busyId === row.id}
                onClick={() => void markBaixado(row)}
                className="px-3 py-1.5 text-xs"
              >
                {busyId === row.id ? '…' : 'Marcar baixado Avec'}
              </PanelButton>
            </li>
          ))}
        </ul>
      </SectionCard>
    </IntranetPage>
  )
}
