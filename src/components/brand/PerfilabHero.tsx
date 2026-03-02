import { ArrowRight } from 'lucide-react';

export function PerfilabHero({
  headline,
  subheadline,
  primaryCta,
  onPrimary
}: {
  headline: string;
  subheadline: string;
  primaryCta: string;
  onPrimary?: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-borderLight bg-white" id="nosotros">
      <div
        className="absolute -right-14 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(221,87,54,0.18),transparent_65%)]"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(31,31,31,0.08),transparent_68%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl px-6 py-14 md:px-12 md:py-20">
        <h1 className="text-balance text-[clamp(2rem,4.8vw,3.6rem)] font-extrabold leading-[1.02] text-dark">
          {headline}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-grayText md:text-lg">{subheadline}</p>

        <div className="mt-8" id="servicios">
          <button
            onClick={onPrimary}
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white transition-colors duration-200 hover:bg-primaryHover"
          >
            {primaryCta}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
