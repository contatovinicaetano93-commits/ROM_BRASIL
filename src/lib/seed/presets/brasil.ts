import type { SeedPreset } from '@/lib/seed/types'

export const brasilSeedPreset: SeedPreset = {
  id: 'brasil',
  label: 'ROM CLUB BRASIL',
  contacts: [
    {
      name: 'Mariana Oliveira',
      phone: '+5511987654321',
      email: 'mariana@demo.com',
      channel: 'whatsapp',
      source: 'seed-brasil',
      status: 'em_atendimento',
      notes: 'Quer coloração nas próximas semanas.',
      services: [
        { name: 'Corte feminino', category: 'corte', cadenceDays: 45 },
        { name: 'Hidratação', category: 'tratamento', cadenceDays: 30, overdue: true },
      ],
    },
    {
      name: 'Roberto Alves',
      phone: '+5511976543210',
      channel: 'manual',
      source: 'seed-brasil',
      status: 'agendado',
      services: [
        { name: 'Corte masculino', category: 'corte', cadenceDays: 21, scheduleTomorrow: true },
      ],
    },
    {
      name: 'Fernanda Lima',
      phone: '+5511965432109',
      channel: 'telegram',
      source: 'seed-brasil',
      status: 'novo',
      notes: 'Primeiro contato hoje.',
      services: [],
    },
    {
      name: 'Patricia Souza',
      phone: '+5511954321098',
      channel: 'avec',
      source: 'seed-brasil',
      status: 'convertido',
      avecClientId: 'seed-brasil-004',
      services: [
        { name: 'Escova progressiva', category: 'tratamento', cadenceDays: 90 },
        { name: 'Manutenção raiz', category: 'coloracao', cadenceDays: 45, dueSoon: true },
      ],
    },
    {
      name: 'Lucas Ferreira',
      phone: '+5511943210987',
      channel: 'instagram',
      source: 'seed-brasil',
      status: 'perdido',
      services: [{ name: 'Barba', category: 'corte', cadenceDays: 14 }],
    },
    {
      name: 'Camila Rocha',
      phone: '+5511932109876',
      channel: 'whatsapp',
      source: 'seed-brasil',
      status: 'em_atendimento',
      services: [
        { name: 'Massagem relaxante', category: 'bem_estar', cadenceDays: 30, scheduleToday: true },
      ],
    },
  ],
}
