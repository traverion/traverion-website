import { addCalendarDaysYmd } from './booking-lifecycle-calendar';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Add calendar months, clamping the day to the target month. UTC only — no local timezone shift. */
export function addCalendarMonthsYmd(ymd: string, months: number): string | null {
  const day = ymd.trim();
  if (!ISO_DATE.test(day) || !Number.isFinite(months)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Math.trunc(months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(d, last);
  const yy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(clamped).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Monday = 0 … Sunday = 6 for a civil date. */
export function calendarMondayIndex(ymd: string): number | null {
  if (!ISO_DATE.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const sun0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sun0 + 6) % 7;
}

/** Arrow, Home/End, and PageUp/PageDown movement for a Monday-first month grid. */
export function calendarGridMove(iso: string, key: string, shiftKey = false): string | null {
  if (!ISO_DATE.test(iso)) return null;
  if (key === 'ArrowLeft') return addCalendarDaysYmd(iso, -1);
  if (key === 'ArrowRight') return addCalendarDaysYmd(iso, 1);
  if (key === 'ArrowUp') return addCalendarDaysYmd(iso, -7);
  if (key === 'ArrowDown') return addCalendarDaysYmd(iso, 7);
  if (key === 'Home') {
    const index = calendarMondayIndex(iso);
    return index == null ? null : addCalendarDaysYmd(iso, -index);
  }
  if (key === 'End') {
    const index = calendarMondayIndex(iso);
    return index == null ? null : addCalendarDaysYmd(iso, 6 - index);
  }
  if (key === 'PageUp') return addCalendarMonthsYmd(iso, shiftKey ? -12 : -1);
  if (key === 'PageDown') return addCalendarMonthsYmd(iso, shiftKey ? 12 : 1);
  return null;
}

type GridKeyEvent = {
  key: string;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

/** Move the roving day when focus is already on a date cell. */
export function handleCalendarGridKeyDown(
  event: GridKeyEvent,
  onMove: (iso: string) => void,
  isBlocked?: (iso: string) => boolean
): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const current = target.getAttribute('data-cal-day');
  if (!current) return;
  let next = calendarGridMove(current, event.key, event.shiftKey);
  if (!next) return;
  if (isBlocked) {
    let guard = 0;
    while (next && isBlocked(next) && guard < 42) {
      const step = calendarGridMove(next, event.key, event.shiftKey);
      if (!step || step === next) break;
      next = step;
      guard += 1;
    }
    if (!next || isBlocked(next)) return;
  }
  if (next === current) return;
  event.preventDefault();
  onMove(next);
}
