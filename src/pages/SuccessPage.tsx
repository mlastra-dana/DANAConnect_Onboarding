import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Mail } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import { buildFriendlyMailDraft, buildFriendlySummaryLines, openMailto } from '../lib/email/demoMail';
import { formatDateTime } from '../lib/receipt';

export function SuccessPage({ companyId }: { companyId: string }) {
  const { state, resetOnboarding } = useOnboarding();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const submittedAt = state.submission.submittedAt ? new Date(state.submission.submittedAt) : new Date();
  const summaryLines = buildFriendlySummaryLines(state);

  async function handleCopySummary() {
    await navigator.clipboard.writeText(summaryLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleOpenMail() {
    const mail = buildFriendlyMailDraft(state, companyId);
    openMailto(mail.subject, mail.body);
  }

  function handleBackHome() {
    resetOnboarding();
    navigate(`/onboarding/${companyId}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border border-borderLight bg-white px-6 py-10 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF4F1]">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-dark">Proceso completado</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-grayText md:text-base">Tu documentación fue recibida y está en revisión.</p>
      </div>

      <Card className="mx-auto max-w-3xl">
        <h2 className="text-base font-semibold text-dark">Resumen</h2>
        <ul className="mt-3 space-y-2 text-sm text-grayText">
          {summaryLines.map((line) => (
            <li key={line} className="rounded-lg border border-borderLight bg-white px-3 py-2">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-grayText">Fecha de envío: {formatDateTime(submittedAt)}</p>
      </Card>

      {copied ? (
        <div className="mt-4">
          <Toast type="success" message="Resumen copiado al portapapeles." />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void handleCopySummary()}>
          <Copy className="h-4 w-4" />
          Copiar resumen
        </Button>
        <Button type="button" onClick={handleOpenMail}>
          <Mail className="h-4 w-4" />
          Abrir correo
        </Button>
        <Button type="button" variant="ghost" onClick={handleBackHome}>
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
