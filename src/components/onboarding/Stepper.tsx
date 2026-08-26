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

      <ol className="grid grid-cols-1 gap-3 md:hidden">
        {stepLabels.map((step, index) => {
          const stepNumber = index + 1;
          const active = currentStep === stepNumber;
          const done = currentStep > stepNumber;

          return (
            <li
              key={step}
              className={`rounded-lg border p-3 text-sm ${
                active ? 'border-primary bg-brand-50 text-dark' : 'border-borderLight bg-white text-grayText'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-primary text-white' : active ? 'bg-primary text-white' : 'bg-pendingSoft text-grayText'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
                </span>
                <span className="font-medium">{step}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
