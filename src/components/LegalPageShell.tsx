import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goProductReturn } from '../lib/navReturn';

export type LegalTocItem = {
  id: string;
  label: string;
};

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  eyebrow?: string;
  /** Optional in-page section links (ids must exist on headings in children). */
  toc?: LegalTocItem[];
  onNavigate?: (page: string) => void;
  children: ReactNode;
};

/**
 * Shared shell for Terms, Privacy, About, Contact, and other info pages.
 * Readability first — visual polish only; do not alter legal meaning in callers.
 */
export default function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  eyebrow = 'Traverion',
  toc,
  onNavigate,
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="border-b border-black/[0.06] bg-gradient-to-b from-white/80 to-transparent">
        <div className="mx-auto max-w-3xl px-5 sm:px-6 pt-6 sm:pt-8 pb-8 sm:pb-10">
          <button
            type="button"
            onClick={() => goProductReturn(onNavigate)}
            className="tv-btn-ghost mb-6 -ml-2"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-finland mb-2">{eyebrow}</p>
          <h1
            id="legal-page-title"
            className="font-display text-[1.85rem] sm:text-4xl lg:text-[2.65rem] text-ink tracking-tight leading-[1.15]"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 text-base sm:text-lg text-ink-muted max-w-2xl leading-relaxed">{subtitle}</p>
          ) : null}
          {lastUpdated ? (
            <p className="mt-5 text-[11px] uppercase tracking-[0.16em] text-ink-faint">
              Last updated {lastUpdated}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 sm:px-6 py-8 sm:py-10">
        {toc && toc.length > 0 ? (
          <nav
            aria-label="On this page"
            className="mb-8 rounded-2xl border border-black/[0.06] bg-white/70 px-4 py-3.5 sm:px-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">
              On this page
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-sm text-ink-muted hover:text-ink underline-offset-2 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <article
          className="motion-safe:animate-fade-in
            space-y-5 text-sm sm:text-[15px] text-ink leading-relaxed
            [&_h2]:font-display [&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:text-ink [&_h2]:tracking-tight
            [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-black/[0.06] [&_h2]:scroll-mt-24
            [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-6 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-muted
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:text-ink-muted
            [&_p]:text-ink-muted [&_p]:leading-relaxed
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-black/25 hover:[&_a]:decoration-ink
            [&_.tv-card]:shadow-sm"
          aria-labelledby="legal-page-title"
        >
          {children}
        </article>
      </div>
    </div>
  );
}
