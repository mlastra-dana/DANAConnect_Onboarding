import { OnboardingState } from '../../app/types';
import { getDocumentLabel, getDocumentOrder, getFlowConfig, requiresRepresentatives } from '../../config/onboardingCountries';

export type DemoEmailPayload = {
  trackingId: string;
  submittedAtISO: string;
  subject: string;
  body: string;
  data: Record<string, string>;
  files: Array<{
    field: string;
    documentType: string;
    fileName: string;
    contentType: string;
    fileBase64: string;
  }>;
};

export type SendEmailResult = {
  ok: boolean;
  to?: string;
  messageId?: string;
  mode?: string;
  error?: string;
};

export function buildDemoEmail(
  state: OnboardingState,
  companyId: string,
  externalTrigger?: string | null,
  recipientEmail?: string
): DemoEmailPayload {
  const trackingId = crypto.randomUUID();
  const submittedAtISO = new Date().toISOString();
  const portalLink = `${window.location.origin}/onboarding/${companyId}${
    externalTrigger ? `?externalTrigger=${encodeURIComponent(externalTrigger)}` : ''
  }`;

  const companyName = state.tenant.name;
  const flow = getFlowConfig(state.country, state.personType);
  const activeDocuments = getDocumentOrder(state.country, state.personType);
  const showRepresentatives = requiresRepresentatives(state.country, state.personType);

  const subject = `${companyName} | Onboarding recibido | ${trackingId}`;
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
  summaryLines.push(`- Prueba de Vida: ${biometricStatusLabel(state.biometrics.status)}`);
  const body = [
    `Hola equipo ${companyName},`,
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

  const data = buildConversationData({
    state,
    companyId,
    trackingId,
    submittedAtISO,
    portalLink,
    summaryLines,
    recipientEmail: recipientEmail ?? ''
  });
  const files = buildConversationFiles(state);

  return { trackingId, submittedAtISO, subject, body, data, files };
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
  lines.push(`Prueba de Vida: ${biometricStatusToFriendly(state.biometrics.status)}`);

  return lines;
}

export function buildFriendlyMailDraft(state: OnboardingState, companyId: string) {
  const portalLink = `${window.location.origin}/onboarding/${companyId}`;
  const requestCode = state.submission.registrationId ? state.submission.registrationId.slice(0, 8).toUpperCase() : 'PENDIENTE';
  const subject = `${state.tenant.name} | Documentación recibida`;
  const summaryLines = buildFriendlySummaryLines(state).map((line) => `- ${line}`).join('\n');

  const body = [
    `Hola equipo ${state.tenant.name},`,
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

export async function sendEmailViaApi(
  subject: string,
  body: string,
  conversationData?: Record<string, string>,
  files?: DemoEmailPayload['files']
): Promise<SendEmailResult> {
  const endpoint = import.meta.env.VITE_EMAIL_SEND_URL?.trim() || '/api/send-email';
  const isLambdaEndpoint = endpoint !== '/api/send-email';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: isLambdaEndpoint ? 'sendEmail' : undefined,
        subject,
        body,
        data: conversationData,
        files
      })
    });

    const result = (await response.json()) as SendEmailResult;
    if (!response.ok || !result.ok) {
      return {
        ok: false,
        error: result.error ?? 'No se pudo enviar el correo'
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      error: 'No se pudo conectar con el servicio de envío.'
    };
  }
}

function buildConversationFiles(state: OnboardingState): DemoEmailPayload['files'] {
  const files: DemoEmailPayload['files'] = [];
  const addDocument = (field: string, documentType: string, record = state.documents[documentType as keyof typeof state.documents]) => {
    if (!record?.fileBase64 || !record.fileName) return;
    files.push({
      field,
      documentType,
      fileName: record.fileName,
      contentType: record.fileType || inferContentType(record.fileName),
      fileBase64: record.fileBase64
    });
  };

  addDocument('RIF', 'rif');
  addDocument('ACTA_CONSTITUTIVA', 'registroMercantil');
  addDocument('CEDULA_IDENTIDAD', 'documentoIdentidad');
  addDocument('LICENCIA_FRONT', 'licenciaConducirFrente');
  addDocument('LICENCIA_BACK', 'licenciaConducirReverso');

  const representative1 = state.representatives[0];
  if (representative1.enabled) {
    addDocument('CEDULA_IDENTIDAD', 'cedulaRepresentante', representative1.document);
  }

  return files;
}

function inferContentType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function buildConversationData({
  state,
  companyId,
  trackingId,
  submittedAtISO,
  portalLink,
  summaryLines,
  recipientEmail
}: {
  state: OnboardingState;
  companyId: string;
  trackingId: string;
  submittedAtISO: string;
  portalLink: string;
  summaryLines: string[];
  recipientEmail: string;
}) {
  const flow = getFlowConfig(state.country, state.personType);
  const documentStatusByType = (type: string) => {
    if (type === 'rif') return statusLabel(state.documents.rif.validation.status);
    if (type === 'registroMercantil') return statusLabel(state.documents.registroMercantil.validation.status);
    if (type === 'cedulaRepresentante') return statusLabel(state.representatives[0].document.validation.status);
    if (type === 'documentoIdentidad') return statusLabel(state.documents.documentoIdentidad.validation.status);
    if (type === 'licenciaConducirFrente') return statusLabel(state.documents.licenciaConducirFrente.validation.status);
    return '';
  };
  const documentLabelByType = (type: string) => {
    if (type === 'rif') return state.documents.rif.fileName || '';
    if (type === 'registroMercantil') return state.documents.registroMercantil.fileName || '';
    if (type === 'cedulaRepresentante') return state.representatives[0].document.fileName || '';
    if (type === 'documentoIdentidad') return state.documents.documentoIdentidad.fileName || '';
    if (type === 'licenciaConducirFrente') return state.documents.licenciaConducirFrente.fileName || '';
    return '';
  };
  const fullName = [state.personalInfo.firstName, state.personalInfo.lastName].filter(Boolean).join(' ').trim();
  const representativeName = state.representatives[0].document.validation.extractedIdentity
    ? [
        state.representatives[0].document.validation.extractedIdentity.firstName,
        state.representatives[0].document.validation.extractedIdentity.lastName
      ]
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';

  return {
    EMAIL: recipientEmail,
    NOMBRE_CLIENTE: fullName || state.tenant.name,
    NOMBRE_EMPRESA: state.tenant.name,
    PAIS: state.country.toUpperCase(),
    TIPO_PERSONA: flow.personTypeLabel,
    RIF: state.personalInfo.documentNumber || documentStatusByType('rif') || '',
    ACTA_CONSTITUTIVA: documentStatusByType('registroMercantil') || documentLabelByType('registroMercantil'),
    CEDULA_IDENTIDAD:
      state.personalInfo.documentNumber ||
      documentStatusByType('cedulaRepresentante') ||
      documentStatusByType('documentoIdentidad') ||
      documentStatusByType('licenciaConducirFrente') ||
      '',
    REPRESENTANTE_LEGAL: representativeName || statusLabel(state.representatives[0].document.validation.status)
  };
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
