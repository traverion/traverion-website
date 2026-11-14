import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
const NAV_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-finland/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]';

export function TraverionCalendarMonth({
  year,
  month0,
  onPrevMonth,
  onNextMonth,
  onPrevYear,
  onNextYear,
  children,
  footer,
  labelledBy,
  bare = false,
  onGridKeyDown,
}: {
  year: number;
  month0: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevYear?: () => void;
  onNextYear?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  /** Drop the inner ring when a popover or sheet already frames the calendar. */
  bare?: boolean;
  onGridKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={`font-sans ${bare ? 'bg-white p-1' : 'rounded-xl bg-white p-2.5 ring-1 ring-black/[0.08]'}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-sans text-[15px] font-semibold tracking-tight text-ink">
          {calendarMonthTitle(year, month0)}
        </p>
        <div className="flex items-center gap-0.5">
          {onPrevYear ? (
            <button type="button" className={NAV_BTN} aria-label="Previous year" onClick={onPrevYear}>
              <ChevronsLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <button type="button" className={NAV_BTN} aria-label="Previous month" onClick={onPrevMonth}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={NAV_BTN} aria-label="Next month" onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          {onNextYear ? (
            <button type="button" className={NAV_BTN} aria-label="Next year" onClick={onNextYear}>
              <ChevronsRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKeyDown}>
        {children}
      </div>
      {footer ? <div className="mt-2 font-sans text-[11px] leading-snug text-ink-faint">{footer}</div> : null}
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
      // Secondary cue only — never stronger than disabled/occupied.
      return 'text-ink ring-1 ring-finland/35';
    case 'occupied':
    case 'disabled':
      // Same muted treatment — no strikethrough (looks broken vs other closed days).
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
  onHoverChange,
  ariaLabel,
  ariaPressed,
  today = false,
  tabIndex,
}: {
  iso: string;
  visual: TraverionCalendarDayVisual;
  disabled?: boolean;
  onSelect: (iso: string) => void;
  /** Desktop hover preview for stay range selection. */
  onHoverChange?: (iso: string | null) => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  /** Civil today. Kept visible even when the day is also selected. */
  today?: boolean;
  tabIndex?: number;
}) {
  const day = Number(iso.slice(8, 10));
  // Disabled must never keep interactive / today / default chrome.
  const effectiveVisual: TraverionCalendarDayVisual =
    disabled && (visual === 'default' || visual === 'today') ? 'disabled' : visual;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect(iso);
      }}
      onMouseEnter={() => {
        if (disabled) return;
        onHoverChange?.(iso);
      }}
      onMouseLeave={() => onHoverChange?.(null)}
      aria-label={today ? `${ariaLabel}, today` : ariaLabel}
      aria-pressed={ariaPressed}
      aria-disabled={disabled || undefined}
      aria-current={today ? 'date' : undefined}
      data-cal-day={iso}
      tabIndex={tabIndex}
      className={`tv-date-day inline-flex h-11 min-h-11 w-full flex-col items-center justify-center rounded-lg font-sans text-sm tabular-nums motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83] ${
        today ? 'is-today' : ''
      } ${traverionCalendarDayClass(effectiveVisual)} ${disabled ? 'pointer-events-none cursor-not-allowed' : ''}`}
    >
      <span>{day}</span>
    </button>
  );
}
