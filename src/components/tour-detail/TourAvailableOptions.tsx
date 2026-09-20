import { Check } from 'lucide-react';
import type { TourBookingVariant } from '../../lib/booking-flow';
import {
  formatTourAvailabilityHeading,
  optionMetaParts,
  type TourOptionAvailabilityKind,
} from '../../lib/tour-available-options';
import { optionUsesAgePricing, optionUsesPrivateFlatPrice } from '../../lib/participant-mix';
import { summarizeOptionPricing } from '../../lib/price-categories';
import { formatMoney } from '../../lib/money';
import NoticeCallout from '../NoticeCallout';

type Props = {
  date: string;
  kind: TourOptionAvailabilityKind;
  available: TourBookingVariant[];
  selectedId: string | null;
  guestsLabel: string;
  currency: string;
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
            compact
            onChoose={onChoose}
          />
        </div>
      ) : null}

      {kind === 'many' ? (
        <ul className="mt-4 divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {available.map((variant) => (
            <li key={variant.id}>
              <OptionRow
                variant={variant}
                selected={selectedId === variant.id}
                currency={currency}
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
  compact,
  onChoose,
}: {
  variant: TourBookingVariant;
  selected: boolean;
  currency: string;
  compact?: boolean;
  onChoose: (variant: TourBookingVariant) => void;
}) {
  const opt = variant.listingOption;
  const meta = optionMetaParts(variant);
  const priceLine = optionUsesAgePricing(opt)
    ? summarizeOptionPricing(opt!, (n) => formatMoney(n, currency))
    : `${formatMoney(variant.pricePerPerson, currency)} ${
        optionUsesPrivateFlatPrice(opt) ? 'private group' : 'per person'
      }`;
  return (
    <div
      className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 ${
        compact ? 'rounded-xl bg-paper-raised/80 px-4 ring-1 ring-black/[0.05] sm:px-5' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-ink">{variant.label}</p>
        {meta.length > 0 ? <p className="mt-1 text-sm text-ink-muted">{meta.join(' · ')}</p> : null}
        {opt?.optionInfo?.trim() ? (
          <p className="mt-1 text-sm leading-snug text-ink-muted">{opt.optionInfo.trim()}</p>
        ) : variant.subtitle && meta.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">{variant.subtitle}</p>
        ) : null}
        <p className="mt-2 text-sm font-semibold tabular-nums text-ink">{priceLine}</p>
      </div>
      <button
        type="button"
        onClick={() => onChoose(variant)}
        aria-pressed={selected}
        className={
          selected
            ? 'tv-btn-secondary min-h-11 shrink-0 self-start'
            : 'tv-btn-primary min-h-11 shrink-0 self-start'
        }
      >
        {selected ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" aria-hidden />
            Selected
          </span>
        ) : (
          'Choose'
        )}
      </button>
    </div>
  );
}
