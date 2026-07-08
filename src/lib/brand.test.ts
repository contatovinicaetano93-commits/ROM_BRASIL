import { afterEach, describe, expect, it } from 'vitest'
import { getBrand, getDefaultSeedPreset, parseRomPanelId, parseSeedPreset } from '@/lib/brand'

const originalRomPanel = process.env.ROM_PANEL
const originalSeedPreset = process.env.ROM_SEED_PRESET

afterEach(() => {
  if (originalRomPanel === undefined) delete process.env.ROM_PANEL
  else process.env.ROM_PANEL = originalRomPanel

  if (originalSeedPreset === undefined) delete process.env.ROM_SEED_PRESET
  else process.env.ROM_SEED_PRESET = originalSeedPreset
})

describe('brand', () => {
  it('brasil é o painel padrão', () => {
    const brand = getBrand('brasil')
    expect(brand.displayName).toBe('ROM CLUB BRASIL')
    expect(brand.productName).toBe('ROM CLUB BRASIL')
  })

  it('iguatemi tem branding próprio', () => {
    const brand = getBrand('iguatemi')
    expect(brand.displayName).toBe('ROM CLUB IGUATEMI')
    expect(brand.productName).toBe('ROM CLUB BRASIL')
    expect(brand.locationSubtitle).toBe('IGUATEMI')
  })

  it('parseia painel e seed', () => {
    expect(parseRomPanelId('iguatemi')).toBe('iguatemi')
    expect(parseRomPanelId('iguatuemi')).toBe('iguatemi')
    expect(parseRomPanelId('BRASIL')).toBe('brasil')
    expect(parseSeedPreset('iguatemi')).toBe('iguatemi')
    expect(parseSeedPreset('outro')).toBeNull()
  })

  it('usa painel ativo quando seed padrão não é definido', () => {
    process.env.ROM_PANEL = 'iguatemi'
    delete process.env.ROM_SEED_PRESET
    expect(getDefaultSeedPreset()).toBe('iguatemi')

    process.env.ROM_SEED_PRESET = 'outro'
    expect(getDefaultSeedPreset()).toBe('iguatemi')
  })
})
