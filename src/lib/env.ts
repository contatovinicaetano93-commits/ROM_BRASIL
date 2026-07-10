/**
 * Produção "de verdade" — não confundir com build de Preview do Vercel.
 * NODE_ENV já vem 'production' tanto em Preview quanto em Production (é assim
 * que o Next.js builda); VERCEL_ENV é quem realmente distingue os dois.
 * Fora da Vercel (dev local, outro host), cai no fallback via NODE_ENV.
 */
export function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return process.env.NODE_ENV === 'production'
}
