import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

type PanelBox =
  | { mode: 'popover'; top: number; left: number; width: number; maxHeight: number }
  | { mode: 'sheet' };

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (hm: string) => void;
  /** Valid HH:MM options only. Current value is never auto-rewritten if missing. */
  options: string[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  hideIcon?: boolean;
  'aria-label'?: string;
};

/**
 * Compact Traverion time list — portaled popover/sheet of valid HH:MM slots.
 * Does not invent times; parent supplies options from rental schedule helpers.
 */
export function TraverionTimeListField({
  id,
  label = '',
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  placeholder = 'Select time',
  hideIcon = false,
  'aria-label': ariaLabelProp,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const valueId = useId();
  const showLabel = label.trim().length > 0;
  const display = value.trim() || placeholder;

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
    const width = Math.min(11 * 16, window.innerWidth - edge * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - edge) {
      left = Math.max(edge, window.innerWidth - width - edge);
    }
    if (left < edge) left = edge;
    const gap = 8;
    const panelH = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    const preferBelow = spaceBelow >= Math.min(panelH, 160) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, Math.min(panelH, preferBelow ? spaceBelow : spaceAbove));
    const top = preferBelow
      ? Math.min(rect.bottom + gap, window.innerHeight - edge)
      : Math.max(edge, rect.top - gap - maxHeight);
    setPanelBox({ mode: 'popover', top, left, width, maxHeight });
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

  useEffect(() => {
    if (!open || !value.trim()) return;
    requestAnimationFrame(() => {
      const node = listRef.current?.querySelector(`[data-value="${value}"]`) as HTMLElement | null;
      node?.scrollIntoView({ block: 'center' });
    });
  }, [open, value]);

  const list = (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ariaLabelProp || label || 'Time'}
      className="max-h-[min(15rem,50vh)] overflow-y-auto overscroll-contain py-1"
    >
      {options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-muted">No times available for this day.</p>
      ) : (
        options.map((hm) => {
          const selected = hm === value;
          return (
            <button
              key={hm}
              type="button"
              role="option"
              data-value={hm}
              aria-selected={selected}
              className={`flex w-full items-center px-3 py-2 text-left text-sm tabular-nums transition ${
                selected
                  ? 'bg-finland/10 font-semibold text-finland'
                  : 'text-ink hover:bg-finland/5'
              }`}
              onClick={() => {
                onChange(hm);
                close();
              }}
            >
              {hm}
            </button>
          );
        })
      )}
    </div>
  );

  const panelChrome = (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/[0.08]">
      {list}
    </div>
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
                aria-label="Close time picker"
                onClick={close}
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabelProp || label || 'Time'}
                className="tv-date-sheet__panel motion-safe:animate-slide-up"
              >
                <p className="mb-2 px-1 text-sm font-semibold text-ink">{ariaLabelProp || label || 'Time'}</p>
                {panelChrome}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabelProp || label || 'Time'}
              className="motion-safe:animate-fade-in"
              style={{
                position: 'fixed',
                top: panelBox.top,
                left: panelBox.left,
                width: panelBox.width,
                maxHeight: panelBox.maxHeight,
                zIndex: 130,
              }}
            >
              {panelChrome}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {showLabel ? (
        <span id={labelId} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-labelledby={showLabel ? `${labelId} ${valueId}` : valueId}
        aria-label={showLabel ? undefined : ariaLabelProp || placeholder}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className="flex w-full min-w-0 items-center gap-2 border-0 bg-transparent text-left text-sm text-ink focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!hideIcon ? <Clock className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden /> : null}
        <span
          id={valueId}
          className={`min-w-0 truncate tabular-nums ${value.trim() ? 'text-ink' : 'text-ink-muted'}`}
        >
          {display}
        </span>
      </button>
      {panel}
    </div>
  );
}
