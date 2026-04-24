import { CountryCode, DocumentRecordType, DocumentType, PersonType } from '../app/types';

type CountryDocumentSlot = {
  label: string;
};

export type PersonOnboardingCopy = {
  personType: PersonType;
  personTypeLabel: string;
  personTypeDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroButton: string;
  documentsIntro: string;
  documentOrder: DocumentType[];
  documents: Partial<Record<DocumentRecordType, CountryDocumentSlot>>;
  representativePrimaryTitle?: string;
  representativeSecondaryTitle?: string;
  representativeSectionTitle?: string;
  representativeSectionDescription?: string;
  addSecondRepresentativeLabel?: string;
  removeSecondRepresentativeLabel?: string;
  reviewRepresentativePrimaryLabel?: string;
  reviewRepresentativeSecondaryLabel?: string;
};

export type CountryOnboardingCopy = {
  code: CountryCode;
  name: string;
  flag: string;
  heroEyebrow: string;
  personTypes: Record<PersonType, PersonOnboardingCopy>;
};

export const ONBOARDING_COUNTRIES: Record<CountryCode, CountryOnboardingCopy> = {
  ve: {
    code: 've',
    name: 'Venezuela',
    flag: '🇻🇪',
    heroEyebrow: 'DANACONNECT VENEZUELA',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona juridica',
        personTypeDescription: 'Onboarding para empresas o sociedades con representantes legales.',
        heroHeadline: 'Portal de onboarding para empresas en Venezuela.',
        heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en Venezuela.',
        heroButton: 'Continuar con persona juridica',
        documentsIntro: 'Cargue los documentos requeridos para continuar con el onboarding de persona juridica.',
        documentOrder: ['rif', 'registroMercantil'],
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
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Portal de onboarding para personas naturales en Venezuela.',
        heroSubheadline: 'Cargue su documentacion personal en un flujo guiado, simple y validado para Venezuela.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el RIF y la cédula requeridos para completar el onboarding de persona natural.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'RIF' },
          documentoIdentidad: { label: 'Cédula de Identidad' }
        }
      }
    }
  },
  pe: {
    code: 'pe',
    name: 'Perú',
    flag: '🇵🇪',
    heroEyebrow: 'DANACONNECT PERU',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona juridica',
        personTypeDescription: 'Onboarding para empresas con vigencia de poder y representantes legales.',
        heroHeadline: 'Onboarding documental para empresas en Peru.',
        heroSubheadline: 'Mantenga el flujo guiado de DanaConnect, adaptado a los requisitos documentales y de identificacion de Peru.',
        heroButton: 'Continuar con persona juridica',
        documentsIntro: 'Cargue la documentacion requerida para completar el onboarding de persona juridica en Peru.',
        documentOrder: ['rif', 'registroMercantil'],
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
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Onboarding documental para personas naturales en Peru.',
        heroSubheadline: 'Complete el flujo personal de DanaConnect con los documentos requeridos para Peru.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el RUC y el documento de identidad requeridos para completar el onboarding de persona natural en Peru.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'RUC' },
          documentoIdentidad: { label: 'DNI o CE' }
        }
      }
    }
  },
  bo: {
    code: 'bo',
    name: 'Bolivia',
    flag: '🇧🇴',
    heroEyebrow: 'DANACONNECT BOLIVIA',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona juridica',
        personTypeDescription: 'Onboarding para empresas con matricula y representantes legales.',
        heroHeadline: 'Onboarding documental para empresas en Bolivia.',
        heroSubheadline: 'Mantenga el flujo guiado de DanaConnect, adaptado a los requisitos documentales y de identificacion empresarial de Bolivia.',
        heroButton: 'Continuar con persona juridica',
        documentsIntro: 'Cargue la documentacion requerida para completar el onboarding de persona juridica en Bolivia.',
        documentOrder: ['rif', 'registroMercantil'],
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
      },
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Onboarding documental para personas naturales en Bolivia.',
        heroSubheadline: 'Complete el flujo personal de DanaConnect con los recaudos requeridos para Bolivia.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el NIT y la cédula de identidad requeridos para completar el onboarding de persona natural en Bolivia.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'NIT' },
          documentoIdentidad: { label: 'Cédula de Identidad' }
        }
      }
    }
  }
};

export function getCountryConfig(country: CountryCode) {
  return ONBOARDING_COUNTRIES[country];
}

export function getFlowConfig(country: CountryCode, personType: PersonType) {
  return getCountryConfig(country).personTypes[personType];
}

export function getDocumentLabel(country: CountryCode, personType: PersonType, type: DocumentRecordType) {
  return getFlowConfig(country, personType).documents[type]?.label ?? type;
}

export function getDocumentOrder(country: CountryCode, personType: PersonType) {
  return getFlowConfig(country, personType).documentOrder;
}

export function requiresRepresentatives(country: CountryCode, personType: PersonType) {
  return personType === 'juridica' && Boolean(getFlowConfig(country, personType).documents.cedulaRepresentante);
}
