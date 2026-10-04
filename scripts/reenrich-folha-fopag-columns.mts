/**
 * Reenrich Folha Q2 a partir da Fopag da própria unidade + rehydrate colunas
 * (Tx adm / Meio / Outros / Fat. referência) sem reabater Baru embutido.
 *
 * - PANEL=iguatemi (default): overlay U/Baru/líquido da `fopag_ig_q2`
 * - PANEL=brasil: overlay U/Baru/`faturado_referencia`/líquido da `fopag_br_q2`
 *   (não lê a Fopag IG — unidades independentes)
 *
 * Run (IG):
 *   node --import ./scripts/mock-server-only.cjs --import tsx scripts/reenrich-folha-fopag-columns.mts
 * Run (BR):
 *   DATABASE_URL=$DATABASE_URL_BR PANEL=brasil node --import ./scripts/mock-server-only.cjs --import tsx scripts/reenrich-folha-fopag-columns.mts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import {
  firstAndLastTokenKey,
  occupancyMergeKey,
} from '../src/lib/director-report/match-pro'
import { rehydrateFolhaDraftFromPeriod } from '../src/lib/folha/workflow'
import type { FolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import type { RomPanelId } from '../src/lib/brand'

type FopagRow = {
  name: string
  cargo?: string | null
  faturado?: number
  U: number
  V?: number
  W?: number
  taxa_adm?: number
  baru: number
  liquido: number
  fat_liquido?: number
  produto?: number
  parc?: number
  desc_diversos_02?: number
}

type BonusRow = {
  name: string
  total: number
}

function lookupByNameKey<T>(
  map: Map<string, T>,
  name: string,
): T | null {
  const key = occupancyMergeKey(name)
  if (key && map.has(key)) return map.get(key) ?? null
  const fl = firstAndLastTokenKey(key ?? '')
  const hits: T[] = []
  for (const [k, v] of map) {
    if (fl && firstAndLastTokenKey(k) === fl) hits.push(v)
    else if (
      key &&
      (key === k ||
        key.startsWith(k + ' ') ||
        k.startsWith(key + ' '))
    ) {
      hits.push(v)
    }
  }
  const uniq = [...new Set(hits)]
  return uniq.length === 1 ? uniq[0]! : null
}

function isAssistLike(
  cargo: string | null | undefined,
  lineCargo: string | null | undefined,
): boolean {
  const c = String(cargo ?? lineCargo ?? '').toLowerCase()
  return /assist|multi|color/i.test(c)
}

async function main() {
  const panel = (process.env.PANEL?.trim() || 'iguatemi') as RomPanelId
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q2'
  const dry = process.env.DRY_RUN === '1'
  const dbUrl =
    panel === 'brasil'
      ? process.env.DATABASE_URL_BR || process.env.DATABASE_URL
      : process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL missing')

  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'src/lib/folha/fixtures/fopag-ig-q2-parsed.json'),
      'utf8',
    ),
  ) as {
    fopag_ig_q2?: FopagRow[]
    bonus_romeu_ig?: BonusRow[]
    fopag_br_q2?: FopagRow[]
    bonus_romeu_br?: BonusRow[]
  }

  const fopagByKey = new Map<string, FopagRow>()
  const bonusByKey = new Map<string, BonusRow>()
  if (panel === 'iguatemi') {
    for (const r of fixture.fopag_ig_q2 ?? []) {
      const k = occupancyMergeKey(r.name)
      if (k) fopagByKey.set(k, r)
    }
    for (const b of fixture.bonus_romeu_ig ?? []) {
      const k = occupancyMergeKey(b.name)
      if (k) bonusByKey.set(k, b)
    }
  } else if (panel === 'brasil') {
    for (const r of fixture.fopag_br_q2 ?? []) {
      const k = occupancyMergeKey(r.name)
      if (k) fopagByKey.set(k, r)
    }
    for (const b of fixture.bonus_romeu_br ?? []) {
      const k = occupancyMergeKey(b.name)
      if (k) bonusByKey.set(k, b)
    }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const rows = await sql`
      select id, half, to_day::text as to_day, reference_day::text as reference_day,
             lines, source_professionals, total_proposed_pay
      from folha_periods where id = ${periodId}
    `
    const row = rows[0]
    if (!row) throw new Error(`period ${periodId} missing`)

    const lines = (
      typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines
    ) as FolhaDraftLine[]
    const source =
      typeof row.source_professionals === 'string'
        ? JSON.parse(row.source_professionals)
        : row.source_professionals

    let patchedU = 0
    let patchedBaru = 0
    let clearedBaru = 0
    let patchedBonus = 0
    let patchedFatRef = 0
    let patchedDiversos = 0
    let patchedParc = 0

    const withExtras = lines.map((line) => {
      const f = lookupByNameKey(fopagByKey, line.name)
      const bonus = lookupByNameKey(bonusByKey, line.name)
      const extras = { ...line.folha_extras }
      if (f) {
        let u = f.U
        /**
         * BR: se a planilha tem J sem U e o a_pagar live ainda é o G
         * (pré-adm), derivar U = J/2%. Se a_pagar já ≈ Y, não derivar
         * (reabateria). Ex.: Alcides G=3040.8 / J=84.46; Islay traz U.
         */
        if (
          panel === 'brasil' &&
          isAssistLike(f.cargo, line.cargo_raw ?? line.cargo) &&
          !(u > 0.005) &&
          (f.taxa_adm ?? 0) > 0.005 &&
          (f.fat_liquido ?? 0) > 0.02 &&
          line.avec.net_payable != null
        ) {
          const net = line.avec.net_payable
          const g = f.fat_liquido!
          const y = f.liquido
          const preAdm = Math.abs(net - g) <= 2
          const alreadyY = y > 0.02 && Math.abs(net - y) <= 2
          if (preAdm && !alreadyY) {
            u = f.taxa_adm! / 0.02
          }
        }
        if (u > 0.005) {
          extras.servicos_assistente_como_pro = u
          extras.valor_a_pagar_profissional = null
          extras.taxa_servicos = null
          patchedU++
        } else if (extras.servicos_assistente_como_pro != null) {
          extras.servicos_assistente_como_pro = null
          extras.valor_a_pagar_profissional = null
          extras.taxa_servicos = null
          extras.taxa_adm_assistente = null
          patchedU++
        }
        if ((f.V ?? 0) > 0.005 && !(u > 0.005)) {
          extras.valor_a_pagar_profissional = f.V!
        }
        if ((f.taxa_adm ?? 0) > 0.005 && !(u > 0.005)) {
          if (isAssistLike(f.cargo, line.cargo_raw ?? line.cargo)) {
            extras.taxa_adm_assistente = f.taxa_adm!
          }
        }
        if (f.baru > 0.005) {
          extras.consumo_baru = f.baru
          patchedBaru++
        } else if (extras.consumo_baru != null) {
          extras.consumo_baru = null
          clearedBaru++
        }
        if (f.liquido > 0.005) {
          extras.liquido_referencia = f.liquido
        }
        if (f.fat_liquido != null && f.fat_liquido > 0.005) {
          extras.fat_liquido_referencia = f.fat_liquido
        }
        if (f.produto != null && f.produto > 0.005) {
          extras.produto_referencia = f.produto
        }
        // Total Faturado olerite/Fopag → coluna Fat. (não altera líquido).
        if (f.faturado != null && f.faturado > 0.005) {
          extras.faturado_referencia = f.faturado
          patchedFatRef++
        }
        /**
         * RH extras da Base Folha BR. Só grava se o 8123 ainda NÃO trouxe
         * o mesmo valor em `other_discounts` (senão double-abate: Dayana
         * parc=232.74 já em outros; Janderson div02=3546 já em outros).
         */
        const otherMag =
          line.avec.other_discounts == null
            ? null
            : Math.abs(line.avec.other_discounts)
        const otherAlreadyHas = (amount: number) =>
          otherMag != null && Math.abs(otherMag - amount) <= 2
        if (
          panel === 'brasil' &&
          (f.desc_diversos_02 ?? 0) > 0.005 &&
          !otherAlreadyHas(f.desc_diversos_02!)
        ) {
          extras.descontos_diversos = f.desc_diversos_02!
          patchedDiversos++
        } else if (
          panel === 'brasil' &&
          (f.desc_diversos_02 ?? 0) > 0.005 &&
          otherAlreadyHas(f.desc_diversos_02!) &&
          extras.descontos_diversos != null &&
          Math.abs(extras.descontos_diversos - f.desc_diversos_02!) <= 2
        ) {
          extras.descontos_diversos = null
        }
        if (
          panel === 'brasil' &&
          (f.parc ?? 0) > 0.005 &&
          !otherAlreadyHas(f.parc!)
        ) {
          extras.parc = f.parc!
          patchedParc++
        } else if (
          panel === 'brasil' &&
          (f.parc ?? 0) > 0.005 &&
          otherAlreadyHas(f.parc!) &&
          extras.parc != null &&
          Math.abs(extras.parc - f.parc!) <= 2
        ) {
          extras.parc = null
        }
      }
      if (bonus && extras.acumulado_mes == null) {
        extras.acumulado_mes = bonus.total
        patchedBonus++
      }
      return { ...line, folha_extras: extras }
    })

    const { lines: rehydrated, total } = rehydrateFolhaDraftFromPeriod(panel, {
      half: row.half as 1 | 2,
      to_day: String(row.to_day),
      reference_day:
        row.reference_day == null ? null : String(row.reference_day),
      lines: withExtras,
      source_professionals: source as never,
    })

    const sample =
      panel === 'brasil'
        ? [
            'Islayquiel',
            'ALCIDES',
            'MARCELO SABINO',
            'ARIANE',
            'DAYANA',
            'ALISON',
          ]
        : [
            'ANA CRISTINA MATSUMOTO',
            'BRUNNA FABRICIO',
            'DANIEL CHABARIBERY',
            'GABRIELA DA SILVA',
            'LUCAS RODRIGUES',
          ]
    for (const p of sample) {
      const L = rehydrated.find((x) =>
        x.name.toUpperCase().includes(p.toUpperCase().slice(0, 12)),
      )
      if (!L) continue
      console.log(
        JSON.stringify({
          name: L.name,
          fat_ref: L.folha_extras.faturado_referencia,
          charged: L.avec.charged,
          taxa_adm: L.taxa_administrativa,
          meio: L.meio_a_meio,
          outros: L.outros_descontos,
          baru: L.folha_extras.consumo_baru,
          U: L.folha_extras.servicos_assistente_como_pro,
          W: L.folha_extras.taxa_servicos,
          proposed: L.proposed_pay,
        }),
      )
    }

    console.log(
      JSON.stringify({
        panel,
        periodId,
        dry,
        patchedU,
        patchedBaru,
        clearedBaru,
        patchedBonus,
        patchedFatRef,
        patchedDiversos,
        patchedParc,
        total_before: row.total_proposed_pay,
        total_after: total,
        with_taxa_adm: rehydrated.filter((l) => l.taxa_administrativa != null)
          .length,
        with_baru: rehydrated.filter((l) => l.folha_extras.consumo_baru != null)
          .length,
        with_U: rehydrated.filter(
          (l) => l.folha_extras.servicos_assistente_como_pro != null,
        ).length,
        with_fat_ref: rehydrated.filter(
          (l) => l.folha_extras.faturado_referencia != null,
        ).length,
      }),
    )

    if (!dry) {
      await sql`
        update folha_periods set
          lines = ${sql.json(rehydrated as never)},
          total_proposed_pay = ${total},
          updated_by = ${'reenrich-fopag-columns'},
          updated_at = now()
        where id = ${periodId}
      `
      console.log('saved')
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
