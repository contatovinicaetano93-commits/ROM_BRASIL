import { describe, expect, it } from 'vitest'
import { pickLastVisit, type ClientService } from '@/lib/services'

function service(overrides: Partial<ClientService> & Pick<ClientService, 'id' | 'name'>): ClientService {
  return {
    contact_id: 'c1',
    category: 'corte',
    cadence_days: null,
    last_done_at: null,
    scheduled_at: null,
    product: null,
    notes: null,
    professional_name: null,
    last_price: null,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('pickLastVisit', () => {
  it('retorna null sem last_done_at', () => {
    expect(pickLastVisit([service({ id: '1', name: 'Corte' })])).toBeNull()
  })

  it('escolhe o serviço mais recente', () => {
    const last = pickLastVisit([
      service({
        id: '1',
        name: 'Corte',
        last_done_at: '2026-01-10T12:00:00.000Z',
        professional_name: 'Walter',
      }),
      service({
        id: '2',
        name: 'Coloração',
        last_done_at: '2026-03-15T12:00:00.000Z',
        professional_name: 'Dani Mariniello',
        last_price: 450,
      }),
    ])
    expect(last).toMatchObject({
      service_id: '2',
      service_name: 'Coloração',
      professional_name: 'Dani Mariniello',
      last_price: 450,
    })
  })
})
