import type { SeedPreset } from '@/lib/seed/types'

export const iguatemiSeedPreset: SeedPreset = {
  id: 'iguatemi',
  label: 'ROM CLUB IGUATEMI',
  contacts: [
    {
      name: 'Beatriz Mendonça',
      phone: '+5511998812345',
      email: 'beatriz.m@demo.com',
      channel: 'whatsapp',
      source: 'seed-iguatemi',
      status: 'em_atendimento',
      notes: 'Cliente VIP Iguatemi — prefere horário pós-almoço.',
      services: [
        { name: 'Corte premium', category: 'corte', cadenceDays: 35 },
        { name: 'Glossing', category: 'tratamento', cadenceDays: 45, dueSoon: true },
      ],
    },
    {
      name: 'Rafael Costa',
      phone: '+5511998723456',
      channel: 'avec',
      source: 'seed-iguatemi',
      status: 'agendado',
      avecClientId: 'seed-iguatemi-002',
      services: [
        { name: 'Barbearia executiva', category: 'corte', cadenceDays: 18, scheduleTomorrow: true },
      ],
    },
    {
      name: 'Isabela Nogueira',
      phone: '+5511998634567',
      channel: 'instagram',
      source: 'seed-iguatemi',
      status: 'novo',
      notes: 'Veio pelo Instagram — interesse em nail art.',
      services: [],
    },
    {
      name: 'Carolina Duarte',
      phone: '+5511998545678',
      channel: 'whatsapp',
      source: 'seed-iguatemi',
      status: 'convertido',
      services: [
        { name: 'Coloração balayage', category: 'coloracao', cadenceDays: 60 },
        { name: 'Manicure spa', category: 'bem_estar', cadenceDays: 21, overdue: true },
      ],
    },
    {
      name: 'Thiago Ribeiro',
      phone: '+5511998456789',
      channel: 'manual',
      source: 'seed-iguatemi',
      status: 'em_atendimento',
      notes: 'Estacionamento Iguatemi — validar ticket na recepção.',
      services: [
        { name: 'Tratamento capilar keratin', category: 'tratamento', cadenceDays: 120 },
      ],
    },
    {
      name: 'Valentina Prado',
      phone: '+5511998367890',
      channel: 'telegram',
      source: 'seed-iguatemi',
      status: 'agendado',
      services: [
        { name: 'Design de sobrancelha', category: 'outro', cadenceDays: 28, scheduleToday: true },
        { name: 'Hidratação profunda', category: 'tratamento', cadenceDays: 30 },
      ],
    },
  ],
}
