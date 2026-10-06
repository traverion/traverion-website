import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ListingCreationContextNav } from '../../../lib/listing-creation-workspace';
import { ListingCreationContextRail } from './ListingCreationContextRail';
import { ListingCreationNavButton } from './ListingCreationNavButton';

/**
 * Near-full-screen option editor over the tour creation workspace.
 * Left: option steps. Right: scene content + footer actions.
 */
export function TourOptionWorkspace({
  title,
  listingTitle,
  persistLabel,
  contextNav,
  continueHint,
  continueLabel,
  continueDisabled,
  onBack,
  onClose,
  onSaveDraft,
  onContinue,
  saveDraftDisabled,
  children,
}: {
  title: string;
  listingTitle: string;
  persistLabel: string | null;
  contextNav: ListingCreationContextNav;
  continueHint: string | null;
  continueLabel: string;
  continueDisabled: boolean;
  onBack: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onContinue: () => void;
  saveDraftDisabled: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="listing-creation-option-layer" role="presentation">
      <button
        type="button"
        className="listing-creation-option-backdrop"
        aria-label="Close option editor"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="listing-creation-option-shell listing-creation-option-shell--enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="listing-creation-option-rail hidden h-full shrink-0 lg:flex">
          <ListingCreationContextRail nav={contextNav} alwaysVisible />
        </div>
        <div className="listing-creation-option-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="listing-creation-option-header shrink-0 border-b border-black/[0.08] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={onBack}
                  className="lux-flat inline-flex min-h-11 items-center text-sm font-medium text-ink-muted hover:text-ink"
                >
                  ← Options
                </button>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  {listingTitle.trim() || 'Tour'} · Bookable option
                </p>
                <h3
                  id={titleId}
                  className="mt-1 font-display text-xl font-bold leading-tight tracking-tight text-ink sm:text-2xl"
                >
                  {title}
                </h3>
              </div>
              <p
                className={`pt-1 text-xs tabular-nums ${
                  persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
                }`}
                aria-live="polite"
              >
                {persistLabel ?? ''}
              </p>
            </div>
            <nav aria-label={contextNav.title} className="mt-3 lg:hidden">
              <ol className="flex flex-wrap gap-1">
                {contextNav.items.map((item, index) => (
                  <li key={item.id}>
                    <ListingCreationNavButton
                      compact
                      item={{ ...item, label: `${index + 1} ${item.label}` }}
                      onClick={() => contextNav.onSelect?.(item.id)}
                    />
                  </li>
                ))}
              </ol>
            </nav>
          </header>
          <div className="listing-creation-option-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6 lg:px-10">
            {children}
          </div>
          <div className="listing-creation-option-footer shrink-0 border-t border-black/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={saveDraftDisabled}
                  className="touch-manipulation tv-btn-secondary !min-h-11 w-full sm:w-auto disabled:opacity-50"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={continueDisabled}
                  className="touch-manipulation tv-btn-primary !min-h-11 w-full sm:w-auto disabled:opacity-50"
                >
                  {continueLabel}
                </button>
              </div>
              {continueHint ? (
                <p className="listing-creation-hint text-xs leading-relaxed text-ink-muted sm:text-right" role="status">
                  {continueHint}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
