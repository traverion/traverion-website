import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goProductReturn } from '../lib/navReturn';

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  onNavigate?: (page: string) => void;
  children: ReactNode;
};

export default function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  onNavigate,
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-12 sm:py-16 motion-safe:animate-fade-in">
        <button
          type="button"
          onClick={() => goProductReturn(onNavigate)}
          className="tv-btn-ghost mb-8 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back
        </button>
        <h1 className="font-display text-3xl sm:text-5xl text-ink tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-3 text-base text-ink-muted max-w-xl leading-relaxed">{subtitle}</p>
        ) : null}
        {lastUpdated ? (
          <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            Last updated {lastUpdated}
          </p>
        ) : null}
        <div
          className="mt-10 space-y-8 text-[15px] sm:text-base text-ink leading-relaxed
            [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_h2]:tracking-tight [&_h2]:mt-2 [&_h2]:mb-3
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2
            [&_p]:text-ink-muted
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-black/25 hover:[&_a]:decoration-ink"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
