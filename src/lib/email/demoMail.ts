import { OnboardingState } from '../../app/types';
import { getDocumentLabel, getDocumentOrder, getFlowConfig, requiresRepresentatives } from '../../config/onboardingCountries';

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
  const flow = getFlowConfig(state.country, state.personType);
  const activeDocuments = getDocumentOrder(state.country, state.personType);
  const showRepresentatives = requiresRepresentatives(state.country, state.personType);

  const subject = `DanaConnect | Onboarding recibido | ${companyName} | ${trackingId}`;
  const summaryLines = activeDocuments.map(
    (docType) => `- ${getDocumentLabel(state.country, state.personType, docType)}: ${statusLabel(state.documents[docType].validation.status)}`
  );
  if (showRepresentatives) {
    summaryLines.push(`- ${flow.reviewRepresentativePrimaryLabel}: ${statusLabel(state.representatives[0].document.validation.status)}`);
    summaryLines.push(
      `- ${flow.reviewRepresentativeSecondaryLabel}: ${
        state.representatives[1].enabled ? statusLabel(state.representatives[1].document.validation.status) : 'No aplica'
      }`
    );
  }
  if (state.personType === 'natural') {
    summaryLines.push(`- Nombres: ${state.personalInfo.firstName || 'No extraidos'}`);
    summaryLines.push(`- Apellidos: ${state.personalInfo.lastName || 'No extraidos'}`);
    summaryLines.push(`- Identificacion: ${state.personalInfo.documentNumber || 'No extraida'}`);
  }
  summaryLines.push(`- Biometría: ${biometricStatusLabel(state.biometrics.status)}`);
  const body = [
    'Hola equipo DanaConnect,',
    '',
    'Se recibió documentación desde el Portal de Onboarding.',
    '',
    `Empresa: ${companyName} (ID: ${companyId})`,
    `País: ${state.country.toUpperCase()}`,
    `Tipo de persona: ${flow.personTypeLabel}`,
    `Código: ${trackingId}`,
    `Fecha: ${submittedAtISO}`,
    `Link del portal: ${portalLink}`,
    '',
    'Resumen:',
    ...summaryLines,
    '',
    'Gracias.'
  ].join('\n');

  return { trackingId, submittedAtISO, subject, body };
}

export function buildFriendlySummaryLines(state: OnboardingState) {
  const flow = getFlowConfig(state.country, state.personType);
  const lines = getDocumentOrder(state.country, state.personType).map(
    (docType) => `${getDocumentLabel(state.country, state.personType, docType)}: ${statusToFriendly(state.documents[docType].validation.status)}`
  );

  if (requiresRepresentatives(state.country, state.personType)) {
    lines.push(`${flow.reviewRepresentativePrimaryLabel}: ${statusToFriendly(state.representatives[0].document.validation.status)}`);
  }

  if (requiresRepresentatives(state.country, state.personType) && state.representatives[1].enabled) {
    lines.push(`${flow.reviewRepresentativeSecondaryLabel}: ${statusToFriendly(state.representatives[1].document.validation.status)}`);
  }
  if (state.personType === 'natural') {
    lines.push(`Nombres: ${state.personalInfo.firstName || 'Pendiente'}`);
    lines.push(`Apellidos: ${state.personalInfo.lastName || 'Pendiente'}`);
    lines.push(`Identificacion: ${state.personalInfo.documentNumber || 'Pendiente'}`);
  }
  lines.push(`Biometría: ${biometricStatusToFriendly(state.biometrics.status)}`);

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

function biometricStatusLabel(status: 'pending' | 'processing' | 'passed' | 'failed') {
  if (status === 'passed') return 'Válida';
  if (status === 'failed') return 'Fallida';
  if (status === 'processing') return 'En proceso';
  return 'Pendiente';
}

function biometricStatusToFriendly(status: 'pending' | 'processing' | 'passed' | 'failed') {
  if (status === 'passed') return 'Completada';
  if (status === 'failed') return 'Requiere reintento';
  return 'Pendiente';
}
