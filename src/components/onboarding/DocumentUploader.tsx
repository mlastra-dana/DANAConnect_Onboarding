import { useId, useMemo, useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { DocumentRecord } from '../../app/types';
import { DOCUMENT_LABELS } from '../../app/state';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PdfPreview } from './PdfPreview';
import { ValidationItem } from './ValidationItem';
import { FileAttachmentChip } from '../ui/FileAttachmentChip';
import { Progress } from '../ui/Progress';

export function DocumentUploader({
  docRecord,
  title,
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
  const uiFeedback = useMemo(() => {
    if (docRecord.validation.uiStatus) {
      return docRecord.validation.uiStatus;
    }

    if (docRecord.validation.status === 'valid') {
      return { state: 'ok' as const, title: 'Validación completada', message: 'Documento aceptado.' };
    }

    if (docRecord.validation.status === 'error') {
      return {
        state: 'error' as const,
        title: 'Error',
        message: 'No pudimos validar este documento. Verifique que sea legible e intente nuevamente.'
      };
    }

    return null;
  }, [docRecord.validation.uiStatus, docRecord.validation.status]);

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
    <Card className="space-y-4 animate-fadeUp">
      {sectionTitle ? (
        <div className="space-y-2 border-b border-borderLight pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-dark">{sectionTitle}</h3>
            {sectionAction}
          </div>
          {sectionDescription ? <p className="text-sm text-grayText">{sectionDescription}</p> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-dark">{title ?? DOCUMENT_LABELS[docRecord.type]}</h3>
        <StatusBadge status={loading ? 'validating' : docRecord.validation.status} />
      </div>

      {loading ? (
        <div className="space-y-2 rounded-lg border border-[#F5C7BB] bg-[#FFF4F1] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-dark">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            {isUploading ? 'Subiendo archivo...' : 'Validando documento...'}
          </div>
          <Progress value={uploadProgress} max={100} label={`Subida ${Math.round(uploadProgress)}%`} />
          <Progress value={validationProgress} max={100} label={`Validación ${Math.round(validationProgress)}%`} />
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-label={`Subir ${DOCUMENT_LABELS[docRecord.type]}`}
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
          <Button type="button" variant="secondary" onClick={triggerFileDialog}>
            Seleccionar archivo
          </Button>
          <p className="text-xs text-grayText">PDF, JPG, PNG o WEBP. Máx. 10MB.</p>
        </div>
      </div>

      {docRecord.fileName ? (
        <div className="rounded-xl border border-borderLight p-3">
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
              alt={`Vista previa de ${DOCUMENT_LABELS[docRecord.type]}`}
              className="mt-3 max-h-56 rounded-lg"
            />
          ) : (
            <p className="mt-3 text-xs text-grayText">Vista previa no disponible.</p>
          )}
        </div>
      ) : null}

      <ul className="space-y-1 text-sm">
        {!uiFeedback ? (
          <li className="text-grayText">Aún no hay validaciones ejecutadas.</li>
        ) : (
          <ValidationItem
            status={uiFeedback.state === 'ok' ? 'pass' : 'fail'}
            label={uiFeedback.title}
            detail={uiFeedback.message !== uiFeedback.title ? uiFeedback.message : undefined}
          />
        )}
      </ul>
    </Card>
  );
}
