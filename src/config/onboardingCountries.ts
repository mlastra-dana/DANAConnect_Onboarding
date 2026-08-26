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
  optionalDocumentOrder?: DocumentType[];
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
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona jurídica',
        personTypeDescription: 'Onboarding para empresas o sociedades con representantes legales.',
        heroHeadline: 'Portal de onboarding para empresas en Venezuela.',
        heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en Venezuela.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue los documentos requeridos para continuar.',
        documentOrder: ['rif', 'registroMercantil'],
        optionalDocumentOrder: ['actaDesignacionAutoridades'],
        documents: {
          rif: { label: 'RIF' },
          registroMercantil: { label: 'Registro Mercantil' },
          actaDesignacionAutoridades: { label: 'Acta de Asamblea (Opcional)' },
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
        heroSubheadline: 'Cargue su documentación personal en un flujo guiado, simple y validado para Venezuela.',
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
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona jurídica',
        personTypeDescription: 'Onboarding para empresas con vigencia de poder y representantes legales.',
        heroHeadline: 'Onboarding documental para empresas en Perú.',
        heroSubheadline: 'Mantenga el flujo guiado de Example Company, adaptado a los requisitos documentales y de identificación de Perú.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue la documentación requerida para completar el onboarding de persona jurídica en Perú.',
        documentOrder: ['rif', 'registroMercantil'],
        documents: {
          rif: { label: 'RUC' },
          registroMercantil: { label: 'Vigencia de Poder o Partida Registral' },
          cedulaRepresentante: { label: 'DNI o CE del Representante' }
        },
        representativePrimaryTitle: 'DNI o CE del Representante (Obligatorio)',
        representativeSecondaryTitle: 'DNI o CE del segundo representante (Opcional)',
        representativeSectionTitle: 'Representantes legales',
        representativeSectionDescription: 'Cargue el DNI o Carnet de Extranjería del representante principal. Puede agregar un segundo representante si aplica.',
        addSecondRepresentativeLabel: 'Agregar segundo representante',
        removeSecondRepresentativeLabel: 'Quitar segundo representante',
        reviewRepresentativePrimaryLabel: 'DNI o CE del Representante 1',
        reviewRepresentativeSecondaryLabel: 'DNI o CE del Representante 2'
      },
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Onboarding documental para personas naturales en Perú.',
        heroSubheadline: 'Complete el flujo personal de Example Company con los documentos requeridos para Perú.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el RUC y el documento de identidad requeridos para completar el onboarding de persona natural en Perú.',
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
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona jurídica',
        personTypeDescription: 'Onboarding para empresas con matrícula y representantes legales.',
        heroHeadline: 'Onboarding documental para empresas en Bolivia.',
        heroSubheadline: 'Mantenga el flujo guiado de Example Company, adaptado a los requisitos documentales y de identificación empresarial de Bolivia.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue la documentación requerida para completar el onboarding de persona jurídica en Bolivia.',
        documentOrder: ['rif', 'registroMercantil'],
        documents: {
          rif: { label: 'NIT' },
          registroMercantil: { label: 'Matrícula de Comercio o Testimonio de Constitución' },
          cedulaRepresentante: { label: 'CI del Representante' }
        },
        representativePrimaryTitle: 'CI del Representante (Obligatorio)',
        representativeSecondaryTitle: 'CI del segundo representante (Opcional)',
        representativeSectionTitle: 'Representantes legales',
        representativeSectionDescription: 'Cargue la cédula de identidad del representante principal. Puede agregar un segundo representante si aplica.',
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
        heroSubheadline: 'Complete el flujo personal de Example Company con los recaudos requeridos para Bolivia.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el NIT y la cédula de identidad requeridos para completar el onboarding de persona natural en Bolivia.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'NIT' },
          documentoIdentidad: { label: 'Cédula de Identidad' }
        }
      }
    }
  },
  mx: {
    code: 'mx',
    name: 'México',
    flag: '🇲🇽',
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona moral',
        personTypeDescription: 'Onboarding para empresas o sociedades con representantes legales.',
        heroHeadline: 'Portal de onboarding para empresas en México.',
        heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en México.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue los documentos requeridos para continuar.',
        documentOrder: ['documentoFiscal', 'documentoConstitucion', 'facultadesRepresentante', 'documentoRepresentante'],
        documents: {
          documentoFiscal: { label: 'Constancia de Situación Fiscal' },
          documentoConstitucion: { label: 'Acta Constitutiva' },
          facultadesRepresentante: { label: 'Poder Notarial o facultades del representante legal' },
          documentoRepresentante: { label: 'Identificación oficial vigente del representante legal' },
          comprobanteDomicilio: { label: 'Comprobante de domicilio fiscal' }
        }
      },
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Portal de onboarding para personas naturales en México.',
        heroSubheadline: 'Cargue su documentación personal en un flujo guiado, simple y validado para México.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el RFC y su documento de identidad para completar el onboarding de persona natural.',
        documentOrder: ['documentoFiscal', 'documentoIdentidad'],
        documents: {
          documentoFiscal: { label: 'Constancia de Situación Fiscal' },
          documentoIdentidad: { label: 'Identificación oficial vigente' },
          comprobanteDomicilio: { label: 'Comprobante de domicilio fiscal' }
        }
      }
    }
  },
  ar: {
    code: 'ar',
    name: 'Argentina',
    flag: '🇦🇷',
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona jurídica',
        personTypeDescription: 'Onboarding para empresas o sociedades con representantes legales.',
        heroHeadline: 'Portal de onboarding para empresas en Argentina.',
        heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en Argentina.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue los documentos requeridos para continuar.',
        documentOrder: ['rif', 'registroMercantil', 'actaDesignacionAutoridades'],
        documents: {
          rif: { label: 'Constancia de CUIT' },
          registroMercantil: { label: 'Estatuto / Contrato social o Instrumento constitutivo' },
          actaDesignacionAutoridades: { label: 'Acta de designación de autoridades' },
          cedulaRepresentante: { label: 'DNI del Representante' }
        },
        representativePrimaryTitle: 'DNI del Representante (Obligatorio)',
        representativeSecondaryTitle: 'DNI del segundo representante (Opcional)',
        representativeSectionTitle: 'Representantes legales',
        representativeSectionDescription: 'Cargue el DNI del representante principal. Puede agregar un segundo representante si aplica.',
        addSecondRepresentativeLabel: 'Agregar segundo representante',
        removeSecondRepresentativeLabel: 'Quitar segundo representante',
        reviewRepresentativePrimaryLabel: 'DNI del Representante 1',
        reviewRepresentativeSecondaryLabel: 'DNI del Representante 2'
      },
      natural: {
        personType: 'natural',
        personTypeLabel: 'Persona natural',
        personTypeDescription: 'Onboarding individual para personas naturales.',
        heroHeadline: 'Portal de onboarding para personas naturales en Argentina.',
        heroSubheadline: 'Cargue su documentación personal en un flujo guiado, simple y validado para Argentina.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el CUIT y el DNI requeridos para completar el onboarding de persona natural.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'CUIT' },
          documentoIdentidad: { label: 'DNI' }
        }
      }
    }
  },
  do: {
    code: 'do',
    name: 'República Dominicana',
    flag: '🇩🇴',
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Persona jurídica',
        personTypeDescription: 'Onboarding para empresas o sociedades con representantes legales.',
        heroHeadline: 'Portal de onboarding para empresas en República Dominicana.',
        heroSubheadline: 'Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa en República Dominicana.',
        heroButton: 'Continuar con persona jurídica',
        documentsIntro: 'Cargue los documentos requeridos para continuar.',
        documentOrder: ['rif', 'registroMercantil'],
        documents: {
          rif: { label: 'RNC' },
          registroMercantil: { label: 'Registro Mercantil o Acta Constitutiva' },
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
        heroHeadline: 'Portal de onboarding para personas naturales en República Dominicana.',
        heroSubheadline: 'Cargue su documentación personal en un flujo guiado, simple y validado para República Dominicana.',
        heroButton: 'Continuar con persona natural',
        documentsIntro: 'Cargue el RNC y la cédula requeridos para completar el onboarding de persona natural.',
        documentOrder: ['rif', 'documentoIdentidad'],
        documents: {
          rif: { label: 'RNC' },
          documentoIdentidad: { label: 'Cédula de Identidad' }
        }
      }
    }
  },
  usa: {
    code: 'usa',
    name: 'United States',
    flag: '🇺🇸',
    heroEyebrow: '',
    personTypes: {
      juridica: {
        personType: 'juridica',
        personTypeLabel: 'Business',
        personTypeDescription: 'Not available for the United States in this flow.',
        heroHeadline: 'Business onboarding portal for the United States.',
        heroSubheadline: '',
        heroButton: 'Continue',
        documentsIntro: 'This flow is not available for businesses in the United States.',
        documentOrder: [],
        documents: {}
      },
      natural: {
        personType: 'natural',
        personTypeLabel: 'Individual',
        personTypeDescription: 'Individual onboarding with a driver license.',
        heroHeadline: 'Individual onboarding portal for the United States.',
        heroSubheadline: 'Upload the front and back of your driver license in a guided validation flow.',
        heroButton: 'Continue as individual',
        documentsIntro: 'Upload the front and back of your driver license to complete onboarding.',
        documentOrder: ['licenciaConducirFrente', 'licenciaConducirReverso'],
        documents: {
          licenciaConducirFrente: { label: 'Driver license - front' },
          licenciaConducirReverso: { label: 'Driver license - back' }
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

export function getOptionalDocumentOrder(country: CountryCode, personType: PersonType) {
  return getFlowConfig(country, personType).optionalDocumentOrder ?? [];
}

export function requiresRepresentatives(country: CountryCode, personType: PersonType) {
  return personType === 'juridica' && Boolean(getFlowConfig(country, personType).documents.cedulaRepresentante);
}
