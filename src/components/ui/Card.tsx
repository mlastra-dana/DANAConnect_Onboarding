import { PropsWithChildren } from 'react';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-soft ${className}`}>{children}</section>;
}
