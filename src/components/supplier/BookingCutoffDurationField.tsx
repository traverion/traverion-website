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
import { isLastMinuteUntil, type LastMinuteUntil } from '../../lib/last-minute-booking';
import { normalizeBookingCutoffHours } from '../../lib/tour-departure-cutoff';

const LAST_MINUTE_UNTIL: Array<{ id: LastMinuteUntil; label: string }> = [
  { id: 'departure', label: 'Departure time' },
  { id: '30m', label: '30 minutes before' },
  { id: '1h', label: '1 hour before' },
];

type Props = {
  id: string;
  /** Stored hours. Empty means this option still inherits the listing cutoff until the supplier picks an amount. */
  hours?: number;
  listingHours?: number;
  lastMinuteEnabled?: boolean;
  lastMinuteUntil?: LastMinuteUntil | null;
  onChange: (hours: number | undefined) => void;
  onLastMinuteChange: (enabled: boolean, until: LastMinuteUntil) => void;
};

export default function BookingCutoffDurationField({
  id,
  hours,
  listingHours = 0,
  lastMinuteEnabled = false,
  lastMinuteUntil,
  onChange,
  onLastMinuteChange,
}: Props) {
  const stored = normalizeBookingCutoffHours(hours);
  const inherited = stored > 0 ? stored : normalizeBookingCutoffHours(listingHours);
  const selection = inherited > 0 ? cutoffSelectionFromHours(inherited) : null;
  const [pendingUnit, setPendingUnit] = useState<BookingCutoffUnit | null>(null);
  const until = isLastMinuteUntil(lastMinuteUntil) ? lastMinuteUntil : 'departure';

  useEffect(() => {
    setPendingUnit(null);
  }, [stored, inherited]);

  const unit = pendingUnit ?? selection?.unit ?? 'hours';
  const amountValue =
    pendingUnit && pendingUnit !== selection?.unit ? '' : selection ? String(selection.amount) : '';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-ink">Booking cutoff</p>
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
            options={cutoffAmountOptions(unit, inherited)}
            onChange={(next) => {
              const amount = Number(next);
              if (!Number.isFinite(amount) || amount <= 0) return;
              onChange(hoursFromCutoffSelection(unit, amount));
            }}
          />
        </div>
        <p className="text-[12px] leading-snug text-ink-muted">{bookingCutoffExplanation(inherited)}</p>
      </div>

      <div className="space-y-2 border-t border-black/[0.06] pt-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            id={`${id}-last-minute`}
            type="checkbox"
            checked={lastMinuteEnabled}
            onChange={(e) => onLastMinuteChange(e.target.checked, until)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/35 text-finland focus:ring-finland"
          />
          <span>
            <span className="block text-[13px] font-semibold text-ink">
              Allow bookings after cutoff if this departure already has a confirmed booking
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
              When enabled, customers can continue booking until departure starts, provided that
              specific departure already has a confirmed booking and seats remain.
            </span>
          </span>
        </label>
        {lastMinuteEnabled ? (
          <div className="space-y-2 pl-6">
            <p className="text-[13px] font-semibold text-ink">Accept additional bookings until</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LAST_MINUTE_UNTIL.map((choice) => {
                const selected = until === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onLastMinuteChange(true, choice.id)}
                    className={`rounded-lg px-3 py-2 text-left text-[13px] font-semibold ring-1 ${
                      selected ? 'bg-[#eef3fb] text-finland ring-finland' : 'bg-white text-ink ring-black/10'
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] leading-snug text-ink-muted">
              This can fill remaining seats on a departure that is already operating.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
