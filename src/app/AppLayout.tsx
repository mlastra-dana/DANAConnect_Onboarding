import { Stepper } from '../components/onboarding/Stepper';
import { TenantConfig } from '../data/tenants';
import { DanaConnectHeader } from '../components/brand/DanaConnectHeader';
import { WhatsAppWidget } from '../components/brand/WhatsAppWidget';
import { useOnboarding } from './OnboardingContext';
import { useNavigate } from 'react-router-dom';

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
  const { resetOnboarding } = useOnboarding();
  const navigate = useNavigate();

  function handleHomeClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    resetOnboarding();
    navigate(`/onboarding/${tenant.companyId}`);
  }

  function handleExit() {
    resetOnboarding();
    navigate(`/onboarding/${tenant.companyId}`);
  }

  return (
    <div className="min-h-screen bg-surface text-dark" style={{ ['--tenant-brand' as string]: tenant.brandColor ?? '#DD5736' }}>
      <DanaConnectHeader
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
    </div>
  );
}
