import PartnerSelect from '../../components/supplier/PartnerSelect';
import {
  MAX_BOOKING_CUTOFF_HOURS,
  normalizeBookingCutoffHours,
} from '../../lib/tour-departure-cutoff';
import {
  bookingCutoffSelectLabel,
  cutoffHourSelectOptions,
} from '../../pages/supplier/calendarAvailabilityUi';

type Props = {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (hours: string) => void;
  label?: string;
  /** When set, first option clears to inherit listing default (tour creation). */
  allowInherit?: boolean;
  inheritLabel?: string;
  className?: string;
};

const HOUR_OPTIONS = cutoffHourSelectOptions(MAX_BOOKING_CUTOFF_HOURS);

/**
 * Consecutive-hour booking cutoff (0…MAX). Traverion PartnerSelect — no presets, no native select.
 */
export default function AvailabilityCutoffField({
  id,
  value,
  disabled,
  onChange,
  label = 'Booking cutoff',
  allowInherit = false,
  inheritLabel = 'Use listing default',
  className = '',
}: Props) {
  const trimmed = value.trim();
  const inheritSelected = allowInherit && trimmed === '';
  const n = inheritSelected ? -1 : normalizeBookingCutoffHours(trimmed === '' ? 0 : Number(trimmed));
  const selectValue = inheritSelected ? '' : String(n);

  const options = allowInherit
    ? [{ value: '', label: inheritLabel }, ...HOUR_OPTIONS]
    : HOUR_OPTIONS;

  return (
    <div className={`tv-avail-cutoff ${className}`.trim()}>
      {label ? (
        <label className="tv-avail-cutoff__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <PartnerSelect
        id={id}
        aria-label={label || 'Booking cutoff'}
        value={selectValue}
        disabled={disabled}
        searchable
        options={options}
        onChange={(next) => {
          if (allowInherit && next === '') {
            onChange('');
            return;
          }
          onChange(String(normalizeBookingCutoffHours(Number(next))));
        }}
      />
      {!inheritSelected ? (
        <p className="tv-avail-cutoff__hint">{bookingCutoffSelectLabel(n)}</p>
      ) : null}
    </div>
  );
}
