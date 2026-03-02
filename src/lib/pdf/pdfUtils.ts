import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

export async function getPdfInfo(file: File) {
  const buffer = await file.arrayBuffer();
  const doc = await getDocument({ data: buffer }).promise;
  return {
    doc,
    pageCount: doc.numPages
  };
}

export async function extractPdfText(file: File, pagesToRead = 2) {
  const { doc, pageCount } = await getPdfInfo(file);
  const maxPages = Math.min(pageCount, pagesToRead);
  const chunks: string[] = [];

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) chunks.push(pageText);
  }

  return chunks.join(' ');
}

export async function renderPdfPageToCanvas(file: File, pageNumber = 1, scale = 1.8) {
  const { doc } = await getPdfInfo(file);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear contexto de canvas.');

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}
