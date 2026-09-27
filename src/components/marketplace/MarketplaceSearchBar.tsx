import type { FormEvent, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { addCalendarDays } from '../../lib/stayOccupancy';
import {
  nextStayDatePatch,
  marketplaceSearchMinSelectableIso,
  type MarketplaceSearchFamily,
  type MarketplaceSearchValues,
} from '../../lib/marketplaceBrowse';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import { TravelerGuestPicker } from '../calendar/TravelerGuestPicker';

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
  const searchMinIso = marketplaceSearchMinSelectableIso();
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
        <TraverionSingleDateField
          id={`${idPrefix}-date`}
          label={isStay ? 'Check-in' : 'Date'}
          value={values.date}
          placeholder={isStay ? 'Add date' : 'Any date'}
          minIso={searchMinIso}
          onChange={(next) => {
            onChange(isStay ? nextStayDatePatch(values, next) : { date: next });
          }}
        />
      </FieldShell>
      {isStay ? (
        <FieldShell stacked={stacked}>
          <TraverionSingleDateField
            id={`${idPrefix}-checkout`}
            label="Check-out"
            value={values.checkout}
            placeholder="Add date"
            minIso={values.date ? addCalendarDays(values.date, 1) : searchMinIso}
            onChange={(next) => onChange({ checkout: next })}
          />
        </FieldShell>
      ) : null}
      <FieldShell stacked={stacked}>
        <TravelerGuestPicker
          id={`${idPrefix}-guests`}
          label={isStay ? 'Guests' : 'Travelers'}
          mode={isStay ? 'guests' : 'travelers'}
          value={values.guests}
          onChange={(next) => onChange({ guests: next })}
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
      className={`hidden sm:grid gap-1 bg-paper-raised rounded-full p-1.5 shadow-soft-lg ring-1 ring-black/[0.06] overflow-visible ${grid} ${className}`}
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
