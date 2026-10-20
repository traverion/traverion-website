/**
 * Compact booked/capacity meter for Departures & Availability rows.
 * Does not invent capacity — callers pass authoritative numbers.
 */
type Props = {
  booked: number;
  capacity: number;
  /** When false, meter stays muted (closed / past cutoff). */
  bookable?: boolean;
  className?: string;
  size?: 'sm' | 'md';
};

export default function AvailabilityOccupancyMeter({
  booked,
  capacity,
  bookable = true,
  className = '',
  size = 'md',
}: Props) {
  const cap = Math.max(0, Math.floor(capacity));
  const used = Math.max(0, Math.min(cap, Math.floor(booked)));
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const full = cap > 0 && used >= cap;
  const tone = !bookable ? 'muted' : full ? 'full' : pct >= 65 ? 'warm' : 'ok';

  return (
    <span
      className={`tv-avail-meter tv-avail-meter--${size} tv-avail-meter--${tone} ${className}`.trim()}
      title={`Booked / Capacity ${used} / ${cap}`}
    >
      <span className="tv-avail-meter__nums tabular-nums">
        <span className="tv-avail-meter__booked">{used}</span>
        <span className="tv-avail-meter__sep">/</span>
        <span className="tv-avail-meter__cap">{cap}</span>
      </span>
      <span className="tv-avail-meter__track" aria-hidden>
        <span className="tv-avail-meter__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="sr-only">
        {used} of {cap} booked{bookable ? '' : ', not bookable'}
      </span>
    </span>
  );
}
