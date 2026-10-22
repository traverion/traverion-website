import { useState } from 'react';
import { Check, Clock, MapPin, Users } from 'lucide-react';
import type { ListingDiscount } from '../../data/supabase-discounts';
import type { TourPackage } from '../../types/tour';
import type { ListingBookingOption } from '../../types/listingExtras';
import type { TourBookingVariant } from '../../lib/booking-flow';
import {
  formatTourAvailabilityHeading,
  optionMetaParts,
  type TourOptionAvailabilityKind,
} from '../../lib/tour-available-options';
import { optionUsesAgePricing, type ParticipantMixSelection } from '../../lib/participant-mix';
import { travelerOptionPriceFacts } from '../../lib/price-categories';
import { formatMoney } from '../../lib/money';
import { departureTimesOnDate, FLEXIBLE_DEPARTURE_HM } from '../../lib/listing-option-schedules';
import { optionCardPriceForSelection } from '../../lib/tour-option-card-price';
import NoticeCallout from '../NoticeCallout';

type Props = {
  tour: TourPackage;
  date: string;
  kind: TourOptionAvailabilityKind;
  available: TourBookingVariant[];
  selectedId: string | null;
  selectedDepartureTime?: string;
  guestsLabel: string;
  guests: number;
  participantMix: ParticipantMixSelection | null;
  /** Option that owns current mix category ids — remapped per card for comparison pricing. */
  mixSourceOption?: ListingBookingOption | null;
  todayIso: string;
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
  tour,
  date,
  kind,
  available,
  selectedId,
  selectedDepartureTime = '',
  guestsLabel,
  guests,
  participantMix,
  mixSourceOption = null,
  todayIso,
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
          <h2 id="tour-availability-heading" className="tv-section-heading">
            {kind === 'none' ? 'No availability' : 'Available options'}
          </h2>
          {kind !== 'none' ? (
            <p className="mt-1 text-sm text-ink-muted">
              <span className="font-medium text-ink">{headingDate}</span>
              <span aria-hidden> · </span>
              <span>{guestsLabel}</span>
              {onChangeGuests ? (
                <>
                  {' · '}
                  <button type="button" className="font-semibold text-finland hover:underline" onClick={onChangeGuests}>
                    Change participants
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
            tour={tour}
            variant={available[0]}
            selected={selectedId === available[0].id}
            selectedId={selectedId}
            selectedDepartureTime={selectedDepartureTime}
            currency={currency}
            discounts={discounts}
            guests={guests}
            participantMix={participantMix}
            mixSourceOption={mixSourceOption}
            todayIso={todayIso}
            hideCatalogPrice={hideSelectedCatalogPrice && selectedId === available[0].id}
            onChoose={onChoose}
            onChooseTime={onChooseTime}
            date={date}
          />
        </div>
      ) : null}

      {kind === 'many' ? (
        <ul className="mt-4 grid gap-2.5">
          {available.map((variant) => (
            <li key={variant.id}>
              <OptionRow
                tour={tour}
                variant={variant}
                selected={selectedId === variant.id}
                selectedId={selectedId}
                selectedDepartureTime={selectedDepartureTime}
                currency={currency}
                discounts={discounts}
                guests={guests}
                participantMix={participantMix}
                mixSourceOption={mixSourceOption}
                todayIso={todayIso}
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

function metaIcon(part: string) {
  if (/guest|private/i.test(part)) return Users;
  if (/hour|min|day/i.test(part)) return Clock;
  if (/pickup|meet/i.test(part)) return MapPin;
  return null;
}

function OptionRow({
  tour,
  variant,
  selected,
  selectedId,
  selectedDepartureTime,
  currency,
  discounts,
  guests,
  participantMix,
  mixSourceOption,
  todayIso,
  hideCatalogPrice,
  date,
  onChoose,
  onChooseTime,
}: {
  tour: TourPackage;
  variant: TourBookingVariant;
  selected: boolean;
  selectedId: string | null;
  selectedDepartureTime: string;
  currency: string;
  discounts: ListingDiscount[];
  guests: number;
  participantMix: ParticipantMixSelection | null;
  mixSourceOption: ListingBookingOption | null;
  todayIso: string;
  hideCatalogPrice?: boolean;
  date: string;
  onChoose: (variant: TourBookingVariant) => void;
  onChooseTime?: (variant: TourBookingVariant, time: string) => void;
}) {
  const opt = variant.listingOption;
  const meta = optionMetaParts(variant).filter((part) => !part.startsWith('Starts '));
  const detail = opt?.optionInfo?.trim() || '';
  const detailLong = detail.length > 120;
  const [detailOpen, setDetailOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const times = opt
    ? departureTimesOnDate(opt, date).filter((time) => time && time !== FLEXIBLE_DEPARTURE_HM)
    : [];
  const price = optionCardPriceForSelection({
    tour,
    variant,
    bookingDate: date,
    discounts,
    guests,
    participantMix,
    todayIso,
    selectedId,
    selectedDepartureTime,
    mixSourceOption: mixSourceOption ?? null,
    hidePrice: hideCatalogPrice,
  });
  const categoryFacts =
    !hideCatalogPrice && opt && optionUsesAgePricing(opt)
      ? travelerOptionPriceFacts(opt, (n) => formatMoney(n, currency))
      : null;
  const discounted = Boolean(price.discountLabel) && price.originalTotal != null && price.total != null;
  return (
    <article
      className={`tv-tour-option-card flex flex-col px-3.5 py-3 transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none ${
        selected
          ? 'tv-tour-option-card--selected'
          : 'tv-tour-option-card--idle'
      }`}
    >
      <h3 className="min-w-0 text-[0.9375rem] font-bold leading-snug tracking-tight text-[#111827] break-words [overflow-wrap:anywhere]">
        {variant.label}
      </h3>
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
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {meta.map((part) => {
            const Icon = metaIcon(part);
            return (
              <li key={part} className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink">
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden /> : null}
                <span className="break-words">{part}</span>
              </li>
            );
          })}
          {times.length === 1 ? (
            <li className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Clock className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden />
              Departs {times[0]}
            </li>
          ) : null}
        </ul>
      ) : null}
      {times.length > 1 ? (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-faint">Departure</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Departure times for ${variant.label}`}>
            {times.map((time) => {
              const timeSelected = selected && selectedDepartureTime === time;
              return (
                <button
                  key={time}
                  type="button"
                  className={`min-h-9 rounded-lg px-2.5 text-sm font-semibold transition-colors duration-150 ${
                    timeSelected
                      ? 'border border-[#0758CB] bg-[#0758CB] text-white'
                      : 'border border-[#E8EBF0] bg-white text-ink hover:border-[#0758CB] hover:text-[#0758CB]'
                  }`}
                  onClick={() => (onChooseTime ? onChooseTime(variant, time) : onChoose(variant))}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {categoryFacts && categoryFacts.facts.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="text-xs font-semibold text-[#0758CB]"
            aria-expanded={pricesOpen}
            onClick={() => setPricesOpen((open) => !open)}
          >
            {pricesOpen ? 'Hide age prices' : 'Age prices'}
          </button>
          {pricesOpen ? (
            <dl className="mt-1.5 space-y-1">
              {categoryFacts.facts.map((fact) => (
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
      <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-black/[0.05] pt-2.5">
        <div className="min-w-0">
          {price.mode === 'unavailable' || price.total == null ? (
            <p className="text-sm font-semibold text-[#111827]">Price unavailable</p>
          ) : (
            <>
              {discounted && price.originalTotal != null ? (
                <p className="text-xs font-medium text-ink-muted line-through tabular-nums">
                  {price.mode === 'from' ? `From ${formatMoney(price.originalTotal, currency)}` : formatMoney(price.originalTotal, currency)}
                </p>
              ) : null}
              <p className="text-[1.125rem] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {price.mode === 'from' ? `From ${formatMoney(price.total, currency)}` : formatMoney(price.total, currency)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-muted">{price.caption}</span>
                {discounted && price.discountLabel ? (
                  <span className="rounded-md bg-[#F8EFEA] px-1.5 py-0.5 text-[11px] font-semibold text-[#9A3412]">
                    {price.discountLabel}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          data-tour-option-cta="choose"
          onClick={() => onChoose(variant)}
          aria-pressed={selected}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0758CB]/35 ${
            selected
              ? 'bg-[#0758CB] text-white'
              : 'border border-[#0758CB] bg-white text-[#0758CB] hover:bg-[#F3F7FD]'
          }`}
        >
          {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>
    </article>
  );
}
