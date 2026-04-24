import { useNavigate } from 'react-router-dom';
import { DanaConnectHero } from '../components/brand/DanaConnectHero';
import { useOnboarding } from '../app/OnboardingContext';
import { getCountryConfig, getFlowConfig } from '../config/onboardingCountries';
import { PersonType } from '../app/types';

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
              const isSelected = state.personType === personType;
              return (
                <button
                  key={personType}
                  type="button"
                  onClick={() => handlePersonTypeSelect(personType)}
                  className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                    isSelected ? 'border-white bg-white text-dark shadow-soft' : 'border-white/30 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <p className={`text-sm font-semibold uppercase tracking-[0.14em] ${isSelected ? 'text-primary' : 'text-white/80'}`}>
                    {flow.personTypeLabel}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
