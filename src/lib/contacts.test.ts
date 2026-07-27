import { describe, expect, it } from 'vitest'
import {
  isAvecImportSource,
  mergeContactStatus,
  resolveConflictStatus,
} from '@/lib/contacts'

describe('mergeContactStatus', () => {
  it('não rebaixa convertido para agendado (sync de agendamentos Avec)', () => {
    expect(mergeContactStatus('convertido', 'agendado')).toBe('convertido')
  })

  it('promove novo para agendado', () => {
    expect(mergeContactStatus('novo', 'agendado')).toBe('agendado')
  })

  it('promove importado para agendado / convertido', () => {
    expect(mergeContactStatus('importado', 'agendado')).toBe('agendado')
    expect(mergeContactStatus('importado', 'convertido')).toBe('convertido')
  })

  it('não troca importado ↔ novo (entradas paralelas)', () => {
    expect(mergeContactStatus('importado', 'novo')).toBe('importado')
    expect(mergeContactStatus('novo', 'importado')).toBe('novo')
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

describe('resolveConflictStatus (upsert ON CONFLICT)', () => {
  it('default novo não rebaixa importado', () => {
    expect(resolveConflictStatus('importado', 'novo')).toBe('importado')
  })

  it('dump importado não rebaixa lead novo / convertido', () => {
    expect(resolveConflictStatus('novo', 'importado')).toBe('novo')
    expect(resolveConflictStatus('convertido', 'importado')).toBe('convertido')
    expect(resolveConflictStatus('agendado', 'importado')).toBe('agendado')
  })

  it('importado avança para agendado e convertido', () => {
    expect(resolveConflictStatus('importado', 'agendado')).toBe('agendado')
    expect(resolveConflictStatus('importado', 'convertido')).toBe('convertido')
  })

  it('agendado só sobe para convertido', () => {
    expect(resolveConflictStatus('agendado', 'novo')).toBe('agendado')
    expect(resolveConflictStatus('agendado', 'convertido')).toBe('convertido')
  })
})

describe('isAvecImportSource', () => {
  it('reconhece dump 0004, returning e lake', () => {
    expect(isAvecImportSource('avec_sync_clients')).toBe(true)
    expect(isAvecImportSource('avec_sync_returning_0002')).toBe(true)
    expect(isAvecImportSource('avec_backfill_0004')).toBe(true)
    expect(isAvecImportSource('avec_lake_clients')).toBe(true)
  })

  it('não marca agenda / WhatsApp / atendimento como dump', () => {
    expect(isAvecImportSource('avec_sync_appointments')).toBe(false)
    expect(isAvecImportSource('avec_sync_attended')).toBe(false)
    expect(isAvecImportSource('whatsapp')).toBe(false)
    expect(isAvecImportSource(null)).toBe(false)
  })
})
