import { useState } from 'react';
import type { TourBookingVariant } from '../../lib/booking-flow';
import {
  formatTourAvailabilityHeading,
  optionMetaParts,
  type TourOptionAvailabilityKind,
} from '../../lib/tour-available-options';
import { optionUsesAgePricing, optionUsesPrivateFlatPrice } from '../../lib/participant-mix';
import { travelerOptionPriceFacts } from '../../lib/price-categories';
import { formatMoney } from '../../lib/money';
import NoticeCallout from '../NoticeCallout';

type Props = {
  date: string;
  kind: TourOptionAvailabilityKind;
  available: TourBookingVariant[];
  selectedId: string | null;
  guestsLabel: string;
  currency: string;
  /**
   * Phase 1560: selected option + failed panel quote — hide catalog price on that row
   * (PriceHero 1550 / sticky 1547 parity).
   */
  hideSelectedCatalogPrice?: boolean;
  onChoose: (variant: TourBookingVariant) => void;
  onChangeDate: () => void;
  onChangeGuests?: () => void;
};

export default function TourAvailableOptions({
  date,
  kind,
  available,
  selectedId,
  guestsLabel,
  currency,
  hideSelectedCatalogPrice = false,
  onChoose,
  onChangeDate,
  onChangeGuests,
}: Props) {
  const headingDate = formatTourAvailabilityHeading(date);

  return (
    <section
      id="tour-availability"
      aria-labelledby="tour-availability-heading"
      className="scroll-mt-28 motion-safe:animate-fade-in"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="tour-availability-heading" className="font-display text-xl text-ink">
            {kind === 'none' ? 'No availability' : `Available ${headingDate}`}
          </h2>
          {kind !== 'none' ? (
            <p className="mt-1 text-sm text-ink-muted">
              <span>{guestsLabel}</span>
              {onChangeGuests ? (
                <>
                  {' · '}
                  <button type="button" className="font-semibold text-finland hover:underline" onClick={onChangeGuests}>
                    Change
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <button type="button" className="tv-btn-ghost min-h-11 shrink-0" onClick={onChangeDate}>
          Change date
        </button>
      </div>

      {kind === 'none' ? (
        <div className="mt-4">
          <NoticeCallout title="No availability for this date" tone="warn">
            Nothing runs on {headingDate}. Pick another day — we do not invent substitute departures.
          </NoticeCallout>
        </div>
      ) : null}

      {kind === 'one' && available[0] ? (
        <div className="mt-4">
          <OptionRow
            variant={available[0]}
            selected={selectedId === available[0].id}
            currency={currency}
            hideCatalogPrice={hideSelectedCatalogPrice && selectedId === available[0].id}
            compact
            onChoose={onChoose}
          />
        </div>
      ) : null}

      {kind === 'many' ? (
        <ul className="mt-4 space-y-3">
          {available.map((variant) => (
            <li key={variant.id}>
              <OptionRow
                variant={variant}
                selected={selectedId === variant.id}
                currency={currency}
                hideCatalogPrice={hideSelectedCatalogPrice && selectedId === variant.id}
                onChoose={onChoose}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function OptionRow({
  variant,
  selected,
  currency,
  hideCatalogPrice,
  compact,
  onChoose,
}: {
  variant: TourBookingVariant;
  selected: boolean;
  currency: string;
  hideCatalogPrice?: boolean;
  compact?: boolean;
  onChoose: (variant: TourBookingVariant) => void;
}) {
  const opt = variant.listingOption;
  const meta = optionMetaParts(variant);
  const detail = opt?.optionInfo?.trim() || (meta.length === 0 ? variant.subtitle : '');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const priced = hideCatalogPrice
    ? null
    : opt && optionUsesAgePricing(opt)
      ? travelerOptionPriceFacts(opt, (n) => formatMoney(n, currency))
      : {
          lead: `${formatMoney(variant.pricePerPerson, currency)} ${
            optionUsesPrivateFlatPrice(opt) ? 'for your group' : 'per person'
          }`,
          facts: [],
        };
  return (
    <div
      className={`rounded-lg px-3 ring-1 ${compact ? 'py-2' : 'py-2.5'} ${
        selected ? 'bg-[#073b83]/[0.04] ring-[#073b83]' : 'bg-white ring-black/[0.08]'
      }`}
    >
      <button
        type="button"
        data-tour-option-cta="choose"
        onClick={() => onChoose(variant)}
        aria-pressed={selected}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{variant.label}</span>
          {meta.length > 0 ? (
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{meta.join(' · ')}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
          {hideCatalogPrice ? 'Price unavailable' : priced?.lead}
          <span className="mt-1 block text-[11px] font-semibold text-[#073b83]">{selected ? 'Selected' : 'Select'}</span>
        </span>
      </button>
      {priced && priced.facts.length > 0 ? (
        <dl className="mt-2 space-y-0.5 border-t border-black/[0.06] pt-2">
          {priced.facts.map((fact) => (
            <div key={`${fact.label}-${fact.amountLabel}`} className="flex items-baseline justify-between gap-3 text-[13px]">
              <dt className="text-ink">
                {fact.label}
                {fact.ages ? <span className="text-ink-muted"> · {fact.ages}</span> : null}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums text-ink">{fact.amountLabel}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {detail ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="text-[12px] font-semibold text-[#073b83]"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? 'Hide details' : 'More details'}
          </button>
          {detailsOpen ? <p className="mt-1 text-[13px] leading-snug text-ink-muted">{detail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
