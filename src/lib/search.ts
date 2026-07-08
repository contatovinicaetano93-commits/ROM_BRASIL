/** Remove acentos e caracteres que o usuário copia da ajuda (<nome>, etc.). */
export function normalizeSearchText(input: string) {
  return input
    .trim()
    .replace(/^[<\[({«"']+|[>\])}»"']+$/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}
