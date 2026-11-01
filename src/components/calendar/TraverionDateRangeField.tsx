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
import {
  TraverionCalendarDayButton,
  TraverionCalendarMonth,
  type TraverionCalendarDayVisual,
} from './TraverionCalendarMonth';

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

type PanelBox =
  | { mode: 'popover'; top: number; left: number; width: number }
  | { mode: 'sheet' };

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
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
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
    const isSheet = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
    if (isSheet) {
      setPanelBox({ mode: 'sheet' });
      return;
    }
    const rect = btn.getBoundingClientRect();
    const edge = 8;
    const width = Math.min(21.5 * 16, window.innerWidth - edge * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - edge) {
      left = Math.max(edge, window.innerWidth - width - edge);
    }
    if (left < edge) left = edge;
    const gap = 8;
    const panelH = 360;
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
      year={cursor.y}
      month0={cursor.m}
      onPrevMonth={() => shift(-1)}
      onNextMonth={() => shift(1)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-finland hover:underline"
              onClick={() => shift(-12)}
            >
              Prev year
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-finland hover:underline"
              onClick={() => shift(12)}
            >
              Next year
            </button>
          </div>
          <div className="flex items-center gap-2">
            {draft && draft.start === draft.end ? (
              <button
                type="button"
                className="text-xs font-semibold text-finland hover:underline"
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
                className="text-xs font-semibold text-finland hover:underline"
                onClick={commitClear}
              >
                Clear
              </button>
            ) : (
              <span className="text-[11px] text-ink-faint">Select start and end</span>
            )}
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
    <div className={`partner-bookings-daterange ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-labelledby={valueId}
        aria-label={ariaLabelProp || placeholder}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="partner-bookings-daterange__trigger"
      >
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
