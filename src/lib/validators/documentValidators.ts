import { CountryCode, DocumentType, DocumentValidationResult } from '../../app/types';
import { validateBasicFile } from './fileValidators';

const DOCUMENT_VALIDATION_URL =
  import.meta.env.VITE_DOCUMENT_VALIDATION_URL?.trim() ||
  'https://uou6hka7wmyfgtirokika5bkme0wfwzj.lambda-url.us-east-1.on.aws/';

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  country: CountryCode,
  onProgress?: (progress: number) => void
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

  onProgress?.(30);
  const payload = {
    file_name: file.name,
    content_type: file.type || inferContentType(file.name),
    file_base64: await fileToBase64(file),
    country,
    slot: type
  };

  onProgress?.(65);
  const lambdaResponse = await fetch(DOCUMENT_VALIDATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let responseBody: unknown = null;
  try {
    responseBody = await lambdaResponse.json();
  } catch {
    responseBody = null;
  }

  if (!lambdaResponse.ok) {
    onProgress?.(100);
    const errorMessage = extractLambdaError(responseBody) ?? 'No se pudo validar el documento.';
    return {
      status: 'error',
      typeStatus: 'error',
      validityStatus: 'unknown',
      checks,
      reasons: [errorMessage],
      warnings: [],
      uiStatus: {
        state: 'error',
        title: 'Con errores',
        message: errorMessage
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
      internalDiagnostics: ['lambda_http_error']
    };
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
    internalDiagnostics: result.internalDiagnostics
  };
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
              ? 'Aceptado con revision recomendada'
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
  if (status === 'warning') return 'Documento aceptado con revision recomendada.';
  return 'Documento rechazado.';
}
