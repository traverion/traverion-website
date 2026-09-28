import { useMemo, useState } from 'react';
import { monthGrid, stayNightState } from '../lib/stay-calendar';
import { addCalendarDays, STAY_MAX_OCCUPIED_NIGHTS } from '../lib/stayOccupancy';
import {
  TraverionCalendarDayButton,
  TraverionCalendarMonth,
  type TraverionCalendarDayVisual,
} from './calendar/TraverionCalendarMonth';

type Props = {
  checkIn: string;
  checkOut: string;
  occupiedNights: string[];
  todayIso: string;
  minNights: number;
  onChange: (checkIn: string, checkOut: string) => void;
  id?: string;
};

function stayVisual(
  iso: string,
  state: ReturnType<typeof stayNightState>,
  checkIn: string,
  checkOut: string
): TraverionCalendarDayVisual {
  if (state === 'past') return 'disabled';
  if (state === 'occupied') return 'occupied';
  if (checkIn && checkOut) {
    if (iso === checkIn) return 'rangeStart';
    if (iso === checkOut) return 'rangeEnd';
    if (iso > checkIn && iso < checkOut) return 'rangeMiddle';
  }
  if (state === 'selected') return 'selected';
  if (state === 'checkout') return 'rangeEnd';
  return 'default';
}

export default function StayNightPicker({
  checkIn,
  checkOut,
  occupiedNights,
  todayIso,
  minNights,
  onChange,
  id = 'stay-night-picker',
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
    if (nights.length < minNights) return;
    if (nights.length > STAY_MAX_OCCUPIED_NIGHTS) return;
    onChange(checkIn, iso);
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  return (
    <div
      id={id}
      tabIndex={-1}
      className="outline-none focus-visible:ring-2 focus-visible:ring-finland/40 rounded-2xl"
    >
      <TraverionCalendarMonth
        year={cursor.y}
        month0={cursor.m}
        onPrevMonth={() => shift(-1)}
        onNextMonth={() => shift(1)}
        footer="Select check-in, then check-out. Booked and host-blocked nights are crossed out. Checkout night is free."
      >
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e-${i}`} />;
          const state = stayNightState({ iso, todayIso, occupied, checkIn, checkOut });
          const disabled = state === 'past' || state === 'occupied';
          return (
            <TraverionCalendarDayButton
              key={iso}
              iso={iso}
              visual={stayVisual(iso, state, checkIn, checkOut)}
              disabled={disabled}
              ariaLabel={
                state === 'occupied'
                  ? `${iso} occupied`
                  : state === 'past'
                    ? `${iso} past`
                    : `${iso} ${state}`
              }
              ariaPressed={state === 'selected' || state === 'checkout'}
              onSelect={pick}
            />
          );
        })}
      </TraverionCalendarMonth>
    </div>
  );
}
