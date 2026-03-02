import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

const styles = {
  success: 'border-orange-200 bg-orange-50 text-perfilabOrange',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-brand-200 bg-brand-50 text-brand-700'
};

export function Toast({ message, type = 'info' }: { message: string; type?: ToastType }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${styles[type]}`} role="status" aria-live="polite">
      {type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <span>{message}</span>
    </div>
  );
}
