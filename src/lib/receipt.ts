import { OnboardingState } from '../app/types';
import { getDocumentLabel, getDocumentOrder, getFlowConfig, requiresRepresentatives } from '../config/onboardingCountries';

type ReceiptData = {
  companyName: string;
  companyId: string;
  requestCode: string;
  submittedAt: Date;
  documents: Array<{ label: string; fileName?: string }>;
};

export function buildReceiptData(state: OnboardingState): ReceiptData {
  const submittedAt = state.submission.submittedAt ? new Date(state.submission.submittedAt) : new Date();
  const code = shortRequestCode(state.submission.registrationId);
  const flow = getFlowConfig(state.country, state.personType);
  const documents = getDocumentOrder(state.country, state.personType).map((docType) => ({
    label: getDocumentLabel(state.country, state.personType, docType),
    fileName: state.documents[docType].fileName
  }));

  if (requiresRepresentatives(state.country, state.personType)) {
    documents.push({ label: flow.reviewRepresentativePrimaryLabel ?? 'Representante 1', fileName: state.representatives[0].document.fileName });
    documents.push({
      label: flow.reviewRepresentativeSecondaryLabel ?? 'Representante 2',
      fileName: state.representatives[1].enabled ? state.representatives[1].document.fileName : 'No aplica'
    });
  }
  documents.push({ label: 'Biometría', fileName: biometricToFileLabel(state.biometrics.status) });

  return {
    companyName: state.tenant.name,
    companyId: state.companyId,
    requestCode: code,
    submittedAt,
    documents
  };
}

export function shortRequestCode(trackingId?: string) {
  if (!trackingId) return 'PENDIENTE';
  const compact = trackingId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return compact.slice(0, 6) || 'PENDIENTE';
}

export function generateReceiptHtml(data: ReceiptData) {
  const dateLabel = formatDateTime(data.submittedAt);
  const year = new Date().getFullYear();
  const rows = data.documents
    .map((doc) => {
      if (doc.fileName === 'No aplica') {
        return `<tr><td>${escapeHtml(doc.label)}</td><td>No aplica</td></tr>`;
      }
      const fileInfo = doc.fileName ? ` (${escapeHtml(doc.fileName)})` : '';
      return `<tr><td>${escapeHtml(doc.label)}</td><td>Recibido${fileInfo}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Constancia DanaConnect | ${escapeHtml(data.requestCode)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #2f2f2f; margin: 0; background: #f7f7f7; }
      .wrap { max-width: 860px; margin: 24px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 28px; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .brand { font-weight: 700; font-size: 22px; color: #1f1f1f; }
      .accent { color: #dd5736; }
      h1 { margin: 18px 0 8px; font-size: 24px; }
      .meta { margin: 4px 0; color: #5b5b5b; font-size: 14px; }
      .code { display: inline-block; margin-top: 8px; font-weight: 700; letter-spacing: 1px; color: #dd5736; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
      th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
      th { background: #fff4f1; color: #1f1f1f; }
      .note { margin-top: 18px; padding: 12px; border: 1px solid #f5c7bb; border-radius: 10px; background: #fff4f1; font-size: 14px; }
      .helper { margin-top: 12px; font-size: 12px; color: #5b5b5b; }
      .footer { margin-top: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
      @media print { body { background: #fff; } .wrap { border: none; margin: 0; max-width: 100%; border-radius: 0; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div class="brand">Dana<span class="accent">Connect</span></div>
      </div>
      <h1>Comprobante de recepción de documentación</h1>
      <p class="meta"><strong>Empresa:</strong> ${escapeHtml(data.companyName)} (${escapeHtml(data.companyId)})</p>
      <p class="meta"><strong>Código de solicitud:</strong> <span class="code">${escapeHtml(data.requestCode)}</span></p>
      <p class="meta"><strong>Fecha/Hora:</strong> ${escapeHtml(dateLabel)}</p>

      <table>
        <thead><tr><th>Documento</th><th>Estatus</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="note">
        La documentación será revisada por el equipo de DanaConnect. Si requiere soporte, indique su código de solicitud.
      </div>
      <p class="helper">Para guardar en PDF: Imprimir → Guardar como PDF.</p>
      <div class="footer">DanaConnect · ${year}</div>
    </div>
  </body>
</html>`;
}

export function openReceiptPrintWindow(receiptHtml: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(receiptHtml);
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  return true;
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function biometricToFileLabel(status: 'pending' | 'processing' | 'passed' | 'failed') {
  if (status === 'passed') return 'Validada';
  if (status === 'failed') return 'Fallida';
  if (status === 'processing') return 'En proceso';
  return 'Pendiente';
}
