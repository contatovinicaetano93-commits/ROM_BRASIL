import { describe, expect, it } from 'vitest'
import { mergeContactStatus } from '@/lib/contacts'

describe('mergeContactStatus', () => {
  it('não rebaixa convertido para agendado (sync de agendamentos Avec)', () => {
    expect(mergeContactStatus('convertido', 'agendado')).toBe('convertido')
  })

  it('promove novo para agendado', () => {
    expect(mergeContactStatus('novo', 'agendado')).toBe('agendado')
  })

  it('promove agendado para convertido', () => {
    expect(mergeContactStatus('agendado', 'convertido')).toBe('convertido')
  })

  it('mantém perdido salvo retorno com atendimento (convertido)', () => {
    expect(mergeContactStatus('perdido', 'agendado')).toBe('perdido')
    expect(mergeContactStatus('perdido', 'convertido')).toBe('convertido')
  })

  it('marca perdido quando explícito', () => {
    expect(mergeContactStatus('convertido', 'perdido')).toBe('perdido')
  })
})
