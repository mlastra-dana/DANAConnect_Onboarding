import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { ExcelValidationState } from '../../app/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { StatusBadge } from '../ui/Badge';
import { FileAttachmentChip } from '../ui/FileAttachmentChip';

export function ExcelUploader({
  excel,
  loading,
  isUploading,
  uploadProgress,
  selectedFileName,
  onSelect,
  onClear
}: {
  excel: ExcelValidationState;
  loading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  selectedFileName: string | null;
  onSelect: (file: File) => Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function processFile(file: File) {
    await onSelect(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  function handleRemoveClick() {
    if (inputRef.current) inputRef.current.value = '';
    onClear();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark">Carga de Excel</h3>
        <StatusBadge status={loading ? 'validating' : excel.status} />
      </div>

      <div
        className={`rounded-xl border border-dashed p-4 transition-colors duration-200 ${
          dragOver ? 'border-primary bg-[#FAFAFA]' : 'border-borderLight bg-white'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm font-medium text-dark">Arrastra tu Excel o selecciónalo</p>
              <p className="text-xs text-grayText">Formato .xlsx o .csv.</p>
            </div>
          </div>

          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
            Buscar
          </Button>
        </div>

        <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={(e) => void handleInputChange(e)} className="hidden" />
      </div>

      {selectedFileName ? (
        <FileAttachmentChip fileName={selectedFileName} status={excel.status} onRemove={handleRemoveClick} />
      ) : null}

      {loading ? (
        <div className="space-y-2 rounded-lg border border-[#F5C7BB] bg-[#FFF4F1] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-dark">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            {isUploading ? 'Subiendo Excel...' : 'Validando Excel...'}
          </div>
          <Progress value={uploadProgress} max={100} label={`Subida ${Math.round(uploadProgress)}%`} />
          <Progress
            value={excel.processedRows}
            max={Math.max(excel.totalRows, 1)}
            label={`Validación ${excel.processedRows}/${excel.totalRows || '?'} filas`}
          />
        </div>
      ) : excel.processedRows > 0 ? (
        <Progress
          value={excel.processedRows}
          max={Math.max(excel.totalRows, 1)}
          label={`Validación ${excel.processedRows}/${excel.totalRows || '?'} filas`}
        />
      ) : null}

      {excel.totalRows > 0 ? (
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Total" value={excel.totalRows} />
          <Stat label="Válidas" value={excel.validRows} />
          <Stat label="Inválidas" value={excel.invalidRows} />
          <Stat label="Estado" value={excel.status === 'valid' ? '100% OK' : 'Con errores'} />
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-borderLight bg-white p-3 text-center">
      <p className="text-xs text-grayText">{label}</p>
      <p className="text-base font-semibold text-dark">{value}</p>
    </div>
  );
}
