import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import { buildReceiptData, formatDateTime, generateReceiptHtml, openReceiptPrintWindow, shortRequestCode } from '../lib/receipt';

export function SuccessPage({ companyId }: { companyId: string }) {
  const { state, resetOnboarding } = useOnboarding();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const submittedAt = state.submission.submittedAt ? new Date(state.submission.submittedAt) : new Date();
  const requestCode = shortRequestCode(state.submission.registrationId);
  const representative1 = state.representatives[0];
  const validDocsCount =
    Object.values(state.documents).filter((doc) => doc.validation.status === 'valid').length +
    (representative1.document.validation.status === 'valid' ? 1 : 0);
  const excelReceived = state.excel.totalRows > 0;

  async function handleCopyCode() {
    await navigator.clipboard.writeText(requestCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownloadReceipt() {
    const data = buildReceiptData(state);
    const receiptHtml = generateReceiptHtml(data);
    const opened = openReceiptPrintWindow(receiptHtml);
    if (!opened) {
      setDownloadError('No se pudo abrir la ventana de impresión. Verifique el bloqueo de pop-ups.');
      setTimeout(() => setDownloadError(null), 2500);
    }
  }

  function handleBackHome() {
    resetOnboarding();
    navigate(`/onboarding/${companyId}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border border-borderLight bg-white px-6 py-10 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF4F1]">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-dark">Proceso completado</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-grayText md:text-base">
          Hemos recibido tu documentación correctamente. Nuestro equipo la revisará en breve.
        </p>
      </div>

      <Card className="mx-auto max-w-3xl">
        <h2 className="text-base font-semibold text-dark">Resumen de la solicitud</h2>
        <div className="mt-3 space-y-1.5 text-sm text-grayText">
          <p>
            <span className="font-medium text-dark">Empresa:</span> {state.tenant.name}
          </p>
          <p>
            <span className="font-medium text-dark">Documentos recibidos:</span> {validDocsCount}/3
          </p>
          <p>
            <span className="font-medium text-dark">Archivo de datos:</span> {excelReceived ? 'Recibido' : 'No cargado'}
          </p>
          <p>
            <span className="font-medium text-dark">Fecha:</span> {formatDateTime(submittedAt)}
          </p>
        </div>
      </Card>

      <div className="rounded-xl border border-[#F5C7BB] bg-[#FFF4F1] p-4">
        <p className="text-xs uppercase tracking-wide text-grayText">Código de solicitud</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xl font-bold tracking-wider text-primary">{requestCode}</p>
          <Button type="button" variant="secondary" onClick={() => void handleCopyCode()}>
            <Copy className="h-4 w-4" />
            Copiar código
          </Button>
        </div>
      </div>

      {copied ? (
        <div className="mt-4">
          <Toast type="success" message="Código copiado al portapapeles." />
        </div>
      ) : null}
      {downloadError ? (
        <div className="mt-4">
          <Toast type="error" message={downloadError} />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={handleDownloadReceipt}>
          Descargar comprobante
        </Button>
        <Button type="button" variant="secondary" onClick={handleBackHome}>
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
