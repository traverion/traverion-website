import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { ListingBookingOption } from '../types/listingExtras';
import { monthGrid } from '../lib/stay-calendar';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { formatTourDayAria, tourDayState, tourMonthAvailabilityNote } from '../lib/tour-calendar';
import { localYmd } from '../lib/local-ymd';
import {
  TraverionCalendarDayButton,
  TraverionCalendarMonth,
  type TraverionCalendarDayVisual,
} from './calendar/TraverionCalendarMonth';

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  options: ListingBookingOption[];
  todayIso?: string;
  hint?: string;
  soldOutDates?: ReadonlySet<string>;
  /** inline keeps the month open. field opens it from the selected date. */
  presentation?: 'inline' | 'field';
};

function visualForTourState(state: ReturnType<typeof tourDayState>): TraverionCalendarDayVisual {
  switch (state) {
    case 'selected':
      return 'selected';
    case 'full':
      return 'occupied';
    case 'past':
    case 'closed':
      return 'disabled';
    default:
      return 'default';
  }
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
  presentation = 'inline',
}: Props) {
  const todayIso = todayProp ?? localYmd();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const start = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const monthStates = useMemo(
    () =>
      cells
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) =>
          tourDayState({
            iso,
            todayIso,
            selected: value,
            options,
            soldOut: soldOutDates?.has(iso),
          })
        ),
    [cells, todayIso, value, options, soldOutDates]
  );
  const monthNote = useMemo(() => tourMonthAvailabilityNote(monthStates), [monthStates]);

  useEffect(() => {
    if (presentation !== 'field' || !open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, presentation]);

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const month = (
      <div id={presentation === 'field' ? undefined : id} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-finland/40 rounded-2xl">
        <TraverionCalendarMonth
          year={cursor.y}
          month0={cursor.m}
          onPrevMonth={() => shift(-1)}
          onNextMonth={() => shift(1)}
          labelledBy={`${id}-label`}
          footer={
            <>
              <p>
                {value.trim()
                  ? `Selected · ${formatBookingDateDisplay(value)}`
                  : 'Open days can be booked. Faded days are closed. Struck days are sold out.'}
              </p>
              {monthNote ? <p className="mt-1 text-ink-muted">{monthNote}</p> : null}
            </>
          }
        >
          {cells.map((iso, i) => {
            if (!iso) return <span key={`e-${i}`} />;
            const state = tourDayState({
              iso,
              todayIso,
              selected: value,
              options,
              soldOut: soldOutDates?.has(iso),
            });
            const disabled = state === 'past' || state === 'closed' || state === 'full';
            return (
              <TraverionCalendarDayButton
                key={iso}
                iso={iso}
                visual={visualForTourState(state)}
                disabled={disabled}
                ariaLabel={formatTourDayAria(iso, state)}
                ariaPressed={state === 'selected'}
                onSelect={(iso) => {
                  onChange(iso);
                  if (presentation === 'field') setOpen(false);
                }}
              />
            );
          })}
        </TraverionCalendarMonth>
      </div>
  );

  if (presentation === 'field') {
    return (
      <div ref={rootRef} className="relative">
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium tracking-tight text-ink">
          {label}
        </label>
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((next) => !next)}
          className="tv-checkout-input tv-checkout-input--plain relative flex items-center justify-between gap-3 pr-3 text-left"
        >
          <span className={value.trim() ? 'font-medium text-ink' : 'text-ink-faint'}>
            {value.trim() ? formatBookingDateDisplay(value) : 'Select a date'}
          </span>
          <Calendar className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        </button>
        {open ? (
          <div className="absolute z-30 mt-2 w-full max-w-md rounded-xl border border-black/10 bg-white p-3 shadow-lg">
            {month}
          </div>
        ) : null}
        {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <p id={`${id}-label`} className="mb-1.5 block text-sm font-medium tracking-tight text-ink">
        {label}
      </p>
      {month}
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
