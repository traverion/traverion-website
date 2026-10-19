import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatStayNightHuman, monthGrid, stayNightState } from '../lib/stay-calendar';
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

/**
 * Compact check-in / check-out fields; calendar opens in a popover (not always visible).
 */
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!checkIn || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return;
    const [y, m] = checkIn.split('-').map(Number);
    setCursor({ y, m: (m ?? 1) - 1 });
  }, [checkIn]);

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
    setOpen(false);
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const fieldClass =
    'flex min-h-11 flex-1 flex-col justify-center gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/40';

  return (
    <div ref={rootRef} id={id} className="relative outline-none">
      <div
        className={`grid grid-cols-2 divide-x divide-black/[0.08] overflow-hidden rounded-xl ring-1 transition-[box-shadow,ring-color] duration-200 ${
          open ? 'ring-finland/35 shadow-[var(--tv-focus-ring)]' : 'ring-black/[0.1]'
        }`}
      >
        <button
          type="button"
          className={fieldClass}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Check-in</span>
          <span className={`text-sm font-semibold tabular-nums ${checkIn ? 'text-ink' : 'text-ink-faint'}`}>
            {checkIn ? formatStayNightHuman(checkIn) : 'Add date'}
          </span>
        </button>
        <button
          type="button"
          className={fieldClass}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Check-out</span>
          <span className={`text-sm font-semibold tabular-nums ${checkOut ? 'text-ink' : 'text-ink-faint'}`}>
            {checkOut ? formatStayNightHuman(checkOut) : 'Add date'}
          </span>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Select stay dates"
          className="tv-popover tv-popover-enter absolute left-0 right-0 z-40 mt-2 p-3 sm:min-w-[19rem]"
        >
          <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
            <CalendarDays className="h-3.5 w-3.5 text-finland" aria-hidden />
            <span>
              {checkIn && !checkOut
                ? `Select check-out · min ${minNights} night${minNights === 1 ? '' : 's'}`
                : 'Select check-in, then check-out'}
            </span>
          </div>
          <TraverionCalendarMonth
            year={cursor.y}
            month0={cursor.m}
            onPrevMonth={() => shift(-1)}
            onNextMonth={() => shift(1)}
            footer="Booked and host-blocked nights are unavailable. Checkout night stays free."
          >
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e-${i}`} />;
              const state = stayNightState({ iso, todayIso, occupied, checkIn, checkOut });
              return (
                <TraverionCalendarDayButton
                  key={iso}
                  iso={iso}
                  visual={stayVisual(iso, state, checkIn, checkOut)}
                  onClick={() => pick(iso)}
                  disabled={state === 'past' || state === 'occupied'}
                />
              );
            })}
          </TraverionCalendarMonth>
          {(checkIn || checkOut) && (
            <button
              type="button"
              className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-finland hover:bg-finland/[0.06]"
              onClick={() => {
                onChange('', '');
                setOpen(true);
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
