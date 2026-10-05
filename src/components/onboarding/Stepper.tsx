import { CheckCircle2 } from 'lucide-react';

const steps = {
  es: ['Bienvenida', 'Tipo de persona', 'Documentos', 'Prueba de vida', 'Revisión y envío'],
  en: ['Welcome', 'Person type', 'Documents', 'Liveness check', 'Review and submit']
};

export function Stepper({ currentStep, language = 'es' }: { currentStep: number; language?: 'es' | 'en' }) {
  const stepLabels = steps[language];
  return (
    <nav aria-label={language === 'en' ? 'Onboarding steps' : 'Pasos de onboarding'} className="mb-8">
      <div className="relative hidden md:block">
        <div className="absolute left-[10%] right-[10%] top-4 h-px bg-borderLight" />
        <ol className="relative grid grid-cols-5 gap-4">
          {stepLabels.map((step, index) => {
            const stepNumber = index + 1;
            const active = currentStep === stepNumber;
            const done = currentStep > stepNumber;

            return (
              <li key={step} className="flex flex-col items-center text-center">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                    done ? 'border-primary bg-primary text-white' : active ? 'border-primary bg-primary text-white' : 'border-borderLight bg-white text-grayText'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
                </span>
                <span className={`mt-2 text-xs font-medium ${active || done ? 'text-dark' : 'text-grayText'}`}>{step}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="md:hidden">
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-dark">{stepLabels[currentStep - 1]}</span>
          <span className="shrink-0 text-grayText">{currentStep} / {stepLabels.length}</span>
        </div>
      <ol className="grid grid-cols-5 gap-2">
        {stepLabels.map((step, index) => {
          const stepNumber = index + 1;
          const active = currentStep === stepNumber;
          const done = currentStep > stepNumber;

          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              aria-label={`${stepNumber}. ${step}`}
              className={`h-1 rounded-full ${active ? 'bg-[#F58220]' : done ? 'bg-primary' : 'bg-borderLight'}`}
            >
              <span className="sr-only">{step}</span>
            </li>
          );
        })}
      </ol>
      </div>
    </nav>
  );
}
