import { CheckCircle2 } from 'lucide-react';

const steps = ['Bienvenida', 'Documentos', 'Excel', 'Revisión & Envío'];

export function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Pasos de onboarding" className="mb-8">
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const active = currentStep === stepNumber;
          const done = currentStep > stepNumber;

          return (
            <li
              key={step}
              className={`rounded-xl border p-3 text-sm ${
                active ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-orange-50 text-perfilabOrange' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'
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
