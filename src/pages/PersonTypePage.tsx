import { Link, useNavigate } from 'react-router-dom';
import { useOnboarding } from '../app/OnboardingContext';
import { getCountryConfig } from '../config/onboardingCountries';
import { PersonType } from '../app/types';
import { Button } from '../components/ui/Button';
import { ArrowRight, Building2, UserRound } from 'lucide-react';

export function PersonTypePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { state, setPersonType } = useOnboarding();
  const selectedCountry = getCountryConfig(state.country);
  const isEnglish = state.country === 'usa';

  function handlePersonTypeSelect(personType: PersonType) {
    setPersonType(personType);
    navigate(`/onboarding/${companyId}/documents`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-6 md:py-8">
      <section className="border-t border-borderLight bg-white p-5 md:p-8">
        <div className="mb-5">
          <p className="text-sm font-medium text-grayText">Mercantil · {selectedCountry.name}</p>
          <h1 className="mt-2 text-2xl font-bold text-dark md:text-3xl">
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
                  className="group min-h-44 rounded-lg border border-borderLight bg-white p-5 text-left text-dark transition-colors duration-200 hover:border-primary hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <div className="mb-5 flex items-center justify-between text-primary">{personType === 'juridica' ? <Building2 className="h-7 w-7" /> : <UserRound className="h-7 w-7" />}<ArrowRight className="h-5 w-5" /></div>
                  <p className="text-lg font-semibold text-primary">
                    {flow.personTypeLabel}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-grayText">
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
