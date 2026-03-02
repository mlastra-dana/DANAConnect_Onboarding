import { OnboardingState } from '../../app/types';

export type DemoEmailPayload = {
  trackingId: string;
  submittedAtISO: string;
  subject: string;
  body: string;
};

export type SendEmailResult = {
  ok: boolean;
  to?: string;
  messageId?: string;
  error?: string;
};

export function buildDemoEmail(state: OnboardingState, companyId: string, externalTrigger?: string | null): DemoEmailPayload {
  const trackingId = crypto.randomUUID();
  const submittedAtISO = new Date().toISOString();
  const portalLink = `${window.location.origin}/onboarding/${companyId}${
    externalTrigger ? `?externalTrigger=${encodeURIComponent(externalTrigger)}` : ''
  }`;

  const companyName = state.tenant.name;

  const subject = `Perfilab | Onboarding recibido | ${companyName} | ${trackingId}`;
  const body = [
    'Hola,',
    '',
    'Se recibió documentación validada desde el Portal de Onboarding Perfilab.',
    '',
    `Empresa: ${companyName} (ID: ${companyId})`,
    `Tracking ID: ${trackingId}`,
    `Fecha: ${submittedAtISO}`,
    `Link del portal: ${portalLink}`,
    '',
    'Resumen de validación:',
    `- RIF: ${statusLabel(state.documents.rif.validation.status)} | Archivo: ${state.documents.rif.fileName ?? 'N/A'}`,
    `- Registro Mercantil: ${statusLabel(state.documents.registroMercantil.validation.status)} | Archivo: ${
      state.documents.registroMercantil.fileName ?? 'N/A'
    }`,
    `- Cédula Representante 1: ${statusLabel(state.representatives[0].document.validation.status)} | Archivo: ${
      state.representatives[0].document.fileName ?? 'N/A'
    } | Cédula detectada: ${maskDetectedId(state.representatives[0].document.validation.extractedId)}`,
    `- Cédula Representante 2: ${
      state.representatives[1].enabled ? statusLabel(state.representatives[1].document.validation.status) : 'No aplica'
    } | Archivo: ${state.representatives[1].enabled ? state.representatives[1].document.fileName ?? 'N/A' : 'No aplica'}`,
    `- Archivo de datos: ${statusLabel(state.excel.status)} | Archivo: N/A | Filas: ${state.excel.totalRows} | Válidas: ${
      state.excel.validRows
    } | Inválidas: ${state.excel.invalidRows}`,
    '',
    'Nota (modo demo):',
    'Los archivos fueron validados localmente en el navegador y no se adjuntan automáticamente.',
    '',
    'Gracias.'
  ].join('\n');

  return { trackingId, submittedAtISO, subject, body };
}

export function openMailto(subject: string, body: string) {
  const mailto = `mailto:mlastra@danaconnect.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

export async function copyEmailToClipboard(subject: string, body: string) {
  const content = `Asunto:\n${subject}\n\nCuerpo:\n${body}`;
  await navigator.clipboard.writeText(content);
}

export async function sendEmailViaApi(subject: string, body: string): Promise<SendEmailResult> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subject, body })
    });

    const data = (await response.json()) as SendEmailResult;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? 'No se pudo enviar el correo'
      };
    }

    return data;
  } catch {
    return {
      ok: false,
      error: 'No se pudo conectar con el servicio de envío.'
    };
  }
}

function statusLabel(status: string) {
  if (status === 'valid') return 'Válido';
  if (status === 'error') return 'Error';
  if (status === 'validating') return 'Validando';
  return 'Pendiente';
}

function maskDetectedId(value?: string) {
  if (!value) return 'N/A';
  if (value.length < 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-3)}`;
}
