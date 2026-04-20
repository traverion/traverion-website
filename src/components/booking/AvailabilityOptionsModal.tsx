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
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-100 max-h-[85vh] overflow-hidden flex flex-col animate-fade-in-up">
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
                className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ease-smooth ${
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
            className="px-4 py-2.5 rounded-lg text-gray-600 hover:text-finland font-medium"
          >
            {checking || options.some((o) => o.selectable) ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
