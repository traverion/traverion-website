import { CUTOFF_PRESETS, cutoffDisplayLabel } from './calendarAvailabilityUi';

type Props = {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (hours: string) => void;
};

/**
 * Booking cutoff control matching tour creation: hours before departure (0–168).
 * Presets plus free-form hours input (same limits as BookingOptionEditor).
 */
export default function AvailabilityCutoffField({ id, value, disabled, onChange }: Props) {
  const n = Math.max(0, Math.min(168, Math.floor(Number(value) || 0)));
  const presetMatch = CUTOFF_PRESETS.some((p) => p.hours === n);

  return (
    <div className="tv-avail-cutoff">
      <label className="tv-avail-cutoff__label" htmlFor={id}>
        Booking cutoff
      </label>
      <div className="tv-avail-cutoff__row">
        <select
          id={`${id}-preset`}
          aria-label="Booking cutoff preset"
          disabled={disabled}
          value={presetMatch ? String(n) : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') return;
            onChange(e.target.value);
          }}
          className="tv-input"
        >
          {CUTOFF_PRESETS.map((p) => (
            <option key={p.hours} value={String(p.hours)}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom hours…</option>
        </select>
        <input
          id={id}
          type="number"
          min={0}
          max={168}
          step={1}
          disabled={disabled}
          value={String(n)}
          aria-label="Hours before departure"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange('0');
              return;
            }
            const next = Math.max(0, Math.min(168, Math.floor(Number(raw) || 0)));
            onChange(String(next));
          }}
          className="tv-input tv-avail-cutoff__hours tabular-nums"
        />
        <span className="tv-avail-cutoff__unit">h before</span>
      </div>
      <p className="tv-avail-cutoff__hint">{cutoffDisplayLabel(n)}</p>
    </div>
  );
}
