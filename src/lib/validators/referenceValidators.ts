import { DocumentValidationResult } from '../../app/types';
import { getPdfInfo } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';

export async function validateReferenceFile(file: File): Promise<DocumentValidationResult> {
  const basic = validateBasicFile(file);
  if (!basic.success || file.size === 0) {
    return rejectedReference(basic.errors[0] ?? 'El archivo está vacío.');
  }

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

  return {
    status: 'warning',
    checks: [
      { label: 'Formato y tamaño permitidos', passed: true },
      { label: 'Archivo abierto correctamente', passed: true }
    ],
    warnings: ['Archivo recibido. El contenido y la autenticidad de la referencia quedan pendientes de revisión.'],
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
