import { CountryCode, DocumentType, DocumentValidationResult } from '../../app/types';
import { validateBasicFile } from './fileValidators';
import { validateDocumentForSlot } from '../documentValidation';

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
  const result = await validateDocumentForSlot(file, type, country);
  onProgress?.(100);

  const mappedStatus = result.status;
  const userMessage = result.messages[0] ?? 'Documento aceptado.';

  return {
    status: mappedStatus,
    typeStatus: result.status === 'error' ? 'error' : 'valid',
    validityStatus: result.validityStatus,
    checks,
    reasons: result.messages,
    warnings: result.warnings,
    uiStatus: {
      state: result.status === 'error' ? 'error' : 'ok',
      title: result.status === 'error' ? 'Con errores' : 'Documento aceptado.',
      message: userMessage
    },
    extracted: {
      hasText: result.extracted.hasText,
      usedOcr: result.extracted.usedOcr,
      confidence: result.extracted.confidence,
      keywordsFound: result.extracted.keywordsFound,
      datesFound: result.extracted.datesFound
    },
    quality: result.quality,
    internalDiagnostics: []
  };
}
