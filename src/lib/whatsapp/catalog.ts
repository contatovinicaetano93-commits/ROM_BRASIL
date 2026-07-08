/** Catálogo base do salão — a IA usa isso e não inventa serviços fora da lista. */
export const SALON_CATALOG = [
  { name: 'Corte de cabelo', category: 'corte' },
  { name: 'Hidratação / nutrição capilar', category: 'tratamento' },
  { name: 'Coloração', category: 'coloracao' },
  { name: 'Mechas / luzes', category: 'coloracao' },
  { name: 'Escova / finalização', category: 'outro' },
  { name: 'Massagem nos pés', category: 'bem_estar' },
  { name: 'Design de sobrancelha', category: 'outro' },
] as const

export const SALON_HOURS = 'Segunda a sábado, 9h às 19h (confirme horário com a equipe).'

export function formatCatalogForPrompt() {
  const names = SALON_CATALOG.map((s) => s.name).join(', ')
  return `Serviços: ${names}. Horário: ${SALON_HOURS} Valores: informar que dependem do serviço e combinar com atendente — não inventar preços.`
}
