import { useEffect, useRef } from 'react';
import type { ListingBookingOption } from '../../../types/listingExtras';
import type { TourOptionConfigPanel } from '../../../lib/listing-option-progression';
import BookingOptionEditor from '../BookingOptionEditor';

const COPY: Record<TourOptionConfigPanel, { kicker: string; title: string; support: string; save: string }> = {
  availability: {
    kicker: 'Availability & Pricing',
    title: 'Availability',
    support: 'Set when this option can be booked.',
    save: 'Save availability',
  },
  pricing: {
    kicker: 'Availability & Pricing',
    title: 'Pricing',
    support: 'Set how customers are charged.',
    save: 'Save pricing',
  },
  capacity: {
    kicker: 'Availability & Pricing',
    title: 'Capacity',
    support: 'Set booking limits for this option.',
    save: 'Save capacity',
  },
};

export function TourOptionConfigWorkspace({
  panel,
  option,
  listingTitle,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onChange,
  onCancel,
  onSave,
  attempted,
  saveHint,
}: {
  panel: TourOptionConfigPanel;
  option: ListingBookingOption;
  listingTitle: string;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  onCancel: () => void;
  onSave: () => void;
  attempted: boolean;
  saveHint: string | null;
}) {
  const copy = COPY[panel];
  const optionLabel = option.name.trim() || 'Untitled option';
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [panel]);

  return (
    <div
      className="listing-creation-ap-workspace listing-creation-ap-workspace--enter absolute inset-0 z-20 flex flex-col overflow-hidden bg-paper"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-option-config-heading"
    >
      <header className="shrink-0 border-b border-black/[0.08] px-4 py-4 sm:px-8 lg:px-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{copy.kicker}</p>
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">{listingTitle.trim() || 'Tour'}</span>
          <span aria-hidden> · </span>
          Option: {optionLabel}
        </p>
        <h3
          ref={headingRef}
          id="tour-option-config-heading"
          tabIndex={-1}
          className="mt-3 font-display text-[1.85rem] font-bold leading-tight tracking-tight text-ink outline-none sm:text-[2.1rem]"
        >
          {copy.title}
        </h3>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">{copy.support}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-8 sm:px-8 sm:py-8 lg:px-12">
        <div className="w-full max-w-xl">
          <BookingOptionEditor
            option={option}
            currencyLabel={currencyLabel}
            hasEndingDate={hasEndingDate}
            onHasEndingDateChange={onHasEndingDateChange}
            onChange={onChange}
            activeSection={panel}
            attempted={attempted}
          />
        </div>
      </div>
      <div className="listing-creation-footer shrink-0 border-t border-black/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4 lg:px-12">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onCancel} className="tv-btn-ghost !min-h-11 w-full sm:w-auto">
            Cancel
          </button>
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
            <button type="button" onClick={onSave} className="tv-btn-primary !min-h-11 w-full sm:w-auto">
              {copy.save}
            </button>
            {saveHint ? (
              <p className="listing-creation-hint text-xs text-ink-muted sm:text-right" role="status">
                {saveHint}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
