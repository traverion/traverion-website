import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid, stayNightState } from '../lib/stay-calendar';
import { addCalendarDays } from '../lib/stayOccupancy';

type Props = {
  checkIn: string;
  checkOut: string;
  occupiedNights: string[];
  todayIso: string;
  minNights: number;
  onChange: (checkIn: string, checkOut: string) => void;
};

function monthTitle(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export default function StayNightPicker({
  checkIn,
  checkOut,
  occupiedNights,
  todayIso,
  minNights,
  onChange,
}: Props) {
  const occupied = useMemo(() => new Set(occupiedNights), [occupiedNights]);
  const start = checkIn && /^\d{4}-\d{2}-\d{2}$/.test(checkIn) ? checkIn : todayIso;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);

  const pick = (iso: string) => {
    const state = stayNightState({ iso, todayIso, occupied, checkIn, checkOut });
    if (state === 'past' || state === 'occupied') return;
    if (!checkIn || (checkIn && checkOut)) {
      onChange(iso, '');
      return;
    }
    if (iso <= checkIn) {
      onChange(iso, '');
      return;
    }
    const nights: string[] = [];
    let cur = checkIn;
    while (cur < iso) {
      nights.push(cur);
      cur = addCalendarDays(cur, 1);
    }
    if (nights.some((n) => occupied.has(n))) return;
    if (nights.length < minNights) {
      onChange(checkIn, iso);
      return;
    }
    onChange(checkIn, iso);
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-ink">{monthTitle(cursor.y, cursor.m)}</p>
        <div className="flex gap-1">
          <button type="button" className="lux-tap-target p-1.5 rounded-lg" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" className="lux-tap-target p-1.5 rounded-lg" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-wide text-ink-faint mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e-${i}`} />;
          const state = stayNightState({ iso, todayIso, occupied, checkIn, checkOut });
          const day = Number(iso.slice(8, 10));
          const disabled = state === 'past' || state === 'occupied';
          const cls =
            state === 'selected'
              ? 'bg-ink text-paper-raised'
              : state === 'checkout'
                ? 'ring-1 ring-ink/40 text-ink'
                : state === 'occupied'
                  ? 'text-ink-faint line-through'
                  : state === 'past'
                    ? 'text-ink-faint/50'
                    : 'text-ink hover:bg-finland/10';
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => pick(iso)}
              aria-label={
                state === 'occupied'
                  ? `${iso} occupied`
                  : state === 'past'
                    ? `${iso} past`
                    : `${iso} ${state}`
              }
              className={`h-9 rounded-lg text-sm tabular-nums motion-safe:transition-colors ${cls}`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Select check-in, then check-out. Occupied nights are crossed out. Checkout night is free.
      </p>
    </div>
  );
}
