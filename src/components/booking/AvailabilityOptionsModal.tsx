import { useEffect, useRef } from 'react';
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
  const preOpenFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    preOpenFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const getFocusable = () => {
      if (!panel) return [] as HTMLElement[];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const list = getFocusable();
      if (list.length < 2) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      preOpenFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

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
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-modal-title"
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-100 max-h-[85vh] overflow-hidden flex flex-col animate-fade-in-up outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 z-[1]"
        tabIndex={-1}
      >
        <div className="p-5 sm:p-6 border-b border-gray-100">
          <h2 id="availability-modal-title" className="text-lg font-semibold text-gray-900">
            Availability for your trip
          </h2>
          <p className="text-sm text-gray-500 mt-1">{summaryLine}</p>
          {note && <p className="text-sm text-amber-700 mt-2">{note}</p>}
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {checking ? (
            <p className="text-sm text-gray-600 py-4 text-center">Checking options…</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={!opt.selectable}
                onClick={() => onSelectOption(opt)}
                className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 ${
                  opt.selectable
                    ? 'border-gray-200 hover:border-finland hover:bg-finland/5 active:scale-[0.99] cursor-pointer'
                    : 'border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed'
                }`}
              >
                <p className="font-medium text-gray-900">{opt.title}</p>
                <p className="text-sm text-gray-600 mt-1">{opt.description}</p>
                {opt.selectable && (
                  <p className="text-sm font-medium text-finland mt-3">Continue with this option →</p>
                )}
              </button>
            ))
          )}
        </div>
        <div className="p-4 sm:p-6 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-gray-600 hover:text-finland font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
          >
            {checking || options.some((o) => o.selectable) ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
