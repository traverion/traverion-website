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
  optionName,
  sceneLabel,
  persistLabel,
  contextNav,
  continueHint,
  continueLabel,
  continueDisabled,
  onBackToOptions,
  onPreviousScene,
  onClose,
  onSaveDraft,
  onContinue,
  saveDraftDisabled,
  children,
}: {
  title: string;
  listingTitle: string;
  /** Current option name (empty until the supplier types one). */
  optionName: string;
  /** Current scene label, e.g. "Meeting". */
  sceneLabel: string;
  persistLabel: string | null;
  contextNav: ListingCreationContextNav;
  continueHint: string | null;
  continueLabel: string;
  continueDisabled: boolean;
  /** Leave the option sheet and return to the Options list (keeps work as a draft). */
  onBackToOptions: () => void;
  /** Go to the previous option scene. Omit on the first scene. */
  onPreviousScene?: (() => void) | null;
  onClose: () => void;
  onSaveDraft: () => void;
  onContinue: () => void;
  saveDraftDisabled: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const hintId = useId();
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
      if (e.key !== 'Escape') return;
      // Schedule editor stacks above this sheet — let it own Escape.
      if (document.querySelector('.listing-creation-schedule-layer')) return;
      e.preventDefault();
      onClose();
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
                  onClick={onBackToOptions}
                  className="lux-flat inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-finland hover:underline"
                >
                  <span aria-hidden>←</span> Back to options
                </button>
                <nav aria-label="Where you are" className="mt-1">
                  <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    <li className="max-w-[12rem] truncate">{listingTitle.trim() || 'Tour'}</li>
                    <li aria-hidden>›</li>
                    <li className="max-w-[12rem] truncate">{optionName.trim() || 'New option'}</li>
                    <li aria-hidden>›</li>
                    <li aria-current="page" className="text-ink">
                      {sceneLabel}
                    </li>
                  </ol>
                </nav>
                <h3
                  id={titleId}
                  className="mt-1.5 font-display text-xl font-bold leading-tight tracking-tight text-ink sm:text-2xl"
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
          <div className="listing-creation-option-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
            {children}
          </div>
          <div className="listing-creation-option-footer shrink-0 border-t border-black/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex flex-col gap-2">
              {continueHint ? (
                <p
                  id={hintId}
                  className="listing-creation-hint flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-200/80"
                  role="status"
                >
                  <span className="shrink-0 font-semibold">Still needed:</span>
                  <span>{continueHint}</span>
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  {onPreviousScene ? (
                    <button
                      type="button"
                      onClick={onPreviousScene}
                      className="touch-manipulation tv-btn-ghost !min-h-11 w-full sm:w-auto"
                    >
                      Back
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
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
                    aria-describedby={continueHint ? hintId : undefined}
                    className="touch-manipulation tv-btn-primary !min-h-11 w-full sm:w-auto disabled:opacity-50"
                  >
                    {continueLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
