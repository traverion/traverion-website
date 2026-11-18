import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  clampDobDay,
  daysInMonth,
  formatDobDisplay,
  formatIsoDob,
  latestDobMeetingMinAge,
  maxSelectableDob,
  minSelectableDob,
  parseIsoDob,
  DOB_MIN_AGE_YEARS,
  type IsoDobParts,
} from '../../lib/date-of-birth';
import { computeAnchoredPopoverBox } from '../../lib/anchored-popover';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

type Props = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
  minAge?: number;
};

function toViewMonth(parts: IsoDobParts | null): { year: number; month: number } {
  if (parts) return { year: parts.year, month: parts.month };
  const latest = latestDobMeetingMinAge();
  return { year: latest.year, month: latest.month };
}

function isBefore(a: IsoDobParts, b: IsoDobParts): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month !== b.month) return a.month < b.month;
  return a.day < b.day;
}

function isAfter(a: IsoDobParts, b: IsoDobParts): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month !== b.month) return a.month > b.month;
  return a.day > b.day;
}

/**
 * Traverion-themed date-of-birth picker.
 * Emits ISO `YYYY-MM-DD` only — no free-text entry required.
 */
export default function DateOfBirthPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  className = '',
  minAge = DOB_MIN_AGE_YEARS,
}: Props) {
  const selected = parseIsoDob(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => toViewMonth(selected));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [box, setBox] = useState<ReturnType<typeof computeAnchoredPopoverBox> | null>(null);

  const minParts = useMemo(() => minSelectableDob(), []);
  const maxParts = useMemo(() => latestDobMeetingMinAge(minAge), [minAge]);
  const todayCap = useMemo(() => maxSelectableDob(), []);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxParts.year; y >= minParts.year; y -= 1) list.push(y);
    return list;
  }, [maxParts.year, minParts.year]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !open) return;
    const rect = el.getBoundingClientRect();
    const measured = panelRef.current?.getBoundingClientRect().height ?? 360;
    setBox(
      computeAnchoredPopoverBox({
        anchorRect: rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        preferredWidth: 320,
        estimatedHeight: measured,
        sheetMaxWidth: 639,
      })
    );
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    setView(toViewMonth(selected));
    reposition();
  }, [open, reposition, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const onPointer = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onResize = () => reposition();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, close, reposition]);

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month - 1, 1));
    // Monday-first: UTC Sunday=0 → 6, Monday=1 → 0
    const startOffset = (first.getUTCDay() + 6) % 7;
    const dim = daysInMonth(view.year, view.month);
    const cells: Array<IsoDobParts | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let d = 1; d <= dim; d += 1) {
      cells.push({ year: view.year, month: view.month, day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view.year, view.month]);

  const canSelect = (parts: IsoDobParts): boolean => {
    if (isBefore(parts, minParts)) return false;
    if (isAfter(parts, maxParts)) return false;
    if (isAfter(parts, todayCap)) return false;
    return true;
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      let month = v.month + delta;
      let year = v.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      if (year < minParts.year) return v;
      if (year > maxParts.year) return v;
      return { year, month };
    });
  };

  const pick = (parts: IsoDobParts) => {
    if (!canSelect(parts)) return;
    onChange(formatIsoDob(parts));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) setOpen(true);
    }
  };

  const display = formatDobDisplay(value) || 'Select date';
  const isSheet = box?.mode === 'sheet';

  const panel =
    open && box ? (
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Choose date of birth"
        className={[
          'tv-dob-picker__panel',
          isSheet ? 'tv-dob-picker__panel--sheet' : 'tv-dob-picker__panel--popover',
        ].join(' ')}
        style={
          isSheet
            ? undefined
            : {
                position: 'fixed',
                top: box.top,
                left: box.left,
                width: box.width,
                zIndex: 80,
              }
        }
      >
        {isSheet ? (
          <div className="tv-dob-picker__sheet-handle" aria-hidden />
        ) : null}
        <div className="tv-dob-picker__toolbar">
          <button
            type="button"
            className="tv-dob-picker__nav"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="tv-dob-picker__selects">
            <label className="sr-only" htmlFor={`${panelId}-month`}>
              Month
            </label>
            <select
              id={`${panelId}-month`}
              className="tv-dob-picker__select"
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
            >
              {MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`${panelId}-year`}>
              Year
            </label>
            <select
              id={`${panelId}-year`}
              className="tv-dob-picker__select tv-dob-picker__select--year"
              value={view.year}
              onChange={(e) => {
                const year = Number(e.target.value);
                setView((v) => ({
                  year,
                  month: v.month,
                }));
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="tv-dob-picker__nav"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="tv-dob-picker__weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="tv-dob-picker__grid" role="grid" aria-label={`${MONTHS[view.month - 1]} ${view.year}`}>
          {grid.map((cell, idx) => {
            if (!cell) {
              return <span key={`e-${idx}`} className="tv-dob-picker__cell tv-dob-picker__cell--empty" />;
            }
            const enabled = canSelect(cell);
            const isSelected =
              selected &&
              selected.year === cell.year &&
              selected.month === cell.month &&
              selected.day === cell.day;
            return (
              <button
                key={`${cell.year}-${cell.month}-${cell.day}`}
                type="button"
                role="gridcell"
                disabled={!enabled}
                aria-selected={isSelected || undefined}
                className={[
                  'tv-dob-picker__cell',
                  isSelected ? 'tv-dob-picker__cell--selected' : '',
                  !enabled ? 'tv-dob-picker__cell--muted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pick(cell)}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <p className="tv-dob-picker__hint">Must be at least {minAge} years old</p>
      </div>
    ) : null;

  return (
    <div className={['tv-dob-picker', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        className={[
          'tv-dob-picker__trigger',
          !selected ? 'tv-dob-picker__trigger--placeholder' : '',
          ariaInvalid ? 'tv-dob-picker__trigger--invalid' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKey}
      >
        <span>{display}</span>
        <Calendar className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </button>
      {/* Keep a hidden ISO field for form serialization / autofill tooling. */}
      <input
        type="hidden"
        name={id ? `${id}-iso` : undefined}
        value={value}
        readOnly
      />
      {typeof document !== 'undefined' && panel
        ? createPortal(
            isSheet ? (
              <div className="tv-dob-picker__sheet-root" role="presentation">
                <button
                  type="button"
                  className="tv-dob-picker__backdrop"
                  aria-label="Close calendar"
                  onClick={close}
                />
                {panel}
              </div>
            ) : (
              panel
            ),
            document.body
          )
        : null}
    </div>
  );
}

/** Ensure day stays valid when month/year changes programmatically. */
export function normalizeDobIso(year: number, month: number, day: number): string {
  return formatIsoDob({
    year,
    month,
    day: clampDobDay(year, month, day),
  });
}
