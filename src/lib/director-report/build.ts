import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import {
  directorFullBudget,
  directorUiBudget,
  DIRECTOR_UI_SLIM_MAX_PAGES,
  fetchLiveDirectorBlocks,
} from './avec-live'
import {
  buildMockReturnBlocks,
  buildMockRevenueBlocks,
  defaultCompareQuarter,
  defaultSelectedMonth,
  defaultSelectedQuarter,
} from './mock'
import {
  aggregateQuarterRevenue,
  label0011,
  label0021,
  monthsInComparableQuarter,
  orderQuarters,
  reportPeriodLabel,
  reportReferenceDate,
} from './period'
import { listDirectorReportProfessionals } from './professionals'
import type { DirectorReport, MonthKey, QuarterKey } from './types'

/** Evita jogar JSON bruto de validação Avec na UI (HTTP 400 salao_id etc.). */
function shortenAvecWarning(w: string): string {
  if (/salao_id/i.test(w)) {
    return '0011: Avec exige salao_id — confira AVEC_UNIT_ID'
  }
  if (/HTTP 400/i.test(w)) {
    return w.replace(/\{[\s\S]*\}/, '').trim().slice(0, 120) || 'Avec HTTP 400'
  }
  return w.length > 160 ? `${w.slice(0, 157)}…` : w
}

export interface BuildDirectorReportOptions {
  selectedMonth?: MonthKey
  /** false = 0021 só o mês selecionado (sem comparativo) */
  compareMonths?: boolean
  /** Trimestre foco do comparativo 0021 */
  selectedQuarter0021?: QuarterKey
  /** Trimestre de comparação do 0021 */
  compareQuarter0021?: QuarterKey | null
  selectedQuarter?: QuarterKey
  compareQuarter?: QuarterKey
  professionalId?: string
  forceMock?: boolean
  /** Se definido, só monta a etapa pedida (0011 ou 0021) — acelera a UI. */
  stage?: '0011' | '0021' | 'all'
  /**
   * true = budget Avec curto (UI JSON). false/omit = full (cron, CSV, e-mail).
   */
  interactive?: boolean
  /** Cap de páginas Avec 0011 na UI (slim). */
  maxPages0011?: number
  /**
   * Limita clientes de reativação por profissional na resposta JSON (UI).
   * null/undefined = sem corte (CSV/e-mail).
   */
  reactivationLimit?: number | null
}

function comparisonMonthSet(
  selectedMonth: MonthKey,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey
) {
  return new Set([
    ...monthsInComparableQuarter(selectedQuarter, selectedMonth, selectedQuarter, compareQuarter),
    ...monthsInComparableQuarter(compareQuarter, selectedMonth, selectedQuarter, compareQuarter),
  ])
}

export async function buildDirectorReport(
  opts: BuildDirectorReportOptions = {}
): Promise<DirectorReport> {
  const selectedMonth = opts.selectedMonth ?? defaultSelectedMonth()
  const compareMonths = opts.compareMonths === true
  const selectedQuarter0021 = opts.selectedQuarter0021 ?? defaultSelectedQuarter()
  const compareQuarter0021 = compareMonths
    ? (opts.compareQuarter0021 ?? defaultCompareQuarter())
    : null
  const selectedQuarter = opts.selectedQuarter ?? defaultSelectedQuarter()
  const compareQuarter = opts.compareQuarter ?? defaultCompareQuarter()

  let professionals = listDirectorReportProfessionals(true)
  if (opts.professionalId) {
    professionals = professionals.filter((p) => p.id === opts.professionalId)
  }

  const stage = opts.stage ?? 'all'
  const need0011 = stage === 'all' || stage === '0011'
  const need0021 = stage === 'all' || stage === '0021'

  const avecReady = isAvecConfigured() && !isAvecMock() && !opts.forceMock
  let source: 'mock' | 'avec' = 'mock'
  let return_blocks = need0011
    ? buildMockReturnBlocks(professionals, selectedQuarter, compareQuarter)
    : []
  let revenue_blocks = need0021
    ? buildMockRevenueBlocks(professionals, selectedMonth)
    : []
  let liveNote: string | null = null
  let live0011 = false
  let live0021 = false

  if (avecReady) {
    try {
      const live = await fetchLiveDirectorBlocks(
        professionals,
        selectedMonth,
        selectedQuarter0021,
        compareQuarter0021,
        selectedQuarter,
        compareQuarter,
        {
          includeReturn: need0011,
          includeRevenue: need0021,
          budget: opts.interactive
            ? directorUiBudget(
                Date.now(),
                opts.maxPages0011 ?? DIRECTOR_UI_SLIM_MAX_PAGES,
              )
            : directorFullBudget(),
        },
      )
      // Cada etapa cai pro mock de forma independente — uma falhar não deve
      // jogar fora o dado real da outra que funcionou.
      if (need0011 && live.return_blocks) {
        return_blocks = live.return_blocks
        live0011 = true
      }
      if (need0021 && live.revenue_blocks) {
        revenue_blocks = live.revenue_blocks
        live0021 = true
      }
      if ((need0011 ? live0011 : true) && (need0021 ? live0021 : true)) {
        source = 'avec'
      } else if (live0011 || live0021) {
        source = 'avec'
      }
      if (live.warnings.length) {
        liveNote = live.warnings.slice(0, 3).map(shortenAvecWarning).join(' · ')
      }
    } catch (e) {
      liveNote = `Avec live falhou — usando fixture: ${e instanceof Error ? e.message : String(e)}`
      console.warn('[director-report]', liveNote)
    }
  }

  if (need0021 && compareMonths && compareQuarter0021) {
    const quarterMonths = comparisonMonthSet(
      selectedMonth,
      selectedQuarter0021,
      compareQuarter0021
    )
    revenue_blocks = revenue_blocks.map((block) => ({
      ...block,
      quarters: aggregateQuarterRevenue(block.months.filter((m) => quarterMonths.has(m.month))),
    }))
  }

  const selectedRevenue =
    !need0021
      ? []
      : compareMonths && compareQuarter0021
      ? revenue_blocks.map((b) => {
          const [, newer] = orderQuarters(selectedQuarter0021, compareQuarter0021)
          const row = b.quarters.find((q) => q.quarter === newer)
          return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
        })
      : revenue_blocks.map((b) => {
          const row = b.months.find((m) => m.month === selectedMonth)
          return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
        })
  const totalRev = selectedRevenue.reduce((s, r) => s + r.revenue, 0)
  const totalAtt = selectedRevenue.reduce((s, r) => s + r.attended, 0)

  const returnRates = return_blocks
    .map((b) => {
      const q = b.quarters.find((x) => x.quarter === selectedQuarter)
      return q?.return_rate ?? null
    })
    .filter((x): x is number => x != null)

  const draft: DirectorReport = {
    generated_at: new Date().toISOString(),
    period: {
      selected_month: selectedMonth,
      compare_months: compareMonths && Boolean(compareQuarter0021),
      selected_quarter_0021: selectedQuarter0021,
      compare_quarter_0021: compareQuarter0021,
      selected_quarter: selectedQuarter,
      compare_quarter: compareQuarter,
      label: '',
      label_0011: '',
      label_0021: '',
      reference_date: '',
    },
    source,
    avec_reports: { return: '0011', revenue: '0021' },
    schedule_note:
      professionals.length === 0
        ? '⚠ Nenhum profissional de piso (cabelo/maquiagem) no roster — relatório sai vazio.'
        : source === 'avec'
          ? `Envio em 2 etapas (terças 08:00 SP): 0011/0021 live Avec · ${professionals.length} profissionais de piso${liveNote ? ` · ${liveNote}` : ''}`
          : avecReady
            ? `Envio em 2 etapas (terças 08:00 SP): 0011/0021 · fallback fixture · ${professionals.length} profissionais de piso${liveNote ? ` · ${liveNote}` : ''}`
            : `Envio em 2 etapas (terças 08:00 SP): 0011 trimestre vs trimestre · 0021 mês · dados mock · ${professionals.length} profissionais de piso`,
    return_blocks,
    revenue_blocks,
    summary: {
      professionals: professionals.length,
      avg_return_rate:
        returnRates.length > 0
          ? returnRates.reduce((a, b) => a + b, 0) / returnRates.length
          : null,
      total_revenue_selected_month: totalRev,
      avg_ticket_selected_month: totalAtt > 0 ? Math.round(totalRev / totalAtt) : null,
    },
  }

  draft.period.reference_date = reportReferenceDate(draft)
  draft.period.label_0011 = label0011(draft)
  draft.period.label_0021 = label0021(draft)
  draft.period.label = reportPeriodLabel(draft)

  const reactivationLimit = opts.reactivationLimit
  if (
    reactivationLimit != null &&
    Number.isFinite(reactivationLimit) &&
    reactivationLimit >= 0
  ) {
    draft.return_blocks = draft.return_blocks.map((b) => ({
      ...b,
      reactivation: b.reactivation.slice(0, reactivationLimit),
    }))
  }

  return draft
}
