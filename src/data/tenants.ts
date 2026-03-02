export type TenantConfig = {
  companyId: string;
  name: string;
  logoUrl?: string;
  brandColor?: string;
  slaHours: number;
  whatsAppNumber: string;
  phone: string;
};

export const tenantsRegistry: Record<string, TenantConfig> = {
  'demo-001': {
    companyId: 'demo-001',
    name: 'Grupo Perfilab',
    logoUrl: '/perfilab-logo.svg',
    brandColor: '#F28C28',
    slaHours: 8,
    whatsAppNumber: '584128194750',
    phone: '0212.819.47.50'
  },
  'demo-002': {
    companyId: 'demo-002',
    name: 'Red Integral Preventiva C.A.',
    logoUrl: '/perfilab-logo.svg',
    brandColor: '#F28C28',
    slaHours: 8,
    whatsAppNumber: '584120002222',
    phone: '0212.819.47.50'
  },
  'demo-003': {
    companyId: 'demo-003',
    name: 'Servicios Médicos Delta',
    logoUrl: '/perfilab-logo.svg',
    brandColor: '#F28C28',
    slaHours: 12,
    whatsAppNumber: '584120003333',
    phone: '0212.819.47.50'
  }
};

export function getTenantByCompanyId(companyId?: string | null): TenantConfig | null {
  if (!companyId) return null;
  return tenantsRegistry[companyId] ?? null;
}
