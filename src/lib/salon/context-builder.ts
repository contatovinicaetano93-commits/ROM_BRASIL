import { createHash } from 'crypto'
import type { ContactRow } from '@/lib/contacts'
import { computeFinanceKpis, type FinanceKpis } from '@/lib/finance'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'
import { contactKpiWindow } from '@/lib/salon/contact-kpi-chart'
import { todayIso } from '@/lib/salon/format'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { getSalonMetrics } from '@/lib/salon/metrics'
import {
  computePeriodAnalytics,
  type PeriodAnalytics,
} from '@/lib/salon/period-analytics'
import { listActionItems } from '@/lib/salon/recommendations'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import { listUpcomingSchedules, pickLastVisit, type LastVisit } from '@/lib/services'

/** Fração 0–1 → pontos percentuais (ex.: 0.8 → 80). */
export function fractionToPctPoints(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 1000) / 10
}

/** Clipa fim do bucket financeiro (mês calendário) ao dia de referência (MTD). */
export function clipMonthEndToToday(monthTo: string, today: string): string {
  return monthTo > today ? today : monthTo
}

function fmtService(s: EnrichedService) {
  const parts = [s.name]
  if (s.product) parts.push(`(${s.product})`)
  if (s.cadence_days) parts.push(`a cada ${s.cadence_days}d`)
  if (s.state === 'overdue') parts.push(`ATRASADO ${Math.abs(s.days_until ?? 0)}d`)
  else if (s.state === 'due_soon') parts.push(`vence em ${s.days_until}d`)
  return parts.join(' ')
}

function fmtLastVisit(v: LastVisit | null): string | null {
  if (!v) return null
  const when = new Date(v.last_done_at).toLocaleDateString('pt-BR')
  const parts = [when, v.service_name]
  if (v.professional_name) parts.push(`com ${v.professional_name}`)
  if (v.last_price != null) {
    parts.push(
      v.last_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    )
  }
  return parts.join(' · ')
}

export interface ContactContext {
  cliente: {
    nome: string | null
    status: string
    telefone: string | null
    notas: string | null
    manicure_preferida: string | null
    cabeleireiro_preferido: string | null
  }
  ultima_visita: string | null
  servicos: string[]
  recomendacoes: { tipo: string; titulo: string; detalhe: string }[]
}

export interface SalonContext {
  hoje: string
  salon: Awaited<ReturnType<typeof getSalonMetrics>>
  /**
   * Acumulado financeiro do mês corrente (mesmo núcleo do /financeiro).
   * `null` se a carga falhou — não inventar zeros para a IA.
   */
  financeiro_mes: FinanceKpis | null
  /**
   * Visão analítica do mês (ocupação, perdas, pacotes, retorno).
   * `null` se a carga falhou.
   */
  visao_mes: PeriodAnalytics | null
  kpis_contato: Awaited<ReturnType<typeof fetchContactKpis>>
  playbook_top5: Awaited<ReturnType<typeof listActionItems>>
  agendamentos_proximos: Awaited<ReturnType<typeof listUpcomingSchedules>>
}

export function buildContactContext(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[],
): ContactContext {
  return {
    cliente: {
      nome: contact.name,
      status: contact.status,
      telefone: contact.phone,
      notas: contact.notes,
      manicure_preferida: contact.preferred_manicurist,
      cabeleireiro_preferido: contact.preferred_hairstylist,
    },
    ultima_visita: fmtLastVisit(pickLastVisit(services)),
    servicos: services.map(fmtService),
    recomendacoes: recs.map((r) => ({ tipo: r.type, titulo: r.title, detalhe: r.detail })),
  }
}

export async function buildSalonContext(): Promise<SalonContext> {
  // Fuso do salão — não usar UTC do toISOString (vira "ontem" à noite no BR).
  const day = todayIso()
  const settled = await Promise.allSettled([
    getSalonMetrics(day),
    fetchContactKpis(30),
    listActionItems(),
    listUpcomingSchedules(1, 20),
    computeFinanceKpis(),
    computePeriodAnalytics(),
  ])

  const salon = settled[0].status === 'fulfilled' ? settled[0].value : null
  const kpis_contato =
    settled[1].status === 'fulfilled'
      ? settled[1].value
      : {
          byDay: [],
          byStatus: [],
          conversion: null,
          window: contactKpiWindow(30, day),
        }
  const playbook_top5 = settled[2].status === 'fulfilled' ? settled[2].value : []
  const agendamentosRaw = settled[3].status === 'fulfilled' ? settled[3].value : []
  const financeiro_mes =
    settled[4].status === 'fulfilled' ? settled[4].value : null
  const visao_mes = settled[5].status === 'fulfilled' ? settled[5].value : null

  // Se nada essencial veio, propaga erro (Telegram mostra mensagem genérica).
  // getSalonMetrics fulfilled com null ainda conta como “hoje disponível vazio”.
  if (salon == null && financeiro_mes == null && visao_mes == null) {
    const reason =
      settled[0].status === 'rejected'
        ? settled[0].reason
        : settled[4].status === 'rejected'
          ? settled[4].reason
          : settled[5].status === 'rejected'
            ? settled[5].reason
            : new Error('Falha ao carregar contexto do salão')
    throw reason instanceof Error ? reason : new Error(String(reason))
  }

  return {
    hoje: day,
    salon,
    financeiro_mes,
    visao_mes,
    kpis_contato,
    playbook_top5: playbook_top5.slice(0, 5),
    agendamentos_proximos: [...agendamentosRaw].sort(compareScheduleByTimeThenName).slice(0, 10),
  }
}

export function hashContactContext(contact: ContactRow, services: EnrichedService[], recs: Recommendation[]) {
  const last = pickLastVisit(services)
  const payload = JSON.stringify({
    status: contact.status,
    notes: contact.notes,
    preferred_manicurist: contact.preferred_manicurist,
    preferred_hairstylist: contact.preferred_hairstylist,
    ultima_visita: last
      ? {
          at: last.last_done_at,
          service: last.service_name,
          pro: last.professional_name,
          price: last.last_price,
        }
      : null,
    services: services.map((s) => ({
      id: s.id,
      state: s.state,
      scheduled_at: s.scheduled_at,
      last_done_at: s.last_done_at,
      professional_name: s.professional_name,
    })),
    recs: recs.map((r) => r.type + r.title),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

/** Payload compacto para a IA do Telegram — hoje + mês das seções principais. */
export function salonContextForAI(ctx: SalonContext) {
  const fin = ctx.financeiro_mes?.current ?? null
  const period = ctx.visao_mes
  // Financeiro usa mês calendário no bucket; clipa "até" ao dia de hoje p/ não
  // sugerir fechamento futuro. Visão analítica já vem MTD.
  const financeTo = fin ? clipMonthEndToToday(fin.to, ctx.hoje) : null
  return JSON.stringify({
    data: ctx.hoje,
    unidades: {
      // Todos os *_pct abaixo estão em pontos percentuais (0–100), não fração.
      percentual: 'pontos_0_a_100',
    },
    salon_hoje: ctx.salon
      ? {
          faturamento: ctx.salon.revenue,
          agendamentos: ctx.salon.appointments,
          atendidos: ctx.salon.attended,
          no_shows: ctx.salon.no_shows,
          ticket_medio: ctx.salon.ticket_avg,
          novos_clientes: ctx.salon.new_clients,
          retornos: ctx.salon.returning_clients,
        }
      : null,
    financeiro_mes: fin
      ? {
          label: fin.label,
          de: fin.from,
          ate: financeTo,
          receita_acumulada: fin.revenue,
          despesas: fin.expenses,
          margem_bruta_pct: fin.gross_margin,
          fluxo: fin.cash_flow,
          atendidos: fin.attended,
          ticket_medio: fin.ticket_avg,
          formas_pagamento: fin.payment_mix.slice(0, 6).map((p) => ({
            metodo: p.method,
            valor: p.amount,
            share_pct: p.share,
          })),
        }
      : null,
    // Mesma separação do dashboard: MTD local vs snapshot Avec ~30d.
    visao_analitica_mes: period
      ? {
          label: period.label,
          mtd: {
            de: period.from,
            ate: period.to,
            cancelados: period.cancelled,
            no_shows: period.no_shows,
            receita_perdida: period.lost_revenue,
          },
          avec_snapshot_30d: {
            dia_snapshot: period.snapshot_day,
            ocupacao_media_pct: fractionToPctPoints(period.occupancy_avg),
            pacotes_faturamento: period.packages_revenue,
            novos_clientes: period.new_clients_period,
            taxa_retorno_pct: fractionToPctPoints(period.return_rate),
          },
        }
      : null,
    contatos: {
      por_status: ctx.kpis_contato.byStatus,
      conversao: ctx.kpis_contato.conversion
        ? {
            total_contacts: ctx.kpis_contato.conversion.total_contacts,
            funnel_contacts: ctx.kpis_contato.conversion.funnel_contacts,
            imported_contacts: ctx.kpis_contato.conversion.imported_contacts,
            // Pontos 0–100 (não fração).
            conversion_rate_pct: fractionToPctPoints(
              ctx.kpis_contato.conversion.conversion_rate,
            ),
          }
        : null,
      janela_dias: ctx.kpis_contato.window?.days ?? 30,
    },
    playbook: ctx.playbook_top5.map((a) => ({
      cliente: a.contact_name,
      acao: a.recommendations[0]?.title,
      urgencia: a.urgency_score,
    })),
    // Próximas 24h a partir de agora (não o calendário "hoje" fechado).
    agendamentos_proximos: ctx.agendamentos_proximos.map((s) => ({
      cliente: s.contact_name,
      servico: s.name,
      horario: s.scheduled_at,
    })),
  })
}

export function contactContextForAI(ctx: ContactContext) {
  return JSON.stringify(ctx)
}
