import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

/** Full-width supplier portal pages — fills the main column on desktop, fluid on mobile. */
export const SUPPLIER_PAGE_CLASS = 'w-full min-w-0 max-w-full motion-safe:animate-fade-in';

export const SUPPLIER_SECTION_HEADER_CLASS = 'pb-4 mb-4 border-b border-black/[0.06]';

/** @deprecated Use SUPPLIER_PAGE_CLASS (all portal pages are full-width now). */
export const SUPPLIER_PAGE_WIDE_CLASS = SUPPLIER_PAGE_CLASS;

export const SUPPLIER_STAT_GRID_CLASS =
  'grid w-full min-w-0 grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4';

/** Three-up summary chips in page heroes (bookings, pickup, etc.). */
export const SUPPLIER_HERO_STAT_GRID_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3 border-t border-gray-100 pt-5';

/** Two-up summary chips in page heroes (reviews, etc.). */
export const SUPPLIER_HERO_STAT_GRID_2_CLASS =
  'mt-5 grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3 border-t border-gray-100 pt-5';

export const SUPPLIER_MODAL_OVERLAY_CLASS =
  'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/35 backdrop-blur-md p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]';

export const SUPPLIER_MODAL_PANEL_CLASS =
  'relative z-10 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200/80 w-full overflow-hidden motion-safe:animate-slide-up sm:motion-safe:animate-none';

export const SUPPLIER_MODAL_PANEL_SCROLL_CLASS = `${SUPPLIER_MODAL_PANEL_CLASS} max-h-[min(calc(100dvh-env(safe-area-inset-bottom)-0.75rem),92dvh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]`;

type SupplierPageHeroProps = {
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function SupplierPageHero({ title, description, actions, children }: SupplierPageHeroProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">{title}</h1>
          {description ? <p className="mt-2 text-sm sm:text-base text-ink-muted max-w-xl leading-relaxed">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type SupplierModalHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClose?: () => void;
};

export function SupplierModalHeader({ icon: Icon, title, subtitle, onClose }: SupplierModalHeaderProps) {
  return (
    <div className={`${SUPPLIER_SECTION_HEADER_CLASS} flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-finland" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
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
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-28 rounded-2xl bg-black/[0.04]" />
      ))}
    </div>
  );
}

export function SupplierEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-16 sm:py-24 max-w-md">
      <h2 className="font-display text-2xl sm:text-3xl text-ink">{title}</h2>
      <p className="mt-3 text-sm sm:text-base text-ink-muted leading-relaxed">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
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
          className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 animate-pulse"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-6 w-16 rounded bg-gray-200" />
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

  return (
    <div className={SUPPLIER_MODAL_OVERLAY_CLASS}>
      {onClose ? (
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      ) : null}
      <div className={`${panelClass} ${widthClass}`}>{children}</div>
    </div>
  );
}
