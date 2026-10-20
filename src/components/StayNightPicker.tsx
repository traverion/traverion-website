import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { computeAnchoredPopoverBox, type AnchoredPopoverBox } from '../lib/anchored-popover';
import { formatStayNightHuman, monthGrid, stayNightState } from '../lib/stay-calendar';
import { planStayNightPick } from '../lib/stay-night-pick';
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
 * Compact check-in / check-out fields; calendar opens in a portaled overlay
 * anchored in viewport coordinates so sticky booking cards do not clip or drift it.
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
  const [panelBox, setPanelBox] = useState<AnchoredPopoverBox | null>(null);
  const [enterAnim, setEnterAnim] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const measuredHeightRef = useRef(380);
  const panelId = useId();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: (m ?? 1) - 1 };
  });

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const close = useCallback(() => setOpen(false), []);
  useDialogFocus(open, panelRef, close);

  const placePanel = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const panelEl = panelRef.current;
    if (panelEl) {
      const h = panelEl.getBoundingClientRect().height;
      if (h > 0) measuredHeightRef.current = h;
    }
    const vv = window.visualViewport;
    // Prefer visualViewport size when present (mobile browser chrome), but keep
    // getBoundingClientRect coords as-is — they match position:fixed top/left.
    const viewportWidth = vv?.width ?? window.innerWidth;
    const viewportHeight = vv?.height ?? window.innerHeight;
    const rect = el.getBoundingClientRect();
    const next = computeAnchoredPopoverBox({
      anchorRect: rect,
      viewportWidth,
      viewportHeight,
      preferredWidth: 20.5 * 16,
      estimatedHeight: measuredHeightRef.current,
    });
    setPanelBox((prev) => {
      if (!prev) return next;
      if (prev.mode === 'sheet' && next.mode === 'sheet') return prev;
      if (prev.mode === 'popover' && next.mode === 'popover') {
        if (
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.maxHeight === next.maxHeight &&
          prev.placement === next.placement
        ) {
          return prev;
        }
      }
      return next;
    });
  }, []);

  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const panelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setPanelEl(node);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      setEnterAnim(false);
      return;
    }
    setEnterAnim(true);
    placePanel();

    // Sticky ancestors can move the anchor without a reliable scroll target.
    // While open, re-measure every frame; placePanel no-ops when geometry is unchanged.
    let rafLoop = 0;
    let scheduled = 0;
    const schedule = () => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        placePanel();
      });
    };
    const loop = () => {
      placePanel();
      rafLoop = window.requestAnimationFrame(loop);
    };
    rafLoop = window.requestAnimationFrame(loop);

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);

    const ro = new ResizeObserver(schedule);
    if (anchorRef.current) ro.observe(anchorRef.current);
    if (panelEl) ro.observe(panelEl);

    return () => {
      window.cancelAnimationFrame(rafLoop);
      if (scheduled) window.cancelAnimationFrame(scheduled);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [open, placePanel, cursor.y, cursor.m, panelEl]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!checkIn || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return;
    const [y, m] = checkIn.split('-').map(Number);
    setCursor({ y, m: (m ?? 1) - 1 });
  }, [checkIn]);

  const pick = (iso: string) => {
    const next = planStayNightPick({
      iso,
      todayIso,
      occupied,
      checkIn,
      checkOut,
      minNights,
    });
    if (next.reason === 'past' || next.reason === 'occupied') return;
    onChange(next.checkIn, next.checkOut);
    if (next.close) close();
  };

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const fieldClass =
    'flex min-h-11 flex-1 flex-col justify-center gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/40';

  const calendar = (
    <>
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
          const disabled = state === 'past' || state === 'occupied';
          return (
            <TraverionCalendarDayButton
              key={iso}
              iso={iso}
              visual={stayVisual(iso, state, checkIn, checkOut)}
              onSelect={pick}
              disabled={disabled}
              ariaLabel={
                disabled
                  ? `${formatStayNightHuman(iso)}, unavailable`
                  : checkIn && !checkOut
                    ? `${formatStayNightHuman(iso)}, check-out`
                    : `${formatStayNightHuman(iso)}, check-in`
              }
            />
          );
        })}
      </TraverionCalendarMonth>
      {checkIn || checkOut ? (
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
      ) : null}
    </>
  );

  const portal =
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
                ref={panelCallbackRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label="Select stay dates"
                className="tv-date-sheet__panel motion-safe:animate-slide-up"
              >
                {calendar}
              </div>
            </div>
          ) : (
            <div
              ref={panelCallbackRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label="Select stay dates"
              className={`tv-popover p-3${enterAnim ? ' tv-popover-enter' : ''}`}
              style={{
                position: 'fixed',
                top: panelBox.top,
                left: panelBox.left,
                width: panelBox.width,
                maxHeight: panelBox.maxHeight,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                zIndex: 140,
              }}
              onAnimationEnd={() => setEnterAnim(false)}
            >
              {calendar}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div ref={rootRef} id={id} className="relative outline-none">
      <div
        ref={anchorRef}
        className={`grid grid-cols-2 divide-x divide-black/[0.08] overflow-hidden rounded-xl ring-1 transition-[box-shadow,ring-color] duration-200 ${
          open ? 'ring-finland/35 shadow-[var(--tv-focus-ring)]' : 'ring-black/[0.1]'
        }`}
      >
        <button
          type="button"
          className={fieldClass}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={panelId}
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
          aria-controls={panelId}
          onClick={() => setOpen(true)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Check-out</span>
          <span className={`text-sm font-semibold tabular-nums ${checkOut ? 'text-ink' : 'text-ink-faint'}`}>
            {checkOut ? formatStayNightHuman(checkOut) : 'Add date'}
          </span>
        </button>
      </div>
      {portal}
    </div>
  );
}
