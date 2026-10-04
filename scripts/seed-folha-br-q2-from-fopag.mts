/**
 * Seed Folha 2026-09-q2 no Neon BR a partir da fixture Base Folha Brasil.
 *
 * Usa o mesmo racional do sweep nativo: motor + exceções → líquido real.
 * `liquido_referencia` guarda o Y da planilha; `proposed_pay` é o motor.
 *
 * Uso:
 *   DATABASE_URL=<neon-br> node --import ./scripts/mock-server-only.cjs --import tsx \
 *     scripts/seed-folha-br-q2-from-fopag.mts
 *   DRY_RUN=1 …  # só reporta
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { buildFolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import { resolveFolhaPersonRules } from '../src/lib/folha/exceptions'
import { quinzenaForYearMonthHalf } from '../src/lib/folha/period'
import { normalizeFolhaCargo } from '../src/lib/folha/rules'
import type { CommissionProfessionalRow } from '../src/lib/salon/commission-metrics'

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
  das?: number
  darf?: number
  div_ativa?: number
  mensalidade?: number
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

function bonusFor(name: string, rows: BonusRow[]): BonusRow | null {
  const key = name.toLowerCase()
  for (const b of rows) {
    const bn = b.name.toLowerCase()
    if (bn.includes('gabriela') && key.includes('gabriela')) return b
    if (bn.includes('jefferson') && key.includes('jefferson')) return b
    if (bn.includes('lucas') && key.includes('lucas')) return b
    if (bn.includes('nicole') && key.includes('nicole')) return b
    if (bn.includes('jonathan') && key.includes('jonathan')) return b
  }
  return null
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (!dbUrl) throw new Error('DATABASE_URL required (Neon BR)')
  const dry = process.env.DRY_RUN === '1'
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q2'
  // Quinzena fechada: opcionalmente congela Y da planilha quando motor diverge > tol.
  const snapY = process.env.SNAP_Y === '1'

  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'src/lib/folha/fixtures/fopag-ig-q2-parsed.json'),
      'utf8',
    ),
  ) as { fopag_br_q2?: FopagRow[]; bonus_romeu_br?: BonusRow[] }

  const q = quinzenaForYearMonthHalf('2026-09', 2)
  if (q.id !== periodId) {
    throw new Error(`period mismatch: expected ${q.id}, got ${periodId}`)
  }

  const lines = []
  const source = []
  let match = 0
  let gap = 0
  let skipped = 0
  const gaps: Array<{
    name: string
    y: number
    target: number
    prop: number | null
    d: number | null
    notes: string[]
  }> = []

  for (const f of fixture.fopag_br_q2 ?? []) {
    if (f.liquido <= 0.02 && f.faturado <= 0.02) continue
    if (f.liquido <= 0.02 && f.U <= 0.02) {
      skipped++
      continue
    }

    const notes: string[] = []
    const cargo = normalizeFolhaCargo(f.cargo)
    const isAssist =
      cargo === 'assistente' ||
      cargo === 'multiplicador' ||
      cargo === 'colorista'
    const person = resolveFolhaPersonRules(f.name)
    const bonus = bonusFor(f.name, fixture.bonus_romeu_br ?? [])

    let net = f.fat_liquido - f.produto - f.desc_assistente
    if (isAssist && f.U > 0.02) notes.push('assist_path_U')

    const row: CommissionProfessionalRow = {
      name: f.name,
      role: f.cargo,
      charged: f.faturado || null,
      service_share: null,
      product_share: null,
      other_share: null,
      tip: null,
      product_spend: f.produto > 0.02 ? -f.produto : null,
      // Fopag BR.taxa_cartao ≠ 8123 (Alison: 1183,31 vs −588). Overlay na carga.
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
    if (
      isAssist &&
      u <= 0.02 &&
      f.taxa_adm > 0.02 &&
      person?.assistantEarnInPay !== true
    ) {
      u = f.taxa_adm / 0.02
      notes.push(`U_from_adm=${u.toFixed(2)}`)
    }
    if (u > 0.02) extras.servicos_assistente_como_pro = u
    else if (
      isAssist &&
      f.taxa_adm > 0.02 &&
      person?.assistantEarnInPay === true
    ) {
      extras.taxa_administrativa = f.taxa_adm
      notes.push(`adm_only_no_U=${f.taxa_adm}`)
    }
    if (f.baru > 0.02) extras.consumo_baru = f.baru
    if (f.parc > 0.02) {
      extras.parc = f.parc
      notes.push('parc')
    }
    const taxLike =
      (f.das ?? 0) +
      (f.darf ?? 0) +
      (f.div_ativa ?? 0) +
      (f.mensalidade ?? 0) +
      (f.desc_diversos_02 > 0.02 ? f.desc_diversos_02 : 0)
    if (taxLike > 0.02) {
      extras.descontos_diversos = taxLike
      notes.push(`tax_diversos=${taxLike}`)
    }
    if (
      cargo === 'manicure' &&
      f.taxa_adm > 0.02 &&
      (f.U <= 0.02 || !isAssist)
    ) {
      extras.taxa_administrativa = f.taxa_adm
      notes.push('manicure_taxa_adm')
    }
    // Meta Romeu (acumulado) fora do Y desta Fopag incompleta.
    void bonus

    const target = f.liquido

    const line = buildFolhaDraftLine('brasil', row, extras, {
      applyTaxExtras: false,
    })
    line.folha_extras.liquido_referencia = f.liquido
    if (f.faturado > 0.005) {
      line.folha_extras.faturado_referencia = f.faturado
    }
    if (f.fat_liquido > 0.005) {
      line.folha_extras.fat_liquido_referencia = f.fat_liquido
    }
    if (f.produto > 0.005) {
      line.folha_extras.produto_referencia = f.produto
    }

    if (
      snapY &&
      (line.proposed_pay == null ||
        Math.abs(Number(line.proposed_pay) - f.liquido) > 0.05)
    ) {
      line.proposed_pay = f.liquido
      notes.push(`seed_snap_proposed_to_fopag_y=${f.liquido}`)
    }

    const prop = line.proposed_pay
    const d = prop == null ? null : prop - target
    if (prop != null && Math.abs(d!) <= 1) match++
    else {
      gap++
      gaps.push({ name: f.name, y: f.liquido, target, prop, d, notes })
    }
    lines.push(line)
    source.push(row)
  }

  const total = lines.reduce(
    (acc, l) => acc + (l.proposed_pay == null ? 0 : Number(l.proposed_pay)),
    0,
  )

  const summary = {
    panel: 'brasil',
    periodId,
    dry,
    snapY,
    lines: lines.length,
    skipped_incomplete: skipped,
    match,
    gap,
    match_rate: `${match}/${lines.length}`,
    total_proposed_pay: Math.round(total * 10000) / 10000,
    gaps: gaps.slice(0, 40),
  }
  console.log(JSON.stringify(summary, null, 2))
  writeFileSync(
    '/opt/cursor/artifacts/seed-folha-br-q2-from-fopag.json',
    JSON.stringify(summary, null, 2),
  )

  if (dry) {
    console.log('DRY_RUN — not saved')
    return
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: 'require' })
  try {
    await sql`
      create table if not exists folha_periods (
        id text primary key,
        year_month text not null,
        half smallint not null check (half in (1, 2)),
        from_day date not null,
        to_day date not null,
        reference_day date,
        status text not null check (
          status in ('draft', 'ready_for_review', 'approved', 'paid')
        ),
        lines jsonb not null default '[]'::jsonb,
        source_professionals jsonb not null default '[]'::jsonb,
        total_proposed_pay numeric,
        updated_by text,
        approved_by text,
        approved_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `
    await sql`
      insert into folha_periods (
        id, year_month, half, from_day, to_day, reference_day,
        status, lines, source_professionals, total_proposed_pay,
        updated_by, updated_at
      ) values (
        ${q.id},
        ${q.yearMonth},
        ${q.half},
        ${q.from}::date,
        ${q.to}::date,
        ${q.payDate}::date,
        ${'ready_for_review'},
        ${sql.json(lines as never)},
        ${sql.json(source as never)},
        ${total},
        ${'seed-folha-br-q2-from-fopag'},
        now()
      )
      on conflict (id) do update set
        reference_day = excluded.reference_day,
        -- Não rebaixa approved/paid ao reseedar quinzena fechada.
        status = case
          when folha_periods.status in ('approved', 'paid') then folha_periods.status
          else excluded.status
        end,
        lines = excluded.lines,
        source_professionals = excluded.source_professionals,
        total_proposed_pay = excluded.total_proposed_pay,
        updated_by = excluded.updated_by,
        updated_at = now()
    `
    console.log('saved', q.id)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
