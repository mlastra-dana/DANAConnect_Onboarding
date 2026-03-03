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

  const subject = `DanaConnect | Onboarding recibido | ${companyName} | ${trackingId}`;
  const body = [
    'Hola equipo DanaConnect,',
    '',
    'Se recibió documentación desde el Portal de Onboarding.',
    '',
    `Empresa: ${companyName} (ID: ${companyId})`,
    `Código: ${trackingId}`,
    `Fecha: ${submittedAtISO}`,
    `Link del portal: ${portalLink}`,
    '',
    'Resumen:',
    `- RIF: ${statusLabel(state.documents.rif.validation.status)}`,
    `- Registro/Acta: ${statusLabel(state.documents.registroMercantil.validation.status)}`,
    `- Cédula Representante: ${statusLabel(state.representatives[0].document.validation.status)}`,
    `- Cédula Representante 2: ${
      state.representatives[1].enabled ? statusLabel(state.representatives[1].document.validation.status) : 'No aplica'
    }`,
    '',
    'Gracias.'
  ].join('\n');

  return { trackingId, submittedAtISO, subject, body };
}

export function buildFriendlySummaryLines(state: OnboardingState) {
  const lines = [
    `RIF: ${statusToFriendly(state.documents.rif.validation.status)}`,
    `Registro/Acta: ${statusToFriendly(state.documents.registroMercantil.validation.status)}`,
    `Cédula representante: ${statusToFriendly(state.representatives[0].document.validation.status)}`
  ];

  if (state.representatives[1].enabled) {
    lines.push(`Cédula segundo representante: ${statusToFriendly(state.representatives[1].document.validation.status)}`);
  }

  return lines;
}

export function buildFriendlyMailDraft(state: OnboardingState, companyId: string) {
  const portalLink = `${window.location.origin}/onboarding/${companyId}`;
  const requestCode = state.submission.registrationId ? state.submission.registrationId.slice(0, 8).toUpperCase() : 'PENDIENTE';
  const subject = `DanaConnect | Documentación recibida | ${state.tenant.name}`;
  const summaryLines = buildFriendlySummaryLines(state).map((line) => `- ${line}`).join('\n');

  const body = [
    'Hola equipo DanaConnect,',
    '',
    'Comparto el resumen de la documentación enviada:',
    summaryLines,
    '',
    `Empresa: ${state.tenant.name} (${companyId})`,
    `Código: ${requestCode}`,
    `Portal: ${portalLink}`,
    '',
    'Quedo atento a cualquier comentario.',
    '',
    'Gracias.'
  ].join('\n');

  return { subject, body };
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
  if (status === 'warning') return 'Advertencia';
  if (status === 'error') return 'Error';
  if (status === 'review') return 'Revisión requerida';
  if (status === 'validating') return 'Validando';
  return 'Pendiente';
}

function statusToFriendly(status: string) {
  if (status === 'warning') return 'Recibido con advertencia';
  if (status === 'review') return 'Revisión requerida';
  return status === 'valid' ? 'Recibido' : 'Pendiente';
}
