import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export type TravelerGuestCounts = {
  adults: number;
  children: number;
};

export function guestCountsFromTotal(total: string | number): TravelerGuestCounts {
  const n = typeof total === 'number' ? total : Number.parseInt(String(total).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return { adults: 0, children: 0 };
  return { adults: Math.min(99, Math.max(1, Math.floor(n))), children: 0 };
}

export function guestTotalString(counts: TravelerGuestCounts): string {
  const total = counts.adults + counts.children;
  return total > 0 ? String(total) : '';
}

export function formatGuestSummary(
  counts: TravelerGuestCounts,
  mode: 'travelers' | 'guests'
): string {
  const { adults, children } = counts;
  const total = adults + children;
  if (total <= 0) return mode === 'guests' ? 'Add guests' : 'Add travelers';
  if (children <= 0) {
    return `${adults} ${adults === 1 ? (mode === 'guests' ? 'guest' : 'traveler') : mode === 'guests' ? 'guests' : 'travelers'}`;
  }
  const adultLabel = `${adults} ${adults === 1 ? 'adult' : 'adults'}`;
  const childLabel = `${children} ${children === 1 ? 'child' : 'children'}`;
  return `${adultLabel} · ${childLabel}`;
}

type Props = {
  id: string;
  label: string;
  mode: 'travelers' | 'guests';
  /** Applied/draft total as string for marketplace URL state. */
  value: string;
  onChange: (total: string) => void;
  maxTotal?: number;
  className?: string;
};

/**
 * Shared traveler/guest stepper — Traverion chrome, plus/minus, accessible.
 * Search still persists a single guests total; adult/child split is UI summary only until booking needs mix.
 */
export function TravelerGuestPicker({
  id,
  label,
  mode,
  value,
  onChange,
  maxTotal = 16,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();
  const [counts, setCounts] = useState<TravelerGuestCounts>(() => guestCountsFromTotal(value));

  useEffect(() => {
    setCounts(guestCountsFromTotal(value));
  }, [value]);

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

  const commit = (next: TravelerGuestCounts) => {
    setCounts(next);
    onChange(guestTotalString(next));
  };

  const bump = (key: keyof TravelerGuestCounts, delta: number) => {
    setCounts((prev) => {
      const next = { ...prev };
      const total = prev.adults + prev.children;
      if (delta > 0 && total >= maxTotal) return prev;
      next[key] = Math.max(key === 'adults' ? (prev.children > 0 ? 1 : 0) : 0, prev[key] + delta);
      if (key === 'adults' && next.adults < 1 && next.children > 0) next.adults = 1;
      if (next.adults + next.children > maxTotal) return prev;
      onChange(guestTotalString(next));
      return next;
    });
  };

  const summary = formatGuestSummary(counts, mode);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <span id={labelId} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      <button
        type="button"
        id={id}
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center gap-2 border-0 bg-transparent pr-1 text-left text-[15px] text-ink focus:outline-none"
      >
        <Users className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <span className={counts.adults + counts.children > 0 ? 'text-ink' : 'text-ink-muted'}>{summary}</span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-2xl bg-paper-raised p-4 shadow-soft-lg ring-1 ring-black/[0.08] motion-safe:animate-fade-in"
        >
          <GuestRow
            label="Adults"
            hint="Primary travelers"
            value={counts.adults}
            min={counts.children > 0 ? 1 : 0}
            onMinus={() => bump('adults', -1)}
            onPlus={() => bump('adults', 1)}
            plusDisabled={counts.adults + counts.children >= maxTotal}
          />
          <GuestRow
            className="mt-3"
            label="Children"
            hint="Optional"
            value={counts.children}
            min={0}
            onMinus={() => bump('children', -1)}
            onPlus={() => bump('children', 1)}
            plusDisabled={counts.adults + counts.children >= maxTotal}
          />
          {counts.adults + counts.children > 0 ? (
            <button
              type="button"
              className="mt-4 text-xs font-semibold text-finland hover:underline"
              onClick={() => {
                commit({ adults: 0, children: 0 });
                close();
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GuestRow({
  label,
  hint,
  value,
  min,
  onMinus,
  onPlus,
  plusDisabled,
  className = '',
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  onMinus: () => void;
  onPlus: () => void;
  plusDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-faint">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-full ring-1 ring-black/[0.08] text-ink disabled:opacity-35"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={onMinus}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums text-ink" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-full ring-1 ring-black/[0.08] text-ink disabled:opacity-35"
          aria-label={`Increase ${label}`}
          disabled={plusDisabled}
          onClick={onPlus}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
