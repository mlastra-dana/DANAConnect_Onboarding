import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractPdfText, getPdfInfo } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';

const RIF_REGEX = /\b([VEJG])-?\s?(\d{8,9})-?\s?(\d)\b/i;
const RIF_HINTS = [/rif/i, /seniat/i];
const REGISTRO_HINTS = [
  /registro mercantil/i,
  /acta constitutiva/i,
  /acta de asamblea/i,
  /asamblea/i,
  /junta directiva/i,
  /acta/i,
  /sociedad/i,
  /constituci[oó]n/i,
  /estatutos/i
];
const CEDULA_HINTS = [
  /c[eé]dula de identidad/i,
  /rep[uú]blica bolivariana de venezuela/i,
  /venezolano|venezolana/i
];
const CEDULA_NUMBER_REGEX = /\b([VE]-?)?\s?(\d{6,9})\b/i;
const EXPIRY_REGEX = /(?:vencimiento|vence|expira|fecha de vencimiento)[:\s-]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i;

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  onProgress?: (progress: number) => void
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];

  try {
    onProgress?.(12);
    const basic = validateBasicFile(file);
    if (!basic.success) {
      return buildResult(type, 'error', checks, basic.errors[0] ?? 'Formato inválido.');
    }

    const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (isImage) {
      onProgress?.(100);
      return buildResult(type, 'valid', checks, 'Documento aceptado.', {
        extractedId: type === 'cedulaRepresentante' ? extractCedulaFromNamelessSource(file.name) : undefined
      });
    }

    if (!isPdf) {
      onProgress?.(100);
      return buildResult(type, 'error', checks, 'Formato no permitido.');
    }

    onProgress?.(45);
    const [{ pageCount }, rawText] = await Promise.all([getPdfInfo(file), extractPdfText(file)]);
    const normalizedText = normalizeText(rawText);
    const scannedPdfFallback = pageCount > 0 && normalizedText.length < 8;

    if (scannedPdfFallback) {
      onProgress?.(100);
      return buildResult(type, 'valid', checks, 'Documento aceptado.');
    }

    if (type === 'rif') {
      const valid = RIF_REGEX.test(rawText) || RIF_HINTS.some((hint) => hint.test(rawText));
      onProgress?.(100);
      return valid
        ? buildResult(type, 'valid', checks, 'Documento aceptado.')
        : buildResult(type, 'error', checks, 'El documento no parece ser un RIF.');
    }

    if (type === 'registroMercantil') {
      const valid = REGISTRO_HINTS.some((hint) => hint.test(rawText));
      onProgress?.(100);
      return valid
        ? buildResult(type, 'valid', checks, 'Documento aceptado.')
        : buildResult(type, 'error', checks, 'El documento no parece ser un Registro/Acta.');
    }

    const hasCedulaHint = CEDULA_HINTS.some((hint) => hint.test(rawText));
    const cedulaMatch = CEDULA_NUMBER_REGEX.exec(rawText);
    const parsedExpiry = extractExpiry(rawText);
    const isExpired = Boolean(parsedExpiry && parsedExpiry.getTime() < Date.now());
    const valid = hasCedulaHint || Boolean(cedulaMatch);

    onProgress?.(100);
    if (!valid) {
      return buildResult(type, 'error', checks, 'El documento no parece ser una cédula.');
    }
    if (isExpired) {
      return buildResult(type, 'error', checks, 'La cédula parece estar vencida.', {
        extractedId: normalizeCedulaNumber(cedulaMatch)
      });
    }
    return buildResult(type, 'valid', checks, 'Documento aceptado.', {
      extractedId: normalizeCedulaNumber(cedulaMatch)
    });
  } catch {
    onProgress?.(100);
    return buildResult(type, 'valid', checks, 'Documento aceptado.');
  }
}

function buildResult(
  type: DocumentType,
  status: 'valid' | 'error',
  checks: DocumentValidationResult['checks'],
  message: string,
  extra?: Partial<DocumentValidationResult>
): DocumentValidationResult {
  const diagnostics = checks.map((check) => `${check.label}: ${check.passed ? 'ok' : check.details ?? 'error'}`);
  if (import.meta.env.DEV) {
    console.debug(`[document-validation:${type}]`, { status, diagnostics, extra });
  }

  return {
    status,
    checks,
    uiStatus: {
      state: status === 'valid' ? 'ok' : 'error',
      title: status === 'valid' ? 'Documento aceptado.' : message,
      message: status === 'valid' ? 'Documento aceptado.' : message
    },
    internalDiagnostics: diagnostics,
    ...extra
  };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCedulaNumber(match: RegExpExecArray | null): string | undefined {
  if (!match) return undefined;
  const prefix = match[1] ? match[1].replace('-', '').toUpperCase() : 'V';
  const digits = match[2]?.replace(/\D/g, '');
  if (!digits) return undefined;
  return `${prefix}-${digits}`;
}

function extractCedulaFromNamelessSource(raw: string): string | undefined {
  const match = CEDULA_NUMBER_REGEX.exec(raw);
  return normalizeCedulaNumber(match);
}

function extractExpiry(rawText: string): Date | null {
  const match = EXPIRY_REGEX.exec(rawText);
  if (!match) return null;
  const dateText = match[1];
  const parts = dateText.split(/[/-]/).map((value) => Number(value));
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return null;
  const [day, month, year] = parts;
  const normalizedYear = year < 100 ? 2000 + year : year;
  const parsed = new Date(normalizedYear, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
