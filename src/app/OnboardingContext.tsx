import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { TenantConfig } from '../data/tenants';
import {
  BiometricValidationRecord,
  CountryCode,
  DocumentRecord,
  DocumentType,
  OnboardingState,
  PersonalInfo,
  PersonType,
  RepresentativeRecord,
  SubmissionState
} from './types';
import { clearState, createEmptyDocument, createInitialState, loadState, saveState } from './state';
import { getDocumentOrder, requiresRepresentatives } from '../config/onboardingCountries';

type Action =
  | { type: 'set_country'; payload: CountryCode }
  | { type: 'set_person_type'; payload: PersonType }
  | { type: 'set_document'; payload: { docType: DocumentType; record: DocumentRecord } }
  | { type: 'set_representative'; payload: { id: 1 | 2; representative: RepresentativeRecord } }
  | { type: 'set_representative_enabled'; payload: { id: 2; enabled: boolean } }
  | { type: 'set_personal_info'; payload: PersonalInfo }
  | { type: 'set_biometric'; payload: BiometricValidationRecord }
  | { type: 'set_submission'; payload: SubmissionState }
  | { type: 'reset'; payload: OnboardingState };

type ContextValue = {
  state: OnboardingState;
  setCountry: (country: CountryCode) => void;
  setPersonType: (personType: PersonType) => void;
  setDocument: (docType: DocumentType, record: DocumentRecord) => void;
  setRepresentative: (id: 1 | 2, representative: RepresentativeRecord) => void;
  setRepresentativeEnabled: (id: 2, enabled: boolean) => void;
  setPersonalInfo: (record: PersonalInfo) => void;
  setBiometric: (record: BiometricValidationRecord) => void;
  setSubmission: (submission: SubmissionState) => void;
  resetOnboarding: () => void;
  resetOnboardingState: () => void;
  allDocumentsValid: boolean;
  allBiometricsPassed: boolean;
  canSubmit: boolean;
};

const OnboardingContext = createContext<ContextValue | null>(null);

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'set_country':
      return {
        ...state,
        country: action.payload,
        documents: createInitialState(state.companyId, state.tenant).documents,
        representatives: createInitialState(state.companyId, state.tenant).representatives,
        personalInfo: createInitialState(state.companyId, state.tenant).personalInfo,
        biometrics: createInitialState(state.companyId, state.tenant).biometrics,
        submission: createInitialState(state.companyId, state.tenant).submission
      };
    case 'set_person_type':
      return {
        ...state,
        personType: action.payload,
        documents: createInitialState(state.companyId, state.tenant).documents,
        representatives: createInitialState(state.companyId, state.tenant).representatives,
        personalInfo: createInitialState(state.companyId, state.tenant).personalInfo,
        biometrics: createInitialState(state.companyId, state.tenant).biometrics,
        submission: createInitialState(state.companyId, state.tenant).submission
      };
    case 'set_document':
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.docType]: action.payload.record
        }
      };
    case 'set_representative':
      return {
        ...state,
        representatives: state.representatives.map((item) =>
          item.id === action.payload.id ? action.payload.representative : item
        ) as OnboardingState['representatives']
      };
    case 'set_representative_enabled':
      return {
        ...state,
        representatives: state.representatives.map((item) =>
          item.id === action.payload.id
            ? {
                ...item,
                enabled: action.payload.enabled,
                document: action.payload.enabled ? item.document : createEmptyDocument('cedulaRepresentante')
              }
            : item
        ) as OnboardingState['representatives']
      };
    case 'set_personal_info':
      return {
        ...state,
        personalInfo: action.payload
      };
    case 'set_submission':
      return {
        ...state,
        submission: action.payload
      };
    case 'set_biometric':
      return {
        ...state,
        biometrics: action.payload
      };
    case 'reset':
      return action.payload;
    default:
      return state;
  }
}

export function OnboardingProvider({ companyId, tenant, children }: PropsWithChildren<{ companyId: string; tenant: TenantConfig }>) {
  const restored = loadState(companyId);
  const initial = createInitialState(companyId, tenant);
  const restoredBiometric = normalizeBiometricFromStorage(restored?.biometrics, initial.biometrics);
  const hydrated =
    restored == null
      ? initial
      : {
          ...initial,
          ...restored,
          documents: {
            ...initial.documents,
            ...restored.documents
          },
          biometrics: restoredBiometric,
          representatives:
            restored.representatives && restored.representatives.length === 2
              ? (restored.representatives as OnboardingState['representatives'])
              : initial.representatives
        };
  const [state, dispatch] = useReducer(reducer, hydrated);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo<ContextValue>(() => {
    const representative1 = state.representatives.find((rep) => rep.id === 1);
    const representative2 = state.representatives.find((rep) => rep.id === 2);
    const activeDocumentStatuses = getDocumentOrder(state.country, state.personType).map(
      (docType) => state.documents[docType].validation.status
    );
    const requiredDocs = [...activeDocumentStatuses];

    if (requiresRepresentatives(state.country, state.personType) && representative1) {
      requiredDocs.push(representative1.document.validation.status);
      if (representative2?.enabled) {
        requiredDocs.push(representative2.document.validation.status);
      }
    }

    const allDocumentsValid = requiredDocs.every((status) => status === 'valid');
    const allBiometricsPassed = state.biometrics.status === 'passed';

    return {
      state,
      setCountry: (country) => dispatch({ type: 'set_country', payload: country }),
      setPersonType: (personType) => dispatch({ type: 'set_person_type', payload: personType }),
      setDocument: (docType, record) => dispatch({ type: 'set_document', payload: { docType, record } }),
      setRepresentative: (id, representative) => dispatch({ type: 'set_representative', payload: { id, representative } }),
      setRepresentativeEnabled: (id, enabled) => dispatch({ type: 'set_representative_enabled', payload: { id, enabled } }),
      setPersonalInfo: (record) => dispatch({ type: 'set_personal_info', payload: record }),
      setBiometric: (record) => dispatch({ type: 'set_biometric', payload: record }),
      setSubmission: (submission) => dispatch({ type: 'set_submission', payload: submission }),
      resetOnboarding: () => {
        clearState(companyId);
        dispatch({ type: 'reset', payload: createInitialState(companyId, tenant) });
      },
      resetOnboardingState: () => {
        clearState(companyId);
        dispatch({ type: 'reset', payload: createInitialState(companyId, tenant) });
      },
      allDocumentsValid,
      allBiometricsPassed,
      canSubmit: allDocumentsValid && allBiometricsPassed
    };
  }, [companyId, state, tenant]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding debe usarse dentro de OnboardingProvider');
  }
  return context;
}

function normalizeBiometricFromStorage(value: unknown, fallback: BiometricValidationRecord): BiometricValidationRecord {
  if (!value || typeof value !== 'object') return fallback;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status === 'string') {
    return {
      ...fallback,
      ...candidate
    } as BiometricValidationRecord;
  }

  const legacyStage2 = candidate.stage2 as Record<string, unknown> | undefined;
  const legacyStage1 = candidate.stage1 as Record<string, unknown> | undefined;
  const legacy = legacyStage2 ?? legacyStage1;

  if (legacy && typeof legacy.status === 'string') {
    return {
      ...fallback,
      ...legacy
    } as BiometricValidationRecord;
  }

  return fallback;
}
