import { ClipboardList, ScanFace, FileCheck2 } from 'lucide-react';

const features = [
  {
    title: 'Documentación',
    description: 'Recaudos personales y empresariales.',
    icon: ClipboardList
  },
  {
    title: 'Verificación de identidad',
    description: 'Identificación y prueba de vida.',
    icon: ScanFace
  },
  {
    title: 'Solicitud',
    description: 'Revisión y envío de su expediente.',
    icon: FileCheck2
  }
];

export function FeatureCards() {
  return (
    <section className="bg-surface py-8 md:py-10">
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="border-t border-borderLight pt-5">
                <div className="flex items-center justify-between"><Icon className="h-6 w-6 text-primary" /><span className="text-xs font-medium text-grayText">0{index + 1}</span></div>
                <h2 className="mt-4 text-base font-semibold leading-tight text-dark">
                  {feature.title}
                </h2>
                <p className="mt-2 text-[0.92rem] leading-relaxed text-grayText md:text-[0.96rem]">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
