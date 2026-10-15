import { Check } from 'lucide-react';
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
      className={`rounded-xl px-4 py-3.5 ring-1 sm:px-5 ${
        selected ? 'bg-finland/[0.05] ring-finland' : 'bg-white ring-black/[0.08]'
      } ${compact ? '' : ''}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{variant.label}</p>
          {meta.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-sm text-ink-muted">
              {meta.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
          ) : null}
          {opt?.optionInfo?.trim() ? (
            <p className="mt-1.5 text-sm leading-snug text-ink-muted">{opt.optionInfo.trim()}</p>
          ) : variant.subtitle && meta.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-muted">{variant.subtitle}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
          {hideCatalogPrice ? 'Price unavailable' : priced?.lead}
        </p>
      </div>
      {priced && priced.facts.length > 0 ? (
        <dl className="mt-3 space-y-1 border-t border-black/[0.06] pt-3">
          {priced.facts.map((fact) => (
            <div key={`${fact.label}-${fact.amountLabel}`} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-ink">
                {fact.label}
                {fact.ages ? <span className="text-ink-muted"> · {fact.ages}</span> : null}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums text-ink">{fact.amountLabel}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <button
        type="button"
        data-tour-option-cta="choose"
        onClick={() => onChoose(variant)}
        aria-pressed={selected}
        className={
          selected
            ? 'tv-btn-secondary mt-3 min-h-11'
            : 'tv-btn-primary mt-3 min-h-11'
        }
      >
        {selected ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" aria-hidden />
            Selected
          </span>
        ) : (
          'Select'
        )}
      </button>
    </div>
  );
}
