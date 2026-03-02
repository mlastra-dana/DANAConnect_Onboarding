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
    <Card className="mx-auto max-w-3xl border-slate-200 bg-white shadow-soft-dark">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-orange-50 p-2">
          <CheckCircle2 className="h-7 w-7 text-perfilabOrange" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-perfilabDark">Solicitud recibida</h1>
          <p className="mt-1 text-perfilabGray">Tu documentación fue recibida y está en revisión.</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h2 className="text-base font-semibold text-perfilabDark">Resumen</h2>
        <div className="mt-3 space-y-1.5 text-sm text-perfilabGray">
          <p>
            <span className="font-medium text-perfilabDark">Empresa:</span> {state.tenant.name}
          </p>
          <p>
            <span className="font-medium text-perfilabDark">Documentos recibidos:</span> {validDocsCount}/3
          </p>
          <p>
            <span className="font-medium text-perfilabDark">Archivo de datos:</span> {excelReceived ? 'Recibido' : 'No cargado'}
          </p>
          <p>
            <span className="font-medium text-perfilabDark">Fecha:</span> {formatDateTime(submittedAt)}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50/70 p-4">
        <p className="text-xs uppercase tracking-wide text-perfilabGray">Código de solicitud</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xl font-bold tracking-wider text-perfilabOrange">{requestCode}</p>
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

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={handleDownloadReceipt}>
          Descargar comprobante
        </Button>
        <Button type="button" variant="secondary" onClick={handleBackHome}>
          Volver al inicio
        </Button>
      </div>
    </Card>
  );
}
