/**
 * Detecta bloqueio de cota Postgres (transferência / tamanho) — sync deve skipar, não 500.
 * BR e IG usam Supabase; só o Cérebro usa Neon.
 * Mantém detecção de strings legacy do Neon (402, "data transfer quota") —
 * e mensagens genéricas de quota/disco.
 */

export function isDbQuotaError(e: unknown): boolean {
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

export function dbQuotaUserMessage(e?: unknown): string {
  const msg = e instanceof Error ? e.message : e ? String(e) : ''
  const lower = msg.toLowerCase()
  if (
    lower.includes('project size limit') ||
    lower.includes('could not extend file') ||
    lower.includes('disk full') ||
    lower.includes('no space left')
  ) {
    return 'Banco sem espaço (limite de tamanho). Purgue snapshots em /api/avec/purge-snapshots ou faça upgrade do plano Supabase.'
  }
  return 'Banco sem cota de transferência (HTTP 402). Pare crons agressivos, purge snapshots ou faça upgrade do plano Supabase.'
}
