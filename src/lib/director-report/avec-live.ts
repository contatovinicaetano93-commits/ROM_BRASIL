import { fetchAllAvecReport, fmtAvecDate, getAvecSyncMaxPages } from '@/lib/avec/client'
import {
  normalize0011ReactivationRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import { resolveMonthWindow } from '@/lib/salon/month-window'
import { matchDirectorProfessional } from './match-pro'
import {
  aggregateQuarterRevenue,
  labelMonth,
  labelQuarter,
  monthsInComparableQuarter,
} from './period'
import type {
  DirectorProfessional,
  MonthKey,
  MonthRevenueRow,
  ProfessionalReturnBlock,
  ProfessionalRevenueBlock,
  QuarterKey,
  ReactivationClient,
  ReturnQuarterRow,
} from './types'

function resolveMapperId(mapper: string): string | null {
  const def = getAvecReportRegistry().find((r) => r.mapper === mapper)
  if (!def) return null
  return resolveReportId(def)
}

/** Intervalo dd/mm/yyyy do mês (MTD no mês corrente — alinha Visão/Financeiro). */
export function monthRangeBr(month: MonthKey, referenceDay?: string): { inicio: string; fim: string } {
  const w = resolveMonthWindow(month, referenceDay)
  const [fy, fm, fd] = w.from.split('-').map(Number)
  const [ty, tm, td] = w.to.split('-').map(Number)
  if (!fy || !fm || !fd || !ty || !tm || !td) throw new Error(`Mês inválido: ${month}`)
  return {
    inicio: fmtAvecDate(new Date(fy, fm - 1, fd)),
    fim: fmtAvecDate(new Date(ty, tm - 1, td)),
  }
}

/** Intervalo dd/mm/yyyy do trimestre (YYYY-Qn). */
export function quarterRangeBr(quarter: QuarterKey): { inicio: string; fim: string } {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr) as 1 | 2 | 3 | 4
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  const startMonth = (q - 1) * 3
  const start = new Date(y, startMonth, 1)
  const end = new Date(y, startMonth + 3, 0)
  return { inicio: fmtAvecDate(start), fim: fmtAvecDate(end) }
}

function daysSince(iso: string) {
  const t = new Date(iso + 'T12:00:00').getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

function suggestedAction(days: number) {
  return days > 90
    ? 'Mensagem de retorno + oferta de manutenção'
    : 'Convite para reagendar no horário preferido'
}

function toReactivationClient(c: {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  gender: string | null
  lastVisit: string | null
}): ReactivationClient {
  const last =
    c.lastVisit ?? new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const days = daysSince(last)
  return {
    name: c.name,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    gender: c.gender,
    last_visit: last,
    days_since: days,
    suggested_action: suggestedAction(days),
  }
}

function emptyMonthRow(month: MonthKey): MonthRevenueRow {
  return {
    month,
    label: labelMonth(month),
    revenue: 0,
    ticket_avg: 0,
    attended: 0,
  }
}

/** Budget interativo: caber no abort 90s do browser + deixar margem de rede. */
export const DIRECTOR_UI_BUDGET_MS = 70_000
/** 20 × 250 = 5k linhas/trimestre — suficiente p/ taxa + lista; CSV completo usa budget completo. */
export const DIRECTOR_UI_MAX_PAGES = 20
/** UI slim: menos páginas → resposta antes do abort do browser. */
export const DIRECTOR_UI_SLIM_MAX_PAGES = 12

export type DirectorFetchBudget = {
  deadlineAt: number | null
  maxPages: number
}

export function directorUiBudget(now = Date.now(), maxPages = DIRECTOR_UI_MAX_PAGES): DirectorFetchBudget {
  return {
    deadlineAt: now + DIRECTOR_UI_BUDGET_MS,
    maxPages,
  }
}

export function directorFullBudget(): DirectorFetchBudget {
  return { deadlineAt: null, maxPages: getAvecSyncMaxPages() }
}

async function fetch0021Month(
  month: MonthKey,
  budget: DirectorFetchBudget = directorFullBudget(),
): Promise<Map<string, { revenue: number; attended: number; ticketAvg: number }>> {
  const id = resolveMapperId('professionals_revenue') ?? '0021'
  const { inicio, fim } = monthRangeBr(month)
  const { rows } = await fetchAllAvecReport(
    id,
    { inicio, fim, limit: 250 },
    budget.maxPages,
    { deadlineAt: budget.deadlineAt },
  )
  const byName = new Map<string, { revenue: number; attended: number; ticketAvg: number }>()

  for (const row of rows) {
    const p = normalizeP1ProfessionalRevenueRow(row)
    if (!p) continue
    const cur = byName.get(p.name) ?? { revenue: 0, attended: 0, ticketAvg: 0 }
    cur.revenue += p.revenue
    cur.attended += p.attended
    cur.ticketAvg = cur.attended > 0 ? cur.revenue / cur.attended : p.ticketAvg
    byName.set(p.name, cur)
  }
  return byName
}

/** Todos os meses de 2025 até `latest` (inclusive) — usado no perfil individual (022). */
function allMonthsUpTo(latest: MonthKey): MonthKey[] {
  const [yStr, mStr] = latest.split('-')
  const endY = Number(yStr)
  const endM = Number(mStr)
  const out: MonthKey[] = []
  for (let y = 2025; y <= endY; y++) {
    const lastM = y === endY ? endM : 12
    for (let m = 1; m <= lastM; m++) {
      out.push(`${y}-${String(m).padStart(2, '0')}` as MonthKey)
    }
  }
  return out
}

/** Série mensal completa (2025 → mês atual) de um único profissional — perfil individual (022). */
export async function fetchProfessionalProfileMonths(
  professional: DirectorProfessional,
  latestMonth: MonthKey,
): Promise<MonthRevenueRow[]> {
  const months = allMonthsUpTo(latestMonth)
  async function fetchProfessionalMonth(m: MonthKey): Promise<MonthRevenueRow> {
    try {
      const map = await fetch0021Month(m)
      let hit: { revenue: number; attended: number; ticketAvg: number } | undefined
      for (const [avecName, stats] of map) {
        if (matchDirectorProfessional(avecName, [professional])) {
          hit = stats
          break
        }
      }
      return hit
        ? {
            month: m,
            label: labelMonth(m),
            revenue: Math.round(hit.revenue),
            ticket_avg: Math.round(hit.ticketAvg),
            attended: hit.attended,
          }
        : emptyMonthRow(m)
    } catch {
      return emptyMonthRow(m)
    }
  }

  const rows: MonthRevenueRow[] = []
  for (let i = 0; i < months.length; i += 3) {
    const chunk = months.slice(i, i + 3)
    rows.push(...(await Promise.all(chunk.map(fetchProfessionalMonth))))
  }
  return rows
}

type QuarterAgg = {
  clients: ReactivationClient[]
  returnRates: number[]
  clientsTotalHint: number
  clientsReturnedHint: number
}

async function fetch0011Quarter(
  quarter: QuarterKey,
  budget: DirectorFetchBudget,
): Promise<{
  byPro: Map<string, QuarterAgg>
  salonRates: number[]
  truncated: boolean
}> {
  const id = resolveMapperId('director_return') ?? '0011'
  const { inicio, fim } = quarterRangeBr(quarter)
  const result = await fetchAllAvecReport(
    id,
    { inicio, fim, limit: 250 },
    budget.maxPages,
    { deadlineAt: budget.deadlineAt },
  )
  const rows = result.rows

  const byPro = new Map<string, QuarterAgg>()
  const salonRates: number[] = []

  for (const row of rows) {
    const c = normalize0011ReactivationRow(row)
    if (!c) continue

    if (c.returnRate != null && (!c.lastVisit || c.name === '—')) {
      salonRates.push(c.returnRate)
      if (c.professional) {
        const agg = byPro.get(c.professional) ?? {
          clients: [],
          returnRates: [],
          clientsTotalHint: 0,
          clientsReturnedHint: 0,
        }
        agg.returnRates.push(c.returnRate)
        byPro.set(c.professional, agg)
      }
      continue
    }

    const proName = c.professional ?? '_unassigned'
    const agg = byPro.get(proName) ?? {
      clients: [],
      returnRates: [],
      clientsTotalHint: 0,
      clientsReturnedHint: 0,
    }
    if (c.returnRate != null) agg.returnRates.push(c.returnRate)
    if (c.name && c.name !== '—') {
      agg.clients.push(
        toReactivationClient({
          name: c.name,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          gender: c.gender,
          lastVisit: c.lastVisit,
        }),
      )
    }
    byPro.set(proName, agg)
  }

  // Fallback 0007 só se ainda houver tempo no budget (UI não pode gastar +30–90s aqui).
  const timeLeft =
    budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
  if (salonRates.length === 0 && timeLeft > 12_000) {
    const id0007 = resolveMapperId('return_rate')
    if (id0007) {
      try {
        const { rows: r7 } = await fetchAllAvecReport(
          id0007,
          { inicio, fim, limit: 250 },
          Math.min(4, budget.maxPages),
          { deadlineAt: budget.deadlineAt },
        )
        for (const row of r7) {
          const rate = normalizeP3ReturnRateRow(row)
          if (rate != null) salonRates.push(rate)
        }
      } catch {
        // opcional
      }
    }
  }

  return { byPro, salonRates, truncated: result.truncated }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function buildQuarterRow(
  quarter: QuarterKey,
  agg: QuarterAgg | undefined,
  salonRate: number | null,
  prevRate: number | null,
): ReturnQuarterRow {
  const listN = agg?.clients.length ?? 0
  const rateFromAgg = avg(agg?.returnRates ?? [])
  // Lista 0011 = clientes sem retorno → taxa ≈ 1 − (lista / (lista + retornados)).
  // Sem total Avec, usamos taxa do relatório/0007; clients_total = tamanho da lista.
  const return_rate =
    rateFromAgg ??
    salonRate ??
    (listN > 0 ? 0 : 0)

  const clients_total = listN > 0 ? listN : agg?.clientsTotalHint || 0
  const clients_returned =
    clients_total > 0 && return_rate > 0
      ? Math.round(clients_total * return_rate)
      : agg?.clientsReturnedHint || 0

  return {
    quarter,
    label: labelQuarter(quarter),
    return_rate: Math.round(return_rate * 1000) / 1000,
    clients_total,
    clients_returned,
    delta_vs_prev:
      prevRate == null ? null : Math.round((return_rate - prevRate) * 1000) / 10,
  }
}

export interface LiveDirectorBlocks {
  /** null = etapa 0011 falhou ao montar (bug/exceção) — quem chama deve cair pro mock só dessa etapa. */
  return_blocks: ProfessionalReturnBlock[] | null
  /** null = etapa 0021 falhou ao montar (bug/exceção) — quem chama deve cair pro mock só dessa etapa. */
  revenue_blocks: ProfessionalRevenueBlock[] | null
  warnings: string[]
}

/**
 * Busca 0011 + 0021 na Avec e monta blocos do relatório.
 * Match por nome (e avec_pro_id quando preenchido).
 */
export async function fetchLiveDirectorBlocks(
  professionals: DirectorProfessional[],
  selectedMonth: MonthKey,
  selectedQuarter0021: QuarterKey,
  compareQuarter0021: QuarterKey | null,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
  opts?: {
    includeReturn?: boolean
    includeRevenue?: boolean
    /** Budget Avec — UI passa directorUiBudget(); cron/CSV usam full. */
    budget?: DirectorFetchBudget
  },
): Promise<LiveDirectorBlocks> {
  const includeReturn = opts?.includeReturn !== false
  const includeRevenue = opts?.includeRevenue !== false
  const budget = opts?.budget ?? directorFullBudget()
  const warnings: string[] = []
  const monthsNeeded = new Set<MonthKey>()
  if (includeRevenue) {
    monthsNeeded.add(selectedMonth)
    if (compareQuarter0021) {
      for (const m of monthsInComparableQuarter(
        selectedQuarter0021,
        selectedMonth,
        selectedQuarter0021,
        compareQuarter0021
      )) {
        monthsNeeded.add(m)
      }
      for (const m of monthsInComparableQuarter(
        compareQuarter0021,
        selectedMonth,
        selectedQuarter0021,
        compareQuarter0021
      )) {
        monthsNeeded.add(m)
      }
    }
  }

  const monthMaps = new Map<
    MonthKey,
    Map<string, { revenue: number; attended: number; ticketAvg: number }>
  >()

  // Meses em paralelo (antes era 1 a 1 — 0021 no UI estourava o abort).
  if (monthsNeeded.size > 0) {
    const monthList = [...monthsNeeded]
    const settled = await Promise.allSettled(
      monthList.map((m) => fetch0021Month(m, budget)),
    )
    settled.forEach((r, i) => {
      const m = monthList[i]!
      if (r.status === 'fulfilled') monthMaps.set(m, r.value)
      else {
        warnings.push(`0021 ${m}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
        monthMaps.set(m, new Map())
      }
    })
  }

  let selectedQ: Awaited<ReturnType<typeof fetch0011Quarter>> = {
    byPro: new Map(),
    salonRates: [],
    truncated: false,
  }
  let compareQ: Awaited<ReturnType<typeof fetch0011Quarter>> = {
    byPro: new Map(),
    salonRates: [],
    truncated: false,
  }
  if (includeReturn) {
    // Dois trimestres em paralelo — antes era sequencial (×2 wall time → >90s).
    const [selRes, cmpRes] = await Promise.allSettled([
      fetch0011Quarter(selectedQuarter, budget),
      fetch0011Quarter(compareQuarter, budget),
    ])
    if (selRes.status === 'fulfilled') {
      selectedQ = selRes.value
      if (selectedQ.truncated) warnings.push(`0011 ${selectedQuarter}: parcial (budget UI)`)
    } else {
      warnings.push(
        `0011 ${selectedQuarter}: ${selRes.reason instanceof Error ? selRes.reason.message : String(selRes.reason)}`,
      )
    }
    if (cmpRes.status === 'fulfilled') {
      compareQ = cmpRes.value
      if (compareQ.truncated) warnings.push(`0011 ${compareQuarter}: parcial (budget UI)`)
    } else {
      warnings.push(
        `0011 ${compareQuarter}: ${cmpRes.reason instanceof Error ? cmpRes.reason.message : String(cmpRes.reason)}`,
      )
    }
  }

  const salonSel = avg(selectedQ.salonRates)
  const salonCmp = avg(compareQ.salonRates)

  // Indexa agregados 0011 por profissional do portfólio
  function indexByPro(src: Map<string, QuarterAgg>) {
    const out = new Map<string, QuarterAgg>()
    for (const [avecName, agg] of src) {
      if (avecName === '_unassigned') continue
      const pro = matchDirectorProfessional(avecName, professionals)
      if (!pro) continue
      const cur = out.get(pro.id) ?? {
        clients: [],
        returnRates: [],
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      }
      cur.clients.push(...agg.clients)
      cur.returnRates.push(...agg.returnRates)
      out.set(pro.id, cur)
    }
    // Linhas sem profissional: distribui só se houver 1 pro filtrado
    const un = src.get('_unassigned')
    if (un && professionals.length === 1) {
      const only = professionals[0]!
      const cur = out.get(only.id) ?? {
        clients: [],
        returnRates: [],
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      }
      cur.clients.push(...un.clients)
      cur.returnRates.push(...un.returnRates)
      out.set(only.id, cur)
    }
    return out
  }

  const selByPro = includeReturn ? indexByPro(selectedQ.byPro) : new Map<string, QuarterAgg>()
  const cmpByPro = includeReturn ? indexByPro(compareQ.byPro) : new Map<string, QuarterAgg>()

  // Se 0011 veio sem coluna profissional, atribui lista inteira a cada pro filtrado
  // só quando há um único profissional — senão fica no bloco com lista vazia + taxa salão.
  if (includeReturn && selByPro.size === 0 && selectedQ.byPro.size > 0) {
    const allClients: ReactivationClient[] = []
    const rates: number[] = []
    for (const agg of selectedQ.byPro.values()) {
      allClients.push(...agg.clients)
      rates.push(...agg.returnRates)
    }
    if (professionals.length === 1) {
      selByPro.set(professionals[0]!.id, {
        clients: allClients,
        returnRates: rates,
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      })
    }
  }

  let revenue_blocks: ProfessionalRevenueBlock[] | null = null
  if (includeRevenue) {
    try {
      revenue_blocks = professionals.map((professional) => {
        const months: MonthRevenueRow[] = []
        for (const m of monthsNeeded) {
          const map = monthMaps.get(m)!
          let hit: { revenue: number; attended: number; ticketAvg: number } | undefined
          for (const [avecName, stats] of map) {
            const matched = matchDirectorProfessional(avecName, [professional])
            if (matched) {
              hit = stats
              break
            }
          }
          // Também tenta match contra lista completa (nome Avec → este pro)
          if (!hit) {
            for (const [avecName, stats] of map) {
              if (matchDirectorProfessional(avecName, professionals)?.id === professional.id) {
                hit = stats
                break
              }
            }
          }
          months.push(
            hit
              ? {
                  month: m,
                  label: labelMonth(m),
                  revenue: Math.round(hit.revenue),
                  ticket_avg: Math.round(hit.ticketAvg),
                  attended: hit.attended,
                }
              : emptyMonthRow(m),
          )
        }
        months.sort((a, b) => a.month.localeCompare(b.month))
        return {
          professional,
          months,
          quarters: aggregateQuarterRevenue(months),
          selected_month: selectedMonth,
        }
      })
    } catch (e) {
      warnings.push(`0021 falhou ao montar blocos: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // UI mostra no máx. 3 listas; 1 pro filtrado = lista completa (até cap).
  const reactivationCap = professionals.length === 1 ? 200 : 40

  let return_blocks: ProfessionalReturnBlock[] | null = null
  if (includeReturn) {
    try {
      return_blocks = professionals.map((professional) => {
        const selAgg = selByPro.get(professional.id)
        const cmpAgg = cmpByPro.get(professional.id)

        const cmpRow = buildQuarterRow(compareQuarter, cmpAgg, salonCmp, null)
        const selRow = buildQuarterRow(selectedQuarter, selAgg, salonSel, cmpRow.return_rate)

        // Se não há lista por pro mas há taxa salão, ainda mostra a taxa
        if (!selAgg && salonSel != null && selRow.clients_total === 0) {
          selRow.return_rate = Math.round(salonSel * 1000) / 1000
        }
        if (!cmpAgg && salonCmp != null && cmpRow.clients_total === 0) {
          cmpRow.return_rate = Math.round(salonCmp * 1000) / 1000
          selRow.delta_vs_prev =
            Math.round((selRow.return_rate - cmpRow.return_rate) * 1000) / 10
        }

        const reactivation = (selAgg?.clients ?? [])
          .slice()
          .sort((a, b) => b.days_since - a.days_since)
          .slice(0, reactivationCap)

        return {
          professional,
          quarters: [cmpRow, selRow],
          selected_quarter: selectedQuarter,
          compare_quarter: compareQuarter,
          reactivation,
        }
      })
    } catch (e) {
      warnings.push(`0011 falhou ao montar blocos: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const hasAnyRevenue =
    revenue_blocks?.some((b) => b.months.some((m) => m.revenue > 0)) ?? false
  const hasAnyReturn =
    return_blocks != null &&
    (return_blocks.some((b) => b.reactivation.length > 0) ||
      return_blocks.some((b) => b.quarters.some((q) => q.return_rate > 0 || q.clients_total > 0)))

  if (includeRevenue && includeReturn && revenue_blocks == null && return_blocks == null) {
    throw new Error(
      `Avec 0011/0021 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }

  // Sem sinal útil → null para o caller manter mock (evita tabela de 0% vazia).
  if (includeRevenue && !hasAnyRevenue) {
    warnings.push('0021 sem faturamento casado aos profissionais do portfólio')
    revenue_blocks = null
  }
  if (includeReturn && !hasAnyReturn) {
    warnings.push('0011 sem lista/taxa casada aos profissionais do portfólio')
    return_blocks = null
  }

  return { return_blocks, revenue_blocks, warnings }
}
