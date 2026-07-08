export const SERVICE_CATEGORIES = ['corte', 'tratamento', 'coloracao', 'bem_estar', 'produto', 'outro'] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<string, string> = {
  corte: 'Corte',
  tratamento: 'Tratamento',
  coloracao: 'Coloração',
  bem_estar: 'Bem-estar',
  produto: 'Produto',
  outro: 'Outro',
}

export const DAY_MS = 86_400_000
