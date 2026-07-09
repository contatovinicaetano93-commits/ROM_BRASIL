export type QuarterKey = `${number}-Q${1 | 2 | 3 | 4}`
export type MonthKey = `${number}-${string}` // YYYY-MM

export interface DirectorProfessional {
  id: string
  name: string
  avec_pro_id: string | null
  role: 'hairstylist' | 'makeup' | 'other'
  active: boolean
}

export interface ReturnQuarterRow {
  quarter: QuarterKey
  label: string
  return_rate: number // 0–1
  clients_total: number
  clients_returned: number
  delta_vs_prev: number | null // pontos percentuais
}

/** Linha no formato Avec 0011 (export Excel). */
export interface ReactivationClient {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  gender: string | null
  last_visit: string // ISO date
  days_since: number
  suggested_action: string
}

export interface ProfessionalReturnBlock {
  professional: DirectorProfessional
  quarters: ReturnQuarterRow[]
  selected_quarter: QuarterKey
  compare_quarter: QuarterKey
  reactivation: ReactivationClient[]
}

export interface MonthRevenueRow {
  month: MonthKey
  label: string
  revenue: number
  ticket_avg: number
  attended: number
}

export interface ProfessionalRevenueBlock {
  professional: DirectorProfessional
  months: MonthRevenueRow[]
  selected_month: MonthKey
}

export interface DirectorReportPeriod {
  selected_month: MonthKey
  selected_quarter: QuarterKey
  compare_quarter: QuarterKey
  /** Rótulo legível: Fat Mar/2026 · Retorno 1º tri/2026 vs … */
  label: string
  /** Data de referência (último dia do mês 0021), dd/mm/aaaa */
  reference_date: string
}

export interface DirectorReport {
  generated_at: string
  period: DirectorReportPeriod
  source: 'mock' | 'avec'
  avec_reports: { return: string; revenue: string }
  schedule_note: string
  return_blocks: ProfessionalReturnBlock[]
  revenue_blocks: ProfessionalRevenueBlock[]
  summary: {
    professionals: number
    avg_return_rate: number | null
    total_revenue_selected_month: number
    avg_ticket_selected_month: number | null
  }
}
