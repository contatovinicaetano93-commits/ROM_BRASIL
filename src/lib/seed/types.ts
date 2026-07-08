import type { ContactStatus } from '@/lib/contacts'

export interface SeedServiceSpec {
  name: string
  category: 'corte' | 'coloracao' | 'tratamento' | 'bem_estar' | 'outro'
  cadenceDays: number
  overdue?: boolean
  dueSoon?: boolean
  scheduleTomorrow?: boolean
  scheduleToday?: boolean
}

export interface SeedContactSpec {
  name: string
  phone: string
  email?: string
  channel: 'whatsapp' | 'telegram' | 'avec' | 'instagram' | 'manual'
  source: string
  status: ContactStatus
  notes?: string
  avecClientId?: string
  services: SeedServiceSpec[]
}

export interface SeedPreset {
  id: 'brasil' | 'iguatemi'
  label: string
  contacts: SeedContactSpec[]
}

export interface SeedResult {
  preset: 'brasil' | 'iguatemi'
  contacts: number
  services: number
  message: string
}
