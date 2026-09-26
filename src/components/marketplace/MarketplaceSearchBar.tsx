import type { FormEvent, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { addCalendarDays } from '../../lib/stayOccupancy';
import {
  nextStayDatePatch,
  type MarketplaceSearchFamily,
  type MarketplaceSearchValues,
} from '../../lib/marketplaceBrowse';

type Props = {
  family: MarketplaceSearchFamily;
  values: MarketplaceSearchValues;
  onChange: (patch: Partial<MarketplaceSearchValues>) => void;
  idPrefix: string;
  /** Stacked fields for mobile sheets. */
  stacked?: boolean;
  onSubmit?: (e: FormEvent) => void;
  /** Search button or live result count. */
  trailing?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

function FieldShell({ stacked, children }: { stacked?: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative min-w-0 px-3.5 py-2 hover:bg-black/[0.03] focus-within:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25 transition-colors ${
        stacked ? 'rounded-xl' : 'rounded-full'
      }`}
    >
      {children}
    </div>
  );
}

export function MarketplaceSearchFields({
  family,
  values,
  onChange,
  idPrefix,
  stacked = false,
}: Pick<Props, 'family' | 'values' | 'onChange' | 'idPrefix' | 'stacked'>) {
  const isStay = family === 'stays';
  return (
    <>
      <FieldShell stacked={stacked}>
        <label htmlFor={`${idPrefix}-where`} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Where
        </label>
        <div className="relative">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
          <input
            id={`${idPrefix}-where`}
            type="search"
            value={values.where}
            onChange={(e) => onChange({ where: e.target.value })}
            placeholder={isStay ? 'City or stay' : 'City or tour'}
            className="w-full h-9 pl-6 pr-2 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
          />
        </div>
      </FieldShell>
      <FieldShell stacked={stacked}>
        <label htmlFor={`${idPrefix}-date`} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {isStay ? 'Check-in' : 'Date'}
        </label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={values.date}
          onChange={(e) => {
            const next = e.target.value;
            onChange(isStay ? nextStayDatePatch(values, next) : { date: next });
          }}
          className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
        />
      </FieldShell>
      {isStay ? (
        <FieldShell stacked={stacked}>
          <label htmlFor={`${idPrefix}-checkout`} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Check-out
          </label>
          <input
            id={`${idPrefix}-checkout`}
            type="date"
            value={values.checkout}
            min={values.date ? addCalendarDays(values.date, 1) : undefined}
            onChange={(e) => onChange({ checkout: e.target.value })}
            className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
          />
        </FieldShell>
      ) : null}
      <FieldShell stacked={stacked}>
        <label htmlFor={`${idPrefix}-guests`} className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {isStay ? 'Guests' : 'Travelers'}
        </label>
        <input
          id={`${idPrefix}-guests`}
          type="number"
          min={1}
          max={99}
          inputMode="numeric"
          value={values.guests}
          onChange={(e) => onChange({ guests: e.target.value })}
          placeholder={isStay ? 'Guests' : 'Travelers'}
          className="w-full h-9 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
        />
      </FieldShell>
    </>
  );
}

export function MarketplaceSearchPill({
  family,
  values,
  onChange,
  idPrefix,
  onSubmit,
  trailing,
  ariaLabel,
  className = '',
}: Props) {
  const isStay = family === 'stays';
  const grid = isStay
    ? trailing
      ? 'grid-cols-[1.15fr_0.9fr_0.9fr_0.75fr_auto]'
      : 'grid-cols-[1.3fr_1fr_1fr_0.85fr]'
    : trailing
      ? 'grid-cols-[1.35fr_1fr_0.85fr_auto]'
      : 'grid-cols-[1.4fr_1fr_0.85fr]';
  return (
    <form
      onSubmit={onSubmit ?? ((e) => e.preventDefault())}
      className={`hidden sm:grid gap-1 bg-paper-raised rounded-full p-1.5 shadow-soft-lg ring-1 ring-black/[0.06] ${grid} ${className}`}
      aria-label={ariaLabel ?? (isStay ? 'Search stays' : 'Search tours')}
    >
      <MarketplaceSearchFields family={family} values={values} onChange={onChange} idPrefix={idPrefix} />
      {trailing}
    </form>
  );
}

export function MarketplaceMobileSearchTrigger({
  where,
  whenLabel,
  whoLabel,
  onClick,
  expanded,
  controlsId,
}: {
  where: string;
  whenLabel: string;
  whoLabel: string;
  onClick: () => void;
  expanded?: boolean;
  controlsId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sm:hidden w-full flex items-center gap-3 rounded-2xl bg-paper-raised text-ink px-4 py-3.5 shadow-soft-lg ring-1 ring-black/[0.06] text-left active:scale-[0.99] transition-transform"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controlsId}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finland text-white" aria-hidden>
        <Search className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink truncate">{where}</span>
        <span className="mt-0.5 block text-sm text-ink-muted truncate">
          {whenLabel}
          <span className="mx-1.5 text-ink-faint" aria-hidden>
            ·
          </span>
          {whoLabel}
        </span>
      </span>
    </button>
  );
}
