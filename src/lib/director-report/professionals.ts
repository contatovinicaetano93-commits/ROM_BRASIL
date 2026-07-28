import { getRomPanelId } from '@/lib/brand'
import { BRASIL_DIRECTOR_PROFESSIONALS } from './professionals.brasil'
import { IGUATEMI_DIRECTOR_PROFESSIONALS } from './professionals.iguatemi'
import type { DirectorProfessional } from './types'

const ROSTERS: Record<string, DirectorProfessional[]> = {
  brasil: BRASIL_DIRECTOR_PROFESSIONALS,
  iguatemi: IGUATEMI_DIRECTOR_PROFESSIONALS,
}

/** Roles de atendimento no salão — usados no Relatório gerência (0011/0021). */
const FLOOR_ROLES = new Set<DirectorProfessional['role']>(['hairstylist', 'makeup'])

export function listDirectorProfessionals(activeOnly = true): DirectorProfessional[] {
  const roster = ROSTERS[getRomPanelId()] ?? []
  return roster.filter((p) => (activeOnly ? p.active : true))
}

/**
 * Portfólio do relatório gerência: só profissionais de piso (cabelo/maquiagem).
 * O roster Lake traz ~300+ ativos (adm, baru, marketing…) e quebrava o 0011
 * (payload gigante, tabela ilegível, match diluído).
 */
export function listDirectorReportProfessionals(activeOnly = true): DirectorProfessional[] {
  return listDirectorProfessionals(activeOnly).filter((p) => FLOOR_ROLES.has(p.role))
}
