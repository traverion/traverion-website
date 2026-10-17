import { useState } from 'react';
import { Check, Clock, MapPin, Users } from 'lucide-react';
import type { ListingDiscount } from '../../data/supabase-discounts';
import { discountedCatalogUnit } from '../../lib/discount-display';
import { activePriceCategories } from '../../lib/price-categories';
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
  /** Offers that may reduce this option's catalog unit. Empty until discounts have loaded. */
  discounts?: ListingDiscount[];
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
  discounts = [],
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
            discounts={discounts}
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
                discounts={discounts}
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

function catalogUnit(variant: TourBookingVariant): { amount: number; basis: string } | null {
  const opt = variant.listingOption;
  if (!opt) {
    return variant.pricePerPerson > 0
      ? { amount: variant.pricePerPerson, basis: 'per person' }
      : null;
  }
  if (optionUsesPrivateFlatPrice(opt)) {
    const flat = opt.privateGroupPriceUsd ?? opt.priceUsd;
    return flat > 0 ? { amount: flat, basis: 'for your group' } : null;
  }
  if (optionUsesAgePricing(opt)) {
    const priced = activePriceCategories(opt)
      .map((category) => category.priceUsd)
      .filter((amount) => amount > 0);
    const from = priced.length ? Math.min(...priced) : 0;
    return from > 0 ? { amount: from, basis: 'from' } : null;
  }
  return opt.priceUsd > 0 ? { amount: opt.priceUsd, basis: 'per person' } : null;
}

function metaIcon(part: string) {
  if (/guest|private/i.test(part)) return Users;
  if (/hour|min|day/i.test(part)) return Clock;
  if (/pickup|meet/i.test(part)) return MapPin;
  return null;
}

function OptionRow({
  variant,
  selected,
  currency,
  discounts,
  hideCatalogPrice,
  date,
  onChoose,
  onChooseTime,
}: {
  variant: TourBookingVariant;
  selected: boolean;
  currency: string;
  discounts: ListingDiscount[];
  hideCatalogPrice?: boolean;
  compact?: boolean;
  date: string;
  onChoose: (variant: TourBookingVariant) => void;
  onChooseTime?: (variant: TourBookingVariant, time: string) => void;
}) {
  const opt = variant.listingOption;
  const meta = optionMetaParts(variant).filter((part) => !part.startsWith('Starts '));
  const detail = opt?.optionInfo?.trim() || '';
  const detailLong = detail.length > 140;
  const [detailOpen, setDetailOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const unit = catalogUnit(variant);
  const offer =
    unit && opt
      ? discountedCatalogUnit(unit.amount, discounts, opt.id, date, currency)
      : null;
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
  const discounted = Boolean(offer?.label);
  const priceLabel = hideCatalogPrice
    ? null
    : offer
      ? unit?.basis === 'from'
        ? `From ${formatMoney(offer.price, currency)}`
        : formatMoney(offer.price, currency)
      : priced?.lead ?? null;
  return (
    <article
      className={`flex flex-col rounded-2xl border px-4 py-3.5 transition-[background-color,border-color] duration-200 ${
        selected ? 'border-[#0758CB] bg-[#EAF2FF]' : 'border-[#E8EBF0] bg-white hover:border-black/15'
      }`}
    >
      <h3 className="text-base font-bold leading-snug text-[#111827]">{variant.label}</h3>
      {detail ? (
        <p className={`mt-1 text-sm leading-snug text-ink-muted ${detailLong && !detailOpen ? 'line-clamp-2' : ''}`}>
          {detail}
        </p>
      ) : null}
      {detailLong ? (
        <button
          type="button"
          className="mt-1 self-start text-sm font-semibold text-[#0758CB]"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((open) => !open)}
        >
          {detailOpen ? 'Show less' : 'Show more'}
        </button>
      ) : null}
      {meta.length > 0 || times.length === 1 ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
          {meta.map((part) => {
            const Icon = metaIcon(part);
            return (
              <li key={part} className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[#111827]">
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden /> : null}
                <span className="break-words">{part}</span>
              </li>
            );
          })}
          {times.length === 1 ? (
            <li className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
              <Clock className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden />
              Departs {times[0]}
            </li>
          ) : null}
        </ul>
      ) : null}
      {times.length > 1 ? (
        <div className="mt-2.5">
          <p className="mb-1.5 text-xs font-semibold text-ink-muted">Departure</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Departure times for ${variant.label}`}>
            {times.map((time) => (
              <button
                key={time}
                type="button"
                className="min-h-9 rounded-lg border border-[#E8EBF0] px-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-[#0758CB] hover:text-[#0758CB]"
                onClick={() => (onChooseTime ? onChooseTime(variant, time) : onChoose(variant))}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {priced && priced.facts.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-sm font-semibold text-[#0758CB]"
            aria-expanded={pricesOpen}
            onClick={() => setPricesOpen((open) => !open)}
          >
            {pricesOpen ? 'Hide price details' : 'Price details'}
          </button>
          {pricesOpen ? (
            <dl className="mt-2 space-y-1">
              {priced.facts.map((fact) => (
                <div key={`${fact.label}-${fact.amountLabel}`} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="font-medium text-ink">
                    {fact.label}
                    {fact.ages ? <span className="font-normal text-ink-muted"> · {fact.ages}</span> : null}
                  </dt>
                  <dd className="shrink-0 font-semibold tabular-nums text-ink">{fact.amountLabel}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {hideCatalogPrice ? (
            <p className="text-sm font-semibold text-[#111827]">Price unavailable</p>
          ) : priceLabel ? (
            <>
              {discounted && offer ? (
                <p className="text-xs font-medium text-ink-muted line-through tabular-nums">
                  {unit?.basis === 'from' ? `From ${formatMoney(offer.originalPrice, currency)}` : formatMoney(offer.originalPrice, currency)}
                </p>
              ) : null}
              <p className={`text-lg font-bold leading-none tabular-nums ${discounted ? 'text-[#B42318]' : 'text-[#111827]'}`}>
                {priceLabel}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {unit && unit.basis !== 'from' ? (
                  <span className="text-xs text-ink-muted">{unit.basis === 'for your group' ? 'For your group' : 'Per person'}</span>
                ) : null}
                {discounted && offer?.label ? (
                  <span className="rounded bg-[#FDECEC] px-1.5 py-0.5 text-[11px] font-semibold text-[#B42318]">
                    {offer.label}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <button
          type="button"
          data-tour-option-cta="choose"
          onClick={() => onChoose(variant)}
          aria-pressed={selected}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors duration-200 ${
            selected
              ? 'bg-[#0758CB] text-white'
              : 'border border-[#0758CB] bg-white text-[#0758CB] hover:bg-[#EAF2FF]'
          }`}
        >
          {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>
    </article>
  );
}
