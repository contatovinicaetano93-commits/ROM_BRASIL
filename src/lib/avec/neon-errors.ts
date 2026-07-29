/** Detecta bloqueio de cota Postgres (transferência / tamanho) — sync deve skipar, não 500. */

export function isNeonQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (
    lower.includes('data transfer quota') ||
    lower.includes('project size limit') ||
    lower.includes('could not extend file') ||
    lower.includes('disk full') ||
    lower.includes('no space left')
  ) {
    return true
  }
  // 402 Payment Required / HTTP status 402 (com ou sem "neon"/"quota"/"supabase" no texto)
  if (
    /\b402\b/.test(lower) &&
    (lower.includes('payment required') ||
      lower.includes('quota') ||
      lower.includes('neon') ||
      lower.includes('supabase'))
  ) {
    return true
  }
  if (lower.includes('http status 402')) return true
  return false
}

export function neonQuotaUserMessage(e?: unknown): string {
  const msg = e instanceof Error ? e.message : e ? String(e) : ''
  const lower = msg.toLowerCase()
  if (
    lower.includes('project size limit') ||
    lower.includes('could not extend file') ||
    lower.includes('disk full') ||
    lower.includes('no space left')
  ) {
    return 'Banco sem espaço (limite de tamanho). Purgue snapshots em /api/avec/purge-snapshots ou faça upgrade do plano.'
  }
  return 'Banco sem cota de transferência (HTTP 402). Pare crons agressivos, purge snapshots ou faça upgrade.'
}
