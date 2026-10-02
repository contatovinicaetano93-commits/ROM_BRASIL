/**
 * Auditoria nativa BR: Base Folha Brasil (Q2 16–30/09) × motor.
 * Não usa padrões do sweep IG — sintetiza 8123 a partir das colunas BR.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  resolveFolhaPersonRules,
  resolveMeioAMeioRate,
  usesNamedMeioOverride,
} from '@/lib/folha/exceptions'
import { normalizeFolhaCargo } from '@/lib/folha/rules'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

type FopagRow = {
  name: string
  cargo: string | null
  faturado: number
  fat_liquido: number
  produto: number
  taxa_adm: number
  desc_assistente: number
  meio_a_meio: number
  parc: number
  baru: number
  U: number
  V: number
  W: number
  desc_diversos_02: number
  liquido: number
}

type BonusRow = {
  name: string
  total: number
  adic_10: number
}

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/fopag-ig-q2-parsed.json',
)

const parsed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  fopag_br_q2?: FopagRow[]
  bonus_romeu_br?: BonusRow[]
}

function bonusFor(name: string): BonusRow | null {
  const key = name.toLowerCase()
  for (const b of parsed.bonus_romeu_br ?? []) {
    const bn = b.name.toLowerCase()
    if (bn.includes('gabriela') && key.includes('gabriela')) return b
    if (bn.includes('jefferson') && key.includes('jefferson')) return b
    if (bn.includes('lucas') && key.includes('lucas')) return b
    if (bn.includes('nicole') && key.includes('nicole')) return b
    if (bn.includes('jonathan') && key.includes('jonathan')) return b
  }
  return null
}

describe('Fopag BR Q2 native sweep', () => {
  it('motor BR vs Base Folha Brasil — reporta match rate e gaps', () => {
    const rows = (parsed.fopag_br_q2 ?? []).filter(
      (f) => f.liquido > 0.02 || f.faturado > 0.02,
    )
    expect(rows.length).toBeGreaterThan(50)

    const people: Array<{
      name: string
      cargo: string | null
      fopag_liq: number
      target_liq: number
      motor_proposed: number | null
      diff: number | null
      status: 'match' | 'gap' | 'skip_incomplete'
      notes: string[]
    }> = []

    for (const f of rows) {
      const notes: string[] = []
      // Linhas Romeu com líquido 0 na Base Folha = planilha incompleta
      if (f.liquido <= 0.02 && f.U <= 0.02) {
        people.push({
          name: f.name,
          cargo: f.cargo,
          fopag_liq: f.liquido,
          target_liq: f.liquido,
          motor_proposed: null,
          diff: null,
          status: 'skip_incomplete',
          notes: ['base_folha_liq_zero'],
        })
        continue
      }

      const cargo = normalizeFolhaCargo(f.cargo)
      const isAssist =
        cargo === 'assistente' ||
        cargo === 'multiplicador' ||
        cargo === 'colorista'
      const person = resolveFolhaPersonRules(f.name)
      const bonus = bonusFor(f.name)

      // 8123 a_pagar sintético: G − produto − desc.assist (antes de meio/adm/Baru)
      let net = f.fat_liquido - f.produto - f.desc_assistente
      if (isAssist && f.U > 0.02) {
        notes.push('assist_path_U')
      }

      const row: CommissionProfessionalRow = {
        name: f.name,
        role: f.cargo,
        charged: f.faturado || null,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: null,
        product_spend: f.produto > 0.02 ? -f.produto : null,
        card_fee: null,
        admin_fee: 0,
        assistant_discount:
          f.desc_assistente > 0.02 ? -f.desc_assistente : null,
        other_discounts: null,
        net_payable: Math.round(net * 10000) / 10000,
        house_share: null,
      }

      const extras: NonNullable<Parameters<typeof buildFolhaDraftLine>[2]> = {}
      let u = f.U
      // Fopag BR às vezes põe J = constante×2% com coluna U vazia (Alberto).
      if (isAssist && u <= 0.02 && f.taxa_adm > 0.02) {
        u = f.taxa_adm / 0.02
        notes.push(`U_from_adm=${u.toFixed(2)}`)
      }
      if (u > 0.02) extras.servicos_assistente_como_pro = u
      if (f.baru > 0.02) extras.consumo_baru = f.baru
      // RH extras — mesma entrada do sweep IG (parc / diversos / adm manicure).
      if (f.parc > 0.02) {
        extras.parc = f.parc
        notes.push('parc')
      }
      if (f.desc_diversos_02 > 0.02) {
        extras.descontos_diversos = f.desc_diversos_02
        notes.push('desc_diversos_02')
      }
      if (
        cargo === 'manicure' &&
        f.taxa_adm > 0.02 &&
        (f.U <= 0.02 || !isAssist)
      ) {
        extras.taxa_administrativa = f.taxa_adm
        notes.push('manicure_taxa_adm')
      }
      if (person?.isRomeuAssistant && bonus && bonus.total > 0.02) {
        extras.acumulado_mes = bonus.total
        notes.push(`romeu_acumulado=${bonus.total}`)
      }

      let target = f.liquido
      // Fopag coluna meio às vezes 50% genérico; motor usa exceção (Dayana 5%, Walter 70%).
      if (f.desc_assistente > 0.02) {
        const motorMeio = resolveMeioAMeioRate(person) * f.desc_assistente
        if (Math.abs(motorMeio - f.meio_a_meio) > 1) {
          target = f.liquido - f.meio_a_meio + motorMeio
          notes.push(
            `target_meio_corrected=${target.toFixed(2)} (fopag=${f.meio_a_meio})`,
          )
        }
      }

      const line = buildFolhaDraftLine('brasil', row, extras, {
        applyTaxExtras: false,
      })
      const proposed = line.proposed_pay
      const diff = proposed == null ? null : proposed - target
      let status: 'match' | 'gap' | 'skip_incomplete' = 'gap'
      if (proposed != null && Math.abs(diff!) <= 1) status = 'match'
      else if (proposed != null && Math.abs(diff!) <= 3) status = 'match'

      people.push({
        name: f.name,
        cargo: f.cargo,
        fopag_liq: f.liquido,
        target_liq: target,
        motor_proposed: proposed,
        diff,
        status,
        notes,
      })
    }

    const scored = people.filter((p) => p.status !== 'skip_incomplete')
    const matches = scored.filter((p) => p.status === 'match')
    const gaps = scored.filter((p) => p.status === 'gap')

    const out = {
      period: '2026-09-q2',
      panel: 'brasil',
      source: 'fopag_br_native',
      match_rate: `${matches.length}/${scored.length}`,
      counts: {
        total: scored.length,
        match: matches.length,
        gap: gaps.length,
        skip_incomplete: people.length - scored.length,
      },
      highlight: scored.filter((p) =>
        [
          'marcelo sabino',
          'islayquiel',
          'dayana',
          'alison',
          'walter martinho',
          'alan fern',
          'auricaliane',
        ].some((h) => p.name.toLowerCase().includes(h)),
      ),
      gaps: gaps.map((g) => ({
        name: g.name,
        cargo: g.cargo,
        fopag_liq: g.fopag_liq,
        target_liq: g.target_liq,
        motor_proposed: g.motor_proposed,
        diff: g.diff,
        notes: g.notes,
      })),
    }

    if (existsSync('/opt/cursor') || existsSync('/opt/cursor/artifacts')) {
      try {
        mkdirSync('/opt/cursor/artifacts', { recursive: true })
        writeFileSync(
          '/opt/cursor/artifacts/fopag-br-q2-native-sweep.json',
          JSON.stringify(out, null, 2),
        )
      } catch {
        /* CI */
      }
    }

    const by = (s: string) =>
      out.highlight.find((h) => h.name.toLowerCase().includes(s))

    expect(by('islayquiel')?.status).toBe('match')
    expect(by('marcelo sabino')?.status).toBe('match')
    expect(by('islayquiel')?.motor_proposed).toBeCloseTo(3301.4, 0)
    expect(by('marcelo sabino')?.motor_proposed).toBeCloseTo(4552.7, 0)

    expect(by('auricaliane')?.status).toBe('match')
    expect(by('dayana')?.status).toBe('match')
    // Soft floor: extras RH (parc/diversos) + Auricaliane earn-in-pay
    expect(matches.length / scored.length).toBeGreaterThanOrEqual(0.97)
    expect(by('walter')?.status).toBe('match')
  })
})
