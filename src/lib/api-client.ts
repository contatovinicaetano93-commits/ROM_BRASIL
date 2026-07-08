/** Fetch autenticado — envia cookie de sessão em todas as chamadas internas. */
export function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, { ...init, credentials: 'include' })
}
