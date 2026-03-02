import { TenantConfig } from '../data/tenants';

export type DocumentType = 'rif' | 'registroMercantil' | 'cedulaRepresentante';
export type DocumentRecordType = DocumentType;
export type RequiredDocumentType = 'rif' | 'registroMercantil';
export type ValidationStatus = 'pending' | 'validating' | 'valid' | 'error';

export type DocumentCheck = {
  label: string;
  passed: boolean;
  details?: string;
  severity?: 'info' | 'warning' | 'error';
};

export type DocumentValidationResult = {
  status: ValidationStatus;
  checks: DocumentCheck[];
  uiStatus?: {
    state: 'ok' | 'error';
    title: string;
    message: string;
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

export type ExcelRowIssue = {
  rowNumber: number;
  reasons: string[];
  fieldErrors?: Array<{ field: string; message: string }>;
  rowData: Record<string, unknown>;
};

export type ExcelValidationState = {
  status: ValidationStatus;
  totalRows: number;
  processedRows: number;
  validRows: number;
  invalidRows: number;
  headers: string[];
  previewRows: Record<string, unknown>[];
  issues: ExcelRowIssue[];
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
  excel: ExcelValidationState;
  submission: SubmissionState;
};
