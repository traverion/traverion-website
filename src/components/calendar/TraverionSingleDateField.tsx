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
  /** marketplace — tiny uppercase label; premium — semibold sentence-case label. */
  tone?: 'marketplace' | 'premium';
  /** When the parent field shell already shows a calendar icon. */
  hideIcon?: boolean;
  /** Civil YYYY-MM-DD for the “today” ring; defaults to browser-local calendar day. */
  todayIso?: string;
  /** Extra disable rules (closed weekdays, notice floor, etc.). Past/`minIso` still apply. */
  isDayDisabled?: (ymd: string) => boolean;
  /**
   * default — hint + optional Clear (marketplace/partner).
   * compact — Today shortcut when selectable; no verbose copy (rental booking).
   */
  footerMode?: 'default' | 'compact';
  /** Show Clear in the footer (default true for default footer, false for compact). */
  allowClear?: boolean;
  /** Optional aria-label when `label` is empty. */
  'aria-label'?: string;
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
  tone = 'marketplace',
  hideIcon = false,
  todayIso: todayIsoProp,
  isDayDisabled,
  footerMode = 'default',
  allowClear,
  'aria-label': ariaLabelProp,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const valueId = useId();
  const todayIso = todayIsoProp && /^\d{4}-\d{2}-\d{2}$/.test(todayIsoProp) ? todayIsoProp : localYmd();
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
  const showClear = allowClear ?? footerMode === 'default';
  const dayBlocked = (iso: string) => (hasMin && iso < min) || Boolean(isDayDisabled?.(iso));
  const todaySelectable = !dayBlocked(todayIso);

  const calendar = (
    <TraverionCalendarMonth
      year={cursor.y}
      month0={cursor.m}
      onPrevMonth={() => shift(-1)}
      onNextMonth={() => shift(1)}
      footer={
        footerMode === 'compact' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {todaySelectable ? (
              <button
                type="button"
                className="text-xs font-semibold text-finland hover:underline"
                onClick={() => {
                  onChange(todayIso);
                  close();
                }}
              >
                Today
              </button>
            ) : (
              <span />
            )}
            {showClear && value.trim() ? (
              <button
                type="button"
                className="text-xs font-semibold text-finland hover:underline"
                onClick={() => {
                  onChange('');
                  close();
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{hasMin ? 'Past days are unavailable.' : 'Select a date.'}</span>
            {showClear && value.trim() ? (
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
        )
      }
    >
      {cells.map((iso, i) => {
        if (!iso) return <span key={`e-${i}`} />;
        const blocked = dayBlocked(iso);
        const isSelected = value === iso;
        const isToday = iso === todayIso && !isSelected;
        let visual: TraverionCalendarDayVisual = 'default';
        if (blocked) visual = 'disabled';
        else if (isSelected) visual = 'selected';
        else if (isToday) visual = 'today';
        return (
          <TraverionCalendarDayButton
            key={iso}
            iso={iso}
            visual={visual}
            disabled={blocked}
            ariaPressed={isSelected}
            ariaLabel={
              isSelected
                ? `${formatBookingDateDisplay(iso)}, selected`
                : blocked
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
                aria-label={ariaLabelProp || label || placeholder}
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
              aria-label={ariaLabelProp || label || placeholder}
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

  const labelClass =
    tone === 'premium'
      ? 'block text-[13px] font-semibold tracking-tight text-ink'
      : 'block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted';

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {showLabel ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-labelledby={showLabel ? `${labelId} ${valueId}` : valueId}
        aria-label={showLabel ? undefined : ariaLabelProp || placeholder}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full min-w-0 items-center gap-2 border-0 bg-transparent pr-1 text-left text-ink focus:outline-none focus-visible:ring-0 ${
          tone === 'premium' ? 'mt-0.5 min-h-6 text-[13px] sm:text-sm' : 'h-9 text-[15px]'
        }`}
      >
        {!hideIcon ? <Calendar className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden /> : null}
        <span id={valueId} className={`min-w-0 truncate ${value.trim() ? 'text-ink' : 'text-ink-muted'}`}>
          {display}
        </span>
      </button>
      {panel}
    </div>
  );
}
