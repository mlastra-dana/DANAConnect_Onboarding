import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOnboarding } from '../app/OnboardingContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { buildDemoEmail, sendEmailViaApi } from '../lib/email/demoMail';
import {
  getDocumentLabel,
  getDocumentOrder,
  getFlowConfig,
  getOptionalDocumentOrder,
  requiresRepresentatives
} from '../config/onboardingCountries';
import { clearState } from '../app/state';

export function ReviewPage({ companyId }: { companyId: string }) {
  const { state, canSubmit, setSubmission } = useOnboarding();
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const navigate = useNavigate();
  const representative1 = state.representatives.find((rep) => rep.id === 1)!;
  const representative2 = state.representatives.find((rep) => rep.id === 2)!;
  const flowConfig = getFlowConfig(state.country, state.personType);
  const activeDocuments = getDocumentOrder(state.country, state.personType);
  const optionalDocuments = getOptionalDocumentOrder(state.country, state.personType).filter(
    (docType) => Boolean(state.documents[docType].fileName)
  );
  const showRepresentatives = requiresRepresentatives(state.country, state.personType);
  const isEnglish = state.country === 'usa';
  const requiredDocuments = [
    ...activeDocuments.map((docType) => state.documents[docType].fileName),
    ...optionalDocuments.map((docType) => state.documents[docType].fileName),
    ...(showRepresentatives ? [representative1.document.fileName] : []),
    ...(showRepresentatives && representative2.enabled ? [representative2.document.fileName] : [])
  ];
  const receivedDocumentsCount = requiredDocuments.filter(Boolean).length;
  const requiredDocumentsCount = requiredDocuments.length;
  const normalizedRecipientEmail = recipientEmail.trim();
  const recipientEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipientEmail);
  const showSubmissionError = canSubmit && state.submission.status === 'error';

  async function submit() {
    setErrorToast(null);
    if (!canSubmit) return;

    if (!recipientEmailIsValid) {
      setErrorToast(isEnglish ? 'Enter a valid email address.' : 'Ingrese un correo electrónico válido.');
      return;
    }
    setSubmission({ status: 'loading' });

    try {
      const externalTrigger = new URLSearchParams(window.location.search).get('externalTrigger');
      const email = buildDemoEmail(state, companyId, externalTrigger, normalizedRecipientEmail);
      const sendResult = await sendEmailViaApi(email.subject, email.body, email.data, email.files);

      if (!sendResult.ok) {
        const fallbackError = isEnglish ? 'The submission could not be completed.' : 'No se pudo completar el envío.';
        setSubmission({ status: 'error', error: sendResult.error ?? fallbackError });
        setErrorToast(sendResult.error ?? fallbackError);
        return;
      }

      setSubmission({
        status: 'success',
        registrationId: email.trackingId,
        submittedAt: email.submittedAtISO,
        emailSubject: email.subject,
        emailBody: email.body,
        emailTo: sendResult.to ?? 'DANAConnect Cloud SMTP'
      });

      const payload = {
        companyId,
        registrationId: email.trackingId,
        submittedAt: email.submittedAtISO,
        to: sendResult.to ?? 'DANAConnect Cloud SMTP',
        documents: summarizeDocuments(state.documents),
        representatives: state.representatives.map((representative) => ({
          id: representative.id,
          enabled: representative.enabled,
          document: summarizeDocument(representative.document)
        })),
        biometrics: state.biometrics
      };

      try {
        localStorage.setItem(`onboarding_submission:${companyId}:${email.trackingId}`, JSON.stringify(payload));
      } catch (storageError) {
        console.warn('No se pudo guardar el comprobante local del envío.', storageError);
      }
      clearState(companyId);
      navigate(`/onboarding/${companyId}/success`);
    } catch {
      const fallbackError = isEnglish ? 'The submission could not be completed. Try again.' : 'No se pudo completar el envío. Intente nuevamente.';
      setSubmission({ status: 'error', error: fallbackError });
      setErrorToast(fallbackError);
    }
  }

  return (
    <div className="space-y-6">
      {errorToast ? <Toast type="error" message={errorToast} /> : null}
      {showSubmissionError ? (
        <Card className="border border-[#F9C9C3] bg-errorSoft">
          <h3 className="text-base font-semibold text-red-800">{isEnglish ? 'The submission could not be completed' : 'No se pudo completar el envío'}</h3>
          <p className="mt-1 text-sm text-red-700">{isEnglish ? 'Check your connection and try again.' : 'Revise su conexión y vuelva a intentar.'}</p>
          <div className="mt-3">
            <Button onClick={() => void submit()} variant="danger">
              {isEnglish ? 'Retry submission' : 'Reintentar envío'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-dark">{isEnglish ? 'Document summary' : 'Resumen documental'}</h2>
        <p className="mt-1 text-sm text-grayText">
          {isEnglish ? 'Documents received' : 'Documentos recibidos'}: {receivedDocumentsCount}/{requiredDocumentsCount}
        </p>
        <p className="mt-1 text-sm text-grayText">
          {isEnglish ? 'Onboarding type' : 'Tipo de onboarding'}: {flowConfig.personTypeLabel}
        </p>
        {state.personType === 'natural' ? (
          <p className="mt-1 text-sm text-grayText">
            {isEnglish ? 'Identity' : 'Identidad'}: {state.personalInfo.firstName || (isEnglish ? 'No first name' : 'Sin nombres')} {state.personalInfo.lastName || ''} {state.personalInfo.documentNumber ? `· ${state.personalInfo.documentNumber}` : ''}
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {[...activeDocuments, ...optionalDocuments].map((docType) => {
            const doc = state.documents[docType];
            return (
              <li key={docType} className="flex items-center justify-between rounded-lg border border-borderLight p-3">
              <div>
                  <p className="font-medium text-dark">{getDocumentLabel(state.country, state.personType, docType)}</p>
                <p className="text-xs text-grayText">{doc.fileName ?? (isEnglish ? 'No file' : 'Sin archivo')}</p>
              </div>
              <StatusBadge status={doc.validation.status} language={isEnglish ? 'en' : 'es'} />
            </li>
            );
          })}
          {showRepresentatives ? (
            <li className="flex items-center justify-between rounded-lg border border-borderLight p-3">
              <div>
                <p className="font-medium text-dark">{flowConfig.reviewRepresentativePrimaryLabel}</p>
                <p className="text-xs text-grayText">{representative1.document.fileName ?? (isEnglish ? 'No file' : 'Sin archivo')}</p>
              </div>
              <StatusBadge status={representative1.document.validation.status} language={isEnglish ? 'en' : 'es'} />
            </li>
          ) : null}
          {showRepresentatives ? (
            <li className="flex items-center justify-between rounded-lg border border-borderLight p-3">
              <div>
                <p className="font-medium text-dark">{flowConfig.reviewRepresentativeSecondaryLabel}</p>
                <p className="text-xs text-grayText">
                  {!representative2.enabled
                    ? isEnglish ? 'Not applicable' : 'No aplica'
                    : representative2.document.fileName ?? (isEnglish ? 'Pending' : 'Pendiente')}
                </p>
              </div>
              <StatusBadge
                language={isEnglish ? 'en' : 'es'}
                status={
                  !representative2.enabled
                    ? 'na'
                    : representative2.document.fileName
                      ? representative2.document.validation.status
                      : 'pending'
                }
              />
            </li>
          ) : null}
          <li className="flex items-center justify-between rounded-lg border border-borderLight p-3">
            <div>
              <p className="font-medium text-dark">{isEnglish ? 'Liveness check' : 'Prueba de vida'}</p>
              <p className="text-xs text-grayText">{biometricStatusLabel(state.biometrics.status, isEnglish)}</p>
            </div>
            <StatusBadge status={toBadgeStatus(state.biometrics.status)} language={isEnglish ? 'en' : 'es'} />
          </li>
        </ul>
      </Card>

      <Card>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-dark">{isEnglish ? 'Email address' : 'Correo electrónico'}</span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            className="w-full rounded-lg border border-borderLight px-3 py-2.5 text-sm text-dark outline-none transition-colors focus:border-primary"
            placeholder={isEnglish ? 'email@company.com' : 'correo@empresa.com'}
          />
        </label>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}/biometria`}>
          <Button variant="ghost">{isEnglish ? 'Back' : 'Volver'}</Button>
        </Link>
        <Button onClick={() => void submit()} disabled={!canSubmit || !recipientEmailIsValid || state.submission.status === 'loading'}>
          {state.submission.status === 'loading' ? (isEnglish ? 'Submitting...' : 'Enviando...') : isEnglish ? 'Submit' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}

function toBadgeStatus(status: 'pending' | 'processing' | 'passed' | 'failed'): 'valid' | 'error' | 'pending' {
  if (status === 'passed') return 'valid';
  if (status === 'failed') return 'error';
  return 'pending';
}

function biometricStatusLabel(status: 'pending' | 'processing' | 'passed' | 'failed', isEnglish: boolean) {
  if (status === 'passed') return isEnglish ? 'Validation completed' : 'Validación completada';
  if (status === 'processing') return isEnglish ? 'Validation in progress' : 'Validación en curso';
  if (status === 'failed') return isEnglish ? 'Validation failed' : 'Validación fallida';
  return isEnglish ? 'Pending' : 'Pendiente';
}

function summarizeDocuments(documents: ReturnType<typeof useOnboarding>['state']['documents']) {
  return Object.fromEntries(
    Object.entries(documents).map(([type, document]) => [type, summarizeDocument(document)])
  );
}

function summarizeDocument(document: ReturnType<typeof useOnboarding>['state']['documents'][keyof ReturnType<typeof useOnboarding>['state']['documents']]) {
  return {
    type: document.type,
    fileName: document.fileName,
    fileType: document.fileType,
    validation: document.validation
  };
}
