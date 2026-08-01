import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

/** Texto da query (template tag) — pra contar quantas vezes cada tabela é lida. */
function queryTextOf(call: unknown[]): string {
  const strings = call[0]
  return Array.isArray(strings) ? strings.join(' ') : String(strings)
}

function countQueries(match: RegExp): number {
  return sqlMock.mock.calls.filter((c) => match.test(queryTextOf(c))).length
}

const CATALOGO = /select avec_product_id, name\s+from stock_products/
const CATEGORIA = /from stock_categories/

const alert = (name: string, categoryName: string | null = 'Coloração') => ({
  avecProductId: null,
  name,
  categoryName,
  currentQty: 1,
  minimumQty: 5,
  suggestedReposition: 4,
})

describe('applyStockAlert — custo por linha do 0046', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    // O que importa aqui é a CONTAGEM de queries, não o conteúdo.
    sqlMock.mockImplementation((strings: TemplateStringsArray) => {
      const text = Array.isArray(strings) ? strings.join(' ') : String(strings)
      if (CATALOGO.test(text)) {
        return Promise.resolve([{ avec_product_id: 'avec-1', name: 'Tinta 7.0' }])
      }
      if (CATEGORIA.test(text)) return Promise.resolve([{ id: 'cat-1' }])
      if (/from stock_alerts/.test(text)) return Promise.resolve([])
      return Promise.resolve([{ id: 'prod-1' }])
    })
  })

  it('com índice: lê o catálogo uma vez por ciclo, não por alerta', async () => {
    const { applyStockAlert, loadStockProductNameIndex, createStockDimCache } = await import(
      '@/lib/stock'
    )

    const productNameIndex = await loadStockProductNameIndex()
    const dimCache = createStockDimCache()
    for (const name of ['Tinta 7.0', 'Tinta 8.0', 'Tinta 9.0', 'Pó descolorante']) {
      await applyStockAlert(alert(name), { productNameIndex, dimCache })
    }

    expect(countQueries(CATALOGO)).toBe(1)
  })

  it('com dimCache: não reconsulta a mesma categoria a cada alerta', async () => {
    const { applyStockAlert, loadStockProductNameIndex, createStockDimCache } = await import(
      '@/lib/stock'
    )

    const productNameIndex = await loadStockProductNameIndex()
    const dimCache = createStockDimCache()
    for (const name of ['Tinta 7.0', 'Tinta 8.0', 'Tinta 9.0']) {
      await applyStockAlert(alert(name, 'Coloração'), { productNameIndex, dimCache })
    }

    expect(countQueries(CATEGORIA)).toBe(1)
  })

  it('sem opts mantém o comportamento antigo (relê por alerta)', async () => {
    const { applyStockAlert } = await import('@/lib/stock')

    await applyStockAlert(alert('Tinta 7.0'))
    await applyStockAlert(alert('Tinta 8.0'))

    expect(countQueries(CATALOGO)).toBe(2)
    expect(countQueries(CATEGORIA)).toBe(2)
  })

  it('reaproveita produto criado no próprio ciclo', async () => {
    const { applyStockAlert, loadStockProductNameIndex, createStockDimCache } = await import(
      '@/lib/stock'
    )

    const productNameIndex = await loadStockProductNameIndex()
    const dimCache = createStockDimCache()
    const first = await applyStockAlert(alert('Produto Novo'), { productNameIndex, dimCache })
    const second = await applyStockAlert(alert('produto  novo'), { productNameIndex, dimCache })

    // Mesmo nome normalizado → mesmo avec_product_id, sem reler catálogo.
    expect(first?.avecProductId).toBe(second?.avecProductId)
    expect(countQueries(CATALOGO)).toBe(1)
  })
})
