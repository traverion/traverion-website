import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Focused option editor over the tour creation workspace.
 * Header → body (progress + fields via children) → sticky footer.
 * No left sidebar — scene progress lives in ListingCreationSceneFrame.
 */
export function TourOptionWorkspace({
  title,
  persistLabel,
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
  persistLabel: string | null;
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
        <div className="listing-creation-option-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="listing-creation-option-header shrink-0 border-b border-black/[0.07] px-4 py-3 sm:px-6">
            <div className="mx-auto flex w-full max-w-[48rem] flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={onBackToOptions}
                  className="lux-flat inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-finland hover:underline"
                >
                  <span aria-hidden>←</span> Back to options
                </button>
                <h2
                  id={titleId}
                  className="mt-1 font-display text-xl font-bold leading-tight tracking-tight text-ink sm:text-[1.35rem]"
                >
                  {title}
                </h2>
              </div>
              <p
                className={`text-[11px] tabular-nums sm:pt-5 ${
                  persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
                }`}
                aria-live="polite"
              >
                {persistLabel ?? ''}
              </p>
            </div>
          </header>

          <div className="listing-creation-option-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-[48rem]">{children}</div>
          </div>

          <div className="listing-creation-option-footer shrink-0 border-t border-black/[0.07] px-4 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-2">
              {continueHint ? (
                <p
                  id={hintId}
                  className="text-[12px] leading-snug text-ink-muted"
                  role="status"
                >
                  {continueHint}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  {onPreviousScene ? (
                    <button
                      type="button"
                      onClick={onPreviousScene}
                      className="touch-manipulation tv-btn-ghost !min-h-10 w-full sm:w-auto"
                    >
                      Back
                    </button>
                  ) : (
                    <span className="hidden sm:block sm:min-w-[4.5rem]" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    disabled={saveDraftDisabled}
                    className="touch-manipulation tv-btn-secondary !min-h-10 w-full sm:w-auto disabled:opacity-50"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={onContinue}
                    disabled={continueDisabled}
                    aria-describedby={continueHint ? hintId : undefined}
                    className="touch-manipulation tv-btn-primary !min-h-10 w-full sm:w-auto disabled:opacity-50"
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
