import { useMemo, useState } from 'react';
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
}: Props) {
  const todayIso = todayProp ?? localYmd();
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

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  return (
    <div>
      <p id={`${id}-label`} className="mb-1.5 block text-sm font-medium tracking-tight text-ink">
        {label}
      </p>
      <div id={id} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-finland/40 rounded-2xl">
        <TraverionCalendarMonth
          year={cursor.y}
          month0={cursor.m}
          onPrevMonth={() => shift(-1)}
          onNextMonth={() => shift(1)}
          labelledBy={`${id}-label`}
          footer={
            <>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-finland align-middle" />
                  Selected
                </span>
                <span>Open days are clickable. Faded days are not offered. Struck days are fully booked.</span>
              </p>
              {monthNote ? <p className="mt-1.5 text-xs text-ink-muted">{monthNote}</p> : null}
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
                onSelect={onChange}
              />
            );
          })}
        </TraverionCalendarMonth>
      </div>
      {value.trim() ? (
        <p className="mt-1.5 text-xs font-medium text-finland/90">{formatBookingDateDisplay(value)}</p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
