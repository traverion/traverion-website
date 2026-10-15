import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/** Full-width supplier portal pages — fills the main column on desktop, fluid on mobile. */
export const SUPPLIER_PAGE_CLASS = 'partner-stack w-full min-w-0 max-w-full motion-safe:animate-fade-in';

/** Main column width modes for SupplierLayout `partner-page-frame`. */
export type PartnerPageFrameMode = 'default' | 'home' | 'ops';

export function partnerPageFrameClass(mode: PartnerPageFrameMode = 'default'): string {
  if (mode === 'ops') return 'partner-page-frame partner-page-frame--ops outline-none';
  if (mode === 'home') return 'partner-page-frame partner-page-frame--home outline-none';
  return 'partner-page-frame outline-none';
}

export const SUPPLIER_SECTION_HEADER_CLASS =
  'partner-section__head partner-section__head--ruled';

/** @deprecated Use SUPPLIER_PAGE_CLASS (all portal pages are full-width now). */
export const SUPPLIER_PAGE_WIDE_CLASS = SUPPLIER_PAGE_CLASS;

type SupplierSectionProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Draw a hairline under the heading row. Default true. */
  ruled?: boolean;
  className?: string;
  id?: string;
};

/** Standard partner page section — heading, optional desc/actions, content. */
export function SupplierSection({
  title,
  description,
  actions,
  children,
  ruled = true,
  className = '',
  id,
}: SupplierSectionProps) {
  return (
    <section id={id} className={`partner-section ${className}`.trim()}>
      <div className={ruled ? 'partner-section__head partner-section__head--ruled' : 'partner-section__head'}>
        <div className="min-w-0">
          <h2 className="partner-section-title font-display">{title}</h2>
          {description ? <p className="partner-section-desc">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export const SUPPLIER_STAT_GRID_CLASS =
  'grid w-full min-w-0 grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4';

/** Three-up summary chips in page heroes (bookings, pickup, etc.). */
export const SUPPLIER_HERO_STAT_GRID_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3 border-t border-black/[0.06] pt-4';

/** Two-up summary chips in page heroes (reviews, etc.). */
export const SUPPLIER_HERO_STAT_GRID_2_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3 border-t border-black/[0.06] pt-4';

export const SUPPLIER_MODAL_OVERLAY_CLASS = 'tv-sheet-overlay tv-sheet-overlay--portal';

export const SUPPLIER_MODAL_PANEL_CLASS =
  'relative z-10 bg-paper-raised rounded-t-2xl sm:rounded-2xl shadow-xl ring-1 ring-black/[0.08] w-full overflow-hidden motion-safe:animate-slide-up sm:motion-safe:animate-none';

export const SUPPLIER_MODAL_PANEL_SCROLL_CLASS = `${SUPPLIER_MODAL_PANEL_CLASS} max-h-[min(calc(100dvh-env(safe-area-inset-bottom)-0.75rem),92dvh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]`;

type SupplierPageHeroProps = {
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Optional eyebrow above the title. Omit for cleaner operational pages. */
  badge?: string | null;
};

export function SupplierPageHero({ title, description, actions, children, badge = null }: SupplierPageHeroProps) {
  return (
    <header className="partner-page-hero border-b border-[color:var(--partner-border,rgba(15,23,42,0.08))]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {badge ? <p className="partner-label mb-1 text-finland">{badge}</p> : null}
          <h1 className="partner-page-title font-display">{title}</h1>
          {description ? <p className="partner-section-desc mt-1">{description}</p> : null}
        </div>
        {actions ? (
          <div className="shrink-0 flex flex-wrap items-center gap-2 [&_button]:min-h-10 [&_a]:min-h-10">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

const SupplierModalTitleIdContext = createContext<string | null>(null);

type SupplierModalHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  /** When used outside SupplierModalShell, pass the same id as the dialog’s aria-labelledby. */
  titleId?: string;
};

export function SupplierModalHeader({ icon: Icon, title, subtitle, onClose, titleId }: SupplierModalHeaderProps) {
  const shellTitleId = useContext(SupplierModalTitleIdContext);
  const headingId = titleId ?? shellTitleId ?? undefined;
  return (
    <div className={`${SUPPLIER_SECTION_HEADER_CLASS} flex shrink-0 items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-finland" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-lg sm:text-xl font-semibold text-ink tracking-tight truncate">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-xs text-ink-muted mt-0.5 truncate" title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-ink-muted hover:bg-black/[0.04] shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function SupplierListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 animate-pulse" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-[4.25rem] rounded-[var(--partner-radius,0.5rem)] bg-[color:var(--partner-surface,#fff)] ring-1 ring-[color:var(--partner-border,rgba(15,23,42,0.08))]"
        />
      ))}
    </div>
  );
}

export function SupplierEmptyState({
  icon: Icon,
  title,
  body,
  action,
  className = '',
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`partner-empty ${className}`.trim()} role="status">
      {Icon ? (
        <Icon className="partner-icon mb-0.5 text-finland" strokeWidth={1.85} aria-hidden />
      ) : null}
      <p className="partner-empty__title">{title}</p>
      <p className="partner-empty__body">{body}</p>
      {action ? <div className="partner-empty__actions">{action}</div> : null}
    </div>
  );
}

export function SupplierStatSkeletonGrid({ count = 4 }: { count?: number }) {
  const gridClass =
    count === 3
      ? 'grid w-full min-w-0 grid-cols-1 min-[480px]:grid-cols-3 gap-3 sm:gap-4'
      : SUPPLIER_STAT_GRID_CLASS;
  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-xl bg-paper-raised p-3 sm:p-3.5 flex items-center gap-3 ring-1 ring-black/[0.06] animate-pulse"
        >
          <div className="w-9 h-9 rounded-lg bg-finland/15 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-20 rounded bg-black/[0.06]" />
            <div className="h-5 w-14 rounded bg-black/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

type SupplierModalShellProps = {
  children: ReactNode;
  onClose?: () => void;
  maxWidth?: 'md' | 'lg' | 'xl';
  /**
   * Legacy: entire panel scrolls.
   * Prefer `framed` so header/footer stay visible and only the body scrolls.
   */
  scrollable?: boolean;
  /** Flex column with sticky header/footer; pass body in a scrollable middle region. */
  framed?: boolean;
};

export function SupplierModalShell({
  children,
  onClose,
  maxWidth = 'md',
  scrollable = true,
  framed = false,
}: SupplierModalShellProps) {
  const widthClass = maxWidth === 'xl' ? 'max-w-xl' : maxWidth === 'lg' ? 'max-w-lg' : 'max-w-md';
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(true, panelRef, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const panelClass = framed
    ? `${SUPPLIER_MODAL_PANEL_CLASS} flex max-h-[min(92dvh,40rem)] flex-col`
    : scrollable
      ? SUPPLIER_MODAL_PANEL_SCROLL_CLASS
      : SUPPLIER_MODAL_PANEL_CLASS;

  const layer = (
    <div className={SUPPLIER_MODAL_OVERLAY_CLASS}>
      {onClose ? (
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${panelClass} ${widthClass}`}
      >
        <SupplierModalTitleIdContext.Provider value={titleId}>{children}</SupplierModalTitleIdContext.Provider>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return layer;
  return createPortal(layer, document.body);
}
