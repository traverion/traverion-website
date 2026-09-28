import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { monthGrid } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { localYmd } from '../../lib/local-ymd';
import {
  TraverionCalendarDayButton,
  TraverionCalendarMonth,
  type TraverionCalendarDayVisual,
} from './TraverionCalendarMonth';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  /** Minimum selectable day (YYYY-MM-DD). Defaults to today. */
  minIso?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Traverion single-date field — popover calendar instead of native date UI.
 * Availability/sold-out logic stays at the booking layer; search uses open future days.
 */
export function TraverionSingleDateField({
  id,
  label,
  value,
  onChange,
  minIso,
  placeholder = 'Any date',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const valueId = useId();
  const todayIso = localYmd();
  const min = minIso ?? todayIso;

  const start = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : min;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  useEffect(() => {
    if (!open || !value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const [y, m] = value.split('-').map(Number);
    setCursor({ y, m: (m ?? 1) - 1 });
  }, [open, value]);

  const close = useCallback(() => setOpen(false), []);
  useDialogFocus(open, panelRef, close);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, close]);

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const display = value.trim() ? formatBookingDateDisplay(value) : placeholder;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <span id={labelId} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      <button
        type="button"
        id={id}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center gap-2 border-0 bg-transparent pr-1 text-left text-[15px] text-ink focus:outline-none focus-visible:ring-0"
      >
        <Calendar className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <span id={valueId} className={value.trim() ? 'text-ink' : 'text-ink-muted'}>
          {display}
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(20.5rem,calc(100vw-2rem))] motion-safe:animate-fade-in"
        >
          <TraverionCalendarMonth
            year={cursor.y}
            month0={cursor.m}
            onPrevMonth={() => shift(-1)}
            onNextMonth={() => shift(1)}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Past days are unavailable.</span>
                {value.trim() ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-finland hover:underline"
                    onClick={() => {
                      onChange('');
                      close();
                    }}
                  >
                    Clear date
                  </button>
                ) : null}
              </div>
            }
          >
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e-${i}`} />;
              const isPast = iso < min;
              const isSelected = value === iso;
              const isToday = iso === todayIso && !isSelected;
              let visual: TraverionCalendarDayVisual = 'default';
              if (isPast) visual = 'disabled';
              else if (isSelected) visual = 'selected';
              else if (isToday) visual = 'today';
              return (
                <TraverionCalendarDayButton
                  key={iso}
                  iso={iso}
                  visual={visual}
                  disabled={isPast}
                  ariaPressed={isSelected}
                  ariaLabel={
                    isSelected
                      ? `${formatBookingDateDisplay(iso)}, selected`
                      : isPast
                        ? `${formatBookingDateDisplay(iso)}, unavailable`
                        : formatBookingDateDisplay(iso)
                  }
                  onSelect={(next) => {
                    onChange(next);
                    close();
                  }}
                />
              );
            })}
          </TraverionCalendarMonth>
        </div>
      ) : null}
    </div>
  );
}
