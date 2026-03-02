import { useNavigate } from 'react-router-dom';
import { PerfilabHero } from '../components/brand/PerfilabHero';

export function WelcomePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();

  return (
    <div>
      <PerfilabHero
        eyebrow="DANACONNECT"
        headline="Portal de onboarding y carga de documentos"
        subheadline="Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa."
        primaryCta="Iniciar onboarding"
        onPrimary={() => navigate(`/onboarding/${companyId}/documents`)}
      />
    </div>
  );
}
