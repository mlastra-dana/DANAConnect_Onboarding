import { DocumentValidationResult } from '../../app/types';
import { getPdfInfo } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';

type ReferenceType = 'referenciaPersonal' | 'referenciaComercial' | 'referenciaBancaria';

const referenceSignals: Record<ReferenceType, { label: string; title: RegExp; evidence: RegExp[] }> = {
  referenciaPersonal: {
    label: 'Referencia personal',
    title: /\b(?:REFERENCIA PERSONAL|REFERENCIAS PERSONALES|PERSONAL REFERENCE)\b/,
    evidence: [
      /\b(?:CONOZCO|CONOCEMOS|CONOCIDO)\b/,
      /\b(?:RECOMIENDO|RECOMENDAMOS|RESPONSABLE|HONESTO|HONESTA|CONDUCTA)\b/,
      /\b(?:CEDULA|IDENTIDAD|IDENTIFICACION)\b/
    ]
  },
  referenciaComercial: {
    label: 'Referencia comercial',
    title: /\b(?:REFERENCIA COMERCIAL|REFERENCIAS COMERCIALES|TRADE REFERENCE)\b/,
    evidence: [
      /\bRELACION(?:ES)? COMERCIAL(?:ES)?\b/,
      /\b(?:CLIENTE|PROVEEDOR|EMPRESA|COMPANIA)\b/,
      /\b(?:CONSTAR|CERTIFICA|CERTIFICAMOS|CUMPLIMIENTO|PUNTUAL|OBLIGACIONES)\b/
    ]
  },
  referenciaBancaria: {
    label: 'Referencia bancaria',
    title: /\b(?:REFERENCIA BANCARIA|REFERENCIAS BANCARIAS|BANK REFERENCE)\b/,
    evidence: [
      /\b(?:BANCO|BANCA|BANCARIA|BANCARIO|INSTITUCION FINANCIERA|VENEZOLANO DE CREDITO)\b/,
      /\b(?:CUENTA|CLIENTE|TITULAR|RELACION BANCARIA)\b/,
      /\b(?:REFERENCIA|CONSTANCIA|CONSTAR|CERTIFICA|CERTIFICAMOS|CERTIFICACION|INFORMAMOS|INFORMAR)\b/
    ]
  }
};

export async function validateReferenceFile(file: File, type: ReferenceType): Promise<DocumentValidationResult> {
  const basic = validateBasicFile(file);
  if (!basic.success || file.size === 0) {
    return rejectedReference(basic.errors[0] ?? 'El archivo está vacío.');
  }

  let extractedText = '';
  try {
    if (file.type === 'application/pdf') {
      const { doc, pageCount } = await getPdfInfo(file);
      try {
        if (!pageCount) return rejectedReference('El PDF no contiene páginas.');
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1, 1200 / Math.max(viewport.width, viewport.height));
        const renderViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo abrir el PDF.');
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        try {
          const chunks: string[] = [];
          for (let pageIndex = 1; pageIndex <= Math.min(pageCount, 3); pageIndex++) {
            const textPage = await doc.getPage(pageIndex);
            const content = await textPage.getTextContent();
            chunks.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
          }
          extractedText = chunks.join(' ');
        } catch {
          // A readable scan can still lack an extractable text layer.
          extractedText = '';
        }
      } finally {
        await doc.destroy();
      }
    } else {
      const bitmap = await createImageBitmap(file);
      try {
        if (!bitmap.width || !bitmap.height) return rejectedReference('La imagen está vacía.');
      } finally {
        bitmap.close();
      }
    }
  } catch {
    return rejectedReference('No se pudo abrir el archivo. Cargue un PDF sin contraseña o una imagen válida.');
  }

  const checks: DocumentValidationResult['checks'] = [
    { label: 'Formato y tamaño permitidos', passed: true },
    { label: 'Archivo abierto correctamente', passed: true }
  ];
  const normalizedText = extractedText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const expected = referenceSignals[type];
  const extracted = { hasText: Boolean(normalizedText), usedOcr: false };
  const otherReferenceTitle = Object.entries(referenceSignals).find(([key, signals]) => key !== type && signals.title.test(normalizedText));

  if (otherReferenceTitle && !expected.title.test(normalizedText)) {
    return {
      ...rejectedReference(`El texto identifica una ${otherReferenceTitle[1].label.toLowerCase()}. Cargue una ${expected.label.toLowerCase()} en este espacio.`),
      checks,
      extracted
    };
  }

  if (expected.title.test(normalizedText) || expected.evidence.every(signal => signal.test(normalizedText))) {
    return {
      status: 'valid',
      typeStatus: 'valid',
      checks: [...checks, { label: `${expected.label} identificada en el texto`, passed: true }],
      uiStatus: { state: 'ok', title: 'Comprobación básica completada', message: `${expected.label} identificada por su contenido.` },
      extracted,
      validityStatus: 'unknown',
      quality: { sharpnessLabel: 'unknown' }
    };
  }

  if (normalizedText.length >= 80 && normalizedText.split(' ').length >= 12) {
    return {
      ...rejectedReference(`No se encontraron señales de ${expected.label.toLowerCase()} en el texto del PDF. Revise el documento y cargue la referencia correspondiente.`),
      checks: [...checks, { label: `${expected.label} identificada en el texto`, passed: false }],
      extracted
    };
  }

  return {
    status: 'warning',
    checks,
    warnings: ['Archivo recibido. No hay suficiente texto extraíble para identificar el tipo de referencia; su contenido queda pendiente de revisión.'],
    extracted,
    validityStatus: 'unknown',
    quality: { sharpnessLabel: 'unknown' }
  };
}

function rejectedReference(message: string): DocumentValidationResult {
  return {
    status: 'error',
    checks: [],
    reasons: [message],
    uiStatus: { state: 'error', title: 'Archivo rechazado', message }
  };
}
