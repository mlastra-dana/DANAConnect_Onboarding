import { ArrowRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FeatureCards } from '../components/brand/FeatureCards';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';

export function WelcomePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { setCountry } = useOnboarding();

  function handleStart() {
    setCountry('ve');
    navigate(`/onboarding/${companyId}/tipo-persona`);
  }

  return (
    <div>
      <section className="border-b border-borderLight bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-2 text-sm text-grayText"><MapPin className="h-4 w-4 text-primary" /> Venezuela</div>
          <h1 className="text-4xl font-bold leading-tight text-primary md:text-5xl">Mercantil</h1>
          <h2 className="mt-3 text-2xl font-medium text-dark">Onboarding digital</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-grayText">Complete su solicitud con la documentación de su empresa o sus recaudos personales.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button onClick={handleStart} className="min-h-12 gap-3 px-6">Comenzar solicitud <ArrowRight className="h-4 w-4" /></Button>
            <span className="text-sm text-grayText">Personas y empresas</span>
          </div>
        </div>
      </section>
      <FeatureCards />
    </div>
  );
}
