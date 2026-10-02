/**
 * Orquestra rascunho Folha: 8123 → persistência → extras → status.
 */

import type { RomPanelId } from '@/lib/brand'
import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import { fetchCommissions8123ForRange } from '@/lib/avec/sync-commissions'
import {
  buildFolhaDraftFrom8123,
  type FolhaDraft,
} from '@/lib/folha/draft-from-8123'
import {
  acceptsFolhaTaxExtras,
  folhaQuinzenasForDailyRefresh,
  listRecentQuinzenas,
  parseFolhaPeriodId,
  quinzenaAvecRangeBr,
  resolveFolhaQuinzena,
  todayIsoSaoPaulo,
  type FolhaQuinzena,
} from '@/lib/folha/period'
import {
  draftLikelySeededFromMtd,
  isoDayBefore,
  sliceQuinzenaFromMtdSnapshots,
} from '@/lib/folha/quinzena-8123'
import { sendFolhaNotifyEmail } from '@/lib/folha/notify'
import { insertFolhaTaxDocument } from '@/lib/folha/store'
import {
  getFolhaPeriod,
  getLatestSalonCommissionsNearOrLatest,
  saveFolhaPeriodLines,
  updateFolhaPeriodStatus,
  upsertFolhaPeriodFromDraft,
  type FolhaPeriodRow,
} from '@/lib/folha/store-facade'
import { parseFolhaTaxEmail, taxKindToExtrasKey } from '@/lib/folha/tax-parse'
import type {
  FolhaPeriodStatus,
  FolhaPeriodSummary,
  FolhaUpcomingPayment,
} from '@/lib/folha/types'
import {
  applyExtrasToDraftLines,
  canTransitionFolhaStatus,
  periodRowToDraft,
  refreshDraftPreservingExtras,
  sumProposedPay,
  type FolhaLineExtrasPatch,
} from '@/lib/folha/workflow'
import {
  fetchZigDetailedTransactions,
  zigWindowForQuinzenaDays,
} from '@/lib/folha/zig-client'
import {
  aggregateZigEmployeeConsumo,
  isZigFolhaConfigured,
  planZigConsumoBaruExtras,
  type ApplyZigConsumoResult,
} from '@/lib/folha/zig-consumo'
import { resolveFolhaTaxLineName } from '@/lib/folha/tax-cnpj'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

export type Folha8123Source = 'avec_window' | 'db_quinzena_slice' | 'db_snapshot'

export type FolhaLoadOpts = {
  /** id `YYYY-MM-q1|q2` */
  periodId?: string
  /** Âncora YYYY-MM-DD (alternativa a periodId) */
  referenceDay?: string
  actor?: string | null
  today?: string
}

export function buildUpcomingPayments(today = todayIsoSaoPaulo()): FolhaUpcomingPayment[] {
  return listRecentQuinzenas({ today, count: 6 })
    .map((q) => ({
      period_id: q.id,
      label: q.label,
      pay_date: q.payDate,
      from: q.from,
      to: q.to,
      upcoming: q.payDate >= today,
    }))
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))
}

export async function listFolhaPeriodSummaries(
  today = todayIsoSaoPaulo(),
): Promise<FolhaPeriodSummary[]> {
  const recent = listRecentQuinzenas({ today, count: 6 })
  const out: FolhaPeriodSummary[] = []
  for (const q of recent) {
    const row = await getFolhaPeriod(q.id)
    out.push({
      id: q.id,
      label: q.label,
      status: row?.status ?? 'draft',
      reference_day: row?.reference_day ?? q.to,
      line_count: row?.lines.length ?? null,
      total_proposed_pay: row?.total_proposed_pay ?? null,
      pay_date: q.payDate,
      from: q.from,
      to: q.to,
    })
  }
  return out
}

/**
 * Resolve profissionais 8123 na janela da quinzena.
 * 1) Avec live (inicio→fim da quinzena) — fonte canônica
 * 2) Diff MTD Neon (fim − dia antes do from) — fallback sem inflar Q2
 * 3) Snapshot MTD cru — último recurso (só Q1 é razoável; Q2 fica marcado)
 */
async function resolveQuinzena8123Professionals(
  quinzena: FolhaQuinzena,
  today: string,
): Promise<{
  professionals: CommissionProfessionalRow[]
  referenceDay: string
  source: Folha8123Source
  avec_range: { inicio: string; fim: string } | null
  error: Error | null
}> {
  const range = quinzenaAvecRangeBr(quinzena, today)
  let avecError: Error | null = null

  // Mock fixtures não têm janela real — só Avec live (token/login).
  if (isAvecConfigured() && !isAvecMock()) {
    try {
      const fetched = await fetchCommissions8123ForRange({
        inicioBr: range.inicio,
        fimBr: range.fim,
      })
      if (fetched.truncated) {
        throw new Error(
          `8123 truncado na janela ${range.inicio}–${range.fim} — aumente AVEC_SYNC_MAX_PAGES ou tente de novo`,
        )
      }
      if (fetched.professionals.length > 0) {
        return {
          professionals: fetched.professionals,
          referenceDay: range.fimIso,
          source: 'avec_window',
          avec_range: { inicio: fetched.inicio, fim: fetched.fim },
          error: null,
        }
      }
    } catch (e) {
      avecError = e instanceof Error ? e : new Error(String(e))
    }
  }

  const endSnap = await getLatestSalonCommissionsNearOrLatest(quinzena.to)
  if (!endSnap || endSnap.professionals.length === 0) {
    return {
      professionals: [],
      referenceDay: range.fimIso,
      source: 'db_snapshot',
      avec_range: null,
      error:
        avecError ??
        new Error(
          `Sem 8123 na janela ${range.inicio}–${range.fim} (nem snapshot DB até ${quinzena.to})`,
        ),
    }
  }

  if (quinzena.half === 2) {
    const priorDay = isoDayBefore(quinzena.from)
    const priorSnap = await getLatestSalonCommissionsNearOrLatest(priorDay)
    if (priorSnap && priorSnap.professionals.length > 0) {
      const sliced = sliceQuinzenaFromMtdSnapshots({
        quinzena,
        endProfessionals: endSnap.professionals,
        priorProfessionals: priorSnap.professionals,
      })
      if (sliced.length > 0) {
        return {
          professionals: sliced,
          referenceDay: endSnap.day,
          source: 'db_quinzena_slice',
          avec_range: null,
          error: avecError,
        }
      }
    }
  }

  // Q1: MTD no dia 15 ≈ janela 01–15. Q2 sem prior: MTD cru (ruim — caller avisa).
  return {
    professionals: endSnap.professionals,
    referenceDay: endSnap.day,
    source: quinzena.half === 1 ? 'db_quinzena_slice' : 'db_snapshot',
    avec_range: null,
    error: avecError,
  }
}

/**
 * Carrega (ou cria) o rascunho da quinzena alvo.
 *
 * Nunca semeia Q2 com MTD cru do Neon (isso inflava faturado bruto de todo
 * mundo). Prefere janela Avec; fallback = fatia MTD(fim)−MTD(dia 15).
 * Rascunhos `draft` já persistidos com cara de MTD são rehidratados na carga.
 */
export async function loadOrCreateFolhaDraft(
  panel: RomPanelId,
  opts?: FolhaLoadOpts,
): Promise<{
  draft: FolhaDraft | null
  period: FolhaPeriodRow | null
  quinzena: FolhaQuinzena
  source?: Folha8123Source
}> {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const quinzena = resolveFolhaQuinzena({
    periodId: opts?.periodId,
    day: opts?.referenceDay,
    today,
  })
  const persisted = await getFolhaPeriod(quinzena.id)

  if (persisted) {
    // Rascunho sticky semeado com MTD: corrige na leitura (preserva extras RH).
    if (persisted.status === 'draft' && persisted.source_professionals.length > 0) {
      const mtdEnd = await getLatestSalonCommissionsNearOrLatest(quinzena.to)
      const poisoned =
        quinzena.half === 2 &&
        mtdEnd != null &&
        draftLikelySeededFromMtd(persisted.source_professionals, mtdEnd.professionals)
      if (poisoned) {
        try {
          const fixed = await refreshFolhaDraft(panel, {
            ...opts,
            periodId: quinzena.id,
            today,
          })
          return {
            draft: fixed.draft,
            period: fixed.period,
            quinzena: fixed.quinzena,
            source: fixed.source,
          }
        } catch {
          // Mantém sticky se Avec/DB falhar — UI ainda pode “Atualizar do 8123”.
        }
      }
    }
    return {
      draft: periodRowToDraft(panel, persisted),
      period: persisted,
      quinzena,
    }
  }

  const resolved = await resolveQuinzena8123Professionals(quinzena, today)
  if (resolved.professionals.length === 0) {
    return { draft: null, period: null, quinzena, source: resolved.source }
  }

  const draft = buildFolhaDraftFrom8123({
    panel,
    referenceDay: resolved.referenceDay,
    professionals: resolved.professionals,
    quinzenaDay: quinzena.to,
  })
  draft.quinzena = quinzena
  const period = await upsertFolhaPeriodFromDraft({
    draft,
    status: 'draft',
    sourceProfessionals: resolved.professionals,
    updatedBy: opts?.actor ?? null,
    forceStatus: true,
  })
  return {
    draft: periodRowToDraft(panel, period),
    period,
    quinzena,
    source: resolved.source,
  }
}

/**
 * Atualiza o rascunho com 8123 na janela da quinzena (inicio→fim, cortado em hoje).
 * Não grava em `salon_commissions_daily` (MTD do painel fica intacto).
 * Fallback: fatia MTD (Q2 = fim − dia 15), nunca MTD cru se o prior existir.
 */
export async function refreshFolhaDraft(
  panel: RomPanelId,
  opts?: FolhaLoadOpts,
): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  quinzena: FolhaQuinzena
  source: Folha8123Source
  avec_range: { inicio: string; fim: string } | null
}> {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const quinzena = resolveFolhaQuinzena({
    periodId: opts?.periodId,
    day: opts?.referenceDay,
    today,
  })
  const range = quinzenaAvecRangeBr(quinzena, today)
  const resolved = await resolveQuinzena8123Professionals(quinzena, today)

  if (resolved.professionals.length === 0) {
    throw (
      resolved.error ??
      new Error(
        `Sem 8123 na janela ${range.inicio}–${range.fim} (nem snapshot DB até ${quinzena.to})`,
      )
    )
  }

  const existing = await getFolhaPeriod(quinzena.id)
  if (existing?.status === 'paid') {
    throw new Error('Período já pago — reabra para editar')
  }
  const previousLines = existing?.lines ?? []

  const draft = refreshDraftPreservingExtras({
    panel,
    referenceDay: resolved.referenceDay,
    professionals: resolved.professionals,
    previousLines,
    quinzenaDay: quinzena.to,
  })
  draft.quinzena = quinzena

  const period = await upsertFolhaPeriodFromDraft({
    draft,
    sourceProfessionals: resolved.professionals,
    updatedBy: opts?.actor ?? null,
    status: existing?.status ?? 'draft',
    forceStatus: false,
  })

  return {
    draft: periodRowToDraft(panel, period),
    period,
    quinzena,
    source: resolved.source,
    avec_range: resolved.avec_range,
  }
}

export type FolhaDailyRefreshItem = {
  period_id: string
  outcome: 'refreshed' | 'skipped_locked' | 'error'
  period_status?: FolhaPeriodStatus
  source?: 'avec_window' | 'db_snapshot'
  error?: string
}

/**
 * Cron diário: recalcula rascunhos abertos (draft / ready_for_review)
 * da quinzena do próximo pagamento e da quinzena civil de hoje.
 * Não toca períodos já aprovados ou pagos.
 */
export async function runFolhaDailyRefresh(
  panel: RomPanelId,
  opts?: { today?: string },
): Promise<{ today: string; results: FolhaDailyRefreshItem[] }> {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const targets = folhaQuinzenasForDailyRefresh(today)
  const results: FolhaDailyRefreshItem[] = []

  for (const q of targets) {
    const existing = await getFolhaPeriod(q.id)
    if (existing && (existing.status === 'approved' || existing.status === 'paid')) {
      results.push({
        period_id: q.id,
        outcome: 'skipped_locked',
        period_status: existing.status,
      })
      continue
    }
    try {
      const refreshed = await refreshFolhaDraft(panel, {
        periodId: q.id,
        today,
        actor: 'cron:folha-daily',
      })
      results.push({
        period_id: q.id,
        outcome: 'refreshed',
        period_status: refreshed.period.status,
        source: refreshed.source,
      })
    } catch (e) {
      results.push({
        period_id: q.id,
        outcome: 'error',
        period_status: existing?.status,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { today, results }
}

/**
 * Puxa consumo funcionário no Baru (Zig) e preenche `consumo_baru` nas linhas.
 * Não sobrescreve valor já lançado; não reabate se Baru já veio no 8123.
 */
export async function applyZigConsumoBaruToPeriod(
  panel: RomPanelId,
  args: { periodId: string; actor?: string | null },
): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  report: ApplyZigConsumoResult
  zig: { placeId: string; txs: number; pages: number; skipped?: string }
}> {
  if (!isZigFolhaConfigured()) {
    throw new Error(
      'Zig não configurado — defina ZIG_API_TOKEN (e opcional ZIG_TRANSACTIONS_RPC)',
    )
  }
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (period.status === 'paid') throw new Error('Período já pago — reabra para editar')
  if (period.lines.length === 0) {
    throw new Error('Rascunho vazio — atualize do 8123 antes de puxar o Baru')
  }

  const quinzena = parseFolhaPeriodId(period.id)
  if (!quinzena) throw new Error(`Período inválido: ${period.id}`)
  const { sinceIso, untilIso } = zigWindowForQuinzenaDays(
    quinzena.from,
    quinzena.to,
  )
  const fetched = await fetchZigDetailedTransactions({
    panel,
    sinceIso,
    untilIso,
  })
  if (fetched.skipped === 'not_configured') {
    throw new Error('Zig não configurado — defina ZIG_API_TOKEN')
  }

  const spends = aggregateZigEmployeeConsumo(fetched.transactions, {
    fromIso: quinzena.from,
    toIso: quinzena.to,
  })
  const draftView = periodRowToDraft(panel, period)
  const { patches, report } = planZigConsumoBaruExtras(draftView.lines, spends)

  const applyTax = acceptsFolhaTaxExtras(quinzena.half)
  let lines = period.lines
  for (const patch of patches) {
    const result = applyExtrasToDraftLines({
      panel,
      lines,
      sourceProfessionals: period.source_professionals,
      professionalName: patch.professionalName,
      extras: patch.extras,
      applyTaxExtras: applyTax,
    })
    lines = result.lines
  }

  const updated = await saveFolhaPeriodLines({
    id: period.id,
    lines,
    totalProposedPay: sumProposedPay(lines),
    updatedBy: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao salvar consumo Baru')

  return {
    draft: periodRowToDraft(panel, updated),
    period: updated,
    report,
    zig: {
      placeId: fetched.placeId,
      txs: fetched.transactions.length,
      pages: fetched.pages,
    },
  }
}

export async function patchFolhaLine(
  panel: RomPanelId,
  args: {
    periodId: string
    professionalName: string
    extras: FolhaLineExtrasPatch
    actor?: string | null
  },
): Promise<{ draft: FolhaDraft; period: FolhaPeriodRow }> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (period.status === 'paid') throw new Error('Período já pago — reabra para editar')

  const quinzena = parseFolhaPeriodId(period.id)
  const applyTax = quinzena ? acceptsFolhaTaxExtras(quinzena.half) : period.half === 1
  if (
    !applyTax &&
    (args.extras.darf != null ||
      args.extras.das != null ||
      args.extras.mensalidade_contabilidade != null)
  ) {
    throw new Error(
      'DARF/DAS/mensalidade só entram no pagamento do dia 20 (1ª quinzena)',
    )
  }

  const result = applyExtrasToDraftLines({
    panel,
    lines: period.lines,
    sourceProfessionals: period.source_professionals,
    professionalName: args.professionalName,
    extras: args.extras,
    applyTaxExtras: applyTax,
  })
  if (!result.matched) throw new Error('Profissional não encontrado no rascunho')

  const updated = await saveFolhaPeriodLines({
    id: period.id,
    lines: result.lines,
    totalProposedPay: result.total,
    updatedBy: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao salvar linha')
  return { draft: periodRowToDraft(panel, updated), period: updated }
}

export async function transitionFolhaPeriod(args: {
  panel: RomPanelId
  periodId: string
  status: FolhaPeriodStatus
  actor?: string | null
  /** default true — e-mail ops ao aprovar */
  notifyOnApprove?: boolean
}): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  notify: Awaited<ReturnType<typeof sendFolhaNotifyEmail>> | null
}> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (!canTransitionFolhaStatus(period.status, args.status)) {
    throw new Error(`Transição inválida: ${period.status} → ${args.status}`)
  }
  if (
    (args.status === 'ready_for_review' || args.status === 'approved') &&
    period.lines.length === 0
  ) {
    throw new Error('Rascunho vazio — atualize a partir do 8123 antes')
  }

  const updated = await updateFolhaPeriodStatus({
    id: args.periodId,
    status: args.status,
    actor: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao atualizar status')
  const draft = periodRowToDraft(args.panel, updated)

  let notify: Awaited<ReturnType<typeof sendFolhaNotifyEmail>> | null = null
  if (args.status === 'approved' && args.notifyOnApprove !== false) {
    notify = await sendFolhaNotifyEmail({
      draft,
      status: args.status,
      actor: args.actor,
    })
  }

  return { draft, period: updated, notify }
}

/** Aplica DARF/DAS/mensalidade na linha (Q1); só preenche campo ainda null. */
export async function applyFolhaTaxParsedToPeriod(
  panel: RomPanelId,
  args: {
    periodId: string
    kind: ReturnType<typeof parseFolhaTaxEmail>['kind']
    amount: number | null
    professionalName: string | null
    /** 14 dígitos ou máscara; prioridade sobre o nome. */
    cnpj?: string | null
    actor?: string | null
  },
): Promise<{ applied: boolean; period: FolhaPeriodRow }> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  const extrasKey = taxKindToExtrasKey(args.kind)
  const quinzena = parseFolhaPeriodId(args.periodId)
  const applyTax = quinzena ? acceptsFolhaTaxExtras(quinzena.half) : period.half === 1
  if (
    !extrasKey ||
    args.amount == null ||
    (!args.professionalName && !args.cnpj) ||
    !applyTax
  ) {
    return { applied: false, period }
  }
  const hitName = resolveFolhaTaxLineName({
    lineNames: period.lines.map((l) => l.name),
    professionalName: args.professionalName,
    cnpj: args.cnpj,
  })
  const hit = hitName ? period.lines.find((l) => l.name === hitName) : null
  if (!hit) return { applied: false, period }
  const existing = hit.folha_extras[extrasKey]
  if (existing != null) return { applied: false, period }
  const patched = await patchFolhaLine(panel, {
    periodId: args.periodId,
    professionalName: hit.name,
    extras: { [extrasKey]: args.amount },
    actor: args.actor,
  })
  return { applied: true, period: patched.period }
}

export async function ingestFolhaTaxEmail(
  panel: RomPanelId,
  args: {
    periodId: string
    subject?: string | null
    body: string
    filenames?: string[] | null
    source?: string
    actor?: string | null
    applyToLine?: boolean
  },
): Promise<{
  parsed: ReturnType<typeof parseFolhaTaxEmail>
  documentId: number
  draft: FolhaDraft
  period: FolhaPeriodRow
  applied: boolean
}> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')

  const parsed = parseFolhaTaxEmail({
    subject: args.subject,
    body: args.body,
    filenames: args.filenames,
  })
  const doc = await insertFolhaTaxDocument({
    periodId: args.periodId,
    kind: parsed.kind,
    professionalName: parsed.professional_name,
    amount: parsed.amount,
    subject: args.subject,
    body: args.body,
    source: args.source ?? 'paste',
  })

  let applied = false
  let current = period
  if (args.applyToLine !== false) {
    const result = await applyFolhaTaxParsedToPeriod(panel, {
      periodId: args.periodId,
      kind: parsed.kind,
      amount: parsed.amount,
      professionalName: parsed.professional_name,
      cnpj: parsed.cnpj,
      actor: args.actor,
    })
    current = result.period
    applied = result.applied
  }

  return {
    parsed,
    documentId: doc.id,
    draft: periodRowToDraft(panel, current),
    period: current,
    applied,
  }
}
