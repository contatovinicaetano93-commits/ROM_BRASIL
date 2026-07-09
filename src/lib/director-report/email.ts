import type { DirectorReport } from './types'
import { reactivationCsv, returnCsv, revenueCsv } from './csv'
import { reportSubject, slugPeriod } from './period'
import { formatCurrency, formatPercent } from '@/lib/salon/format'

export function getDirectorReportRecipients() {
  const raw =
    process.env.DIRECTOR_REPORT_EMAIL?.trim() ||
    process.env.DIRECTOR_REPORT_TO?.trim() ||
    ''
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

export function isDirectorEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && getDirectorReportRecipients().length)
}

function buildHtml(report: DirectorReport) {
  const topFat = [...report.revenue_blocks]
    .map((b) => {
      const m = b.months.find((x) => x.month === b.selected_month) ?? b.months.at(-1)
      return { name: b.professional.name, revenue: m?.revenue ?? 0, ticket: m?.ticket_avg ?? 0 }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  const topReturn = report.return_blocks
    .map((b) => {
      const q = b.quarters.find((x) => x.quarter === b.selected_quarter)
      return { name: b.professional.name, rate: q?.return_rate ?? 0, n: b.reactivation.length }
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  const fatRows = topFat
    .map(
      (r) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.revenue)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.ticket)}</td></tr>`
    )
    .join('')

  const retRows = topReturn
    .map(
      (r) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatPercent(r.rate, 1)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.n}</td></tr>`
    )
    .join('')

  const generated = new Date(report.generated_at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  })

  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <h1 style="font-size:20px;margin:0 0 8px">ROM CLUB BRASIL · Relatório diretoria</h1>
  <p style="margin:0 0 4px;font-size:15px"><b>Período:</b> ${report.period.label}</p>
  <p style="margin:0 0 16px;font-size:14px"><b>Data de referência:</b> ${report.period.reference_date}</p>
  <p style="color:#666;margin:0 0 16px;font-size:13px">Gerado em ${generated} · Avec 0011 + 0021 · fonte ${report.source}</p>
  <p><b>${report.summary.professionals}</b> profissionais · retorno médio <b>${formatPercent(report.summary.avg_return_rate, 1)}</b> · fat. mês <b>${formatCurrency(report.summary.total_revenue_selected_month)}</b> · ticket <b>${formatCurrency(report.summary.avg_ticket_selected_month)}</b></p>
  <h2 style="font-size:16px;margin:24px 0 8px">0021 · Faturamento e ticket — ${report.period.selected_month}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="text-align:left;color:#666"><th style="padding:6px 10px">Profissional</th><th style="padding:6px 10px">Faturamento</th><th style="padding:6px 10px">Ticket</th></tr></thead><tbody>${fatRows}</tbody></table>
  <h2 style="font-size:16px;margin:24px 0 8px">0011 · Retorno — ${report.period.selected_quarter} vs ${report.period.compare_quarter}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="text-align:left;color:#666"><th style="padding:6px 10px">Profissional</th><th style="padding:6px 10px">Taxa retorno</th><th style="padding:6px 10px">Clientes na lista</th></tr></thead><tbody>${retRows}</tbody></table>
  <p style="margin-top:24px;font-size:12px;color:#666">Anexos com a data do período no nome do arquivo. Lista 0011 no formato Avec — Cliente / E-mail / Telefone / Celular / Sexo / Data última comanda.</p>
  <p style="font-size:12px;color:#666">Painel: <a href="https://rom-club.vercel.app/admin/relatorio-diretoria">rom-club.vercel.app/admin/relatorio-diretoria</a></p>
  </body></html>`
}

function toBase64(text: string) {
  return Buffer.from(text, 'utf8').toString('base64')
}

export async function sendDirectorReportEmail(report: DirectorReport): Promise<{
  ok: boolean
  to: string[]
  id?: string
  error?: string
  subject?: string
}> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = getDirectorReportRecipients()
  const from =
    process.env.DIRECTOR_REPORT_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'ROM CLUB BRASIL <onboarding@resend.dev>'

  if (!apiKey) {
    return { ok: false, to, error: 'RESEND_API_KEY não configurado' }
  }
  if (to.length === 0) {
    return { ok: false, to, error: 'DIRECTOR_REPORT_EMAIL não configurado' }
  }

  const subject = reportSubject(report)
  const slug = slugPeriod(report)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: buildHtml(report),
      attachments: [
        {
          filename: `faturamento-ticket_${slug}.csv`,
          content: toBase64('\uFEFF' + revenueCsv(report)),
        },
        {
          filename: `retorno-trimestre_${slug}.csv`,
          content: toBase64('\uFEFF' + returnCsv(report)),
        },
        {
          filename: `0011-lista-clientes_${slug}.csv`,
          content: toBase64('\uFEFF' + reactivationCsv(report)),
        },
      ],
    }),
  })

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok) {
    return {
      ok: false,
      to,
      error: json.message ?? `Resend HTTP ${res.status}`,
      subject,
    }
  }
  return { ok: true, to, id: json.id, subject }
}
