import { ArrowRight } from 'lucide-react';
import { ReactNode } from 'react';

export function DanaConnectHero({
  eyebrow,
  headline,
  subheadline,
  primaryCta,
  onPrimary,
  actions
}: {
  eyebrow: string;
  headline: ReactNode;
  subheadline: string;
  primaryCta?: string;
  onPrimary?: () => void;
  actions?: ReactNode;
}) {
  return (
    <section className="mt-8 bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        <div className="hero-shell relative overflow-hidden rounded-[40px] px-7 py-12 md:px-14 md:py-16 lg:px-16 lg:py-20">
          <img
            src="/brand/example_brand_kit_2/logos/svg/example_icon_white.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 h-40 w-auto opacity-20 md:-right-6 md:-top-10 md:h-56"
          />
          <div className="relative z-10 max-w-[860px]">
            {eyebrow ? <p className="text-[0.72rem] font-semibold tracking-[0.34em] text-white/85 md:text-sm">{eyebrow}</p> : null}
            <h1 className={`${eyebrow ? 'mt-5' : ''} hero-title text-white`}>{headline}</h1>
            {subheadline ? <p className="hero-subtitle mt-6 max-w-[760px] text-white/90">{subheadline}</p> : null}
          </div>

          {actions !== undefined || primaryCta ? (
            <div className="relative z-10 mt-8 md:mt-10">
              {actions ?? (
              <button
                onClick={onPrimary}
                type="button"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white bg-white px-7 text-base font-semibold text-primary transition-colors duration-200 hover:bg-brand-50 md:h-14 md:px-8 md:text-xl"
              >
                {primaryCta}
                <ArrowRight className="h-4 w-4 text-primary md:h-5 md:w-5" />
              </button>
              )}
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}
