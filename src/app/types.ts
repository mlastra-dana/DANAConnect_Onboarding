import { TenantConfig } from '../data/tenants';

export type DocumentType = 'rif' | 'registroMercantil' | 'cedulaRepresentante';
export type DocumentRecordType = DocumentType;
export type RequiredDocumentType = 'rif' | 'registroMercantil';
export type ValidationStatus = 'pending' | 'validating' | 'valid' | 'error' | 'warning' | 'review';
export type ValidityStatus = 'ok' | 'warning' | 'unknown';
export type SharpnessLabel = 'ok' | 'warning' | 'bad' | 'unknown';

export type DocumentCheck = {
  label: string;
  passed: boolean;
  details?: string;
  severity?: 'info' | 'warning' | 'error';
};

export type DocumentValidationResult = {
  status: ValidationStatus;
  checks: DocumentCheck[];
  typeStatus?: 'valid' | 'error' | 'review';
  validityStatus?: ValidityStatus;
  reasons?: string[];
  warnings?: string[];
  uiStatus?: {
    state: 'ok' | 'error';
    title: string;
    message: string;
  };
  extracted?: {
    hasText: boolean;
    usedOcr: boolean;
    confidence?: number;
    keywordsFound?: string[];
    datesFound?: string[];
  };
  quality?: {
    sharpnessScore?: number;
    sharpnessLabel: SharpnessLabel;
  };
  internalDiagnostics?: string[];
  isIdDocument?: boolean;
  extractedId?: string;
  expiryDate?: string;
  error?: string;
};

export type DocumentRecord = {
  type: DocumentRecordType;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  previewUrl?: string;
  validation: DocumentValidationResult;
};

export type RepresentativeRecord = {
  id: 1 | 2;
  enabled: boolean;
  document: DocumentRecord;
};

export type BiometricValidationRecord = {
  status: 'pending' | 'processing' | 'passed' | 'failed';
  completedAt?: string;
  score?: number;
  note?: string;
};

export type SubmissionState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  registrationId?: string;
  error?: string;
  submittedAt?: string;
  emailSubject?: string;
  emailBody?: string;
  emailTo?: string;
};

export type OnboardingState = {
  companyId: string;
  tenant: TenantConfig;
  documents: Record<RequiredDocumentType, DocumentRecord>;
  representatives: [RepresentativeRecord, RepresentativeRecord];
  biometrics: BiometricValidationRecord;
  submission: SubmissionState;
};
