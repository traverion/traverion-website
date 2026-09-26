import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  label: string;
  /** Short applied-value hint shown on the trigger. */
  summary?: string | null;
  active?: boolean;
  /** Close after a chip/control inside the panel is activated (single-select menus). */
  closeOnSelect?: boolean;
  children: ReactNode;
};

/**
 * Desktop secondary-filter popover — Traverion chrome over chip groups.
 * Mobile browse still uses the full filter sheet in MarketplaceBrowseShell.
 */
export function MarketplaceFilterMenu({
  label,
  summary,
  active = false,
  closeOnSelect = false,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const triggerLabel = summary ? `${label}: ${summary}` : label;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`lux-flat inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${
          active || open
            ? 'bg-finland text-white shadow-sm ring-2 ring-finland/35'
            : 'bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
        }`}
      >
        <span className="max-w-[12rem] truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-150 motion-safe:transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="absolute left-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-paper-raised p-4 shadow-soft-lg ring-1 ring-black/[0.08] motion-safe:animate-fade-in"
          onClick={
            closeOnSelect
              ? (e) => {
                  const t = e.target as HTMLElement | null;
                  if (t?.closest('button')) close();
                }
              : undefined
          }
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MarketplaceSecondaryFilterRow({
  children,
  sortControl,
}: {
  children: ReactNode;
  sortControl?: ReactNode;
}) {
  return (
    <div className="hidden lg:flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
        {children}
      </div>
      {sortControl ? <div className="shrink-0">{sortControl}</div> : null}
    </div>
  );
}
