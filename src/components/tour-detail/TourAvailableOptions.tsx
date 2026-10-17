import { useState } from 'react';
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
import { departureTimesOnDate, FLEXIBLE_DEPARTURE_HM } from '../../lib/listing-option-schedules';
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
  onChooseTime?: (variant: TourBookingVariant, time: string) => void;
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
  onChooseTime,
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
          <h2 id="tour-availability-heading" className="text-xl font-bold tracking-tight text-[#111827]">
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
            onChooseTime={onChooseTime}
            date={date}
          />
        </div>
      ) : null}

      {kind === 'many' ? (
        <ul className="mt-4 grid gap-3">
          {available.map((variant) => (
            <li key={variant.id}>
              <OptionRow
                variant={variant}
                selected={selectedId === variant.id}
                currency={currency}
                hideCatalogPrice={hideSelectedCatalogPrice && selectedId === variant.id}
                onChoose={onChoose}
                onChooseTime={onChooseTime}
                date={date}
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
  date,
  onChoose,
  onChooseTime,
}: {
  variant: TourBookingVariant;
  selected: boolean;
  currency: string;
  hideCatalogPrice?: boolean;
  compact?: boolean;
  date: string;
  onChoose: (variant: TourBookingVariant) => void;
  onChooseTime?: (variant: TourBookingVariant, time: string) => void;
}) {
  const opt = variant.listingOption;
  const meta = optionMetaParts(variant).filter((part) => !part.startsWith('Starts '));
  const detail = opt?.optionInfo?.trim() || '';
  const [pricesOpen, setPricesOpen] = useState(false);
  const times = opt
    ? departureTimesOnDate(opt, date).filter((time) => time && time !== FLEXIBLE_DEPARTURE_HM)
    : [];
  const priced = hideCatalogPrice
    ? null
    : opt && optionUsesAgePricing(opt)
      ? travelerOptionPriceFacts(opt, (n) => formatMoney(n, currency))
      : {
          lead: `${formatMoney(variant.pricePerPerson, currency)} ${
            optionUsesPrivateFlatPrice(opt) ? 'for your group' : 'per person'
          }`,
          facts: [] as { label: string; ages?: string; amountLabel: string }[],
        };
  return (
    <article
      className={`rounded-2xl border p-4 transition-[background-color,border-color] duration-200 ${
        selected ? 'border-[#0758CB] bg-[#EAF2FF]' : 'border-black/[0.08] bg-white hover:border-black/15'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-[#111827]">{variant.label}</h3>
          {detail ? <p className="mt-1 text-sm leading-snug text-ink-muted">{detail}</p> : null}
        </div>
        <p className="shrink-0 text-right text-lg font-bold tabular-nums leading-tight text-[#111827]">
          {hideCatalogPrice ? 'Price unavailable' : priced?.lead}
        </p>
      </div>
      {meta.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {meta.map((part) => (
            <li key={part} className="rounded-md bg-[#f4f5f7] px-2 py-1 text-xs text-ink">
              {part}
            </li>
          ))}
        </ul>
      ) : null}
      {times.length > 1 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Departure</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Departure times for ${variant.label}`}>
            {times.map((time) => (
              <button
                key={time}
                type="button"
                className="min-h-9 rounded-lg border border-black/10 px-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-[#073b83] hover:text-[#073b83]"
                onClick={() => (onChooseTime ? onChooseTime(variant, time) : onChoose(variant))}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      ) : times.length === 1 ? (
        <p className="mt-3 text-sm text-ink">
          <span className="text-ink-muted">Departs </span>
          <span className="font-semibold">{times[0]}</span>
        </p>
      ) : null}
      {priced && priced.facts.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm font-semibold text-[#073b83]"
            aria-expanded={pricesOpen}
            onClick={() => setPricesOpen((open) => !open)}
          >
            {pricesOpen ? 'Hide price details' : 'Price details'}
          </button>
          {pricesOpen ? (
            <dl className="mt-2 space-y-1">
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
        </div>
      ) : null}
      <button
        type="button"
        data-tour-option-cta="choose"
        onClick={() => onChoose(variant)}
        aria-pressed={selected}
        className={`mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors duration-200 ${
          selected
            ? 'bg-[#0758CB] text-white'
            : 'border border-[#0758CB] bg-white text-[#0758CB] hover:bg-[#EAF2FF]'
        }`}
      >
        {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
        {selected ? 'Selected' : 'Select'}
      </button>
    </article>
  );
}
