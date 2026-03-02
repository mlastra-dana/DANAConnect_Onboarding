import { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: Variant;
  fullWidth?: boolean;
};

const styles: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primaryHover disabled:bg-[#F0C5BA] disabled:text-white',
  secondary:
    'bg-white text-dark border border-borderLight hover:bg-surface disabled:text-grayText',
  ghost: 'bg-transparent text-grayText hover:bg-surface disabled:text-grayText/70',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-200'
};

export function Button({ children, className = '', variant = 'primary', fullWidth, ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 font-semibold transition-colors duration-200 ${styles[variant]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
