import { useNavigate } from 'react-router-dom';
import { FeatureCards } from '../components/brand/FeatureCards';
import { DanaConnectHero } from '../components/brand/DanaConnectHero';
import { useOnboarding } from '../app/OnboardingContext';
import { CountryCode } from '../app/types';
import { getCountryConfig, ONBOARDING_COUNTRIES } from '../config/onboardingCountries';

export function WelcomePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { state, setCountry } = useOnboarding();
  const selectedCountry = getCountryConfig(state.country);

  function handleCountrySelect(country: CountryCode) {
    setCountry(country);
    navigate(`/onboarding/${companyId}/tipo-persona`);
  }

  return (
    <div>
      <DanaConnectHero
        eyebrow={selectedCountry.heroEyebrow}
        headline="Portal de onboarding y carga de documentos."
        subheadline="Seleccione el país para continuar con el flujo correspondiente."
        actions={
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">Selecciona pais</p>
            <div className="flex items-center gap-4">
              {Object.values(ONBOARDING_COUNTRIES).map((country) => {
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountrySelect(country.code)}
                    aria-label={country.name}
                    className="flex h-16 w-16 items-center justify-center rounded-full border border-white/35 bg-white/10 text-3xl transition-all duration-200 hover:border-white hover:bg-white hover:shadow-soft focus-visible:border-white focus-visible:bg-white focus-visible:shadow-soft md:h-20 md:w-20 md:text-4xl"
                  >
                    <span aria-hidden="true">{country.flag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
      <FeatureCards />
    </div>
  );
}
