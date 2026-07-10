import { describe, expect, it } from 'vitest'
import { buildClientWhatsAppMessage } from '@/lib/whatsapp/client-message'

describe('buildClientWhatsAppMessage', () => {
  it('não usa linguagem de briefing interno', () => {
    const text = buildClientWhatsAppMessage({
      contact: {
        name: 'Carlos Mendes',
        preferred_hairstylist: 'Walter',
      },
      services: [
        {
          name: 'Corte masculino',
          category: 'corte',
          last_done_at: new Date(Date.now() - 80 * 86_400_000).toISOString(),
          scheduled_at: null,
          professional_name: 'Walter',
        },
      ],
      recommendations: [
        { type: 'overdue', title: 'Corte masculino atrasado', detail: 'Previsto há 10 dias' },
      ],
    })

    expect(text).toMatch(/Carlos/)
    expect(text).toMatch(/Corte masculino|corte/i)
    expect(text).not.toMatch(/Briefing|Cross-sell|sem histórico/i)
    expect(text).toMatch(/Walter|remarcar|horário/i)
  })

  it('funciona com dados mínimos da lista 0011', () => {
    const text = buildClientWhatsAppMessage({
      contact: { name: 'Marina Bello' },
      lastVisitDate: '2026-01-16',
      professionalHint: 'Dani Mariniello',
      daysSinceVisit: 100,
    })
    expect(text).toMatch(/Marina/)
    expect(text).toMatch(/Dani Mariniello/)
    expect(text).not.toMatch(/Briefing/)
  })
})
