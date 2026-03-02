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
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200 shadow-soft-dark" id="nosotros">
      <div className="absolute inset-0 bg-[url('/hero-doctor.jpg')] bg-cover bg-center" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      <div className="absolute inset-0 bg-[url('/pattern-hex.svg')] bg-cover bg-center opacity-20" aria-hidden="true" />
      <div className="absolute inset-0 bg-[url('/pattern-ecg.svg')] bg-cover bg-center opacity-15" aria-hidden="true" />

      <div className="relative z-10 max-w-4xl px-6 py-16 md:px-12 md:py-24">
        <h1 className="text-balance text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[0.98] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
          {headline}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/90 md:text-xl">{subheadline}</p>

        <div className="mt-8" id="servicios">
          <button
            onClick={onPrimary}
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-perfilabOrange px-7 py-3 text-base font-bold text-white shadow-soft-orange transition hover:bg-[#de7e22]"
          >
            {primaryCta}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
