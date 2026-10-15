import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /**
   * Minimum selectable day (YYYY-MM-DD). Defaults to today.
   * Pass empty string to allow any past/future date (partner Availability filters).
   */
  minIso?: string;
  placeholder?: string;
  className?: string;
};

type PanelBox =
  | { mode: 'popover'; top: number; left: number; width: number }
  | { mode: 'sheet' };

/**
 * Traverion single-date field — portaled calendar (popover on desktop, bottom sheet on mobile).
 * Avoids clipping inside modals and overflow containers.
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
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const valueId = useId();
  const todayIso = localYmd();
  const min = minIso === undefined ? todayIso : minIso;
  const hasMin = /^\d{4}-\d{2}-\d{2}$/.test(min);

  const start =
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : hasMin ? min : todayIso;
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

  const placePanel = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const isSheet = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
    if (isSheet) {
      setPanelBox({ mode: 'sheet' });
      return;
    }
    const rect = btn.getBoundingClientRect();
    const edge = 8;
    const width = Math.min(20.5 * 16, window.innerWidth - edge * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - edge) {
      left = Math.max(edge, window.innerWidth - width - edge);
    }
    if (left < edge) left = edge;
    const gap = 8;
    const panelH = 340;
    const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    const preferBelow = spaceBelow >= panelH || spaceBelow >= spaceAbove;
    const top = preferBelow
      ? Math.min(rect.bottom + gap, window.innerHeight - edge)
      : Math.max(edge, rect.top - gap - panelH);
    setPanelBox({ mode: 'popover', top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      return;
    }
    placePanel();
    const onWin = () => placePanel();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, placePanel]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
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
  const showLabel = label.trim().length > 0;

  const calendar = (
    <TraverionCalendarMonth
      year={cursor.y}
      month0={cursor.m}
      onPrevMonth={() => shift(-1)}
      onNextMonth={() => shift(1)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{hasMin ? 'Past days are unavailable.' : 'Select a date.'}</span>
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
        const isPast = hasMin && iso < min;
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
  );

  const panel =
    open && panelBox && typeof document !== 'undefined'
      ? createPortal(
          panelBox.mode === 'sheet' ? (
            <div className="tv-date-sheet" role="presentation">
              <button
                type="button"
                tabIndex={-1}
                className="absolute inset-0 cursor-default bg-slate-900/40"
                aria-label="Close calendar"
                onClick={close}
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label={label || placeholder}
                className="tv-date-sheet__panel motion-safe:animate-slide-up"
              >
                {calendar}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label={label || placeholder}
              className="motion-safe:animate-fade-in"
              style={{
                position: 'fixed',
                top: panelBox.top,
                left: panelBox.left,
                width: panelBox.width,
                zIndex: 130,
              }}
            >
              {calendar}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {showLabel ? (
        <span id={labelId} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-labelledby={showLabel ? `${labelId} ${valueId}` : valueId}
        aria-label={showLabel ? undefined : placeholder}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full min-w-0 items-center gap-2 border-0 bg-transparent pr-1 text-left text-[15px] text-ink focus:outline-none focus-visible:ring-0"
      >
        <Calendar className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <span id={valueId} className={`min-w-0 truncate ${value.trim() ? 'text-ink' : 'text-ink-muted'}`}>
          {display}
        </span>
      </button>
      {panel}
    </div>
  );
}
