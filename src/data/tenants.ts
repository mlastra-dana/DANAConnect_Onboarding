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
    name: 'Example Company',
    logoUrl: '/brand/example_brand_kit_2/logos/svg/example_company_color.svg',
    brandColor: '#4B16B6',
    slaHours: 8,
    whatsAppNumber: '584128194750',
    phone: '0212.819.47.50'
  },
  'demo-002': {
    companyId: 'demo-002',
    name: 'Example Insurance',
    logoUrl: '/brand/example_brand_kit_2/logos/svg/example_insurance_color.svg',
    brandColor: '#4B16B6',
    slaHours: 8,
    whatsAppNumber: '584120002222',
    phone: '0212.819.47.50'
  },
  'demo-003': {
    companyId: 'demo-003',
    name: 'Example Banking',
    logoUrl: '/brand/example_brand_kit_2/logos/svg/example_banking_color.svg',
    brandColor: '#4B16B6',
    slaHours: 12,
    whatsAppNumber: '584120003333',
    phone: '0212.819.47.50'
  }
};

export function getTenantByCompanyId(companyId?: string | null): TenantConfig | null {
  if (!companyId) return null;
  return tenantsRegistry[companyId] ?? null;
}
