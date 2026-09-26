import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goProductReturn } from '../lib/navReturn';

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  eyebrow?: string;
  onNavigate?: (page: string) => void;
  children: ReactNode;
};

export default function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  eyebrow,
  onNavigate,
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-paper tv-page">
      <article
        className="max-w-2xl mx-auto px-5 sm:px-6 py-8 sm:py-10 motion-safe:animate-fade-in"
        aria-labelledby="legal-page-title"
      >
        <button
          type="button"
          onClick={() => goProductReturn(onNavigate)}
          className="tv-btn-ghost mb-5 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back
        </button>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">{eyebrow}</p>
        ) : null}
        <h1 id="legal-page-title" className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 text-base text-ink-muted max-w-xl leading-relaxed">{subtitle}</p>
        ) : null}
        {lastUpdated ? (
          <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            Last updated {lastUpdated}
          </p>
        ) : null}
        <div
          className="mt-5 tv-card p-4 sm:p-5
            space-y-4 text-sm sm:text-[15px] text-ink leading-relaxed
            [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-ink [&_h2]:tracking-tight [&_h2]:mt-1 [&_h2]:mb-1.5
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
            [&_p]:text-ink-muted
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-black/25 hover:[&_a]:decoration-ink"
        >
          {children}
        </div>
      </article>
    </div>
  );
}
