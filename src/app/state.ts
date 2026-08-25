import { DocumentRecordType, DocumentType, OnboardingState, RepresentativeRecord } from './types';
import { TenantConfig } from '../data/tenants';

export const DOCUMENT_LABELS: Record<DocumentRecordType, string> = {
  rif: 'RIF',
  registroMercantil: 'Registro Mercantil',
  cedulaRepresentante: 'Cédula del Representante',
  documentoIdentidad: 'Documento de Identidad',
  documentoFiscal: 'Documento Fiscal',
  documentoConstitucion: 'Documento de Constitución',
  facultadesRepresentante: 'Facultades del Representante',
  documentoRepresentante: 'Documento del Representante',
  comprobanteDomicilio: 'Comprobante de Domicilio',
  actaDesignacionAutoridades: 'Acta de designación de autoridades',
  licenciaConducirFrente: 'Licencia de conducir - frente',
  licenciaConducirReverso: 'Licencia de conducir - reverso'
};

const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'rif',
  'registroMercantil',
  'cedulaRepresentante',
  'documentoIdentidad',
  'documentoFiscal',
  'documentoConstitucion',
  'facultadesRepresentante',
  'documentoRepresentante',
  'comprobanteDomicilio',
  'actaDesignacionAutoridades',
  'licenciaConducirFrente',
  'licenciaConducirReverso'
];

export function createEmptyDocument(type: DocumentRecordType) {
  return {
    type,
    validation: {
      status: 'pending' as const,
      checks: [],
      uiStatus: undefined,
      internalDiagnostics: []
    }
  };
}

export function createEmptyRepresentative(id: 1 | 2, enabled: boolean): RepresentativeRecord {
  return {
    id,
    enabled,
    document: createEmptyDocument('cedulaRepresentante')
  };
}

export function createEmptyDocuments(): Record<DocumentType, ReturnType<typeof createEmptyDocument>> {
  return ALL_DOCUMENT_TYPES.reduce(
    (acc, type) => {
      acc[type] = createEmptyDocument(type);
      return acc;
    },
    {} as Record<DocumentType, ReturnType<typeof createEmptyDocument>>
  );
}

export function createEmptyBiometric() {
  return {
    status: 'pending' as const
  };
}

export function createEmptyPersonalInfo() {
  return {
    firstName: '',
    lastName: '',
    documentNumber: ''
  };
}

export function createInitialState(companyId: string, tenant: TenantConfig): OnboardingState {
  return {
    companyId,
    country: 've',
    personType: 'juridica',
    tenant,
    documents: createEmptyDocuments(),
    representatives: [createEmptyRepresentative(1, true), createEmptyRepresentative(2, false)],
    personalInfo: createEmptyPersonalInfo(),
    biometrics: createEmptyBiometric(),
    submission: {
      status: 'idle'
    }
  };
}

const STORAGE_PREFIX = 'onboarding_portal_state';

export function getStorageKey(companyId: string) {
  return `${STORAGE_PREFIX}:${companyId}`;
}

export function saveState(state: OnboardingState) {
  const key = getStorageKey(state.companyId);
  const persistentState = stripTransientDocuments(state);
  try {
    localStorage.setItem(key, JSON.stringify(persistentState));
  } catch (error) {
    console.warn('No se pudo guardar el estado completo del onboarding. Se guardara una version liviana.', error);
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, JSON.stringify(stripFilePayloadsForStorage(persistentState)));
    } catch (fallbackError) {
      console.warn('No se pudo guardar el estado liviano del onboarding.', fallbackError);
    }
  }
}

export function clearState(companyId: string) {
  try {
    localStorage.removeItem(getStorageKey(companyId));
    localStorage.removeItem(`onboarding-${companyId}`);
  } catch (error) {
    console.warn('No se pudo limpiar el estado local del onboarding.', error);
  }
}

export function loadState(companyId: string): OnboardingState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(getStorageKey(companyId));
  } catch (error) {
    console.warn('No se pudo leer el estado local del onboarding.', error);
    return null;
  }
  if (!raw) return null;
  try {
    return stripTransientDocuments(JSON.parse(raw) as OnboardingState);
  } catch (error) {
    console.warn('Estado local de onboarding invalido. Se iniciara uno nuevo.', error);
    clearState(companyId);
    return null;
  }
}

export function clearAllOnboardingState() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX) || key.startsWith('onboarding-'))
      .forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('No se pudo limpiar todo el estado local del onboarding.', error);
  }
}

function stripTransientDocuments(state: OnboardingState): OnboardingState {
  const [representative1, representative2] = state.representatives;

  return {
    ...state,
    documents: Object.fromEntries(
      Object.entries(state.documents).map(([type, document]) => [
        type,
        {
          ...document,
          previewUrl: undefined
        }
      ])
    ) as OnboardingState['documents'],
    representatives: [
      {
        ...representative1,
        document: {
          ...representative1.document,
          previewUrl: undefined
        }
      },
      {
        ...representative2,
        document: {
          ...representative2.document,
          previewUrl: undefined
        }
      }
    ],
    submission:
      state.submission.status === 'loading' || state.submission.status === 'error'
        ? { status: 'idle' }
        : state.submission
  };
}

function stripFilePayloadsForStorage(state: OnboardingState): OnboardingState {
  const [representative1, representative2] = state.representatives;

  return {
    ...state,
    documents: Object.fromEntries(
      Object.entries(state.documents).map(([type, document]) => [
        type,
        {
          ...document,
          fileBase64: undefined,
          previewUrl: undefined
        }
      ])
    ) as OnboardingState['documents'],
    representatives: [
      {
        ...representative1,
        document: {
          ...representative1.document,
          fileBase64: undefined,
          previewUrl: undefined
        }
      },
      {
        ...representative2,
        document: {
          ...representative2.document,
          fileBase64: undefined,
          previewUrl: undefined
        }
      }
    ]
  };
}
