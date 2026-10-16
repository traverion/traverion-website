import { useEffect, useState } from 'react';
import PartnerSelect from './PartnerSelect';
import {
  BOOKING_CUTOFF_UNITS,
  bookingCutoffExplanation,
  cutoffAmountOptions,
  cutoffSelectionFromHours,
  hoursFromCutoffSelection,
  type BookingCutoffUnit,
} from '../../lib/booking-cutoff-duration';
import { normalizeBookingCutoffHours } from '../../lib/tour-departure-cutoff';

type Props = {
  id: string;
  /** Stored hours. Empty means this option uses the listing default. */
  hours?: number;
  listingHours?: number;
  onChange: (hours: number | undefined) => void;
};

export default function BookingCutoffDurationField({ id, hours, listingHours = 0, onChange }: Props) {
  const stored = normalizeBookingCutoffHours(hours);
  const custom = stored > 0;
  const selection = custom ? cutoffSelectionFromHours(stored) : null;
  const [pendingUnit, setPendingUnit] = useState<BookingCutoffUnit | null>(null);

  useEffect(() => {
    setPendingUnit(null);
  }, [stored]);

  const unit = pendingUnit ?? selection?.unit ?? 'hours';
  const amountValue =
    pendingUnit && pendingUnit !== selection?.unit
      ? ''
      : selection
        ? String(selection.amount)
        : '';
  const explanationHours = custom ? stored : normalizeBookingCutoffHours(listingHours);

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-ink">Booking cutoff</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={!custom}
          onClick={() => onChange(undefined)}
          className={`rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold ring-1 ${
            !custom ? 'bg-[#eef3fb] text-finland ring-finland' : 'bg-white text-ink ring-black/10'
          }`}
        >
          Use listing default
        </button>
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            if (!custom) onChange(1);
          }}
          className={`rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold ring-1 ${
            custom ? 'bg-[#eef3fb] text-finland ring-finland' : 'bg-white text-ink ring-black/10'
          }`}
        >
          Custom cutoff
        </button>
      </div>
      {custom ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <PartnerSelect
            id={`${id}-unit`}
            aria-label="Cutoff unit"
            searchable={false}
            value={unit}
            options={BOOKING_CUTOFF_UNITS}
            onChange={(next) => {
              const nextUnit = next as BookingCutoffUnit;
              if (selection && selection.unit === nextUnit) {
                setPendingUnit(null);
                return;
              }
              setPendingUnit(nextUnit);
            }}
          />
          <PartnerSelect
            id={`${id}-amount`}
            aria-label="Cutoff amount"
            searchable={false}
            placeholder="Choose"
            value={amountValue}
            options={cutoffAmountOptions(unit, stored)}
            onChange={(next) => {
              const amount = Number(next);
              if (!Number.isFinite(amount) || amount <= 0) return;
              onChange(hoursFromCutoffSelection(unit, amount));
            }}
          />
        </div>
      ) : null}
      <p className="text-[12px] leading-snug text-ink-muted">{bookingCutoffExplanation(explanationHours)}</p>
    </div>
  );
}
