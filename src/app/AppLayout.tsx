import { Stepper } from '../components/onboarding/Stepper';
import { TenantConfig } from '../data/tenants';
import { PerfilabHeader } from '../components/brand/PerfilabHeader';
import { WhatsAppWidget } from '../components/brand/WhatsAppWidget';
import { useOnboarding } from './OnboardingContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

const SHOW_WHATSAPP_WIDGET = false;

export function AppLayout({
  tenant,
  currentStep,
  children
}: {
  tenant: TenantConfig;
  currentStep: number;
  children: React.ReactNode;
}) {
  const { state, resetOnboarding } = useOnboarding();
  const navigate = useNavigate();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const hasLoadedData =
    Object.values(state.documents).some((doc) => Boolean(doc.fileName)) ||
    state.representatives.some((rep) => rep.enabled && Boolean(rep.document.fileName));

  function handleHomeClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!hasLoadedData) {
      resetOnboarding();
      return;
    }

    event.preventDefault();
    setShowResetConfirm(true);
  }

  function confirmResetAndGoHome() {
    resetOnboarding();
    setShowResetConfirm(false);
    navigate(`/onboarding/${tenant.companyId}`);
  }

  function handleExit() {
    resetOnboarding();
    navigate(`/onboarding/${tenant.companyId}`);
  }

  return (
    <div className="min-h-screen bg-surface text-dark" style={{ ['--tenant-brand' as string]: tenant.brandColor ?? '#DD5736' }}>
      <PerfilabHeader
        tenantName={tenant.name}
        logoUrl={tenant.logoUrl}
        companyId={tenant.companyId}
        onHomeClick={handleHomeClick}
        onExit={handleExit}
        showExit={currentStep > 1}
      />

      <main className={`${currentStep === 1 ? '' : 'mx-auto w-full max-w-7xl px-4 py-8 md:px-6'}`}>
        {currentStep > 1 ? <Stepper currentStep={currentStep} /> : null}
        {children}
      </main>

      {SHOW_WHATSAPP_WIDGET ? <WhatsAppWidget whatsAppNumber={tenant.whatsAppNumber} /> : null}

      {showResetConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-borderLight bg-white p-6 shadow-soft-dark">
            <h2 className="text-lg font-semibold text-dark">¿Desea volver al inicio?</h2>
            <p className="mt-2 text-sm text-grayText">
              Si regresa al inicio, se van a eliminar los adjuntos y validaciones cargadas.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowResetConfirm(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmResetAndGoHome}>
                Continuar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
