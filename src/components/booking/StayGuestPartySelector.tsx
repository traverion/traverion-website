import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Minus, Plus, Users } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { computeAnchoredPopoverBox, type AnchoredPopoverBox } from '../../lib/anchored-popover';
import {
  formatStayGuestPartySummary,
  stayGuestAgeCopy,
  validateStayGuestParty,
  type StayGuestParty,
  type StayGuestPolicy,
} from '../../lib/stay-guest-party';

type Props = {
  id: string;
  party: StayGuestParty;
  policy: StayGuestPolicy;
  maxGuests: number | null;
  onChange: (party: StayGuestParty) => void;
};

/**
 * Compact Guests trigger — adults/children/infants open in a portaled popover
 * so controls are never clipped by the sticky booking card.
 */
export default function StayGuestPartySelector({ id, party, policy, maxGuests, onChange }: Props) {
  const copy = stayGuestAgeCopy(policy);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelBox, setPanelBox] = useState<AnchoredPopoverBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = formatStayGuestPartySummary(party);

  const close = useCallback(() => setOpen(false), []);
  useDialogFocus(open, panelRef, close);

  const placePanel = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    setPanelBox(
      computeAnchoredPopoverBox({
        anchorRect: btn.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        preferredWidth: 18 * 16,
        estimatedHeight: 320,
      })
    );
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

  function bump(key: 'adults' | 'children' | 'infants', delta: number) {
    const next = { ...party, [key]: party[key] + delta };
    if (maxGuests == null) {
      setNotice('Guest capacity is unavailable for this stay.');
      return;
    }
    const checked = validateStayGuestParty(next, policy, maxGuests);
    if (!checked.ok) {
      setNotice(checked.error);
      return;
    }
    setNotice(null);
    onChange(next);
  }

  const rows = [
    ['adults', 'Adults', copy.adult, 1],
    ['children', 'Children', copy.child, 0],
    ['infants', 'Infants', copy.infant, 0],
  ] as const;

  const panelBody = (
    <>
      <p className="mb-2.5 text-[12px] leading-relaxed text-ink-muted">{copy.summary}</p>
      <div className="overflow-hidden rounded-xl ring-1 ring-black/[0.08]">
        {rows.map(([key, label, hint, min]) => {
          const value = party[key];
          return (
            <div
              key={key}
              className="flex items-center gap-3 border-b border-black/[0.06] px-3 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-[12px] text-ink-muted">{hint.replace(`${label} `, '')}</p>
              </div>
              <button
                type="button"
                className="lux-flat flex h-10 w-10 items-center justify-center rounded-full text-finland ring-1 ring-black/[0.08] hover:bg-finland/5 disabled:opacity-30"
                aria-label={`Fewer ${label.toLowerCase()}`}
                disabled={value <= min || maxGuests == null}
                onClick={() => bump(key, -1)}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {value}
              </span>
              <button
                type="button"
                className="lux-flat flex h-10 w-10 items-center justify-center rounded-full text-finland ring-1 ring-black/[0.08] hover:bg-finland/5 disabled:opacity-30"
                aria-label={`More ${label.toLowerCase()}`}
                disabled={maxGuests == null}
                onClick={() => bump(key, 1)}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {notice ? <p className="mt-2 text-sm text-red-700">{notice}</p> : null}
      <button
        type="button"
        className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-finland hover:bg-finland/[0.06]"
        onClick={close}
      >
        Done
      </button>
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
                aria-label="Close guests"
                onClick={close}
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label="Guests"
                className="tv-date-sheet__panel motion-safe:animate-slide-up"
              >
                {panelBody}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label="Guests"
              className="tv-popover tv-popover-enter p-3"
              style={{
                position: 'fixed',
                top: panelBox.top,
                left: panelBox.left,
                width: panelBox.width,
                zIndex: 140,
              }}
            >
              {panelBody}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="lux-flat flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-black/[0.1] transition-[box-shadow,ring-color] duration-200 hover:ring-finland/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland"
      >
        <Users className="h-4 w-4 shrink-0 text-finland" aria-hidden strokeWidth={2} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Guests</span>
          <span className="block truncate text-sm font-semibold text-ink">{summary}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {portal}
    </div>
  );
}
