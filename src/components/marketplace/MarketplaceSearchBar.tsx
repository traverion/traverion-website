import type { FormEvent, ReactNode } from 'react';
import { useId } from 'react';
import { Calendar, MapPin, Search, Users } from 'lucide-react';
import { addCalendarDays } from '../../lib/stayOccupancy';
import {
  nextStayDatePatch,
  marketplaceBrowseTodayIso,
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
  /** Stacked fields for mobile sheets / hero cards. */
  stacked?: boolean;
  onSubmit?: (e: FormEvent) => void;
  /** Search button or live result count. */
  trailing?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

function FieldShell({
  stacked,
  icon,
  children,
  className = '',
}: {
  stacked?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative min-w-0 transition-colors ${
        stacked
          ? 'rounded-none px-4 py-3.5'
          : 'rounded-full px-4 py-2.5 hover:bg-black/[0.03] focus-within:bg-black/[0.03]'
      } ${className}`}
    >
      <div className={`flex min-w-0 items-start gap-3 ${stacked ? '' : ''}`}>
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-finland/[0.08] text-finland" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function FieldDivider({ stacked }: { stacked?: boolean }) {
  if (stacked) {
    return <div className="mx-4 border-t border-black/[0.06]" aria-hidden />;
  }
  return <div className="my-2.5 w-px shrink-0 self-stretch bg-black/[0.08]" aria-hidden />;
}

/** Layer C: Where field accessible name includes label + current text (date/guest picker parity). */
export function MarketplaceDestinationField({
  id,
  family,
  value,
  onChange,
  stacked,
}: {
  id: string;
  family: MarketplaceSearchFamily;
  value: string;
  onChange: (next: string) => void;
  stacked?: boolean;
}) {
  const isStay = family === 'stays';
  const labelId = useId();
  const valueId = useId();
  const placeholder = isStay ? 'City, region or stay' : 'City, region or tour';
  const spokenValue = value.trim() || placeholder;
  return (
    <FieldShell stacked={stacked} icon={<MapPin className="h-4 w-4" strokeWidth={2} />}>
      <span id={labelId} className="block text-[13px] font-semibold tracking-tight text-ink">
        Where to?
      </span>
      <span id={valueId} className="sr-only">
        {spokenValue}
      </span>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-labelledby={`${labelId} ${valueId}`}
        className="mt-0.5 h-6 w-full border-0 bg-transparent p-0 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-0"
      />
    </FieldShell>
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
  const browseTodayIso = marketplaceBrowseTodayIso();
  return (
    <>
      <MarketplaceDestinationField
        id={`${idPrefix}-where`}
        family={family}
        value={values.where}
        onChange={(next) => onChange({ where: next })}
        stacked={stacked}
      />
      <FieldDivider stacked={stacked} />
      <FieldShell stacked={stacked} icon={<Calendar className="h-4 w-4" strokeWidth={2} />}>
        <TraverionSingleDateField
          id={`${idPrefix}-date`}
          label={isStay ? 'Check-in' : 'Dates'}
          value={values.date}
          placeholder={isStay ? 'Add date' : 'Any dates'}
          minIso={searchMinIso}
          todayIso={browseTodayIso}
          tone="premium"
          hideIcon
          onChange={(next) => {
            onChange(isStay ? nextStayDatePatch(values, next) : { date: next });
          }}
        />
      </FieldShell>
      {isStay ? (
        <>
          <FieldDivider stacked={stacked} />
          <FieldShell stacked={stacked} icon={<Calendar className="h-4 w-4" strokeWidth={2} />}>
            <TraverionSingleDateField
              id={`${idPrefix}-checkout`}
              label="Check-out"
              value={values.checkout}
              placeholder="Add date"
              minIso={values.date ? addCalendarDays(values.date, 1) : searchMinIso}
              todayIso={browseTodayIso}
              tone="premium"
              hideIcon
              onChange={(next) => {
                // Layer B: orphan check-out without check-in confuses stay browse + URL state (1435 parity).
                if (!values.date.trim()) {
                  if (!next.trim()) onChange({ checkout: next });
                  return;
                }
                onChange({ checkout: next });
              }}
            />
          </FieldShell>
        </>
      ) : null}
      <FieldDivider stacked={stacked} />
      <FieldShell stacked={stacked} icon={<Users className="h-4 w-4" strokeWidth={2} />}>
        <TravelerGuestPicker
          id={`${idPrefix}-guests`}
          label={isStay ? 'Guests' : 'Travelers'}
          mode={isStay ? 'guests' : 'travelers'}
          value={values.guests}
          tone="premium"
          hideIcon
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
      ? 'grid-cols-[minmax(0,1.2fr)_auto_minmax(0,0.95fr)_auto_minmax(0,0.95fr)_auto_minmax(0,0.85fr)_auto]'
      : 'grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,0.9fr)]'
    : trailing
      ? 'grid-cols-[minmax(0,1.35fr)_auto_minmax(0,1fr)_auto_minmax(0,0.9fr)_auto]'
      : 'grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto_minmax(0,0.9fr)]';
  return (
    <form
      onSubmit={onSubmit ?? ((e) => e.preventDefault())}
      className={`hidden items-center gap-0 overflow-visible rounded-full bg-white p-1.5 shadow-[0_12px_40px_-12px_rgba(7,26,58,0.28),0_4px_14px_-6px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.04] sm:grid ${grid} ${className}`}
      aria-label={ariaLabel ?? (isStay ? 'Search stays' : 'Search tours')}
    >
      <MarketplaceSearchFields family={family} values={values} onChange={onChange} idPrefix={idPrefix} />
      {trailing}
    </form>
  );
}

/** Full-width stacked search card (home mobile / compact surfaces). */
export function MarketplaceSearchStack({
  family,
  values,
  onChange,
  idPrefix,
  onSubmit,
  submitLabel = 'Search',
  ariaLabel,
  className = '',
  header,
}: Props & { submitLabel?: string; header?: ReactNode }) {
  const isStay = family === 'stays';
  return (
    <form
      onSubmit={onSubmit ?? ((e) => e.preventDefault())}
      className={`overflow-hidden rounded-[1.25rem] bg-white shadow-[0_16px_40px_-16px_rgba(7,26,58,0.35),0_6px_16px_-8px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.05] ${className}`}
      aria-label={ariaLabel ?? (isStay ? 'Search stays' : 'Search tours')}
    >
      {header}
      <MarketplaceSearchFields
        family={family}
        values={values}
        onChange={onChange}
        idPrefix={idPrefix}
        stacked
      />
      <div className="p-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Phase 1653: safe-area padding for home mobile search actions. */}
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-finland text-[15px] font-semibold text-white shadow-sm hover:bg-finland-dark"
        >
          <Search className="h-4 w-4" aria-hidden />
          {submitLabel}
        </button>
      </div>
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
  const ariaLabel = `Search, ${where}, ${whenLabel}, ${whoLabel}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[1.25rem] bg-white px-4 py-3.5 text-left text-ink shadow-[0_12px_32px_-12px_rgba(7,26,58,0.28)] ring-1 ring-black/[0.05] transition-transform active:scale-[0.99] sm:hidden"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controlsId}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finland text-white" aria-hidden>
        <Search className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{where}</span>
        <span className="mt-0.5 block truncate text-sm text-ink-muted">
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
