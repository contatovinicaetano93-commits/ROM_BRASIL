import { describe, expect, it } from 'vitest'
import { computeRecommendations, enrichServices } from '@/lib/recommendations'
import type { ClientService } from '@/lib/services'

function service(overrides: Partial<ClientService> & Pick<ClientService, 'name' | 'category'>): ClientService {
  return {
    id: 'svc-1',
    contact_id: 'contact-1',
    cadence_days: null,
    last_done_at: null,
    scheduled_at: null,
    product: null,
    notes: null,
    professional_name: null,
    last_price: null,
    active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('computeRecommendations', () => {
  it('sugere up-sell de tratamento quando cliente faz corte', () => {
    const enriched = enrichServices([
      service({ name: 'Corte', category: 'corte', cadence_days: 30 }),
      service({ name: 'Hidratação', category: 'tratamento', product: 'máscara' }),
    ])

    const recs = computeRecommendations(enriched)
    expect(recs.some((r) => r.type === 'upsell')).toBe(true)
  })

  it('sugere coloração quando cliente só tem corte cadastrado', () => {
    const enriched = enrichServices([service({ name: 'Corte', category: 'corte' })])
    const recs = computeRecommendations(enriched)
    expect(recs.some((r) => r.title.includes('coloração'))).toBe(true)
  })
})
