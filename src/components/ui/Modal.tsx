import { PropsWithChildren } from 'react';
import { Button } from './Button';

export function Modal({
  open,
  title,
  onClose,
  children
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-borderLight bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-dark">{title}</h2>
        <div className="mt-3 text-sm text-grayText">{children}</div>
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
