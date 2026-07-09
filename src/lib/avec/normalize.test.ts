import { describe, expect, it } from 'vitest'
import {
  isNailService,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  normalizePhone,
  parseOptionalMoney,
} from '@/lib/avec/normalize'

describe('normalizePhone', () => {
  it('normaliza celular BR com DDD', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('+5511999998888')
  })

  it('mantém número já com código do país', () => {
    expect(normalizePhone('+5511988887777')).toBe('+5511988887777')
  })

  it('retorna null para número curto', () => {
    expect(normalizePhone('12345')).toBeNull()
  })
})

describe('parseOptionalMoney', () => {
  it('parseia valor BR', () => {
    expect(parseOptionalMoney('R$ 450,00')).toBe(450)
  })

  it('retorna null quando ausente', () => {
    expect(parseOptionalMoney(null)).toBeNull()
    expect(parseOptionalMoney('')).toBeNull()
  })
})

describe('normalizeAppointmentRow price/professional', () => {
  it('extrai profissional e preço', () => {
    const row = normalizeAppointmentRow({
      cliente_id: '1',
      nome_cliente: 'Ana',
      servico: 'Corte',
      data: '10/03/2026',
      hora: '14:00',
      profissional: 'Dani',
      valor: '120,00',
    })
    expect(row?.professional).toBe('Dani')
    expect(row?.price).toBe(120)
  })
})

describe('normalizeAttendanceRow price', () => {
  it('extrai preço quando presente', () => {
    const row = normalizeAttendanceRow({
      cliente_id: '1',
      nome_cliente: 'Ana',
      servico: 'Coloração',
      data: '10/03/2026',
      valor: '450,00',
      profissional: 'Walter',
    })
    expect(row?.price).toBe(450)
    expect(row?.professional).toBe('Walter')
  })
})

describe('isNailService', () => {
  it('reconhece manicure e pedicure', () => {
    expect(isNailService('Manicure completa')).toBe(true)
    expect(isNailService('Pedicure spa')).toBe(true)
    expect(isNailService('Blindagem de unhas')).toBe(true)
    expect(isNailService('Corte feminino')).toBe(false)
  })
})
