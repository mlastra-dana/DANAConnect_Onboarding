import { X } from 'lucide-react';
import { ValidationStatus } from '../../app/types';

const statusStyles: Record<ValidationStatus, string> = {
  pending: 'border-borderLight bg-white',
  validating: 'border-[#F5C7BB] bg-[#FFF4F1]',
  valid: 'border-[#CDEED8] bg-successSoft',
  error: 'border-[#F9C9C3] bg-errorSoft'
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
