import { ArrowRight } from 'lucide-react';

export function PerfilabHero({
  eyebrow,
  headline,
  subheadline,
  primaryCta,
  onPrimary
}: {
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryCta: string;
  onPrimary?: () => void;
}) {
  return (
    <section className="hero-bg-primary flex min-h-[calc(100vh-64px)] items-center">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <p className="text-xs font-semibold tracking-[0.24em] text-white/80 md:text-sm">{eyebrow}</p>
        <h1 className="hero-title mt-4 max-w-5xl text-balance text-white">{headline}</h1>
        <p className="hero-subtitle mt-6 max-w-2xl text-white/90">{subheadline}</p>
        <div className="mt-10">
          <button
            onClick={onPrimary}
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white bg-white px-6 py-3 text-base font-semibold text-primary transition-colors duration-200 hover:bg-[#FFF4F1]"
          >
            {primaryCta}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
