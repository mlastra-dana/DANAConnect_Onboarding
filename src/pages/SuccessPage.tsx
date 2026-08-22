import { CheckCircle2 } from 'lucide-react';

export function SuccessPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-borderLight bg-white px-6 py-10 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-dark">Proceso completado</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-grayText md:text-base">
          Tu documentación fue recibida y está en revisión.
        </p>
      </div>
    </div>
  );
}
