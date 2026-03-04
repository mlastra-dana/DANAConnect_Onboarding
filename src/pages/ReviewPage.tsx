import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOnboarding } from '../app/OnboardingContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { DOCUMENT_LABELS } from '../app/state';
import { Toast } from '../components/ui/Toast';
import { buildDemoEmail, openMailto, sendEmailViaApi } from '../lib/email/demoMail';

export function ReviewPage({ companyId }: { companyId: string }) {
  const { state, canSubmit, setSubmission } = useOnboarding();
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const representative1 = state.representatives.find((rep) => rep.id === 1)!;
  const representative2 = state.representatives.find((rep) => rep.id === 2)!;
  const requiredDocuments = [
    state.documents.rif.fileName,
    state.documents.registroMercantil.fileName,
    representative1.document.fileName,
    ...(representative2.enabled ? [representative2.document.fileName] : [])
  ];
  const receivedDocumentsCount = requiredDocuments.filter(Boolean).length;
  const requiredDocumentsCount = requiredDocuments.length;

  async function submit() {
    setErrorToast(null);
    setSubmission({ status: 'loading' });

    try {
      const externalTrigger = new URLSearchParams(window.location.search).get('externalTrigger');
      const email = buildDemoEmail(state, companyId, externalTrigger);
      const sendResult = await sendEmailViaApi(email.subject, email.body);
      const shouldFallbackToMailto =
        !sendResult.ok &&
        Boolean(sendResult.error) &&
        (sendResult.error?.includes('Falta variable de entorno') ||
          sendResult.error?.includes('No se pudo conectar con el servicio de envío.'));

      if (shouldFallbackToMailto) {
        openMailto(email.subject, email.body);
      } else if (!sendResult.ok) {
        setSubmission({ status: 'error', error: sendResult.error ?? 'No se pudo completar el envío.' });
        setErrorToast(sendResult.error ?? 'No se pudo completar el envío.');
        return;
      }

      setSubmission({
        status: 'success',
        registrationId: email.trackingId,
        submittedAt: email.submittedAtISO,
        emailSubject: email.subject,
        emailBody: email.body,
        emailTo: sendResult.to ?? 'mlastra@danaconnect.com (mailto)'
      });

      const payload = {
        companyId,
        registrationId: email.trackingId,
        submittedAt: email.submittedAtISO,
        to: sendResult.to ?? 'mlastra@danaconnect.com (mailto)',
        documents: state.documents
      };

      localStorage.setItem(`onboarding_submission:${companyId}:${email.trackingId}`, JSON.stringify(payload));
      navigate(`/onboarding/${companyId}/success`);
    } catch {
      setSubmission({ status: 'error', error: 'No se pudo completar el envío. Intente nuevamente.' });
      setErrorToast('No se pudo completar el envío. Intente nuevamente.');
    }
  }

  return (
    <div className="space-y-6">
      {errorToast ? <Toast type="error" message={errorToast} /> : null}
      {state.submission.status === 'error' ? (
        <Card className="border border-[#F9C9C3] bg-errorSoft">
          <h3 className="text-base font-semibold text-red-800">No se pudo completar el envío</h3>
          <p className="mt-1 text-sm text-red-700">Revise su conexión y vuelva a intentar.</p>
          <div className="mt-3">
            <Button onClick={() => void submit()} variant="danger">
              Reintentar envío
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-dark">Resumen documental</h2>
        <p className="mt-1 text-sm text-grayText">
          Documentos recibidos: {receivedDocumentsCount}/{requiredDocumentsCount}
        </p>
        <ul className="mt-3 space-y-2">
          {Object.values(state.documents).map((doc, idx) => (
            <li key={`${doc.type}-${idx}`} className="flex items-center justify-between rounded-lg border border-borderLight p-3">
              <div>
                <p className="font-medium text-dark">{DOCUMENT_LABELS[doc.type]}</p>
                <p className="text-xs text-grayText">{doc.fileName ?? 'Sin archivo'}</p>
              </div>
              <StatusBadge status={doc.validation.status} />
            </li>
          ))}
          <li className="flex items-center justify-between rounded-lg border border-borderLight p-3">
            <div>
              <p className="font-medium text-dark">Cédula del Representante 1</p>
              <p className="text-xs text-grayText">{representative1.document.fileName ?? 'Sin archivo'}</p>
            </div>
            <StatusBadge status={representative1.document.validation.status} />
          </li>
          <li className="flex items-center justify-between rounded-lg border border-borderLight p-3">
            <div>
              <p className="font-medium text-dark">Cédula del Representante 2</p>
              <p className="text-xs text-grayText">
                {!representative2.enabled
                  ? 'No aplica'
                  : representative2.document.fileName ?? 'Pendiente'}
              </p>
            </div>
            <StatusBadge
              status={
                !representative2.enabled
                  ? 'na'
                  : representative2.document.fileName
                    ? representative2.document.validation.status
                    : 'pending'
              }
            />
          </li>
        </ul>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}/documents`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <Button onClick={() => void submit()} disabled={!canSubmit || state.submission.status === 'loading'}>
          {state.submission.status === 'loading' ? 'Enviando...' : 'Enviar onboarding'}
        </Button>
      </div>

      {!canSubmit ? (
        <Toast
          type="error"
          message="No puede enviar todavía: verifique que todos los documentos requeridos estén válidos."
        />
      ) : null}
    </div>
  );
}
