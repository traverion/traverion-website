import type { ReactNode } from 'react';
import { HERO_IMG } from '../lib/heroImages';

type PageHeroProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  imageSrc?: string;
  /** Dark overlay for readability */
  overlay?: 'slate' | 'finland' | 'slateSoft';
  children?: ReactNode;
  className?: string;
};

/**
 * Full-width hero using photos from /public. Default image: banner.
 * Subtle slow zoom/pan on the image; disabled when prefers-reduced-motion.
 */
export default function PageHero({
  title,
  subtitle,
  eyebrow,
  imageSrc = HERO_IMG.banner,
  overlay = 'slate',
  children,
  className = '',
}: PageHeroProps) {
  const overlayClass =
    overlay === 'finland'
      ? 'from-finland/92 via-finland/55 to-finland/25'
      : overlay === 'slateSoft'
        ? 'from-[#0f172a]/88 via-[#0f172a]/45 to-[#0f172a]/25'
        : 'from-[#0f172a]/92 via-[#0f172a]/55 to-[#0f172a]/30';

  return (
    <section
      className={`relative w-full overflow-hidden min-h-[220px] sm:min-h-[280px] lg:min-h-[320px] shadow-[0_24px_64px_-20px_rgba(15,23,42,0.45)] ${className}`}
      aria-label=""
    >
      <div className="page-hero-media" aria-hidden>
        <img src={imageSrc} alt="" loading="eager" decoding="async" />
      </div>
      {/* Scrim: gradient + slight vignette for text contrast */}
      <div
        className={`absolute inset-0 bg-gradient-to-t ${overlayClass}`}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35 pointer-events-none"
        aria-hidden
      />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 flex flex-col justify-end min-h-[220px] sm:min-h-[280px] lg:min-h-[320px]">
        <div className="page-hero-content">
          {eyebrow ? (
            <p className="page-hero-eyebrow text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase mb-2 drop-shadow-sm !text-white/90">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="page-hero-title text-3xl sm:text-4xl lg:text-5xl font-bold !text-white text-balance max-w-4xl drop-shadow-md tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="page-hero-subtitle mt-3 text-base sm:text-lg !text-white max-w-2xl leading-relaxed drop-shadow-md [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">
              {subtitle}
            </p>
          ) : null}
          {children ? <div className="mt-6 flex flex-wrap gap-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
