import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { TenantConfig } from '../data/tenants';
import { PerfilabHero } from '../components/brand/PerfilabHero';

export function WelcomePage({ tenant, companyId }: { tenant: TenantConfig; companyId: string }) {
  const navigate = useNavigate();
  const logos = ['LABORATORIOS', 'EMPRESAS', 'CLINICAS', 'SEGUROS', 'BIENESTAR', 'PREVENCION'];

  return (
    <div className="space-y-8">
      <PerfilabHero
        headline="Onboarding Perfilab: carga y valida tu documentacion"
        subheadline="Sube documentos, valida tu Excel y envia informacion limpia al sistema central."
        primaryCta="Iniciar onboarding"
        onPrimary={() => navigate(`/onboarding/${companyId}/documents`)}
      />

      <section id="blog" className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-soft-dark">
          <ShieldCheck className="h-6 w-6 text-perfilabOrange" />
          <h2 className="mt-3 text-lg font-extrabold uppercase tracking-wide text-perfilabDark">Control estricto</h2>
          <p className="mt-1 text-sm text-perfilabGray">No deja pasar documentos de baja calidad ni formatos incorrectos.</p>
        </Card>
        <Card className="border-slate-200 shadow-soft-dark">
          <Building2 className="h-6 w-6 text-perfilabOrange" />
          <h2 className="mt-3 text-lg font-extrabold uppercase tracking-wide text-perfilabDark">Flujo guiado</h2>
          <p className="mt-1 text-sm text-perfilabGray">Cada paso muestra exactamente que corregir para completar el alta sin fricciones.</p>
        </Card>
        <Card className="border-slate-200 shadow-soft-dark">
          <Sparkles className="h-6 w-6 text-perfilabOrange" />
          <h2 className="mt-3 text-lg font-extrabold uppercase tracking-wide text-perfilabDark">Portal autogestionado</h2>
          <p className="mt-1 text-sm text-perfilabGray">Tu equipo valida todo desde navegador con persistencia por empresa.</p>
        </Card>
      </section>

      <section id="contacto" className="overflow-hidden rounded-2xl border border-slate-200 bg-white py-4">
        <div className="flex min-w-max animate-marquee gap-6 px-4">
          {[...logos, ...logos].map((logo, index) => (
            <div key={`${logo}-${index}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold tracking-wide text-perfilabGray">
              {logo}
            </div>
          ))}
        </div>
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-perfilabDark">
        Sus documentos se procesan en su navegador (demo).
      </p>

      <p className="hidden" id="nosotros" aria-hidden="true">
        {tenant.name}
      </p>
    </div>
  );
}
