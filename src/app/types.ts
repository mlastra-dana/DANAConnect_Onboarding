import { TenantConfig } from '../data/tenants';

export type CountryCode = 've' | 'pe' | 'bo' | 'mx' | 'ar' | 'do' | 'usa';
export type PersonType = 'juridica' | 'natural';
export type DocumentType =
  | 'rif'
  | 'registroMercantil'
  | 'cedulaRepresentante'
  | 'documentoIdentidad'
  | 'documentoFiscal'
  | 'documentoConstitucion'
  | 'facultadesRepresentante'
  | 'documentoRepresentante'
  | 'comprobanteDomicilio'
  | 'actaDesignacionAutoridades'
  | 'licenciaConducirFrente'
  | 'licenciaConducirReverso';
export type DocumentRecordType = DocumentType;
export type ValidationStatus = 'pending' | 'validating' | 'valid' | 'error' | 'warning' | 'review';
export type ValidityStatus = 'ok' | 'warning' | 'unknown';
export type SharpnessLabel = 'ok' | 'warning' | 'bad' | 'unknown';

export type DocumentCheck = {
  label: string;
  passed: boolean;
  details?: string;
  severity?: 'info' | 'warning' | 'error';
};

export type ExtractedCompany = {
  name?: string;
  rif?: string;
  rawText?: string;
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
  extractedIdentity?: {
    firstName?: string;
    lastName?: string;
    documentNumber?: string;
    rawText?: string;
  };
  extractedLegalRepresentatives?: Array<{
    firstName?: string;
    lastName?: string;
    documentNumber?: string;
    role?: string;
    rawText?: string;
  }>;
  extractedCompany?: ExtractedCompany;
  companyDocumentMatch?: boolean | null;
  matchedCompanyEvidence?: string;
  legalRepresentativeMatch?: boolean | null;
  matchedRepresentativeRole?: string;
  matchedRepresentativeEvidence?: string;
  visibleIdentityEvidence?: string;
  fileS3Uri?: string;
  s3Key?: string;
  error?: string;
};

export type DocumentRecord = {
  type: DocumentRecordType;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileBase64?: string;
  fileS3Uri?: string;
  s3Key?: string;
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
  geolocationStatus?: 'idle' | 'requesting' | 'granted' | 'denied' | 'error' | 'resolving';
  geolocationAddress?: string;
  geolocationError?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
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

export type PersonalInfo = {
  firstName: string;
  lastName: string;
  documentNumber: string;
};

export type OnboardingState = {
  companyId: string;
  country: CountryCode;
  personType: PersonType;
  tenant: TenantConfig;
  documents: Record<DocumentType, DocumentRecord>;
  representatives: [RepresentativeRecord, RepresentativeRecord];
  personalInfo: PersonalInfo;
  biometrics: BiometricValidationRecord;
  submission: SubmissionState;
};
