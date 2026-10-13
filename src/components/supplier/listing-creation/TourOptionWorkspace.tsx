import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen option editor (portaled). Covers the listing wizard so only one footer shows.
 * Header → body (progress + fields) → sticky footer. No modal chrome or dark overlay.
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
  /** Leave the option editor and return to the Options list (keeps work as a draft). */
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

  const layer = (
    <div className="listing-creation-option-layer" role="presentation">
      <div
        ref={dialogRef}
        className="listing-creation-option-shell listing-creation-option-shell--enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="listing-creation-option-header shrink-0 border-b border-black/[0.07] px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex w-full max-w-[46rem] flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <div className="min-w-0">
              <button
                type="button"
                onClick={onBackToOptions}
                className="lux-flat inline-flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-finland hover:underline"
              >
                <span aria-hidden>←</span> Back to options
              </button>
              <h2
                id={titleId}
                className="mt-0.5 text-[1.05rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.125rem]"
              >
                {title}
              </h2>
            </div>
            <p
              className={`text-[11px] tabular-nums sm:pt-4 ${
                persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
              }`}
              aria-live="polite"
            >
              {persistLabel ?? ''}
            </p>
          </div>
        </header>

        <div className="listing-creation-option-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto w-full max-w-[46rem]">{children}</div>
        </div>

        <div className="listing-creation-option-footer shrink-0 border-t border-black/[0.07] px-4 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-1.5">
            {continueHint ? (
              <p id={hintId} className="text-[12px] leading-snug text-ink-muted" role="status">
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
  );

  if (typeof document === 'undefined') return null;
  return createPortal(layer, document.body);
}
