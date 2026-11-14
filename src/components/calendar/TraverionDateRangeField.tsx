import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { monthGrid } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { localYmd } from '../../lib/local-ymd';
import {
  applyStayDateTap,
  stayDateRangeEdge,
  type StayDateRange,
} from '../../lib/stay-calendar-selection';
import { handleCalendarGridKeyDown } from '../../lib/calendar-grid-keys';
import {
  TraverionCalendarDayButton,
  TraverionCalendarMonth,
  type TraverionCalendarDayVisual,
} from './TraverionCalendarMonth';
import { placeTraverionDatePanel, type TraverionDatePanelBox } from './placeTraverionDatePanel';

export type TraverionDateRangeValue = { from: string; to: string };

type Props = {
  id: string;
  from: string;
  to: string;
  onChange: (next: TraverionDateRangeValue) => void;
  /** When a quick day chip is active and no custom range is set. */
  presetLabel?: string | null;
  placeholder?: string;
  className?: string;
  todayIso?: string;
  'aria-label'?: string;
};

function formatCompactDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatPartnerTravelRangeLabel(from: string, to: string): string {
  const a = from.trim();
  const b = to.trim();
  if (!a && !b) return '';
  if (a && !b) return formatCompactDay(a);
  if (!a && b) return `Until ${formatCompactDay(b)}`;
  if (a === b) return formatCompactDay(a);
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  if (sameMonth) {
    const startDay = Number(a.slice(8));
    const end = new Date(`${b}T12:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${startDay}–${end}`;
  }
  if (sameYear) {
    return `${formatCompactDay(a)} – ${formatCompactDay(b)} ${a.slice(0, 4)}`;
  }
  return `${formatCompactDay(a)} ${a.slice(0, 4)} – ${formatCompactDay(b)} ${b.slice(0, 4)}`;
}

/**
 * Traverion date-range field for partner bookings — portaled calendar, no native date chrome.
 */
export function TraverionDateRangeField({
  id,
  from,
  to,
  onChange,
  presetLabel = null,
  placeholder = 'Travel dates',
  className = '',
  todayIso: todayIsoProp,
  'aria-label': ariaLabelProp,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelBox, setPanelBox] = useState<TraverionDatePanelBox | null>(null);
  const [focusIso, setFocusIso] = useState(from || '');
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [draft, setDraft] = useState<StayDateRange | null>(() =>
    from && /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? { start: from, end: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : from }
      : null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const valueId = useId();
  const todayIso = todayIsoProp && /^\d{4}-\d{2}-\d{2}$/.test(todayIsoProp) ? todayIsoProp : localYmd();

  const startIso =
    (draft?.start && /^\d{4}-\d{2}-\d{2}$/.test(draft.start) ? draft.start : null) ||
    (from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null) ||
    todayIso;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = startIso.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  useEffect(() => {
    if (!open) return;
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      setDraft({
        start: from,
        end: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : from,
      });
      const [y, m] = from.split('-').map(Number);
      setCursor({ y, m: (m ?? 1) - 1 });
      return;
    }
    setDraft(null);
  }, [open, from, to]);

  const close = useCallback(() => {
    setOpen(false);
    setHoverIso(null);
  }, []);
  useDialogFocus(open, panelRef, close);

  const placePanel = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    setPanelBox(placeTraverionDatePanel(btn));
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
  const visibleDays = cells.filter((iso): iso is string => Boolean(iso));
  const activeFocus = visibleDays.includes(focusIso) ? focusIso : visibleDays[0] ?? '';

  const pendingFocus = useRef<string | null>(null);
  const moveFocus = (iso: string) => {
    const [y, m] = iso.split('-').map(Number);
    setCursor({ y, m: (m ?? 1) - 1 });
    setFocusIso(iso);
    pendingFocus.current = iso;
  };

  useEffect(() => {
    const iso = pendingFocus.current;
    if (!iso || !open) return;
    const btn = panelRef.current?.querySelector<HTMLButtonElement>(`[data-cal-day="${iso}"]`);
    if (!btn) return;
    btn.focus();
    pendingFocus.current = null;
  });

  useEffect(() => {
    if (!open) return;
    const iso = (from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null) || todayIso;
    setFocusIso(iso);
    const [y, m] = iso.split('-').map(Number);
    setCursor({ y, m: (m ?? 1) - 1 });
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>(`[data-cal-day="${iso}"]`)?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, from, todayIso]);

  const shift = (deltaMonths: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + deltaMonths, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const previewRange: StayDateRange | null = useMemo(() => {
    if (!draft) return null;
    if (draft.start !== draft.end) return draft;
    if (hoverIso && hoverIso !== draft.start) {
      return hoverIso < draft.start
        ? { start: hoverIso, end: draft.start }
        : { start: draft.start, end: hoverIso };
    }
    return draft;
  }, [draft, hoverIso]);

  const rangeLabel = formatPartnerTravelRangeLabel(from, to);
  const display = rangeLabel || presetLabel?.trim() || placeholder;
  const hasValue = Boolean(rangeLabel || presetLabel?.trim());

  const commitClear = () => {
    setDraft(null);
    onChange({ from: '', to: '' });
    close();
  };

  const calendar = (
    <TraverionCalendarMonth
      bare
      year={cursor.y}
      month0={cursor.m}
      onPrevMonth={() => shift(-1)}
      onNextMonth={() => shift(1)}
      onPrevYear={() => shift(-12)}
      onNextYear={() => shift(12)}
      onGridKeyDown={(event) => handleCalendarGridKeyDown(event, moveFocus)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{draft && draft.start === draft.end ? 'Select an end date, or apply this day.' : 'Select a start date, then an end date.'}</span>
          <div className="flex items-center gap-2">
            {draft && draft.start === draft.end ? (
              <button
                type="button"
                className="text-xs font-semibold text-finland hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]"
                onClick={() => {
                  onChange({ from: draft.start, to: draft.end });
                  close();
                }}
              >
                Apply day
              </button>
            ) : null}
            {hasValue || draft ? (
              <button
                type="button"
                className="text-xs font-semibold text-finland hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]"
                onClick={commitClear}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      {cells.map((iso, i) => {
        if (!iso) return <span key={`e-${i}`} />;
        const edge = stayDateRangeEdge(iso, previewRange);
        const isToday = iso === todayIso && !edge;
        let visual: TraverionCalendarDayVisual = 'default';
        if (edge === 'both' || edge === 'start') visual = 'rangeStart';
        else if (edge === 'end') visual = 'rangeEnd';
        else if (edge === 'middle') visual = 'rangeMiddle';
        else if (isToday) visual = 'today';
        return (
          <TraverionCalendarDayButton
            key={iso}
            iso={iso}
            visual={visual}
            today={iso === todayIso}
            tabIndex={iso === activeFocus ? 0 : -1}
            ariaPressed={Boolean(edge)}
            ariaLabel={
              edge
                ? `${formatBookingDateDisplay(iso)}, in selected range`
                : formatBookingDateDisplay(iso)
            }
            onHoverChange={setHoverIso}
            onSelect={(next) => {
              const prev = draft;
              const nextDraft = applyStayDateTap(prev, next);
              setFocusIso(next);
              if (!nextDraft && prev && prev.start === prev.end && prev.start === next) {
                onChange({ from: prev.start, to: prev.end });
                close();
                return;
              }
              setDraft(nextDraft);
              if (!nextDraft) {
                onChange({ from: '', to: '' });
                close();
                return;
              }
              // First tap anchors a single day; second tap commits the range.
              if (prev && prev.start === prev.end) {
                onChange({ from: nextDraft.start, to: nextDraft.end });
                close();
              }
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
                aria-label={ariaLabelProp || placeholder}
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
              aria-label={ariaLabelProp || placeholder}
              className={`tv-date-popover motion-safe:animate-fade-in${panelBox.placement === 'above' ? ' tv-date-popover--above' : ''}`}
              style={{
                position: 'fixed',
                top: panelBox.top,
                left: panelBox.left,
                width: panelBox.width,
                zIndex: 130,
              }}
            >
              <span className="tv-date-popover__caret" style={{ left: panelBox.caret }} aria-hidden />
              {calendar}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div className={`partner-bookings-daterange ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-labelledby={
          !hasValue && (ariaLabelProp || placeholder) === display ? valueId : `${labelId} ${valueId}`
        }
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`partner-bookings-daterange__trigger${open ? ' is-open' : ''}`}
      >
        <span id={labelId} className="sr-only">
          {ariaLabelProp || placeholder}
        </span>
        <Calendar className="partner-bookings-daterange__icon" strokeWidth={2} aria-hidden />
        <span
          id={valueId}
          className={`partner-bookings-daterange__value${hasValue ? '' : ' is-placeholder'}`}
        >
          {display}
        </span>
      </button>
      {panel}
    </div>
  );
}
