import { useEffect, useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { AvailabilityCheckOption } from '../../data/supabase-availability';

type Props = {
  open: boolean;
  checking: boolean;
  options: AvailabilityCheckOption[];
  note: string | null;
  /** e.g. "2026-04-22 · 2 guests" */
  summaryLine: string;
  onClose: () => void;
  onSelectOption: (option: AvailabilityCheckOption) => void;
};

export default function AvailabilityOptionsModal({
  open,
  checking,
  options,
  note,
  summaryLine,
  onClose,
  onSelectOption,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, panelRef, onClose);

  useEffect(() => {
    if (!open || checking) return;
    const panel = panelRef.current;
    if (!panel) return;
    const list = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )
    );
    list[0]?.focus();
  }, [open, checking, options]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="tv-sheet-overlay !z-[20100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-modal-title"
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="tv-sheet-panel relative z-[1] flex max-h-[min(85vh,40rem)] flex-col overflow-hidden p-0 motion-safe:animate-slide-up outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
        tabIndex={-1}
      >
        <div className="border-b border-black/[0.06] p-5 sm:p-6">
          <h2 id="availability-modal-title" className="font-display text-xl text-ink tracking-tight">
            Availability for your trip
          </h2>
          <p className="text-sm text-ink-muted mt-1">{summaryLine}</p>
          {note && <p className="text-sm text-amber-800 mt-2">{note}</p>}
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {checking ? (
            <p className="text-sm text-ink-muted py-4 text-center">Checking options…</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={!opt.selectable}
                onClick={() => onSelectOption(opt)}
                className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 ${
                  opt.selectable
                    ? 'border-black/[0.08] bg-paper-raised hover:border-finland hover:bg-finland/5 active:scale-[0.99] cursor-pointer'
                    : 'border-black/[0.06] bg-paper text-ink-faint cursor-not-allowed'
                }`}
              >
                <p className="font-medium text-ink">{opt.title}</p>
                <p className="text-sm text-ink-muted mt-1">{opt.description}</p>
                {opt.selectable && (
                  <p className="text-sm font-medium text-finland mt-3">Continue with this option →</p>
                )}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-black/[0.06] p-4 sm:p-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="tv-btn-ghost">
            {checking || options.some((o) => o.selectable) ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
