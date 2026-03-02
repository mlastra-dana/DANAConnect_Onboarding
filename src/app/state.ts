import { DocumentRecordType, OnboardingState, RepresentativeRecord } from './types';
import { TenantConfig } from '../data/tenants';

export const DOCUMENT_LABELS: Record<DocumentRecordType, string> = {
  rif: 'RIF',
  registroMercantil: 'Registro Mercantil',
  cedulaRepresentante: 'Cédula del Representante'
};

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

export function createInitialState(companyId: string, tenant: TenantConfig): OnboardingState {
  return {
    companyId,
    tenant,
    documents: {
      rif: createEmptyDocument('rif'),
      registroMercantil: createEmptyDocument('registroMercantil')
    },
    representatives: [createEmptyRepresentative(1, true), createEmptyRepresentative(2, false)],
    excel: {
      status: 'pending',
      totalRows: 0,
      processedRows: 0,
      validRows: 0,
      invalidRows: 0,
      headers: [],
      previewRows: [],
      issues: []
    },
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
  localStorage.setItem(key, JSON.stringify(state));
}

export function clearState(companyId: string) {
  localStorage.removeItem(getStorageKey(companyId));
  localStorage.removeItem(`onboarding-${companyId}`);
}

export function loadState(companyId: string): OnboardingState | null {
  const raw = localStorage.getItem(getStorageKey(companyId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}
