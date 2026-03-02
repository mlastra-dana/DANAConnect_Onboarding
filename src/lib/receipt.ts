import { OnboardingState } from '../app/types';

type ReceiptData = {
  companyName: string;
  companyId: string;
  requestCode: string;
  submittedAt: Date;
  documents: Array<{ label: string; fileName?: string }>;
  excel: {
    received: boolean;
    fileName?: string;
    totalRows?: number;
    validRows?: number;
    invalidRows?: number;
  };
};

export function buildReceiptData(state: OnboardingState): ReceiptData {
  const submittedAt = state.submission.submittedAt ? new Date(state.submission.submittedAt) : new Date();
  const code = shortRequestCode(state.submission.registrationId);

  return {
    companyName: state.tenant.name,
    companyId: state.companyId,
    requestCode: code,
    submittedAt,
    documents: [
      { label: 'RIF', fileName: state.documents.rif.fileName },
      { label: 'Registro Mercantil / Acta', fileName: state.documents.registroMercantil.fileName },
      { label: 'Representante 1', fileName: state.representatives[0].document.fileName },
      {
        label: 'Representante 2',
        fileName: state.representatives[1].enabled ? state.representatives[1].document.fileName : 'No aplica'
      }
    ],
    excel: {
      received: state.excel.totalRows > 0,
      fileName: undefined,
      totalRows: state.excel.totalRows || undefined,
      validRows: state.excel.validRows || undefined,
      invalidRows: state.excel.invalidRows || undefined
    }
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

  const excelStatus = data.excel.received
    ? `Recibido${data.excel.totalRows ? ` (${data.excel.totalRows} filas)` : ''}`
    : 'No cargado';
  const excelDetail = data.excel.received
    ? `<p class="meta">Válidas: ${data.excel.validRows ?? 0} | Inválidas: ${data.excel.invalidRows ?? 0}</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Constancia Perfilab | ${escapeHtml(data.requestCode)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #2f2f2f; margin: 0; background: #f7f7f7; }
      .wrap { max-width: 860px; margin: 24px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 28px; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .brand { font-weight: 700; font-size: 22px; color: #2f2f2f; }
      .accent { color: #f28c28; }
      h1 { margin: 18px 0 8px; font-size: 24px; }
      .meta { margin: 4px 0; color: #5b5b5b; font-size: 14px; }
      .code { display: inline-block; margin-top: 8px; font-weight: 700; letter-spacing: 1px; color: #f28c28; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
      th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
      th { background: #fff8ef; color: #2f2f2f; }
      .note { margin-top: 18px; padding: 12px; border: 1px solid #fde2c1; border-radius: 10px; background: #fff8ef; font-size: 14px; }
      .helper { margin-top: 12px; font-size: 12px; color: #5b5b5b; }
      .footer { margin-top: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
      @media print { body { background: #fff; } .wrap { border: none; margin: 0; max-width: 100%; border-radius: 0; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div class="brand">Grupo <span class="accent">Perfilab</span></div>
      </div>
      <h1>Comprobante de recepción de documentación</h1>
      <p class="meta"><strong>Empresa:</strong> ${escapeHtml(data.companyName)} (${escapeHtml(data.companyId)})</p>
      <p class="meta"><strong>Código de solicitud:</strong> <span class="code">${escapeHtml(data.requestCode)}</span></p>
      <p class="meta"><strong>Fecha/Hora:</strong> ${escapeHtml(dateLabel)}</p>

      <table>
        <thead><tr><th>Documento</th><th>Estatus</th></tr></thead>
        <tbody>
          ${rows}
          <tr><td>Archivo de datos (Excel/CSV)</td><td>${escapeHtml(excelStatus)}</td></tr>
        </tbody>
      </table>
      ${excelDetail}

      <div class="note">
        La documentación será revisada por el equipo de Perfilab. Si requiere soporte, indique su código de solicitud.
      </div>
      <p class="helper">Para guardar en PDF: Imprimir → Guardar como PDF.</p>
      <div class="footer">Grupo Perfilab · ${year}</div>
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
