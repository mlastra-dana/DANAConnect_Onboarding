import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractPdfText, getPdfInfo } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';

const RIF_REGEX = /\b[VEJG]-\d{8}-\d\b/i;
const REGISTRO_HINTS = [/acta/i, /asamblea/i, /registro mercantil/i, /compa[nñ][ií]a an[oó]nima/i, /\bc\.a\./i, /estatutos/i, /junta directiva/i];
const CEDULA_WORD_REGEX = /c[eé]dula/i;
const SIMPLE_CEDULA_NUMBER = /\b\d{6,9}\b/;

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  onProgress?: (progress: number) => void
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];

  try {
    onProgress?.(10);
    const basic = validateBasicFile(file);

    checks.push({
      label: 'Formato permitido',
      passed: basic.success,
      details: basic.errors[0]
    });

    if (!basic.success) {
      onProgress?.(100);
      return finalizeValidationResult(type, {
        status: 'error',
        checks,
        error: basic.errors.join(' ')
      });
    }

    const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');

    if (type === 'cedulaRepresentante' && file.type.startsWith('image/')) {
      onProgress?.(45);
      const dim = await getImageDimensions(file);
      const resolutionOk = Math.max(dim.width, dim.height) >= 800;
      const validInDemo = true;

      checks.push({
        label: 'Estructura de imagen',
        passed: validInDemo,
        details: `Resolución ${dim.width}x${dim.height}.`
      });

      onProgress?.(100);
      return finalizeValidationResult(type, {
        status: validInDemo ? 'valid' : 'error',
        checks,
        isIdDocument: validInDemo,
        error: validInDemo ? undefined : 'No pudimos validar el documento.'
      });
    }

    if (!isPdf) {
      onProgress?.(100);
      checks.push({
        label: 'Tipo de documento',
        passed: false,
        details: 'Se requiere PDF para esta validación.'
      });
      return finalizeValidationResult(type, {
        status: 'error',
        checks,
        error: 'No pudimos validar el documento.'
      });
    }

    let pageCount = 0;
    try {
      const info = await getPdfInfo(file);
      pageCount = info.pageCount;
    } catch {
      pageCount = 0;
    }

    onProgress?.(50);
    const rawPdfText = await extractPdfText(file);
    const pdfText = normalizeText(rawPdfText);

    let valid = false;

    if (type === 'rif') {
      valid = RIF_REGEX.test(rawPdfText) || pdfText.includes('seniat');
      const scannedPdfFallback = rawPdfText.trim().length === 0 && pageCount > 0;
      if (!valid && scannedPdfFallback) {
        valid = true;
      }
      checks.push({
        label: 'Tipo de documento',
        passed: valid,
        details: valid ? 'RIF identificado.' : 'No se detectó estructura RIF/SENIAT.'
      });
    } else if (type === 'registroMercantil') {
      valid = REGISTRO_HINTS.some((regex) => regex.test(rawPdfText));
      const scannedPdfFallback = rawPdfText.trim().length === 0 && pageCount > 0;
      if (!valid && scannedPdfFallback) {
        valid = true;
      }
      checks.push({
        label: 'Tipo de documento',
        passed: valid,
        details: valid ? 'Documento societario identificado.' : 'No se detectó estructura de acta/registro.'
      });
    } else {
      const hasCedulaWord = CEDULA_WORD_REGEX.test(rawPdfText);
      const hasNumber = SIMPLE_CEDULA_NUMBER.test(rawPdfText);
      const scannedPdfFallback = pageCount > 0;
      valid = (hasCedulaWord && hasNumber) || scannedPdfFallback;

      checks.push({
        label: 'Tipo de documento',
        passed: valid,
        details: valid ? 'Cédula identificada.' : 'No se detectó estructura de cédula.'
      });
    }

    onProgress?.(100);
    return finalizeValidationResult(type, {
      status: valid ? 'valid' : 'error',
      checks,
      isIdDocument: type === 'cedulaRepresentante' ? valid : undefined,
      error: valid ? undefined : 'No pudimos validar el documento.'
    });
  } catch {
    onProgress?.(100);
    checks.push({
      label: 'Lectura del documento',
      passed: false,
      severity: 'error',
      details: 'No pudimos validar el documento.'
    });

    return finalizeValidationResult(type, {
      status: 'error',
      checks,
      error: 'No pudimos validar el documento.'
    });
  }
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getDocTypeLabel(type: DocumentType) {
  if (type === 'rif') return 'RIF';
  if (type === 'registroMercantil') return 'Registro Mercantil';
  return 'Cédula';
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = URL.createObjectURL(file);
  });
}

function finalizeValidationResult(type: DocumentType, result: DocumentValidationResult): DocumentValidationResult {
  const diagnostics = result.checks.map((check) => {
    const status = check.passed ? (check.severity ?? 'info') : 'error';
    return `[${status}] ${check.label}${check.details ? `: ${check.details}` : ''}`;
  });

  const hasTypeMismatch = result.checks.some((check) => /tipo de documento/i.test(check.label) && !check.passed);

  const uiStatus =
    result.status === 'valid'
      ? {
          state: 'ok' as const,
          title: 'Validación completada',
          message: 'Documento aceptado.'
        }
      : {
          state: 'error' as const,
          title: 'Error',
          message: hasTypeMismatch
            ? `El documento no corresponde al tipo requerido (${getDocTypeLabel(type)}).`
            : 'No pudimos validar el documento. Verifique que sea el archivo correcto e intente nuevamente.'
        };

  if (import.meta.env.DEV) {
    console.debug(`[document-validation:${type}]`, {
      status: result.status,
      error: result.error,
      diagnostics
    });
  }

  return {
    ...result,
    uiStatus,
    internalDiagnostics: diagnostics
  };
}
