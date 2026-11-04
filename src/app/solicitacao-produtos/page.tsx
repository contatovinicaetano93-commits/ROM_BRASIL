'use client'

import { useCallback, useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import {
  WITHDRAWAL_STATUS_LABEL,
  type WithdrawalStatus,
} from '@/lib/stock-withdrawal'

type LocationOpt = { id: string; name: string; rom_code: string }
type ProductOpt = { id: string; name: string; sku: string | null }
type RequestRow = {
  id: string
  product_name: string
  location_name: string
  quantity: number
  unit_label: string | null
  status: WithdrawalStatus
  requested_at: string
  note: string | null
}

async function readOk<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error ?? 'Falha na requisição')
  return json.data as T
}

export default function SolicitacaoProdutosPage() {
  const [locations, setLocations] = useState<LocationOpt[]>([])
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [mine, setMine] = useState<RequestRow[]>([])
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [qty, setQty] = useState('1')
  const [unitLabel, setUnitLabel] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const opts = await readOk<{ locations: LocationOpt[]; products: ProductOpt[] }>(
        await apiFetch('/api/solicitacao-produtos/opcoes', {
          cache: 'no-store',
          clientCache: false,
        }),
      )
      setLocations(opts.locations)
      setProducts(opts.products)
      setLocationId((prev) => prev || opts.locations[0]?.id || '')
      const list = await readOk<{ requests: RequestRow[] }>(
        await apiFetch('/api/solicitacao-produtos?mine=1', {
          cache: 'no-store',
          clientCache: false,
        }),
      )
      setMine(list.requests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !locationId) return
    setBusy(true)
    setError(null)
    try {
      await readOk(
        await apiFetch('/api/solicitacao-produtos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            locationId,
            quantity: Number(qty),
            unitLabel: unitLabel.trim() || null,
            note: note.trim() || null,
          }),
        }),
      )
      setQty('1')
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <IntranetPage
      kicker="Estoque"
      title="Solicitação de produtos"
      subtitle="Peça o produto no piso onde você retira. A baixa no Avec é feita depois pelo time do ponto — aqui só a retirada física."
    >
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <SectionCard title="Novo pedido">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-muted">Produto</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` · ${p.sku}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">Ponto de retirada</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">Quantidade</span>
            <input
              type="number"
              min="0.001"
              step="any"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">Unidade (opcional)</span>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="un, ml, g…"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-muted">Observação</span>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <div className="sm:col-span-2">
            <PanelButton type="submit" disabled={busy || products.length === 0}>
              {busy ? 'Enviando…' : 'Solicitar'}
            </PanelButton>
          </div>
        </form>
        {products.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Nenhum produto no catálogo ROM ainda — sync Avec / estoque precisa ter rodado.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Meus pedidos" badge={<span className="text-xs text-muted">{mine.length}</span>}>
        <ul className="divide-y divide-border">
          {mine.length === 0 && (
            <li className="py-3 text-sm text-muted">Nenhum pedido ainda.</li>
          )}
          {mine.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium">{row.product_name}</p>
                <p className="text-xs text-muted">
                  {row.quantity}
                  {row.unit_label ? ` ${row.unit_label}` : ''} · {row.location_name}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs uppercase tracking-wide text-gold-strong">
                {WITHDRAWAL_STATUS_LABEL[row.status]}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </IntranetPage>
  )
}
