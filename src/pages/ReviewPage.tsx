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
        documents: state.documents,
        excel: {
          totalRows: state.excel.totalRows,
          validRows: state.excel.validRows,
          invalidRows: state.excel.invalidRows
        }
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
        <Card className="border border-red-200 bg-red-50">
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
        <h2 className="text-lg font-semibold text-slate-900">Resumen documental</h2>
        <ul className="mt-3 space-y-2">
          {Object.values(state.documents).map((doc, idx) => (
            <li key={`${doc.type}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-medium text-slate-900">{DOCUMENT_LABELS[doc.type]}</p>
                <p className="text-xs text-slate-500">{doc.fileName ?? 'Sin archivo'}</p>
              </div>
              <StatusBadge status={doc.validation.status} />
            </li>
          ))}
          {state.representatives.map((rep) => (
            <li key={`rep-${rep.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-medium text-slate-900">Cédula del Representante {rep.id}</p>
                <p className="text-xs text-slate-500">
                  {rep.enabled ? rep.document.fileName ?? 'Sin archivo' : 'No aplica'}
                </p>
              </div>
              <StatusBadge status={rep.enabled ? rep.document.validation.status : 'valid'} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Resultado de Excel</h2>
        <p className="mt-1 text-sm text-slate-600">
          {state.excel.validRows}/{state.excel.totalRows} filas válidas. {state.excel.invalidRows} filas inválidas.
        </p>
        <div className="mt-3">
          <StatusBadge status={state.excel.status} />
        </div>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}/excel`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <Button onClick={() => void submit()} disabled={!canSubmit || state.submission.status === 'loading'}>
          {state.submission.status === 'loading' ? 'Enviando...' : 'Enviar onboarding'}
        </Button>
      </div>

      {!canSubmit ? (
        <Toast
          type="error"
          message="No puede enviar todavía: verifique que los 3 documentos estén válidos y el Excel esté 100% en verde."
        />
      ) : null}
    </div>
  );
}
