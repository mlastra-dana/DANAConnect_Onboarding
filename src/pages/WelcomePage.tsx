import { useNavigate } from 'react-router-dom';
import { FeatureCards } from '../components/brand/FeatureCards';
import { DanaConnectHero } from '../components/brand/DanaConnectHero';
import { useOnboarding } from '../app/OnboardingContext';
import { getCountryConfig, ONBOARDING_COUNTRIES } from '../config/onboardingCountries';

export function WelcomePage({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { state, setCountry } = useOnboarding();
  const selectedCountry = getCountryConfig(state.country);

  function handleCountrySelect(country: 've' | 'pe' | 'bo') {
    setCountry(country);
    navigate(`/onboarding/${companyId}/documents`);
  }

  return (
    <div>
      <DanaConnectHero
        eyebrow=""
        headline="Portal de onboarding y carga de documentos."
        subheadline="Centralice los adjuntos requeridos en un flujo simple, seguro y validado para su empresa."
        actions={
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">Selecciona pais</p>
            <div className="flex items-center gap-4">
              {Object.values(ONBOARDING_COUNTRIES).map((country) => {
                const isSelected = state.country === country.code;
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountrySelect(country.code)}
                    aria-label={country.name}
                    className={`flex h-16 w-16 items-center justify-center rounded-full border text-3xl transition-all duration-200 md:h-20 md:w-20 md:text-4xl ${
                      isSelected
                        ? 'border-white bg-white shadow-soft'
                        : 'border-white/35 bg-white/10 hover:bg-white/18'
                    }`}
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
