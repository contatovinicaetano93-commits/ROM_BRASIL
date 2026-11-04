'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../../_components/ui'
import { apiFetch } from '@/lib/api-client'
import {
  WITHDRAWAL_STATUS_LABEL,
  type WithdrawalStatus,
} from '@/lib/stock-withdrawal'

type RequestRow = {
  id: string
  product_name: string
  location_name: string
  location_rom_code: string | null
  quantity: number
  unit_label: string | null
  status: WithdrawalStatus
  requested_by_name: string
  professional_name: string | null
  note: string | null
  requested_at: string
  withdrawn_at: string | null
}

const NEXT_ACTION: Partial<Record<WithdrawalStatus, { status: WithdrawalStatus; label: string }>> = {
  solicitado: { status: 'em_separacao', label: 'Separar' },
  em_separacao: { status: 'pronto', label: 'Pronto' },
  pronto: { status: 'retirado', label: 'Confirmar retirada' },
  retirado: { status: 'baixado_avec', label: 'Marcar baixado Avec' },
}

async function readOk<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error ?? 'Falha na requisição')
  return json.data as T
}

export default function EstoqueFilaPontoPage() {
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [scope, setScope] = useState<string>('todos')
  const [stockPointCode, setStockPointCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'abertos' | 'retirado' | 'todos'>('abertos')

  const load = useCallback(async () => {
    setError(null)
    try {
      const q =
        filter === 'retirado'
          ? '?pendingAvec=1'
          : filter === 'abertos'
            ? ''
            : ''
      const data = await readOk<{
        requests: RequestRow[]
        scope: string
        stockPointCode: string | null
      }>(
        await apiFetch(`/api/estoque/solicitacoes${q}`, {
          cache: 'no-store',
          clientCache: false,
        }),
      )
      setRequests(data.requests)
      setScope(data.scope)
      setStockPointCode(data.stockPointCode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar fila')
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    if (filter === 'todos') return requests
    if (filter === 'retirado') return requests.filter((r) => r.status === 'retirado')
    return requests.filter(
      (r) =>
        r.status === 'solicitado' ||
        r.status === 'em_separacao' ||
        r.status === 'pronto' ||
        r.status === 'retirado',
    )
  }, [filter, requests])

  async function advance(row: RequestRow, toStatus: WithdrawalStatus) {
    setBusyId(row.id)
    setError(null)
    try {
      let avecRef: string | null = null
      if (toStatus === 'baixado_avec') {
        avecRef = window.prompt('Referência Avec (opcional)') ?? null
      }
      await readOk(
        await apiFetch(`/api/estoque/solicitacoes/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: toStatus, avecRef }),
        }),
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar')
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(row: RequestRow) {
    if (!confirm(`Cancelar pedido de ${row.product_name}?`)) return
    await advance(row, 'cancelado')
  }

  const pointLabel = stockPointCode
    ? stockPointCode.replace('piso_', 'Piso ').replace('almox', 'Almox')
    : 'Todos os pontos'

  return (
    <IntranetPage
      kicker="Estoque"
      title="Fila do ponto"
      subtitle={`${pointLabel} · ${scope}. Confirme a retirada no ROM; a baixa no Avec é um passo separado.`}
    >
      <p className="text-sm text-muted">
        <Link href="/estoque" className="text-gold-strong hover:underline">
          ← Estoque
        </Link>
        {' · '}
        <Link href="/estoque/pontos" className="text-gold-strong hover:underline">
          Distribuição Almox → pisos
        </Link>
        {' · '}
        <Link href="/estoque/conferencia-retiradas" className="text-gold-strong hover:underline">
          Conferência ROM × Avec
        </Link>
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['abertos', 'Abertos'],
            ['retirado', 'Aguardando Avec'],
            ['todos', 'Todos'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? 'rounded-xl border border-foreground bg-foreground px-3 py-1.5 text-sm text-background'
                : 'rounded-xl border border-border bg-background px-3 py-1.5 text-sm'
            }
          >
            {label}
          </button>
        ))}
        <PanelButton type="button" variant="outline" onClick={() => void load()}>
          Atualizar
        </PanelButton>
      </div>

      <SectionCard title="Pedidos" badge={<span className="text-xs text-muted">{visible.length}</span>}>
        <ul className="divide-y divide-border">
          {visible.length === 0 && (
            <li className="py-3 text-sm text-muted">Nada nesta fila.</li>
          )}
          {visible.map((row) => {
            const next = NEXT_ACTION[row.status]
            return (
              <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{row.product_name}</p>
                  <p className="text-xs text-muted">
                    {row.quantity}
                    {row.unit_label ? ` ${row.unit_label}` : ''} · {row.location_name}
                    {' · '}
                    {row.professional_name || row.requested_by_name}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-gold-strong">
                    {WITHDRAWAL_STATUS_LABEL[row.status]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {next ? (
                    <PanelButton
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void advance(row, next.status)}
                      className="px-3 py-1.5 text-xs"
                    >
                      {busyId === row.id ? '…' : next.label}
                    </PanelButton>
                  ) : null}
                  {row.status === 'solicitado' ||
                  row.status === 'em_separacao' ||
                  row.status === 'pronto' ? (
                    <PanelButton
                      type="button"
                      variant="outline"
                      disabled={busyId === row.id}
                      onClick={() => void cancel(row)}
                      className="px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </PanelButton>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </SectionCard>
    </IntranetPage>
  )
}
