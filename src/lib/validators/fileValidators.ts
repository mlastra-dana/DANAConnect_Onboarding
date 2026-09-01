import { z } from 'zod';

const MAX_FILE_SIZE_MB = 4.5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = `${MAX_FILE_SIZE_MB}MB`;

export const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

export const fileSchema = z
  .instanceof(File)
  .refine((file) => allowedMimeTypes.includes(file.type), {
    message: 'Formato inválido. Solo se permiten PDF, JPG, PNG o WEBP.'
  })
  .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
    message: `El archivo supera el tamaño máximo temporal de ${MAX_FILE_SIZE_LABEL}. Comprímalo e intente nuevamente.`
  });

export function validateBasicFile(file: File) {
  const result = fileSchema.safeParse(file);
  return {
    success: result.success,
    errors: result.success ? [] : result.error.issues.map((i) => i.message)
  };
}
