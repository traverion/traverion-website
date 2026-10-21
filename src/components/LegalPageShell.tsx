import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { goProductReturn } from '../lib/navReturn';

export type LegalTocItem = {
  id: string;
  label: string;
};

export type ConsumerPageLayout = 'legal' | 'form' | 'marketing' | 'directory';

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  eyebrow?: string;
  /** Optional in-page section links (ids must exist on headings in children). */
  toc?: LegalTocItem[];
  onNavigate?: (page: string) => void;
  children: ReactNode;
  /**
   * legal — wide page + comfortable reading column + sticky TOC
   * form — ~1040px for applications / contact
   * marketing — editorial (~1120px)
   * directory — sitemap-style grids (~1120px)
   */
  layout?: ConsumerPageLayout;
  /** Optional side panel (contact details, program notes) beside form content on desktop. */
  aside?: ReactNode;
};

const OUTER: Record<ConsumerPageLayout, string> = {
  legal: 'mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8',
  form: 'mx-auto w-full max-w-[1040px] px-5 sm:px-6 lg:px-8',
  marketing: 'mx-auto w-full max-w-[1120px] px-5 sm:px-6 lg:px-8',
  directory: 'mx-auto w-full max-w-[1120px] px-5 sm:px-6 lg:px-8',
};

/**
 * Shared shell for Terms, Privacy, About, Contact, and other consumer info pages.
 * Visual polish only — callers must not alter legal meaning.
 */
export default function LegalPageShell({
  title,
  subtitle,
  lastUpdated,
  eyebrow = 'Traverion',
  toc,
  onNavigate,
  children,
  layout = 'legal',
  aside,
}: LegalPageShellProps) {
  const [activeId, setActiveId] = useState<string | null>(toc?.[0]?.id ?? null);
  const [tocOpen, setTocOpen] = useState(false);
  const hasToc = Boolean(toc && toc.length > 0);
  const showStickyToc = hasToc && layout === 'legal';

  useEffect(() => {
    if (!showStickyToc || !toc?.length) return;
    const nodes = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] }
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [showStickyToc, toc]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    setTocOpen(false);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* ignore */
    }
  };

  const articleClass =
    layout === 'legal'
      ? `motion-safe:animate-fade-in max-w-[48rem]
            space-y-5 text-[15px] sm:text-[15.5px] text-ink leading-relaxed
            [&_h2]:font-semibold [&_h2]:text-[1.2rem] [&_h2]:sm:text-[1.35rem] [&_h2]:text-ink [&_h2]:tracking-tight
            [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-black/[0.06] [&_h2]:scroll-mt-28
            [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-6 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-muted
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:text-ink-muted
            [&_p]:text-ink-muted [&_p]:leading-relaxed
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-finland [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-finland/30 hover:[&_a]:decoration-finland
            [&_.tv-card]:shadow-sm`
      : `motion-safe:animate-fade-in
            space-y-5 text-[15px] text-ink leading-relaxed
            [&_h2]:font-semibold [&_h2]:text-[1.2rem] [&_h2]:sm:text-[1.35rem] [&_h2]:text-ink [&_h2]:tracking-tight
            [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:scroll-mt-28
            [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-5 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-muted
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:text-ink-muted
            [&_p]:text-ink-muted [&_p]:leading-relaxed
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-finland [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-finland/30 hover:[&_a]:decoration-finland`;

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="border-b border-black/[0.06] bg-white">
        <div className={`${OUTER[layout]} pt-5 sm:pt-7 pb-6 sm:pb-8`}>
          <button
            type="button"
            onClick={() => goProductReturn(onNavigate)}
            className="tv-btn-ghost mb-5 -ml-2"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back
          </button>
          {eyebrow ? (
            <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-finland">{eyebrow}</p>
          ) : null}
          <h1
            id="legal-page-title"
            className="font-semibold text-[1.75rem] sm:text-[2.1rem] lg:text-[2.35rem] text-ink tracking-tight leading-[1.15]"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2.5 max-w-2xl text-[15px] sm:text-base text-ink-muted leading-relaxed">{subtitle}</p>
          ) : null}
          {lastUpdated ? (
            <p className="mt-4 text-[12px] text-ink-faint">Last updated {lastUpdated}</p>
          ) : null}
        </div>
      </div>

      <div className={`${OUTER[layout]} py-8 sm:py-10`}>
        {hasToc && !showStickyToc ? (
          <nav
            aria-label="On this page"
            className="mb-8 rounded-xl border border-black/[0.06] bg-white px-4 py-3.5 sm:px-5"
          >
            <p className="mb-2 text-[12px] font-semibold text-ink-muted">On this page</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {toc!.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(item.id);
                    }}
                    className="text-sm text-ink-muted hover:text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 rounded"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {showStickyToc ? (
          <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-12">
            <div className="mb-6 lg:mb-0">
              <div className="lg:hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-black/[0.06] bg-white px-4 py-3 text-left text-sm font-medium text-ink"
                  aria-expanded={tocOpen}
                  onClick={() => setTocOpen((o) => !o)}
                >
                  On this page
                  <ChevronDown
                    className={`h-4 w-4 text-ink-muted transition-transform ${tocOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {tocOpen ? (
                  <nav aria-label="On this page" className="mt-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2">
                    <TocList toc={toc!} activeId={activeId} onSelect={scrollToSection} />
                  </nav>
                ) : null}
              </div>
              <nav
                aria-label="On this page"
                className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-3.5 lg:block"
              >
                <p className="mb-2 px-1 text-[12px] font-semibold text-ink-muted">On this page</p>
                <TocList toc={toc!} activeId={activeId} onSelect={scrollToSection} />
              </nav>
            </div>
            <article className={articleClass} aria-labelledby="legal-page-title">
              {children}
            </article>
          </div>
        ) : layout === 'form' && aside ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
            <article className={articleClass} aria-labelledby="legal-page-title">
              {children}
            </article>
            <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">{aside}</aside>
          </div>
        ) : (
          <article className={articleClass} aria-labelledby="legal-page-title">
            {children}
          </article>
        )}
      </div>
    </div>
  );
}

function TocList({
  toc,
  activeId,
  onSelect,
}: {
  toc: LegalTocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {toc.map((item) => {
        const active = activeId === item.id;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelect(item.id);
              }}
              className={`block rounded-lg px-2 py-1.5 text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 ${
                active
                  ? 'bg-finland/8 font-medium text-finland'
                  : 'text-ink-muted hover:bg-black/[0.03] hover:text-ink'
              }`}
              aria-current={active ? 'location' : undefined}
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Shared label style for consumer forms. */
export function consumerFieldLabelClass(optional?: boolean): string {
  return `block text-[13px] font-medium text-ink mb-1.5${optional ? '' : ''}`;
}

export function ConsumerFieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[12px] text-ink-faint leading-snug">{children}</p>;
}

export function ConsumerAsideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <h2 className="text-[14px] font-semibold text-ink tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}
