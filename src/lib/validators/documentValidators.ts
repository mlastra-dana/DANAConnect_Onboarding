import { CountryCode, DocumentType, DocumentValidationResult, PersonType } from '../../app/types';
import { validateBasicFile } from './fileValidators';

const DOCUMENT_VALIDATION_URL =
  import.meta.env.VITE_DOCUMENT_VALIDATION_URL?.trim() ||
  'https://uou6hka7wmyfgtirokika5bkme0wfwzj.lambda-url.us-east-1.on.aws/';
const DOCUMENT_VALIDATION_TIMEOUT_MS = Number(import.meta.env.VITE_DOCUMENT_VALIDATION_TIMEOUT_MS || 120000);
const DIRECT_BASE64_LIMIT_BYTES = Number(import.meta.env.VITE_DIRECT_VALIDATION_FILE_LIMIT_BYTES || 5.5 * 1024 * 1024);

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  country: CountryCode,
  personType: PersonType,
  onProgress?: (progress: number) => void,
  options?: {
    expectedLegalRepresentatives?: DocumentValidationResult['extractedLegalRepresentatives'];
    expectedCompany?: DocumentValidationResult['extractedCompany'];
  }
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];

  onProgress?.(10);
  const basic = validateBasicFile(file);
  if (!basic.success) {
    onProgress?.(100);
    const message = basic.errors[0] ?? 'Formato inválido.';
    return {
      status: 'error',
      typeStatus: 'error',
      validityStatus: 'unknown',
      checks,
      reasons: [message],
      warnings: [],
      uiStatus: {
        state: 'error',
        title: 'Con errores',
        message: `Documento rechazado: ${message}`
      },
      extracted: {
        hasText: false,
        usedOcr: false,
        keywordsFound: [],
        datesFound: []
      },
      quality: {
        sharpnessLabel: 'unknown'
      },
      internalDiagnostics: []
    };
  }

  const slotForValidation = resolveLambdaSlot(type, country);
  onProgress?.(30);
  const payload: Record<string, unknown> = {
    file_name: file.name,
    content_type: file.type || inferContentType(file.name),
    country,
    person_type: personType,
    slot: slotForValidation
  };

  let uploadedFileReference: PreparedDocumentUpload | null = null;
  if (shouldUseS3ValidationUpload(file)) {
    uploadedFileReference = await prepareDocumentValidationUpload(file);
    onProgress?.(45);
    await uploadFileToPreparedUrl(file, uploadedFileReference.uploadUrl, file.type || inferContentType(file.name));
    payload.file_s3_uri = uploadedFileReference.fileS3Uri;
    payload.s3_key = uploadedFileReference.s3Key;
  } else {
    payload.file_base64 = await fileToBase64(file);
  }

  if (options?.expectedLegalRepresentatives) {
    payload.expected_legal_representatives = options.expectedLegalRepresentatives;
  }
  if (options?.expectedCompany) {
    payload.expected_company = options.expectedCompany;
  }

  onProgress?.(65);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DOCUMENT_VALIDATION_TIMEOUT_MS);
  let lambdaResponse: Response;
  try {
    lambdaResponse = await fetch(DOCUMENT_VALIDATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    onProgress?.(100);
    return buildValidationErrorResult(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'La validación tardó demasiado. Intente nuevamente en unos segundos.'
        : 'No se pudo conectar con el servicio de validación. Revise su conexión e intente nuevamente.',
      ['lambda_network_error']
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  let responseBody: unknown = null;
  try {
    responseBody = await lambdaResponse.json();
  } catch {
    responseBody = null;
  }

  if (!lambdaResponse.ok) {
    onProgress?.(100);
    const errorMessage = extractLambdaError(responseBody) ?? 'No se pudo validar el documento.';
    return buildValidationErrorResult(errorMessage, ['lambda_http_error']);
  }

  const result = mapLambdaResponseToValidationResult(responseBody, file.size);
  onProgress?.(100);

  return {
    status: result.status,
    typeStatus: result.typeStatus,
    validityStatus: result.validityStatus,
    checks,
    reasons: result.reasons,
    warnings: result.warnings,
    uiStatus: result.uiStatus,
    extracted: result.extracted,
    quality: result.quality,
    internalDiagnostics: result.internalDiagnostics,
    extractedIdentity: result.extractedIdentity,
    extractedLegalRepresentatives: result.extractedLegalRepresentatives,
    extractedCompany: result.extractedCompany,
    companyDocumentMatch: result.companyDocumentMatch,
    matchedCompanyEvidence: result.matchedCompanyEvidence,
    legalRepresentativeMatch: result.legalRepresentativeMatch,
    matchedRepresentativeRole: result.matchedRepresentativeRole,
    matchedRepresentativeEvidence: result.matchedRepresentativeEvidence,
    visibleIdentityEvidence: result.visibleIdentityEvidence,
    fileS3Uri: result.fileS3Uri || uploadedFileReference?.fileS3Uri,
    s3Key: result.s3Key || uploadedFileReference?.s3Key
  };
}

export function buildValidationErrorResult(
  message: string,
  internalDiagnostics: string[] = []
): DocumentValidationResult {
  return {
    status: 'error',
    typeStatus: 'error',
    validityStatus: 'unknown',
    checks: [],
    reasons: [message],
    warnings: [],
    uiStatus: {
      state: 'error',
      title: 'Con errores',
      message
    },
    extracted: {
      hasText: false,
      usedOcr: false,
      keywordsFound: [],
      datesFound: []
    },
    quality: {
      sharpnessLabel: 'unknown'
    },
    internalDiagnostics
  };
}

type PreparedDocumentUpload = {
  uploadUrl: string;
  fileS3Uri: string;
  s3Key: string;
};

export function shouldUseS3ValidationUpload(file: File) {
  const estimatedBase64Bytes = Math.ceil(file.size / 3) * 4;
  return estimatedBase64Bytes > DIRECT_BASE64_LIMIT_BYTES;
}

async function prepareDocumentValidationUpload(file: File): Promise<PreparedDocumentUpload> {
  const response = await fetch(DOCUMENT_VALIDATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'prepareDocumentValidationUpload',
      file_name: file.name,
      content_type: file.type || inferContentType(file.name),
      file_size: file.size
    })
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(extractLambdaError(body) ?? 'No se pudo preparar la carga segura del documento.');
  }

  const payload = isRecord(body) ? body : {};
  const uploadUrl = typeof payload.uploadUrl === 'string' ? payload.uploadUrl : '';
  const fileS3Uri = typeof payload.fileS3Uri === 'string' ? payload.fileS3Uri : '';
  const s3Key = typeof payload.s3Key === 'string' ? payload.s3Key : '';

  if (!uploadUrl || !fileS3Uri || !s3Key) {
    throw new Error('El servicio de validación no devolvió una URL de carga válida.');
  }

  return { uploadUrl, fileS3Uri, s3Key };
}

async function uploadFileToPreparedUrl(file: File, uploadUrl: string, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar el documento a S3 (${response.status}).`);
  }
}

function resolveLambdaSlot(type: DocumentType, country: CountryCode): string {
  if (type === 'actaDesignacionAutoridades') {
    return country === 've' || country === 'ar' ? 'facultadesRepresentante' : 'registroMercantil';
  }

  if (country !== 'mx') {
    return type;
  }

  const mexicoSlotMap: Partial<Record<DocumentType, string>> = {
    rif: 'documentoFiscal',
    registroMercantil: 'documentoConstitucion',
    cedulaRepresentante: 'documentoRepresentante',
    documentoFiscal: 'documentoFiscal',
    documentoConstitucion: 'documentoConstitucion',
    facultadesRepresentante: 'facultadesRepresentante',
    documentoRepresentante: 'documentoRepresentante',
    documentoIdentidad: 'documentoIdentidad',
    comprobanteDomicilio: 'comprobanteDomicilio'
  };

  return mexicoSlotMap[type] ?? type;
}

function inferContentType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',', 2)[1] : result;
      if (!base64) {
        reject(new Error('No se pudo codificar el archivo.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function extractLambdaError(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const maybeError = 'error' in body ? body.error : null;
  return typeof maybeError === 'string' && maybeError.trim() ? maybeError.trim() : null;
}

function mapLambdaResponseToValidationResult(body: unknown, fileSize: number) {
  const payload = isRecord(body) ? body : {};
  const status = normalizeStatus(payload.status);
  const warnings = toStringList(payload.warnings);
  const reasons = toStringList(payload.reasons);
  const summary = typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : defaultSummary(status);
  const uiStatus = isRecord(payload.uiStatus) ? payload.uiStatus : {};
  const analysis = isRecord(payload.analysis) ? payload.analysis : {};
  const diagnostics = isRecord(payload.providerDiagnostics) ? payload.providerDiagnostics : {};
  const extractedIdentityPayload = isRecord(payload.extractedIdentity) ? payload.extractedIdentity : {};
  const extractedCompanyPayload = isRecord(payload.extractedCompany) ? payload.extractedCompany : {};
  const extractedLegalRepresentativesPayload = Array.isArray(payload.extractedLegalRepresentatives)
    ? payload.extractedLegalRepresentatives
    : [];
  const typeStatus: 'valid' | 'error' | 'review' = status === 'error' ? 'error' : status === 'warning' ? 'review' : 'valid';
  const uiState: 'ok' | 'error' = uiStatus.state === 'error' ? 'error' : 'ok';

  return {
    status,
    typeStatus,
    validityStatus: normalizeValidityStatus(payload.validityStatus),
    reasons: reasons.length > 0 ? reasons : status === 'error' ? [summary] : [],
    warnings,
    uiStatus: {
      state: uiState,
      title:
        typeof uiStatus.title === 'string' && uiStatus.title.trim()
          ? uiStatus.title.trim()
          : status === 'error'
            ? 'Con errores'
            : status === 'warning'
              ? 'Aceptado con revisión recomendada'
              : 'Documento aceptado',
      message:
        typeof uiStatus.message === 'string' && uiStatus.message.trim() ? uiStatus.message.trim() : summary
    },
    extracted: {
      hasText: true,
      usedOcr: false,
      confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
      keywordsFound: toStringList(analysis.keywordsFound),
      datesFound: []
    },
    quality: {
      sharpnessLabel: 'unknown' as const
    },
    extractedIdentity: {
      firstName: typeof extractedIdentityPayload.firstName === 'string' ? extractedIdentityPayload.firstName.trim() : '',
      lastName: typeof extractedIdentityPayload.lastName === 'string' ? extractedIdentityPayload.lastName.trim() : '',
      documentNumber:
        typeof extractedIdentityPayload.documentNumber === 'string' ? extractedIdentityPayload.documentNumber.trim() : '',
      rawText: typeof extractedIdentityPayload.rawText === 'string' ? extractedIdentityPayload.rawText : ''
    },
    extractedLegalRepresentatives: extractedLegalRepresentativesPayload
      .filter(isRecord)
      .map((representative) => ({
        firstName: typeof representative.firstName === 'string' ? representative.firstName.trim() : '',
        lastName: typeof representative.lastName === 'string' ? representative.lastName.trim() : '',
        documentNumber: typeof representative.documentNumber === 'string' ? representative.documentNumber.trim() : '',
        role: typeof representative.role === 'string' ? representative.role.trim() : '',
        rawText: typeof representative.rawText === 'string' ? representative.rawText.trim() : ''
      })),
    extractedCompany: {
      name: typeof extractedCompanyPayload.name === 'string' ? extractedCompanyPayload.name.trim() : '',
      rif: typeof extractedCompanyPayload.rif === 'string' ? extractedCompanyPayload.rif.trim() : '',
      rawText: typeof extractedCompanyPayload.rawText === 'string' ? extractedCompanyPayload.rawText.trim() : ''
    },
    companyDocumentMatch: typeof payload.companyDocumentMatch === 'boolean' ? payload.companyDocumentMatch : null,
    matchedCompanyEvidence:
      typeof payload.matchedCompanyEvidence === 'string' ? payload.matchedCompanyEvidence.trim() : '',
    legalRepresentativeMatch:
      typeof payload.legalRepresentativeMatch === 'boolean' ? payload.legalRepresentativeMatch : null,
    matchedRepresentativeRole:
      typeof payload.matchedRepresentativeRole === 'string' ? payload.matchedRepresentativeRole.trim() : '',
    matchedRepresentativeEvidence:
      typeof payload.matchedRepresentativeEvidence === 'string' ? payload.matchedRepresentativeEvidence.trim() : '',
    visibleIdentityEvidence:
      typeof payload.visibleIdentityEvidence === 'string' ? payload.visibleIdentityEvidence.trim() : '',
    fileS3Uri: typeof payload.fileS3Uri === 'string' ? payload.fileS3Uri.trim() : '',
    s3Key: typeof payload.s3Key === 'string' ? payload.s3Key.trim() : '',
    internalDiagnostics: [
      `lambda_status:${status}`,
      `lambda_file_size:${typeof analysis.fileSizeBytes === 'number' ? analysis.fileSizeBytes : fileSize}`,
      ...(typeof diagnostics.bedrockModelId === 'string' && diagnostics.bedrockModelId
        ? [`bedrock_model:${diagnostics.bedrockModelId}`]
        : [])
    ]
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function normalizeStatus(value: unknown): 'valid' | 'warning' | 'error' {
  return value === 'valid' || value === 'warning' || value === 'error' ? value : 'error';
}

function normalizeValidityStatus(value: unknown): 'ok' | 'warning' | 'unknown' {
  return value === 'ok' || value === 'warning' || value === 'unknown' ? value : 'unknown';
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function defaultSummary(status: 'valid' | 'warning' | 'error') {
  if (status === 'valid') return 'Documento aceptado.';
  if (status === 'warning') return 'Documento aceptado con revisión recomendada.';
  return 'Documento rechazado.';
}
