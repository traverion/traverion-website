import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarMonthTitle } from '../../lib/calendar-month-title';

export type TraverionCalendarDayVisual =
  | 'default'
  | 'selected'
  | 'rangeStart'
  | 'rangeMiddle'
  | 'rangeEnd'
  | 'today'
  | 'disabled'
  | 'occupied';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Shared month chrome — Traverion typography/colors over truthful day cells. */
export function TraverionCalendarMonth({
  year,
  month0,
  onPrevMonth,
  onNextMonth,
  children,
  footer,
  labelledBy,
}: {
  year: number;
  month0: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="rounded-2xl bg-paper-raised p-3 sm:p-3.5 ring-1 ring-black/[0.06] shadow-soft-lg"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="font-display text-base font-semibold tracking-tight text-ink">
          {calendarMonthTitle(year, month0)}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-ink hover:bg-finland/10"
            aria-label="Previous month"
            onClick={onPrevMonth}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-ink hover:bg-finland/10"
            aria-label="Next month"
            onClick={onNextMonth}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">{children}</div>
      {footer ? <div className="mt-2.5 text-[11px] leading-snug text-ink-faint">{footer}</div> : null}
    </div>
  );
}

export function traverionCalendarDayClass(visual: TraverionCalendarDayVisual): string {
  switch (visual) {
    case 'selected':
    case 'rangeStart':
    case 'rangeEnd':
      return 'bg-finland text-white shadow-sm ring-1 ring-finland/30';
    case 'rangeMiddle':
      return 'bg-finland/15 text-ink';
    case 'today':
      return 'text-ink ring-1 ring-finland/35';
    case 'occupied':
      return 'text-ink-faint/50 line-through';
    case 'disabled':
      return 'text-ink-faint/40 cursor-not-allowed';
    default:
      return 'text-ink hover:bg-finland/10';
  }
}

export function TraverionCalendarDayButton({
  iso,
  visual,
  disabled,
  onSelect,
  ariaLabel,
  ariaPressed,
}: {
  iso: string;
  visual: TraverionCalendarDayVisual;
  disabled?: boolean;
  onSelect: (iso: string) => void;
  ariaLabel: string;
  ariaPressed?: boolean;
}) {
  const day = Number(iso.slice(8, 10));
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(iso)}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`min-h-11 h-11 rounded-lg text-sm tabular-nums motion-safe:transition-colors ${traverionCalendarDayClass(
        visual
      )} ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      {day}
    </button>
  );
}
