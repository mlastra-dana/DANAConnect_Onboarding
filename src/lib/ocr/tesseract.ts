import { createWorker } from 'tesseract.js';

export async function extractTextWithOCR(image: string | HTMLCanvasElement): Promise<string> {
  const worker = await createWorker('spa');
  try {
    const result = await worker.recognize(image);
    return result.data.text ?? '';
  } finally {
    await worker.terminate();
  }
}
