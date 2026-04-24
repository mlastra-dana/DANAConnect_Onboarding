import { CountryCode, DocumentRecordType, RequiredDocumentType } from '../app/types';

type CountryDocumentSlot = {
  label: string;
  title?: string;
  sectionTitle?: string;
  sectionDescription?: string;
};

export type CountryOnboardingCopy = {
  code: CountryCode;
  name: string;
  flag: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroButton: string;
  documentsIntro: string;
  documents: Record<DocumentRecordType, CountryDocumentSlot>;
  representativePrimaryTitle: string;
  representativeSecondaryTitle: string;
  representativeSectionTitle: string;
  representativeSectionDescription: string;
  addSecondRepresentativeLabel: string;
  removeSecondRepresentativeLabel: string;
  reviewRepresentativePrimaryLabel: string;
  reviewRepresentativeSecondaryLabel: string;
};

export const ONBOARDING_COUNTRIES: Record<CountryCode, CountryOnboardingCopy> = {
  ve: {
    code: 've',
    name: 'Venezuela',
    flag: '🇻🇪',
    heroEyebrow: 'DANACONNECT VENEZUELA',
    heroHeadline: 'Portal de onboarding y carga de documentos.',
    heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en Venezuela.',
    heroButton: 'Continuar con Venezuela',
    documentsIntro: 'Cargue los documentos requeridos para continuar.',
    documents: {
      rif: { label: 'RIF' },
      registroMercantil: { label: 'Registro Mercantil' },
      cedulaRepresentante: { label: 'Cédula del Representante' }
    },
    representativePrimaryTitle: 'Cédula del Representante (Obligatorio)',
    representativeSecondaryTitle: 'Cédula del segundo representante (Opcional)',
    representativeSectionTitle: 'Representantes legales',
    representativeSectionDescription: 'Cargue la cédula del representante principal. Puede agregar un segundo representante si aplica.',
    addSecondRepresentativeLabel: 'Agregar segundo representante',
    removeSecondRepresentativeLabel: 'Quitar segundo representante',
    reviewRepresentativePrimaryLabel: 'Cédula del Representante 1',
    reviewRepresentativeSecondaryLabel: 'Cédula del Representante 2'
  },
  pe: {
    code: 'pe',
    name: 'Perú',
    flag: '🇵🇪',
    heroEyebrow: 'DANACONNECT PERU',
    heroHeadline: 'Onboarding documental para empresas en Peru.',
    heroSubheadline: 'Mantenga el mismo flujo guiado de DanaConnect, adaptado a los requisitos documentales y de identificacion de Peru.',
    heroButton: 'Continuar con Peru',
    documentsIntro: 'Cargue la documentacion requerida para completar el onboarding de Peru.',
    documents: {
      rif: { label: 'RUC' },
      registroMercantil: { label: 'Vigencia de Poder o Partida Registral' },
      cedulaRepresentante: { label: 'DNI o CE del Representante' }
    },
    representativePrimaryTitle: 'DNI o CE del Representante (Obligatorio)',
    representativeSecondaryTitle: 'DNI o CE del segundo representante (Opcional)',
    representativeSectionTitle: 'Representantes legales',
    representativeSectionDescription: 'Cargue el DNI o Carnet de Extranjeria del representante principal. Puede agregar un segundo representante si aplica.',
    addSecondRepresentativeLabel: 'Agregar segundo representante',
    removeSecondRepresentativeLabel: 'Quitar segundo representante',
    reviewRepresentativePrimaryLabel: 'DNI o CE del Representante 1',
    reviewRepresentativeSecondaryLabel: 'DNI o CE del Representante 2'
  },
  bo: {
    code: 'bo',
    name: 'Bolivia',
    flag: '🇧🇴',
    heroEyebrow: 'DANACONNECT BOLIVIA',
    heroHeadline: 'Onboarding documental para empresas en Bolivia.',
    heroSubheadline: 'Mantenga el flujo guiado de DanaConnect, adaptado a los requisitos documentales y de identificacion empresarial de Bolivia.',
    heroButton: 'Continuar con Bolivia',
    documentsIntro: 'Cargue la documentacion requerida para completar el onboarding de Bolivia.',
    documents: {
      rif: { label: 'NIT' },
      registroMercantil: { label: 'Matricula de Comercio o Testimonio de Constitucion' },
      cedulaRepresentante: { label: 'CI del Representante' }
    },
    representativePrimaryTitle: 'CI del Representante (Obligatorio)',
    representativeSecondaryTitle: 'CI del segundo representante (Opcional)',
    representativeSectionTitle: 'Representantes legales',
    representativeSectionDescription: 'Cargue la cedula de identidad del representante principal. Puede agregar un segundo representante si aplica.',
    addSecondRepresentativeLabel: 'Agregar segundo representante',
    removeSecondRepresentativeLabel: 'Quitar segundo representante',
    reviewRepresentativePrimaryLabel: 'CI del Representante 1',
    reviewRepresentativeSecondaryLabel: 'CI del Representante 2'
  }
};

export function getCountryConfig(country: CountryCode) {
  return ONBOARDING_COUNTRIES[country];
}

export function getDocumentLabel(country: CountryCode, type: DocumentRecordType) {
  return getCountryConfig(country).documents[type].label;
}

export function getRequiredDocumentLabels(country: CountryCode): Record<RequiredDocumentType, string> {
  return {
    rif: getDocumentLabel(country, 'rif'),
    registroMercantil: getDocumentLabel(country, 'registroMercantil')
  };
}
