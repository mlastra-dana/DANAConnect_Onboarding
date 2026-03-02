import { useNavigate } from 'react-router-dom';
import { FeatureCards } from '../components/brand/FeatureCards';
import { DanaConnectHero } from '../components/brand/DanaConnectHero';

export function WelcomePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();

  return (
    <div>
      <DanaConnectHero
        eyebrow="DANACONNECT"
        headline="Portal de onboarding y carga de documentos."
        subheadline="Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa."
        primaryCta="Iniciar onboarding"
        onPrimary={() => navigate(`/onboarding/${companyId}/documents`)}
      />
      <FeatureCards />
    </div>
  );
}
