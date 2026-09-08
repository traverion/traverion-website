import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ListingBookingOption } from '../types/listingExtras';
import { monthGrid } from '../lib/stay-calendar';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { formatTourDayAria, tourDayState } from '../lib/tour-calendar';

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  options: ListingBookingOption[];
  todayIso?: string;
  hint?: string;
  soldOutDates?: ReadonlySet<string>;
};

function monthTitle(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export default function TourDatePicker({
  id,
  label = 'Date',
  value,
  onChange,
  options,
  todayIso: todayProp,
  hint,
  soldOutDates,
}: Props) {
  const todayIso = todayProp ?? new Date().toISOString().slice(0, 10);
  const start = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const monthHasOpenDay = useMemo(
    () =>
      cells.some((iso) => {
        if (!iso) return false;
        const state = tourDayState({
          iso,
          todayIso,
          selected: value,
          options,
          soldOut: soldOutDates?.has(iso),
        });
        return state === 'available' || state === 'selected';
      }),
    [cells, todayIso, value, options, soldOutDates]
  );

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  return (
    <div>
      <p id={id} className="mb-1.5 block text-sm font-medium tracking-tight text-ink">
        {label}
      </p>
      <div role="group" aria-labelledby={id} className="rounded-xl bg-paper-raised p-3 ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-ink">{monthTitle(cursor.y, cursor.m)}</p>
          <div className="flex gap-1">
            <button
              type="button"
              className="lux-tap-target p-1.5 rounded-lg"
              aria-label="Previous month"
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="lux-tap-target p-1.5 rounded-lg"
              aria-label="Next month"
              onClick={() => shift(1)}
            >
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
            const state = tourDayState({
              iso,
              todayIso,
              selected: value,
              options,
              soldOut: soldOutDates?.has(iso),
            });
            const day = Number(iso.slice(8, 10));
            const disabled = state === 'past' || state === 'closed' || state === 'full';
            const cls =
              state === 'selected'
                ? 'bg-ink text-paper-raised'
                : state === 'closed'
                  ? 'text-ink-faint/45'
                  : state === 'full'
                    ? 'text-ink-faint/50 line-through'
                    : state === 'past'
                      ? 'text-ink-faint/40'
                      : 'text-ink hover:bg-finland/10';
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                onClick={() => onChange(iso)}
                aria-label={formatTourDayAria(iso, state)}
                aria-pressed={state === 'selected'}
                className={`h-9 rounded-lg text-sm tabular-nums motion-safe:transition-colors ${cls} ${
                  disabled ? 'cursor-not-allowed' : ''
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-ink align-middle mr-1" />
            Selected
          </span>
          <span>Open days are clickable. Faded days are not offered. Struck days are fully booked.</span>
        </p>
        {!monthHasOpenDay ? (
          <p className="mt-1.5 text-xs text-ink-muted">No departures this month. Try the next month.</p>
        ) : null}
      </div>
      {value.trim() ? (
        <p className="mt-1.5 text-xs font-medium text-finland/90">{formatBookingDateDisplay(value)}</p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
