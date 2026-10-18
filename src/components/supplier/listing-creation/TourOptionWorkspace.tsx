import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { ListingCreationNavButton } from './ListingCreationNavButton';
import { ListingCreationMobileStepStrip } from './ListingCreationMobileStepStrip';

/**
 * Full-screen option editor (portaled) with a left step rail matching tour creation.
 * Sidebar holds Create/Edit + tour context; main header shows the option name (room for long names).
 */
export function TourOptionWorkspace({
  modeTitle,
  optionName,
  listingTitle,
  persistLabel,
  continueHint,
  continueLabel,
  continueDisabled,
  navItems,
  onSelectNavId,
  onBackToOptions,
  onPreviousScene,
  onClose,
  onSaveDraft,
  onContinue,
  saveDraftDisabled,
  children,
  variant = 'option',
  backLabel,
}: {
  /** Short sidebar title: Create option / Edit option. */
  modeTitle: string;
  /** Live option name in the main header; empty → "New option". */
  optionName: string;
  listingTitle: string;
  persistLabel: string | null;
  continueHint: string | null;
  continueLabel: string;
  continueDisabled: boolean;
  navItems: ListingCreationNavItem[];
  onSelectNavId: (id: string) => void;
  onBackToOptions: () => void;
  onPreviousScene?: (() => void) | null;
  onClose: () => void;
  onSaveDraft: () => void;
  onContinue: () => void;
  saveDraftDisabled: boolean;
  children: ReactNode;
  /** Schedule layer sits above the option editor and keeps Escape from closing both. */
  variant?: 'option' | 'schedule';
  backLabel?: string;
}) {
  const titleId = useId();
  const hintId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const displayName = optionName.trim() || 'New option';
  const tourLabel = listingTitle.trim() || 'Untitled tour';

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
      if (e.key !== 'Escape') return;
      if (document.querySelector('.listing-creation-schedule-layer')) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const schedule = variant === 'schedule';
  const layer = (
    <div className={schedule ? 'listing-creation-schedule-layer' : 'listing-creation-option-layer'} role="presentation">
      <div
        ref={dialogRef}
        className={
          schedule
            ? 'listing-creation-schedule-workspace listing-creation-option-shell'
            : 'listing-creation-option-shell listing-creation-option-shell--enter'
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <aside className="listing-creation-option-rail hidden h-full min-h-0 w-[15rem] shrink-0 flex-col overflow-hidden border-r border-black/[0.09] lg:flex xl:w-[15.5rem]">
          <div className="px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={onBackToOptions}
              className="lux-flat inline-flex min-h-9 items-center text-[13px] font-medium text-ink-muted hover:text-ink"
            >
              {backLabel ?? (schedule ? '← Back to option' : '← Back to options')}
            </button>
            <p className="mt-5 text-[1.05rem] font-semibold leading-snug tracking-tight text-ink">
              {modeTitle}
            </p>
            <p className="mt-1 truncate text-[12px] text-ink-muted" title={tourLabel}>
              {tourLabel}
            </p>
          </div>
          <nav aria-label="Option steps" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
            <ol className="space-y-0.5">
              {navItems.map((item, index) => (
                <li key={item.id}>
                  <ListingCreationNavButton
                    item={item}
                    step={index + 1}
                    onClick={() => onSelectNavId(item.id)}
                  />
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="listing-creation-option-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="listing-creation-option-header shrink-0 border-b border-[#E5E7EB] px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={onBackToOptions}
                  className="lux-flat mb-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-[#073B83] hover:underline lg:hidden"
                >
                  <span aria-hidden>←</span> Options
                </button>
                <p className="truncate text-[11px] leading-tight text-[#667085]" title={tourLabel}>
                  {tourLabel}
                </p>
                <h2
                  id={titleId}
                  className="mt-0.5 text-[1.2rem] font-semibold leading-snug tracking-tight text-[#17191D] sm:text-[1.35rem]"
                >
                  {displayName}
                </h2>
              </div>
              <p
                className={`shrink-0 pt-0.5 text-[11px] tabular-nums ${
                  persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-[#667085]'
                }`}
                aria-live="polite"
              >
                {persistLabel ?? ''}
              </p>
            </div>
            <div className="mx-auto mt-2.5 w-full max-w-[56rem] lg:hidden">
              <ListingCreationMobileStepStrip
                items={navItems}
                ariaLabel="Option steps"
                onSelectIndex={(index) => onSelectNavId(navItems[index]?.id ?? '')}
              />
            </div>
          </header>

          <div className="listing-creation-option-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="mx-auto w-full max-w-[56rem]">{children}</div>
          </div>

          <div className="listing-creation-option-footer shrink-0 border-t border-[#E5E7EB] px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-1.5">
              {continueHint ? (
                <p id={hintId} className="text-[12px] leading-snug text-[#667085]" role="status">
                  {continueHint}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="order-2 flex gap-2 sm:order-1">
                  {onPreviousScene ? (
                    <button
                      type="button"
                      onClick={onPreviousScene}
                      className="touch-manipulation tv-btn-ghost !min-h-12 flex-1 sm:!min-h-10 sm:w-auto sm:flex-none"
                    >
                      Back
                    </button>
                  ) : (
                    <span className="hidden sm:block sm:min-w-[4.5rem]" aria-hidden />
                  )}
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    disabled={saveDraftDisabled}
                    className="touch-manipulation tv-btn-secondary !min-h-12 flex-1 sm:!min-h-10 sm:w-auto sm:flex-none disabled:opacity-50"
                  >
                    Save draft
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={continueDisabled}
                  aria-describedby={continueHint ? hintId : undefined}
                  className="touch-manipulation tv-btn-primary order-1 !min-h-12 w-full sm:order-2 sm:!min-h-10 sm:w-auto disabled:opacity-50"
                >
                  {continueLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(layer, document.body);
}
