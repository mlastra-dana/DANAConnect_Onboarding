import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { TenantConfig } from '../data/tenants';
import { DocumentRecord, ExcelValidationState, OnboardingState, RepresentativeRecord, RequiredDocumentType, SubmissionState } from './types';
import { clearState, createInitialState, loadState, saveState } from './state';

type Action =
  | { type: 'set_document'; payload: { docType: RequiredDocumentType; record: DocumentRecord } }
  | { type: 'set_representative'; payload: { id: 1 | 2; representative: RepresentativeRecord } }
  | { type: 'set_representative_enabled'; payload: { id: 2; enabled: boolean } }
  | { type: 'set_excel'; payload: ExcelValidationState }
  | { type: 'set_submission'; payload: SubmissionState }
  | { type: 'reset'; payload: OnboardingState };

type ContextValue = {
  state: OnboardingState;
  setDocument: (docType: RequiredDocumentType, record: DocumentRecord) => void;
  setRepresentative: (id: 1 | 2, representative: RepresentativeRecord) => void;
  setRepresentativeEnabled: (id: 2, enabled: boolean) => void;
  setExcel: (excel: ExcelValidationState) => void;
  setSubmission: (submission: SubmissionState) => void;
  resetOnboarding: () => void;
  resetOnboardingState: () => void;
  allDocumentsValid: boolean;
  excelValid: boolean;
  canSubmit: boolean;
};

const OnboardingContext = createContext<ContextValue | null>(null);

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'set_document':
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.docType]: action.payload.record
        }
      };
    case 'set_excel':
      return {
        ...state,
        excel: action.payload
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
          item.id === action.payload.id ? { ...item, enabled: action.payload.enabled } : item
        ) as OnboardingState['representatives']
      };
    case 'set_submission':
      return {
        ...state,
        submission: action.payload
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
    const baseDocumentsValid = Object.values(state.documents).every((doc) => doc.validation.status === 'valid');
    const representative1 = state.representatives.find((rep) => rep.id === 1);
    const representative2 = state.representatives.find((rep) => rep.id === 2);
    const representative1Valid = representative1?.document.validation.status === 'valid';
    const representative2Valid = !representative2?.enabled || representative2.document.validation.status === 'valid';
    const allDocumentsValid = Boolean(baseDocumentsValid && representative1Valid && representative2Valid);
    const excelValid = state.excel.status === 'valid' && state.excel.totalRows > 0;

    return {
      state,
      setDocument: (docType, record) => dispatch({ type: 'set_document', payload: { docType, record } }),
      setRepresentative: (id, representative) => dispatch({ type: 'set_representative', payload: { id, representative } }),
      setRepresentativeEnabled: (id, enabled) => dispatch({ type: 'set_representative_enabled', payload: { id, enabled } }),
      setExcel: (excel) => dispatch({ type: 'set_excel', payload: excel }),
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
      excelValid,
      canSubmit: allDocumentsValid && excelValid
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
