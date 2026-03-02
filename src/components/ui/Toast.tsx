import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

const styles = {
  success: 'border border-[#F5C7BB] bg-successSoft text-primary',
  error: 'border border-[#F9C9C3] bg-errorSoft text-[#B42318]',
  info: 'border border-borderLight bg-white text-grayText'
};

export function Toast({ message, type = 'info' }: { message: string; type?: ToastType }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${styles[type]}`} role="status" aria-live="polite">
      {type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <span>{message}</span>
    </div>
  );
}
