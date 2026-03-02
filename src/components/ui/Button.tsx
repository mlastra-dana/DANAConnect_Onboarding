import { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: Variant;
  fullWidth?: boolean;
};

const styles: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-100 disabled:text-brand-500',
  secondary:
    'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50 disabled:text-slate-400',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-200'
};

export function Button({ children, className = '', variant = 'primary', fullWidth, ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-medium transition ${styles[variant]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
