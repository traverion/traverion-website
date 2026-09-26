import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { localYmd } from '../../lib/local-ymd';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';

export type BookingDateFieldProps = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  className?: string;
  hint?: string;
};

/**
 * Traveler booking date field — Traverion calendar popover (no native date chrome).
 */
export default function BookingDateField({
  id,
  label = 'Date',
  value,
  onChange,
  min,
  className = '',
  hint,
}: BookingDateFieldProps) {
  const displayLabel = value.trim() ? formatBookingDateDisplay(value) : '';

  return (
    <div className={className}>
      <div className="rounded-xl bg-paper-raised px-3.5 py-2 ring-1 ring-black/[0.06] transition-[box-shadow] duration-150 hover:ring-finland/25 focus-within:ring-2 focus-within:ring-finland/35">
        <TraverionSingleDateField
          id={id}
          label={label}
          value={value}
          minIso={min ?? localYmd()}
          placeholder="Select a date"
          onChange={onChange}
        />
      </div>
      {displayLabel ? (
        <p className="mt-1.5 text-xs font-medium text-finland/90 animate-fade-in motion-reduce:animate-none">
          {displayLabel}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
