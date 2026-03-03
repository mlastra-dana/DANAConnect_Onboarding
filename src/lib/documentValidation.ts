import { DocumentType, SharpnessLabel } from '../app/types';
import { extractPdfText, renderPdfPageToCanvas } from './pdf/pdfUtils';

export type SlotStatus = 'valid' | 'error' | 'warning';
export type ValidationResult = {
  status: SlotStatus;
  category: 'rif' | 'mercantil_acta' | 'cedula';
  confidence: number;
  details: {
    reasons: string[];
    extracted?: {
      text?: string;
      rifMatches?: string[];
      mercantilSignals?: string[];
      keywordsFound?: string[];
      datesFound?: string[];
      hasText?: boolean;
      usedOcr?: boolean;
      score?: number;
      sharpnessScore?: number;
      sharpnessLabel?: SharpnessLabel;
    };
    warnings?: string[];
  };
};

export type SlotValidationResult = {
  status: SlotStatus;
  messages: string[];
  warnings: string[];
  extracted: {
    hasText: boolean;
    usedOcr: boolean;
    keywordsFound: string[];
    datesFound: string[];
    confidence?: number;
  };
  quality: {
    sharpnessScore?: number;
    sharpnessLabel: SharpnessLabel;
  };
  score: number;
  validityStatus: 'ok' | 'warning' | 'unknown';
};

const TEXT_MIN_LENGTH = 24;
const OCR_TIMEOUT_MS = 8000;
const OCR_MAX_BYTES = 9 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1500;
const SHARPNESS_WARN = 85;

const RIF_REGEX = /\b([JVEGPC])\s*-?\s*(\d{7,9})\s*-?\s*(\d)\b/i;
const CEDULA_REGEX = /\bV\s?-?\s?\d{5,9}\b|\bE\s?-?\s?\d{5,9}\b/i;
const DATE_REGEX = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g;
const RIF_STRONG_KEYWORDS = [
  'SENIAT',
  'REGISTRO DE INFORMACION FISCAL',
  'REGISTRO UNICO DE INFORMACION FISCAL',
  'COMPROBANTE DE INSCRIPCION'
] as const;
const RIF_NEGATIVE_ID_KEYWORDS = [
  'CEDULA DE IDENTIDAD',
  'REPUBLICA BOLIVARIANA',
  'VENEZOLANO',
  'APELLIDOS',
  'NOMBRES'
] as const;
const RIF_NEGATIVE_MERCANTIL_KEYWORDS = [
  'REGISTRO MERCANTIL',
  'ACTA',
  'ASAMBLEA',
  'JUNTA DIRECTIVA',
  'TOMO',
  'FOLIO'
] as const;
const MERCANTIL_POSITIVE_KEYWORDS = [
  'REGISTRO MERCANTIL',
  'ACTA CONSTITUTIVA',
  'ACTA',
  'ASAMBLEA',
  'JUNTA DIRECTIVA',
  'CERTIFICA',
  'PROTOCOLO',
  'TOMO',
  'FOLIO',
  'NOTARIA',
  'REGISTRADOR',
  'CIUDADANO',
  'SOCIEDAD',
  'CONSEIN',
  'C.A.',
  'C A',
  'CIA',
  'COMPANIA'
] as const;
const MERCANTIL_LEGAL_KEYWORDS = ['ARTICULO', 'CLAUSULA', 'ESTATUTOS'] as const;
const MERCANTIL_ACTA_SIGNALS = ['ACTA', 'ASAMBLEA', 'JUNTA DIRECTIVA', 'ACTA CONSTITUTIVA', 'REGISTRO MERCANTIL'] as const;
const MERCANTIL_NEGATIVE_CEDULA_KEYWORDS = ['CEDULA DE IDENTIDAD', 'REPUBLICA BOLIVARIANA', 'VENEZOLANO', 'HUELLA', 'APELLIDOS'] as const;
const MERCANTIL_NEGATIVE_RIF_KEYWORDS = ['SENIAT', 'REGISTRO DE INFORMACION FISCAL', 'REGISTRO UNICO DE INFORMACION FISCAL'] as const;
const CEDULA_POSITIVE_KEYWORDS = [
  'CEDULA DE IDENTIDAD',
  'REPUBLICA BOLIVARIANA DE VENEZUELA',
  'VENEZOLANO',
  'APELLIDOS',
  'NOMBRES'
] as const;
const CEDULA_FIELD_KEYWORDS = ['F NACIMIENTO', 'FECHA DE NACIMIENTO', 'F EXPEDICION', 'FECHA DE EXPEDICION', 'F VENCIMIENTO', 'FECHA DE VENCIMIENTO'] as const;
const CEDULA_NEGATIVE_RIF_KEYWORDS = ['SENIAT', 'REGISTRO DE INFORMACION FISCAL', 'REGISTRO UNICO DE INFORMACION FISCAL', 'RIF'] as const;
const CEDULA_NEGATIVE_MERCANTIL_KEYWORDS = ['REGISTRO MERCANTIL', 'ACTA', 'ASAMBLEA', 'TOMO', 'FOLIO'] as const;

const SLOT_KEYWORDS = {
  rif: {
    strong: ['SENIAT', 'REGISTRO UNICO DE INFORMACION FISCAL', 'REGISTRO DE INFORMACION FISCAL', 'RIF'],
    anti: ['CEDULA DE IDENTIDAD', 'REPUBLICA BOLIVARIANA DE VENEZUELA', 'SAIME'],
    expiryHints: ['VENCE', 'VENCIMIENTO', 'HASTA', 'CADUCA', 'FECHA DE VENCIMIENTO', 'FECHA']
  },
  registroMercantil: {
    strong: ['REGISTRO MERCANTIL', 'ACTA CONSTITUTIVA', 'DOCUMENTO CONSTITUTIVO', 'ESTATUTOS'],
    accepted: ['ASAMBLEA', 'ACTA DE ASAMBLEA', 'JUNTA DIRECTIVA', 'RATIFICA', 'CONSTITUCION', 'TOMO', 'FOLIO', 'PROTOCOLO'],
    anti: ['SENIAT', 'RIF', 'CEDULA DE IDENTIDAD', 'SAIME'],
    emissionHints: ['FECHA', 'OTORGADO', 'REGISTRADO']
  },
  cedulaRepresentante: {
    strong: ['REPUBLICA BOLIVARIANA DE VENEZUELA', 'CEDULA DE IDENTIDAD', 'SAIME'],
    anti: ['SENIAT', 'RIF', 'REGISTRO MERCANTIL', 'ACTA CONSTITUTIVA'],
    expiryHints: ['VENCE', 'VENCIMIENTO', 'FECHA DE VENCIMIENTO']
  }
} as const;

const FILE_HINTS: Record<DocumentType, RegExp[]> = {
  rif: [/rif/i, /seniat/i],
  registroMercantil: [/acta/i, /mercantil/i, /asamblea/i, /constitutiv/i],
  cedulaRepresentante: [/cedula/i, /saime/i, /identidad/i]
};

export async function validateDocumentForSlot(file: File, slot: DocumentType): Promise<SlotValidationResult> {
  const slotKey = slot;
  if (slot === 'rif') {
    const rifResult = await validateRifDocument(file);
    return mapRifValidationToSlot(rifResult);
  }
  if (slot === 'registroMercantil') {
    const mercantilResult = await validateMercantilActaDocument(file);
    return mapMercantilValidationToSlot(mercantilResult);
  }
  if (slot === 'cedulaRepresentante') {
    const cedulaResult = await validateCedulaDocument(file);
    return mapCedulaValidationToSlot(cedulaResult);
  }

  const warnings: string[] = [];
  const messages: string[] = [];

  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    return buildError('Documento rechazado: formato no permitido.');
  }

  let analysisCanvas: HTMLCanvasElement | null = null;
  if (isPdf) {
    analysisCanvas = await renderPdfPageToCanvas(file, 1, 1.45);
  } else {
    analysisCanvas = await buildImageCanvas(file, MAX_IMAGE_WIDTH);
  }

  const sharpnessScore = analysisCanvas ? computeSharpness(analysisCanvas) : 0;
  const sharpnessLabel = classifySharpness(sharpnessScore);
  if (sharpnessLabel === 'warning') {
    warnings.push('Documento con baja nitidez.');
  }

  const textResult = isPdf ? await extractTextFromPdf(file) : await extractTextFromImage(file);
  const normalized = normalize(textResult.text);

  if (!textResult.hasText) {
    const hintMatch = FILE_HINTS[slotKey].some((hint) => hint.test(file.name));
    if (hintMatch && (isPdf || isImage)) {
      warnings.push('No se pudo confirmar completamente el contenido. Revise que el documento corresponda al tipo solicitado.');
      if (sharpnessLabel === 'warning') {
        warnings.push('La imagen se ve borrosa, podría afectar la lectura.');
      }
      return {
        status: 'warning',
        messages: ['Documento aceptado.'],
        warnings,
        extracted: {
          hasText: false,
          usedOcr: textResult.usedOcr,
          confidence: textResult.confidence,
          keywordsFound: [],
          datesFound: []
        },
        quality: {
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        },
        score: 0,
        validityStatus: 'unknown'
      };
    }

    return {
      status: 'error',
      messages: ['Documento rechazado: no se pudo confirmar el contenido del archivo.'],
      warnings,
      extracted: {
        hasText: false,
        usedOcr: textResult.usedOcr,
        confidence: textResult.confidence,
        keywordsFound: [],
        datesFound: []
      },
      quality: {
        sharpnessScore: round(sharpnessScore),
        sharpnessLabel
      },
      score: 0,
      validityStatus: 'unknown'
    };
  }

  const classification = classifyBySlot(slot, normalized);
  if (!classification.valid) {
    return {
      status: 'error',
      messages: [`Documento rechazado: ${classification.reason}`],
      warnings,
      extracted: {
        hasText: true,
        usedOcr: textResult.usedOcr,
        confidence: textResult.confidence,
        keywordsFound: classification.keywordsFound,
        datesFound: findAllDateStrings(textResult.text)
      },
      quality: {
        sharpnessScore: round(sharpnessScore),
        sharpnessLabel
      },
      score: classification.score,
      validityStatus: 'unknown'
    };
  }

  const validity = parseValidityWarnings(slot, textResult.text);
  warnings.push(...validity.warnings);
  const finalStatus: SlotStatus = warnings.length > 0 ? 'warning' : 'valid';

  messages.push('Documento aceptado.');
  return {
    status: finalStatus,
    messages,
    warnings,
    extracted: {
      hasText: true,
      usedOcr: textResult.usedOcr,
      confidence: textResult.confidence,
      keywordsFound: classification.keywordsFound,
      datesFound: findAllDateStrings(textResult.text)
    },
    quality: {
      sharpnessScore: round(sharpnessScore),
      sharpnessLabel
    },
    score: classification.score,
    validityStatus: validity.status
  };
}

export async function validateRifDocument(file: File): Promise<ValidationResult> {
  const warnings: string[] = [];
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    return {
      status: 'error',
      category: 'rif',
      confidence: 0,
      details: {
        reasons: ['Archivo no permitido para validar RIF.']
      }
    };
  }

  const analysisCanvas = isPdf ? await buildPdfCanvas(file, 1, MAX_IMAGE_WIDTH) : await buildImageCanvas(file, MAX_IMAGE_WIDTH);
  const sharpnessScore = computeSharpness(analysisCanvas);
  const sharpnessLabel = classifySharpness(sharpnessScore);

  const initialText = isPdf ? (await extractPdfText(file, 1)) ?? '' : '';
  const initialClassification = classifyTextAsRif(initialText);
  const hasStrongInitialSignals = initialClassification.valid && initialClassification.score >= 8;

  let text = initialText;
  let usedOcr = false;
  let confidence = initialClassification.confidence;

  if (!hasStrongInitialSignals) {
    if (isImage || file.size <= OCR_MAX_BYTES) {
      const ocr = await runOcrLight(analysisCanvas, OCR_TIMEOUT_MS);
      usedOcr = true;
      if (ocr.text) text = `${text} ${ocr.text}`.trim();
      if (typeof ocr.confidence === 'number') {
        confidence = Math.max(confidence, clamp01(ocr.confidence / 100));
      }
    }
  }

  const classification = classifyTextAsRif(text);
  const normalized = normalize(text);
  const hasText = normalized.length >= TEXT_MIN_LENGTH;

  if (!hasText || !classification.valid) {
    return {
      status: 'error',
      category: 'rif',
      confidence: classification.confidence,
      details: {
        reasons: [classification.reason],
        extracted: {
          text: text.slice(0, 320),
          rifMatches: classification.rifMatches,
          keywordsFound: classification.keywordsFound,
          datesFound: findAllDateStrings(text),
          hasText,
          usedOcr,
          score: classification.score,
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  }

  const { expiry } = parseExpiry(text);
  if (expiry && expiry.getTime() < Date.now()) {
    warnings.push('RIF no vigente (verificar).');
  }

  return {
    status: warnings.length > 0 ? 'warning' : 'valid',
    category: 'rif',
    confidence: classification.confidence,
    details: {
      reasons: ['Se detectó un RIF del SENIAT.'],
      extracted: {
        text: text.slice(0, 320),
        rifMatches: classification.rifMatches,
        keywordsFound: classification.keywordsFound,
        datesFound: findAllDateStrings(text),
        hasText: true,
        usedOcr,
        score: classification.score,
        sharpnessScore: round(sharpnessScore),
        sharpnessLabel
      },
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}

export async function validateMercantilActaDocument(file: File): Promise<ValidationResult> {
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    return {
      status: 'error',
      category: 'mercantil_acta',
      confidence: 0,
      details: {
        reasons: ['Documento no corresponde a Registro Mercantil/Acta.']
      }
    };
  }

  const analysisCanvas = isPdf ? await buildPdfCanvas(file, 1, MAX_IMAGE_WIDTH) : await buildImageCanvas(file, MAX_IMAGE_WIDTH);
  const sharpnessScore = computeSharpness(analysisCanvas);
  const sharpnessLabel = classifySharpness(sharpnessScore);

  const initialText = isPdf ? (await extractPdfText(file, 1)) ?? '' : '';
  const initialClassification = classifyTextAsMercantilActa(initialText);
  const hasStrongInitialSignals = initialClassification.score >= 0.78 && initialClassification.valid;

  let text = initialText;
  let usedOcr = false;
  let confidence = initialClassification.confidence;

  if (!hasStrongInitialSignals && (isImage || file.size <= OCR_MAX_BYTES)) {
    const ocr = await runOcrLight(analysisCanvas, OCR_TIMEOUT_MS);
    usedOcr = true;
    if (ocr.text) text = `${text} ${ocr.text}`.trim();
    if (typeof ocr.confidence === 'number') {
      confidence = Math.max(confidence, clamp01(ocr.confidence / 100));
    }
  }

  const normalized = normalize(text).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      status: 'error',
      category: 'mercantil_acta',
      confidence: 0,
      details: {
        reasons: ['No pudimos validar este documento. Prueba con otra versión o una imagen más nítida.'],
        extracted: {
          text: '',
          mercantilSignals: [],
          keywordsFound: [],
          datesFound: [],
          hasText: false,
          usedOcr,
          score: 0,
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        }
      }
    };
  }

  const classification = classifyTextAsMercantilActa(normalized);
  if (!classification.valid) {
    return {
      status: 'error',
      category: 'mercantil_acta',
      confidence: classification.confidence,
      details: {
        reasons: [classification.reason],
        extracted: {
          text: text.slice(0, 320),
          mercantilSignals: classification.mercantilSignals,
          keywordsFound: classification.keywordsFound,
          datesFound: findAllDateStrings(text),
          hasText: true,
          usedOcr,
          score: round(classification.score * 100),
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        }
      }
    };
  }

  return {
    status: 'valid',
    category: 'mercantil_acta',
    confidence: classification.confidence,
    details: {
      reasons: ['Documento corresponde a Registro Mercantil/Acta.'],
      extracted: {
        text: text.slice(0, 320),
        mercantilSignals: classification.mercantilSignals,
        keywordsFound: classification.keywordsFound,
        datesFound: findAllDateStrings(text),
        hasText: true,
        usedOcr,
        score: round(classification.score * 100),
        sharpnessScore: round(sharpnessScore),
        sharpnessLabel
      }
    }
  };
}

export async function validateCedulaDocument(file: File): Promise<ValidationResult> {
  const warnings: string[] = [];
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    return {
      status: 'error',
      category: 'cedula',
      confidence: 0,
      details: {
        reasons: ['Documento no corresponde a una cédula venezolana.']
      }
    };
  }

  const analysisCanvas = isPdf ? await buildPdfCanvas(file, 1, MAX_IMAGE_WIDTH) : await buildImageCanvas(file, MAX_IMAGE_WIDTH);
  const sharpnessScore = computeSharpness(analysisCanvas);
  const sharpnessLabel = classifySharpness(sharpnessScore);

  const initialText = isPdf ? (await extractPdfText(file, 1)) ?? '' : '';
  const initialClassification = classifyTextAsCedula(initialText);
  const hasStrongInitialSignals = initialClassification.valid && initialClassification.score >= 0.78;

  let text = initialText;
  let usedOcr = false;
  let confidence = initialClassification.confidence;

  if (!hasStrongInitialSignals && (isImage || file.size <= OCR_MAX_BYTES)) {
    const ocr = await runOcrLight(analysisCanvas, OCR_TIMEOUT_MS);
    usedOcr = true;
    if (ocr.text) text = `${text} ${ocr.text}`.trim();
    if (typeof ocr.confidence === 'number') {
      confidence = Math.max(confidence, clamp01(ocr.confidence / 100));
    }
  }

  const normalized = normalize(text).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      status: 'error',
      category: 'cedula',
      confidence: 0,
      details: {
        reasons: ['No pudimos validar este documento. Prueba con otra versión o una imagen más nítida.'],
        extracted: {
          text: '',
          keywordsFound: [],
          datesFound: [],
          hasText: false,
          usedOcr,
          score: 0,
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  }

  const classification = classifyTextAsCedula(normalized);
  if (!classification.valid) {
    return {
      status: 'error',
      category: 'cedula',
      confidence: classification.confidence,
      details: {
        reasons: [classification.reason],
        extracted: {
          text: text.slice(0, 320),
          keywordsFound: classification.keywordsFound,
          datesFound: findAllDateStrings(text),
          hasText: true,
          usedOcr,
          score: round(classification.score * 100),
          sharpnessScore: round(sharpnessScore),
          sharpnessLabel
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  }

  const { expiry } = parseExpiry(text);
  if (expiry && expiry.getTime() < Date.now()) {
    warnings.push('Cédula no vigente (verificar).');
  }

  return {
    status: warnings.length > 0 ? 'warning' : 'valid',
    category: 'cedula',
    confidence: classification.confidence,
    details: {
      reasons: ['Documento corresponde a una cédula venezolana.'],
      extracted: {
        text: text.slice(0, 320),
        keywordsFound: classification.keywordsFound,
        datesFound: findAllDateStrings(text),
        hasText: true,
        usedOcr,
        score: round(classification.score * 100),
        sharpnessScore: round(sharpnessScore),
        sharpnessLabel
      },
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}

export async function extractTextFromPdf(file: File) {
  const firstPage = await extractPdfText(file, 1);
  let text = firstPage ?? '';

  if (normalize(text).length < TEXT_MIN_LENGTH) {
    const secondPass = await extractPdfText(file, 2);
    text = secondPass ?? text;
  }

  let usedOcr = false;
  let confidence: number | undefined;
  let hasText = normalize(text).length >= TEXT_MIN_LENGTH;

  if (!hasText && file.size <= OCR_MAX_BYTES) {
    const pageCanvas = await renderPdfPageToCanvas(file, 1, 1.4);
    const ocr = await runOcrLight(pageCanvas, OCR_TIMEOUT_MS);
    usedOcr = true;
    confidence = ocr.confidence;
    if (ocr.text) text = `${text} ${ocr.text}`.trim();
    hasText = normalize(text).length >= TEXT_MIN_LENGTH;
  }

  return { text, hasText, usedOcr, confidence };
}

export async function extractTextFromImage(file: File) {
  const canvas = await buildImageCanvas(file, MAX_IMAGE_WIDTH);
  const ocr = await runOcrLight(canvas, OCR_TIMEOUT_MS);
  const text = ocr.text.trim();
  return {
    text,
    hasText: normalize(text).length >= TEXT_MIN_LENGTH,
    usedOcr: true,
    confidence: ocr.confidence
  };
}

export function parseExpiry(text: string) {
  const normalizedText = normalize(text);
  const dateTokens = findAllDateStrings(text);

  for (const token of dateTokens) {
    const parsed = parseDate(token);
    if (!parsed) continue;

    const tokenIdx = normalizedText.indexOf(normalize(token));
    if (tokenIdx < 0) continue;

    const context = normalizedText.slice(Math.max(0, tokenIdx - 60), tokenIdx + 60);
    if (context.includes('VENCIMIENTO') || context.includes('VENCE') || context.includes('CADUCA') || context.includes('HASTA')) {
      return { expiry: parsed, raw: token };
    }
  }

  return { expiry: null as Date | null, raw: null as string | null };
}

export function computeSharpness(input: HTMLCanvasElement | ImageData) {
  const imageData = input instanceof HTMLCanvasElement ? input.getContext('2d')?.getImageData(0, 0, input.width, input.height) : input;
  if (!imageData) return 0;

  const { width, height, data } = imageData;
  if (width < 3 || height < 3) return 0;

  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const i = row + x;
      const lap = gray[i - width] + gray[i - 1] - 4 * gray[i] + gray[i + 1] + gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (!count) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function mapRifValidationToSlot(result: ValidationResult): SlotValidationResult {
  const extracted = result.details.extracted;
  return {
    status: result.status,
    messages:
      result.status === 'error'
        ? [`Documento rechazado: ${result.details.reasons[0] ?? 'no corresponde a RIF.'}`]
        : ['Documento aceptado.'],
    warnings: result.details.warnings ?? [],
    extracted: {
      hasText: extracted?.hasText ?? false,
      usedOcr: extracted?.usedOcr ?? false,
      confidence: result.confidence,
      keywordsFound: extracted?.keywordsFound ?? [],
      datesFound: extracted?.datesFound ?? []
    },
    quality: {
      sharpnessScore: extracted?.sharpnessScore,
      sharpnessLabel: extracted?.sharpnessLabel ?? 'unknown'
    },
    score: extracted?.score ?? 0,
    validityStatus: result.status === 'error' ? 'unknown' : result.status === 'warning' ? 'warning' : 'ok'
  };
}

function mapMercantilValidationToSlot(result: ValidationResult): SlotValidationResult {
  const extracted = result.details.extracted;
  const defaultError = 'Documento no corresponde a Registro Mercantil/Acta.';
  const reason = result.details.reasons[0] ?? '';
  const errorMessage = reason && reason !== defaultError ? `${defaultError} ${reason}` : defaultError;
  return {
    status: result.status,
    messages:
      result.status === 'error'
        ? [errorMessage]
        : ['Documento aceptado.'],
    warnings: result.details.warnings ?? [],
    extracted: {
      hasText: extracted?.hasText ?? false,
      usedOcr: extracted?.usedOcr ?? false,
      confidence: result.confidence,
      keywordsFound: extracted?.keywordsFound ?? [],
      datesFound: extracted?.datesFound ?? []
    },
    quality: {
      sharpnessScore: extracted?.sharpnessScore,
      sharpnessLabel: extracted?.sharpnessLabel ?? 'unknown'
    },
    score: extracted?.score ?? 0,
    validityStatus: result.status === 'error' ? 'unknown' : result.status === 'warning' ? 'warning' : 'ok'
  };
}

function mapCedulaValidationToSlot(result: ValidationResult): SlotValidationResult {
  const extracted = result.details.extracted;
  const defaultError = 'Documento no corresponde a una cédula venezolana.';
  const errorMessage = result.details.reasons[0] ?? defaultError;
  return {
    status: result.status,
    messages: result.status === 'error' ? [errorMessage] : ['Documento aceptado.'],
    warnings: result.details.warnings ?? [],
    extracted: {
      hasText: extracted?.hasText ?? false,
      usedOcr: extracted?.usedOcr ?? false,
      confidence: result.confidence,
      keywordsFound: extracted?.keywordsFound ?? [],
      datesFound: extracted?.datesFound ?? []
    },
    quality: {
      sharpnessScore: extracted?.sharpnessScore,
      sharpnessLabel: extracted?.sharpnessLabel ?? 'unknown'
    },
    score: extracted?.score ?? 0,
    validityStatus: result.status === 'error' ? 'unknown' : result.status === 'warning' ? 'warning' : 'ok'
  };
}

export function classifyTextAsRif(rawText: string) {
  const text = normalize(rawText).replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      valid: false,
      score: 0,
      confidence: 0,
      reason: 'No fue posible confirmar que el archivo sea un RIF.',
      keywordsFound: [] as string[],
      rifMatches: [] as string[]
    };
  }

  let score = 0;
  const keywordsFound: string[] = [];
  const rifMatches = findRifMatches(text);
  const strongKeywordHits = findPhraseMatches(text, RIF_STRONG_KEYWORDS, 0.6);
  const hasRifWord = findPhraseMatches(text, ['RIF', 'R.I.F'], 1).length > 0;
  const idHits = findPhraseMatches(text, RIF_NEGATIVE_ID_KEYWORDS, 0.6);
  const mercantilHits = findPhraseMatches(text, RIF_NEGATIVE_MERCANTIL_KEYWORDS, 0.6);

  if (strongKeywordHits.length > 0) {
    score += strongKeywordHits.length >= 2 ? 5 : 3;
    keywordsFound.push(...strongKeywordHits);
  }
  if (hasRifWord) {
    score += 2;
    keywordsFound.push('RIF');
  }
  if (rifMatches.length > 0) {
    score += 3;
    keywordsFound.push('PATRON_RIF');
  }

  const negativeScore = idHits.length * 3 + mercantilHits.length * 2;
  score -= negativeScore;

  if (idHits.length >= 2 || mercantilHits.length >= 3 || (negativeScore >= 6 && score <= 2)) {
    const reason = idHits.length > mercantilHits.length
      ? 'El archivo corresponde a una cédula, no a un RIF.'
      : 'El archivo corresponde a un acta o registro mercantil, no a un RIF.';
    return {
      valid: false,
      score,
      confidence: clamp01((score + 2) / 10),
      reason,
      keywordsFound,
      rifMatches
    };
  }

  const hasStrongSignals = strongKeywordHits.length >= 1 && hasRifWord;
  const valid = score >= 4 && (rifMatches.length > 0 || hasStrongSignals);

  return {
    valid,
    score,
    confidence: clamp01((score + 2) / 10),
    reason: valid ? '' : 'No se detectaron señales suficientes de un RIF del SENIAT.',
    keywordsFound,
    rifMatches
  };
}

export function classifyTextAsMercantilActa(rawText: string) {
  const text = normalize(rawText).replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      valid: false,
      score: 0,
      confidence: 0,
      reason: 'No pudimos validar este documento. Prueba con otra versión o una imagen más nítida.',
      keywordsFound: [] as string[],
      mercantilSignals: [] as string[]
    };
  }

  const keywordHits = findPhraseMatches(text, MERCANTIL_POSITIVE_KEYWORDS, 0.6);
  const mercantilSignals = findPhraseMatches(text, MERCANTIL_ACTA_SIGNALS, 0.6);
  const legalHits = findPhraseMatches(text, MERCANTIL_LEGAL_KEYWORDS, 0.6);
  const cedulaHits = findPhraseMatches(text, MERCANTIL_NEGATIVE_CEDULA_KEYWORDS, 0.6);
  const rifHits = findPhraseMatches(text, MERCANTIL_NEGATIVE_RIF_KEYWORDS, 0.6);
  const dateMatches = findAllDateStrings(text);
  const alphaNumericOnly = text.replace(/\s+/g, '').match(/^[0-9:/.-]+$/);
  const hasAnyKeyword = keywordHits.length > 0 || legalHits.length > 0 || mercantilSignals.length > 0;

  if (alphaNumericOnly || !hasAnyKeyword) {
    return {
      valid: false,
      score: 0.1,
      confidence: 0.1,
      reason: 'Documento no corresponde a Registro Mercantil/Acta.',
      keywordsFound: [],
      mercantilSignals: []
    };
  }

  if (cedulaHits.length >= 2 || rifHits.length >= 1) {
    return {
      valid: false,
      score: 0.1,
      confidence: 0.15,
      reason: 'Se detectó un documento tipo Cédula/RIF.',
      keywordsFound: [...cedulaHits, ...rifHits],
      mercantilSignals
    };
  }

  let score = 0;
  score += Math.min(keywordHits.length, 8) * 0.08;
  score += Math.min(mercantilSignals.length, 4) * 0.1;
  if (dateMatches.length >= 2) score += 0.1;
  if (legalHits.length >= 1) score += 0.08;
  if (legalHits.length >= 2) score += 0.04;
  if (text.includes('C.A.') || text.includes(' C A ') || text.includes('SOCIEDAD')) score += 0.06;

  const penalty = Math.min(cedulaHits.length * 0.25 + rifHits.length * 0.3, 0.7);
  const normalizedScore = clamp01(score - penalty);
  const hasActaFamilySignals = mercantilSignals.length >= 1;
  const valid = normalizedScore >= 0.35 && hasActaFamilySignals && (keywordHits.length >= 2 || legalHits.length >= 1 || dateMatches.length >= 1);

  return {
    valid,
    score: normalizedScore,
    confidence: normalizedScore,
    reason: valid ? '' : 'Documento no corresponde a Registro Mercantil/Acta.',
    keywordsFound: keywordHits,
    mercantilSignals
  };
}

export function classifyTextAsCedula(rawText: string) {
  const text = normalize(rawText).replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      valid: false,
      score: 0,
      confidence: 0,
      reason: 'No pudimos validar este documento. Prueba con otra versión o una imagen más nítida.',
      keywordsFound: [] as string[]
    };
  }

  const positiveHits = findPhraseMatches(text, CEDULA_POSITIVE_KEYWORDS, 0.6);
  const fieldHits = findPhraseMatches(text, CEDULA_FIELD_KEYWORDS, 0.6);
  const rifHits = findPhraseMatches(text, CEDULA_NEGATIVE_RIF_KEYWORDS, 0.6);
  const mercantilHits = findPhraseMatches(text, CEDULA_NEGATIVE_MERCANTIL_KEYWORDS, 0.6);
  const rifPatternHits = findRifMatches(text);
  const cedulaPatternDirect = findCedulaMatches(text);
  const bareNumberWithContext = findCedulaBareNumbersWithContext(text);
  const strongSignals = [
    positiveHits.includes('CEDULA DE IDENTIDAD'),
    positiveHits.includes('REPUBLICA BOLIVARIANA DE VENEZUELA'),
    cedulaPatternDirect.length > 0 || bareNumberWithContext.length > 0
  ].filter(Boolean).length;

  if (rifHits.length >= 1 || rifPatternHits.length > 0) {
    return {
      valid: false,
      score: 0.1,
      confidence: 0.15,
      reason: 'Se detectó un documento tipo RIF.',
      keywordsFound: [...rifHits, ...rifPatternHits]
    };
  }

  if (mercantilHits.length >= 2) {
    return {
      valid: false,
      score: 0.1,
      confidence: 0.15,
      reason: 'Se detectó un documento tipo Acta/Registro Mercantil.',
      keywordsFound: mercantilHits
    };
  }

  let score = 0;
  score += Math.min(positiveHits.length, 5) * 0.11;
  score += Math.min(fieldHits.length, 3) * 0.07;
  if (cedulaPatternDirect.length > 0) score += 0.22;
  if (bareNumberWithContext.length > 0) score += 0.12;
  if (text.includes('IDENTIDAD')) score += 0.08;

  const penalty = Math.min(mercantilHits.length * 0.25 + rifHits.length * 0.3, 0.75);
  const normalizedScore = clamp01(score - penalty);
  const hasIdCore = positiveHits.includes('CEDULA DE IDENTIDAD') || text.includes('IDENTIDAD');
  const hasDocumentNumber = cedulaPatternDirect.length > 0 || bareNumberWithContext.length > 0;
  const valid =
    normalizedScore >= 0.35 &&
    (strongSignals >= 2 || (strongSignals >= 1 && hasIdCore && hasDocumentNumber));

  return {
    valid,
    score: normalizedScore,
    confidence: normalizedScore,
    reason: valid ? '' : 'Documento no corresponde a una cédula venezolana.',
    keywordsFound: [...positiveHits, ...fieldHits]
  };
}

function classifyBySlot(slot: DocumentType, text: string) {
  if (slot === 'rif') {
    const rif = classifyTextAsRif(text);
    return {
      valid: rif.valid,
      reason: rif.reason,
      score: rif.score,
      keywordsFound: rif.keywordsFound
    };
  }

  if (slot === 'registroMercantil') {
    let score = 0;
    const keywordsFound: string[] = [];

    score += addScore(text, ['REGISTRO MERCANTIL'], 3, keywordsFound);
    score += addScore(text, ['ACTA CONSTITUTIVA'], 3, keywordsFound);
    score += addScore(text, ['ASAMBLEA', 'ACTA DE ASAMBLEA'], 2, keywordsFound);
    score += addScore(text, ['JUNTA DIRECTIVA', 'RATIFICA', 'CONSTITUCION'], 1, keywordsFound);
    score += addScore(text, ['TOMO', 'FOLIO', 'PROTOCOLO'], 1, keywordsFound);

    if (score === 0 && hasAny(text, SLOT_KEYWORDS.registroMercantil.anti)) {
      return { valid: false, reason: 'el archivo parece no corresponder a Registro/Acta.', score, keywordsFound };
    }

    return score >= 4
      ? { valid: true, reason: '', score, keywordsFound }
      : { valid: false, reason: 'no coincide con un Registro Mercantil o Acta.', score, keywordsFound };
  }

  let score = 0;
  const keywordsFound: string[] = [];

  score += addScore(text, ['REPUBLICA BOLIVARIANA DE VENEZUELA'], 3, keywordsFound);
  score += addScore(text, ['CEDULA DE IDENTIDAD'], 3, keywordsFound);
  if (CEDULA_REGEX.test(text)) {
    score += 2;
    keywordsFound.push('PATRON_CEDULA');
  }
  score += addScore(text, ['VENCIMIENTO'], 2, keywordsFound);

  if (hasAny(text, SLOT_KEYWORDS.cedulaRepresentante.anti)) {
    return { valid: false, reason: 'el archivo parece ser otro tipo de documento, no una cédula.', score, keywordsFound };
  }

  return score >= 5
    ? { valid: true, reason: '', score, keywordsFound }
    : { valid: false, reason: 'no coincide con una cédula venezolana.', score, keywordsFound };
}

function parseValidityWarnings(slot: DocumentType, rawText: string) {
  const warnings: string[] = [];

  if (slot === 'rif') {
    const { expiry } = parseExpiry(rawText);
    if (expiry && expiry.getTime() < Date.now()) {
      warnings.push('RIF no vigente (verificar).');
      return { status: 'warning' as const, warnings };
    }
    return { status: expiry ? ('ok' as const) : ('unknown' as const), warnings };
  }

  if (slot === 'cedulaRepresentante') {
    const { expiry, raw } = parseExpiry(rawText);
    if (expiry && expiry.getTime() < Date.now()) {
      warnings.push(`Cédula vencida (${raw ?? formatDate(expiry)}).`);
      return { status: 'warning' as const, warnings };
    }
    return { status: expiry ? ('ok' as const) : ('unknown' as const), warnings };
  }

  const parsedDates = findAllDateStrings(rawText)
    .map((token) => parseDate(token))
    .filter((d): d is Date => Boolean(d));
  if (!parsedDates.length) {
    return { status: 'unknown' as const, warnings };
  }

  const newest = parsedDates.reduce((acc, cur) => (cur.getTime() > acc.getTime() ? cur : acc));
  const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
  if (Date.now() - newest.getTime() > tenYearsMs) {
    warnings.push('El documento es antiguo. Puede continuar, pero podría requerir una versión actualizada.');
    return { status: 'warning' as const, warnings };
  }

  return { status: 'ok' as const, warnings };
}

function classifySharpness(score: number): SharpnessLabel {
  if (score < SHARPNESS_WARN) return 'warning';
  return 'ok';
}

async function buildImageCanvas(file: File, maxWidth: number) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      image.src = objectUrl;
    });

    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear canvas.');

    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function buildPdfCanvas(file: File, pageNumber: number, maxWidth: number) {
  const rendered = await renderPdfPageToCanvas(file, pageNumber, 1.5);
  if (rendered.width <= maxWidth) return rendered;

  const ratio = maxWidth / rendered.width;
  const width = Math.max(1, Math.round(rendered.width * ratio));
  const height = Math.max(1, Math.round(rendered.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas.');
  ctx.drawImage(rendered, 0, 0, width, height);
  return canvas;
}

async function runOcrLight(canvas: HTMLCanvasElement, timeoutMs: number) {
  const baseDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const enhancedDataUrl = buildEnhancedOcrDataUrl(canvas);

  const workerSource = `
self.onmessage = async function (event) {
  try {
    importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const payload = event.data || {};
    const options = {
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    };

    const first = await self.Tesseract.recognize(payload.image, payload.language || 'spa+eng', options);
    let text = (first && first.data && first.data.text) || '';
    let confidence = first && first.data ? first.data.confidence : undefined;

    if (((text || '').trim().length < 24) && payload.imageEnhanced) {
      const second = await self.Tesseract.recognize(payload.imageEnhanced, payload.language || 'spa+eng', options);
      const secondText = (second && second.data && second.data.text) || '';
      const secondConfidence = second && second.data ? second.data.confidence : undefined;
      if ((secondText || '').trim().length > (text || '').trim().length) {
        text = secondText;
      } else if ((secondText || '').trim().length > 0) {
        text = (text + ' ' + secondText).trim();
      }
      if (typeof secondConfidence === 'number') {
        confidence = typeof confidence === 'number' ? Math.max(confidence, secondConfidence) : secondConfidence;
      }
    }

    self.postMessage({ ok: true, text, confidence });
  } catch (error) {
    self.postMessage({ ok: false, text: '', confidence: 0 });
  }
};
`;

  const blob = new Blob([workerSource], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);

  try {
    return await new Promise<{ text: string; confidence?: number }>((resolve) => {
      const timer = window.setTimeout(() => {
        worker.terminate();
        resolve({ text: '' });
      }, timeoutMs);

      worker.onmessage = (event) => {
        window.clearTimeout(timer);
        const payload = (event.data ?? {}) as { ok?: boolean; text?: string; confidence?: number };
        worker.terminate();
        resolve({ text: payload.text ?? '', confidence: payload.confidence });
      };

      worker.onerror = () => {
        window.clearTimeout(timer);
        worker.terminate();
        resolve({ text: '' });
      };

      worker.postMessage({ image: baseDataUrl, imageEnhanced: enhancedDataUrl });
    });
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

function buildEnhancedOcrDataUrl(canvas: HTMLCanvasElement) {
  const width = canvas.width;
  const height = canvas.height;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/jpeg', 0.92);
  ctx.drawImage(canvas, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const boosted = gray > 145 ? 255 : gray < 90 ? 0 : gray;
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);
  return out.toDataURL('image/png');
}

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(normalize(term)));
}

function addScore(text: string, terms: readonly string[], points: number, found: string[]) {
  const hit = terms.some((term) => text.includes(normalize(term)));
  if (!hit) return 0;
  for (const term of terms) {
    if (text.includes(normalize(term))) found.push(term);
  }
  return points;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function findPhraseMatches(text: string, phrases: readonly string[], minRatio: number) {
  const hits: string[] = [];
  for (const phrase of phrases) {
    const normalizedPhrase = normalize(phrase);
    if (text.includes(normalizedPhrase)) {
      hits.push(normalizedPhrase);
      continue;
    }
    const words = normalizedPhrase.split(/\s+/).filter((word) => word.length > 1);
    if (!words.length) continue;
    const matched = words.filter((word) => text.includes(word)).length;
    if (matched / words.length >= minRatio) {
      hits.push(normalizedPhrase);
    }
  }
  return hits;
}

function findRifMatches(text: string) {
  const matches = text.match(new RegExp(RIF_REGEX.source, 'g'));
  if (!matches) return [];
  return [...new Set(matches.map((item) => item.replace(/\s+/g, ' ').trim()))];
}

function findCedulaMatches(text: string) {
  const matches = text.match(/\b[VE]\s?\d{6,9}\b/g);
  if (!matches) return [];
  return [...new Set(matches.map((item) => item.replace(/\s+/g, ' ').trim()))];
}

function findCedulaBareNumbersWithContext(text: string) {
  const matches = text.match(/\b\d{6,9}\b/g);
  if (!matches) return [];
  const contextHints = ['CEDULA', 'IDENTIDAD'];
  const valid: string[] = [];
  for (const token of matches) {
    const idx = text.indexOf(token);
    if (idx < 0) continue;
    const context = text.slice(Math.max(0, idx - 50), idx + 50);
    if (contextHints.some((hint) => context.includes(hint))) {
      valid.push(token);
    }
  }
  return [...new Set(valid)];
}

function findAllDateStrings(text: string) {
  const matches = text.match(DATE_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function parseDate(token: string) {
  const parts = token.split(/[/-]/).map((x) => Number(x));
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) return null;

  let year: number;
  let month: number;
  let day: number;

  if (/^\d{4}[/-]/.test(token)) {
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else {
    day = parts[0];
    month = parts[1];
    year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return round(value);
}

function buildError(message: string): SlotValidationResult {
  return {
    status: 'error',
    messages: [message],
    warnings: [],
    extracted: {
      hasText: false,
      usedOcr: false,
      keywordsFound: [],
      datesFound: []
    },
    quality: {
      sharpnessLabel: 'unknown'
    },
    score: 0,
    validityStatus: 'unknown'
  };
}
