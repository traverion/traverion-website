import { createContext, useContext, useId, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import EmptyState from '../EmptyState';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/** Full-width supplier portal pages — fills the main column on desktop, fluid on mobile. */
export const SUPPLIER_PAGE_CLASS = 'w-full min-w-0 max-w-full motion-safe:animate-fade-in';

export const SUPPLIER_SECTION_HEADER_CLASS =
  'pb-4 mb-4 border-b border-[color:var(--partner-border,rgba(15,23,42,0.08))]';

/** @deprecated Use SUPPLIER_PAGE_CLASS (all portal pages are full-width now). */
export const SUPPLIER_PAGE_WIDE_CLASS = SUPPLIER_PAGE_CLASS;

export const SUPPLIER_STAT_GRID_CLASS =
  'grid w-full min-w-0 grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4';

/** Three-up summary chips in page heroes (bookings, pickup, etc.). */
export const SUPPLIER_HERO_STAT_GRID_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3 border-t border-black/[0.06] pt-4';

/** Two-up summary chips in page heroes (reviews, etc.). */
export const SUPPLIER_HERO_STAT_GRID_2_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3 border-t border-black/[0.06] pt-4';

export const SUPPLIER_MODAL_OVERLAY_CLASS = 'tv-sheet-overlay';

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
    <header className="partner-page-hero mb-6 pb-5 border-b border-[color:var(--partner-border,rgba(15,23,42,0.08))]">
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {badge ? (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-finland">
              {badge}
            </p>
          ) : null}
          <h1 className="font-display text-[1.625rem] sm:text-[1.85rem] font-semibold leading-[1.15] text-slate-900 tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 text-[13.5px] text-slate-500 max-w-2xl leading-relaxed">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="shrink-0 flex flex-wrap items-center gap-2 [&_button]:min-h-11 [&_a]:min-h-11">
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
    <div className={`${SUPPLIER_SECTION_HEADER_CLASS} flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-finland" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-lg sm:text-xl font-semibold text-ink tracking-tight truncate">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-ink-muted mt-0.5 truncate">{subtitle}</p> : null}
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
          className="h-20 rounded-xl bg-paper-raised ring-1 ring-black/[0.06]"
        />
      ))}
    </div>
  );
}

export function SupplierEmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return <EmptyState icon={icon} title={title} body={body} action={action} className={className} />;
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
  scrollable?: boolean;
};

export function SupplierModalShell({ children, onClose, maxWidth = 'md', scrollable = true }: SupplierModalShellProps) {
  const widthClass = maxWidth === 'xl' ? 'max-w-xl' : maxWidth === 'lg' ? 'max-w-lg' : 'max-w-md';
  const panelClass = scrollable ? SUPPLIER_MODAL_PANEL_SCROLL_CLASS : SUPPLIER_MODAL_PANEL_CLASS;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(true, panelRef, onClose);

  return (
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
}
