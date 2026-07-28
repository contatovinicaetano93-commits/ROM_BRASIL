import { describe, expect, it } from 'vitest'
import {
  mergeContactStatus,
  isUniqueViolation,
  resolveUpsertPhone,
} from '@/lib/contacts'

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

describe('resolveUpsertPhone', () => {
  it('normaliza BR para E.164 e rejeita curto', () => {
    expect(resolveUpsertPhone('(11) 97028-4991')).toBe('+5511970284991')
    expect(resolveUpsertPhone('123')).toBeNull()
    expect(resolveUpsertPhone(null)).toBeNull()
  })

  it('não devolve telefone cru quando normalize falha', () => {
    expect(resolveUpsertPhone('abc-def')).toBeNull()
  })
})

describe('isUniqueViolation', () => {
  it('detecta código 23505 e mensagem contacts_phone_idx', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(
      isUniqueViolation(
        new Error('duplicate key value violates unique constraint "contacts_phone_idx"'),
      ),
    ).toBe(true)
    expect(isUniqueViolation(new Error('timeout'))).toBe(false)
  })
})
