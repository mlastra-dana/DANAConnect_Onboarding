import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOnboarding } from '../app/OnboardingContext';
import { buildInvalidRowsCsv, parseExcelWithValidation } from '../lib/excel/excelParser';
import { ExcelUploader } from '../components/onboarding/ExcelUploader';
import { ValidationTable } from '../components/onboarding/ValidationTable';
import { Button } from '../components/ui/Button';

type ProgressState = { processedRows: number; totalRows: number };

export function ExcelPage({ companyId }: { companyId: string }) {
  const { state, setExcel } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progress, setProgress] = useState<ProgressState>({ processedRows: 0, totalRows: 0 });
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  function createPendingExcelState() {
    return {
      status: 'pending' as const,
      totalRows: 0,
      processedRows: 0,
      validRows: 0,
      invalidRows: 0,
      headers: [],
      previewRows: [],
      issues: []
    };
  }

  async function handleExcel(file: File) {
    const lowerName = file.name.toLowerCase();
    const isAccepted = lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv');
    if (!isAccepted) {
      setSelectedFileName(null);
      setExcel({
        ...state.excel,
        status: 'error',
        issues: [
          {
            rowNumber: 1,
            reasons: ['Formato inválido. Solo se acepta .xlsx o .csv'],
            rowData: {}
          }
        ]
      });
      return;
    }

    setSelectedFileName(file.name);
    setUploading(true);
    setUploadProgress(0);
    await simulateUpload((value) => setUploadProgress(value));
    setUploading(false);

    setLoading(true);
    setProgress({ processedRows: 0, totalRows: 0 });
    setExcel({
      ...state.excel,
      status: 'validating',
      processedRows: 0,
      totalRows: 0,
      invalidRows: 0,
      validRows: 0,
      issues: [],
      headers: [],
      previewRows: []
    });

    try {
      const result = await parseExcelWithValidation(file, (processedRows, totalRows) => {
        setProgress({ processedRows, totalRows });
      });
      setExcel(result);
      setProgress({ processedRows: result.processedRows, totalRows: result.totalRows });
    } catch {
      setExcel({
        ...state.excel,
        status: 'error',
        issues: [
          {
            rowNumber: 1,
            reasons: ['No se pudo procesar el Excel. Verifique estructura y codificación.'],
            rowData: {}
          }
        ]
      });
    } finally {
      setLoading(false);
    }
  }

  function handleClearExcel() {
    setSelectedFileName(null);
    setUploading(false);
    setUploadProgress(0);
    setLoading(false);
    setProgress({ processedRows: 0, totalRows: 0 });
    setExcel(createPendingExcelState());
  }

  function downloadErrorsCsv() {
    const csv = buildInvalidRowsCsv(state.excel.issues);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'errores_validacion.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const excelForUi = loading
    ? { ...state.excel, status: 'validating' as const, processedRows: progress.processedRows, totalRows: progress.totalRows }
    : state.excel;

  return (
    <div className="space-y-6">
      <ExcelUploader
        excel={excelForUi}
        loading={loading || uploading}
        isUploading={uploading}
        uploadProgress={uploadProgress}
        selectedFileName={selectedFileName}
        onSelect={handleExcel}
        onClear={handleClearExcel}
      />
      <ValidationTable excel={state.excel} />

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}/documents`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadErrorsCsv} disabled={state.excel.issues.length === 0}>
            Descargar CSV de errores
          </Button>
          <Link to={`/onboarding/${companyId}/review`}>
            <Button disabled={state.excel.status !== 'valid'}>Continuar a revisión</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

async function simulateUpload(onProgress: (progress: number) => void) {
  return new Promise<void>((resolve) => {
    let value = 0;
    onProgress(0);
    const timer = setInterval(() => {
      value += 12;
      if (value >= 100) {
        onProgress(100);
        clearInterval(timer);
        resolve();
        return;
      }
      onProgress(value);
    }, 35);
  });
}
