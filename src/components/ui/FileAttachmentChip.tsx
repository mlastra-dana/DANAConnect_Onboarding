import { X } from 'lucide-react';
import { ValidationStatus } from '../../app/types';

const statusStyles: Record<ValidationStatus, string> = {
  pending: 'border-borderLight bg-white',
  validating: 'border-borderLight bg-surface',
  valid: 'border-borderLight bg-white',
  warning: 'border-amber-200 bg-amber-50',
  error: 'border-borderLight bg-white',
  review: 'border-borderLight bg-white'
};

export function FileAttachmentChip({
  fileName,
  onRemove,
  status = 'pending',
  helperText
}: {
  fileName: string;
  onRemove: () => void;
  status?: ValidationStatus;
  helperText?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-sm ${statusStyles[status]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-dark">Archivo: {fileName}</p>
        <button
          type="button"
          aria-label="Quitar archivo"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-borderLight text-grayText transition hover:bg-surface hover:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {helperText ? <p className="mt-1 text-xs text-grayText">{helperText}</p> : null}
    </div>
  );
}
