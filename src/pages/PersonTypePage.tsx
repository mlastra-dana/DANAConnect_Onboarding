import { Link, useNavigate } from 'react-router-dom';
import { useOnboarding } from '../app/OnboardingContext';
import { getCountryConfig, getFlowConfig } from '../config/onboardingCountries';
import { PersonType } from '../app/types';
import { Button } from '../components/ui/Button';

export function PersonTypePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { state, setPersonType } = useOnboarding();
  const selectedCountry = getCountryConfig(state.country);
  const selectedFlow = getFlowConfig(state.country, state.personType);
  const isEnglish = state.country === 'usa';

  function handlePersonTypeSelect(personType: PersonType) {
    setPersonType(personType);
    navigate(`/onboarding/${companyId}/documents`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 md:px-8 md:py-12">
      <section className="hero-shell relative overflow-hidden rounded-3xl p-6 shadow-soft md:p-8">
        <img
          src="/brand/example_brand_kit_2/logos/svg/example_icon_white.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-auto opacity-20 md:h-52"
        />
        <div className="mb-5">
          <p className="text-sm font-medium text-white/75">{selectedCountry.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            {isEnglish ? 'Select person type' : 'Seleccione tipo de persona'}
          </h1>
        </div>

        <div className="relative z-10 grid gap-3 md:grid-cols-2">
          {(['juridica', 'natural'] as const)
            .filter((personType) => selectedCountry.personTypes[personType].documentOrder.length > 0)
            .map((personType) => {
              const flow = selectedCountry.personTypes[personType];
              return (
                <button
                  key={personType}
                  type="button"
                  onClick={() => handlePersonTypeSelect(personType)}
                  className="group min-h-24 rounded-2xl border border-white/30 bg-white/10 p-5 text-left text-white transition-all duration-200 hover:border-white hover:bg-white hover:text-dark hover:shadow-soft focus-visible:border-white focus-visible:bg-white focus-visible:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  <p className="text-base font-semibold uppercase tracking-[0.08em] transition-colors duration-200 group-hover:text-primary group-focus-visible:text-primary">
                    {flow.personTypeLabel}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/75 transition-colors duration-200 group-hover:text-grayText group-focus-visible:text-grayText">
                    {flow.personTypeDescription}
                  </p>
                </button>
              );
            })}
        </div>
      </section>

      <div className="flex">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="ghost">{isEnglish ? 'Back' : 'Volver'}</Button>
        </Link>
      </div>
    </div>
  );
}
