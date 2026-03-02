import { ClipboardList, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '../ui/Card';

const features = [
  {
    title: 'CONTROL ESTRICTO',
    description: 'No deja pasar documentos de baja calidad ni formatos incorrectos.',
    icon: ShieldCheck
  },
  {
    title: 'FLUJO GUIADO',
    description: 'Cada paso muestra exactamente que corregir para completar el alta sin fricciones.',
    icon: ClipboardList
  },
  {
    title: 'PORTAL AUTOGESTIONADO',
    description: 'Tu equipo valida todo desde navegador con persistencia por empresa.',
    icon: Sparkles
  }
];

export function FeatureCards() {
  return (
    <section className="bg-surface pb-12 pt-6 md:pb-16 md:pt-8">
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="min-h-[190px] rounded-3xl border-borderLight p-6 shadow-soft md:p-7">
                <Icon className="h-6 w-6 text-primary md:h-7 md:w-7" />
                <h2 className="mt-4 text-[1rem] font-semibold uppercase leading-tight tracking-[0.01em] text-dark md:text-[1.04rem]">
                  {feature.title}
                </h2>
                <p className="mt-2 text-[0.92rem] leading-relaxed text-grayText md:text-[0.96rem]">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
