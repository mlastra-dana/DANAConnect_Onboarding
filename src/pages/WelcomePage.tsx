import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { TenantConfig } from '../data/tenants';
import { PerfilabHero } from '../components/brand/PerfilabHero';

export function WelcomePage({ tenant, companyId }: { tenant: TenantConfig; companyId: string }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-10">
      <PerfilabHero
        headline="Onboarding empresarial, claro y sin fricción."
        subheadline="Carga documentos y valida tu Excel en un flujo rápido, seguro y guiado."
        primaryCta="Iniciar onboarding"
        onPrimary={() => navigate(`/onboarding/${companyId}/documents`)}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h2 className="mt-3 text-lg font-semibold text-dark">Control documental</h2>
          <p className="mt-1 text-sm text-grayText">Validaciones automáticas para detectar errores antes del envío.</p>
        </Card>
        <Card>
          <Building2 className="h-6 w-6 text-primary" />
          <h2 className="mt-3 text-lg font-semibold text-dark">Flujo por pasos</h2>
          <p className="mt-1 text-sm text-grayText">Proceso ordenado para completar el alta con trazabilidad.</p>
        </Card>
        <Card>
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="mt-3 text-lg font-semibold text-dark">Experiencia SaaS</h2>
          <p className="mt-1 text-sm text-grayText">Diseño limpio y navegación enfocada para equipos corporativos.</p>
        </Card>
      </section>

      <p className="rounded-xl border border-borderLight bg-white p-3 text-sm text-grayText">
        Sus documentos se procesan en su navegador (demo).
      </p>

      <p className="hidden" aria-hidden="true">
        {tenant.name}
      </p>
    </div>
  );
}
