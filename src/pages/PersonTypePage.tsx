import { Link, useNavigate } from 'react-router-dom';
import { DanaConnectHero } from '../components/brand/DanaConnectHero';
import { useOnboarding } from '../app/OnboardingContext';
import { getCountryConfig, getFlowConfig } from '../config/onboardingCountries';
import { PersonType } from '../app/types';
import { Button } from '../components/ui/Button';

export function PersonTypePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { state, setPersonType } = useOnboarding();
  const selectedCountry = getCountryConfig(state.country);
  const selectedFlow = getFlowConfig(state.country, state.personType);

  function handlePersonTypeSelect(personType: PersonType) {
    setPersonType(personType);
    navigate(`/onboarding/${companyId}/documents`);
  }

  return (
    <div className="space-y-6">
      <DanaConnectHero
        eyebrow={selectedCountry.heroEyebrow}
        headline={selectedFlow.heroHeadline}
        subheadline={selectedFlow.heroSubheadline}
        actions={
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">Selecciona tipo de persona</p>
            <div className="grid gap-3 md:grid-cols-2">
              {(['juridica', 'natural'] as const).map((personType) => {
                const flow = selectedCountry.personTypes[personType];
                return (
                  <button
                    key={personType}
                    type="button"
                    onClick={() => handlePersonTypeSelect(personType)}
                    className="group rounded-2xl border border-white/30 bg-white/10 p-4 text-left text-white transition-all duration-200 hover:border-white hover:bg-white hover:text-dark hover:shadow-soft focus-visible:border-white focus-visible:bg-white focus-visible:text-dark focus-visible:shadow-soft"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80 transition-colors duration-200 group-hover:text-primary group-focus-visible:text-primary">
                      {flow.personTypeLabel}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
      <div className="mx-auto flex w-full max-w-6xl px-5 md:px-8">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="ghost">Volver</Button>
        </Link>
      </div>
    </div>
  );
}
