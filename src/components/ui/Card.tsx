import { PropsWithChildren } from 'react';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-xl border border-borderLight bg-white p-6 shadow-soft ${className}`}>{children}</section>;
}
