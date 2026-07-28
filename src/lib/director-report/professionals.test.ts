import { afterEach, describe, expect, it } from 'vitest'
import {
  listDirectorProfessionals,
  listDirectorReportProfessionals,
} from './professionals'

const ORIGINAL_PANEL = process.env.ROM_PANEL

afterEach(() => {
  process.env.ROM_PANEL = ORIGINAL_PANEL
})

describe('listDirectorProfessionals — roster por unidade', () => {
  it('ROM_PANEL=brasil retorna o roster ATIVO do Lake (salao 40613)', () => {
    process.env.ROM_PANEL = 'brasil'
    const pros = listDirectorProfessionals()
    expect(pros.length).toBeGreaterThan(300)
    expect(pros.every((p) => p.active)).toBe(true)
    expect(pros.some((p) => p.name.includes('Vitor Moreira'))).toBe(true)
    expect(pros.some((p) => p.avec_pro_id === '830330')).toBe(true)
  })

  it('ROM_PANEL=iguatemi retorna o roster ATIVO do Lake (salao 99801)', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const pros = listDirectorProfessionals()
    expect(pros.length).toBeGreaterThan(200)
    expect(pros.every((p) => p.active)).toBe(true)
    expect(pros.some((p) => p.name.includes('Beto Fortes'))).toBe(true)
  })

  it('cada painel devolve só o próprio roster (ids não se misturam)', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const iguatemiIds = new Set(listDirectorProfessionals(false).map((p) => p.id))
    process.env.ROM_PANEL = 'brasil'
    const brasilIds = new Set(listDirectorProfessionals(false).map((p) => p.id))
    const overlap = [...brasilIds].filter((id) => iguatemiIds.has(id))
    expect(overlap).toEqual([])
  })
})

describe('listDirectorReportProfessionals — só piso', () => {
  it('brasil: só cabelo/maquiagem (sem adm/baru/marketing)', () => {
    process.env.ROM_PANEL = 'brasil'
    const floor = listDirectorReportProfessionals()
    const all = listDirectorProfessionals()
    expect(floor.length).toBeGreaterThan(50)
    expect(floor.length).toBeLessThan(all.length)
    expect(floor.every((p) => p.role === 'hairstylist' || p.role === 'makeup')).toBe(true)
    expect(floor.some((p) => /almoxarifado|baru|marketing/i.test(p.name))).toBe(false)
  })
})
