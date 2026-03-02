import { X } from 'lucide-react';
import { ValidationStatus } from '../../app/types';

const statusStyles: Record<ValidationStatus, string> = {
  pending: 'border-slate-200 bg-white',
  validating: 'border-orange-200 bg-orange-50/70',
  valid: 'border-orange-200 bg-orange-50',
  error: 'border-red-200 bg-red-50'
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
        <p className="truncate text-sm font-medium text-perfilabDark">Archivo: {fileName}</p>
        <button
          type="button"
          aria-label="Quitar archivo"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-perfilabGray transition hover:bg-slate-100 hover:text-perfilabDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-perfilabOrange"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {helperText ? <p className="mt-1 text-xs text-perfilabGray">{helperText}</p> : null}
    </div>
  );
}
