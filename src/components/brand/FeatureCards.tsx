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
    <section className="bg-surface py-12 md:py-16">
      <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="rounded-2xl border-borderLight p-6 shadow-soft">
                <Icon className="h-6 w-6 text-primary" />
                <h2 className="mt-4 text-base font-semibold uppercase tracking-[0.02em] text-dark">{feature.title}</h2>
                <p className="mt-2 text-sm text-grayText">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
