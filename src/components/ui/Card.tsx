import { PropsWithChildren } from 'react';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`border-t border-borderLight bg-white p-5 md:p-6 ${className}`}>{children}</section>;
}
