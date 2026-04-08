import { useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { DocumentRecord } from '../../app/types';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PdfPreview } from './PdfPreview';
import { FileAttachmentChip } from '../ui/FileAttachmentChip';
import { Progress } from '../ui/Progress';

export function DocumentUploader({
  docRecord,
  title,
  label,
  sectionTitle,
  sectionDescription,
  sectionAction,
  loading,
  isUploading,
  uploadProgress,
  validationProgress,
  previewFile,
  onSelectFile,
  onRemoveFile
}: {
  docRecord: DocumentRecord;
  title?: string;
  label?: string;
  sectionTitle?: string;
  sectionDescription?: string;
  sectionAction?: React.ReactNode;
  loading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  validationProgress: number;
  previewFile?: File;
  onSelectFile: (file: File) => Promise<void>;
  onRemoveFile: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const fileAccept = useMemo(() => '.pdf,.png,.jpg,.jpeg,.webp', []);
  const resolvedLabel = label ?? title ?? docRecord.type;
  const feedbackStatus = loading
    ? 'pending'
    : docRecord.validation.status === 'valid'
      ? 'valid'
      : docRecord.validation.status === 'warning'
        ? 'warning'
      : docRecord.validation.status === 'error'
        ? 'error'
        : docRecord.validation.status === 'review'
          ? 'review'
          : 'pending';
  const friendlyErrorMessage =
    docRecord.validation.uiStatus?.message || 'No pudimos validar este documento. Verifique que sea legible e intente nuevamente.';
  const pendingMessage = docRecord.validation.uiStatus?.message || 'Aún no hay validaciones ejecutadas.';
  const warningMessages = docRecord.validation.warnings ?? [];
  const fileContainerClass =
    feedbackStatus === 'valid'
      ? 'border-green-200 bg-green-50/40'
      : feedbackStatus === 'error'
        ? 'border-red-200 bg-red-50/30'
        : 'border-borderLight';

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    await onSelectFile(fileList[0]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleRemoveClick() {
    onRemoveFile();
    if (inputRef.current) inputRef.current.value = '';
  }

  function triggerFileDialog() {
    inputRef.current?.click();
  }

  return (
    <Card className="relative space-y-4 animate-fadeUp">
      <div className="absolute right-5 top-5">
        <StatusBadge status={feedbackStatus} />
      </div>
      {sectionTitle ? (
        <div className="space-y-2 border-b border-borderLight pb-3">
          <h3 className="pr-24 text-lg font-semibold text-dark">{sectionTitle}</h3>
          {sectionDescription ? <p className="text-sm text-grayText">{sectionDescription}</p> : null}
          {sectionAction ? <div className="pt-1">{sectionAction}</div> : null}
        </div>
      ) : null}

      <h3 className="pr-24 text-lg font-semibold text-dark">{title ?? resolvedLabel}</h3>

      {loading ? (
        <div className="space-y-2 rounded-lg border border-borderLight bg-surface p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-dark">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-grayText" />
            {isUploading ? 'Subiendo archivo...' : 'Validando documento...'}
          </div>
          <Progress value={uploadProgress} max={100} label={`Subida ${Math.round(uploadProgress)}%`} />
          <Progress value={validationProgress} max={100} label={`Validación ${Math.round(validationProgress)}%`} />
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-label={`Subir ${resolvedLabel}`}
        onClick={triggerFileDialog}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            triggerFileDialog();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed p-5 transition-colors duration-200 ${
          dragOver ? 'border-primary bg-[#FAFAFA]' : 'border-borderLight bg-white'
        }`}
      >
        <div className="flex flex-col items-center gap-2 text-center text-sm text-grayText">
          <UploadCloud className="h-6 w-6 text-primary" />
          <p>Arrastra tu archivo o selecciónalo.</p>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={fileAccept}
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files);
            }}
          />
          <label htmlFor={inputId} className="sr-only">
            Seleccionar archivo
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              triggerFileDialog();
            }}
          >
            Seleccionar archivo
          </Button>
          <p className="text-xs text-grayText">PDF, JPG, PNG o WEBP. Máx. 10MB.</p>
        </div>
      </div>

      {docRecord.fileName ? (
        <div className={`rounded-xl border p-3 ${fileContainerClass}`}>
          <FileAttachmentChip fileName={docRecord.fileName} status={docRecord.validation.status} onRemove={handleRemoveClick} />
          {docRecord.fileType?.includes('pdf') ? (
            previewFile ? (
              <div className="mt-3">
                <PdfPreview file={previewFile} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-grayText">Vista previa disponible tras volver a cargar el archivo.</p>
            )
          ) : docRecord.previewUrl ? (
            <img
              src={docRecord.previewUrl}
              alt={`Vista previa de ${resolvedLabel}`}
              className="mt-3 max-h-56 rounded-lg"
            />
          ) : (
            <p className="mt-3 text-xs text-grayText">Vista previa no disponible.</p>
          )}
        </div>
      ) : null}

      <div className="space-y-1 text-sm">
        {feedbackStatus === 'valid' ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
            <CheckCircle className="h-4 w-4" />
            <span>Documento aceptado.</span>
          </p>
        ) : null}
        {feedbackStatus === 'warning' ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span>Válido con advertencias</span>
          </p>
        ) : null}
        {feedbackStatus === 'error' ? (
          <div>
            <p className="inline-flex items-center gap-1.5 font-medium text-red-700">
              <XCircle className="h-4 w-4" />
              <span>Documento inválido</span>
            </p>
            <p className="text-gray-700">{friendlyErrorMessage}</p>
          </div>
        ) : null}
        {feedbackStatus === 'review' ? (
          <div>
            <p className="font-medium text-amber-700">Revisión requerida</p>
            <p className="text-gray-700">{pendingMessage}</p>
          </div>
        ) : null}
        {warningMessages.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium text-amber-700">Advertencia</p>
            {warningMessages.map((warning, idx) => (
              <p key={`${warning}-${idx}`} className="text-sm text-amber-700">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        {feedbackStatus === 'pending' ? <p className="text-grayText">{pendingMessage}</p> : null}
      </div>
    </Card>
  );
}
