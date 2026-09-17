import { Minus, Plus } from 'lucide-react';
import { formatPriceCategoryAgeRange } from '../../lib/price-categories';
import { formatMoney } from '../../lib/money';
import type { ListingPriceCategory } from '../../types/listingExtras';

export type ParticipantCategoryStepperProps = {
  category: ListingPriceCategory;
  quantity: number;
  currency: string;
  max: number;
  onChange: (quantity: number) => void;
  onBoundaryAttempt?: (message: string) => void;
};

export default function ParticipantCategoryStepper({
  category,
  quantity,
  currency,
  max,
  onChange,
  onBoundaryAttempt,
}: ParticipantCategoryStepperProps) {
  const atMin = quantity <= 0;
  const atMax = quantity >= max;
  const age = formatPriceCategoryAgeRange(category);

  const tryDecrease = () => {
    if (atMin) {
      onBoundaryAttempt?.('Already at zero.');
      return;
    }
    onChange(Math.max(0, quantity - 1));
  };

  const tryIncrease = () => {
    if (atMax) {
      onBoundaryAttempt?.(`No more than ${max} guests for this booking.`);
      return;
    }
    onChange(Math.min(max, quantity + 1));
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-paper-raised px-3 py-3 ring-1 ring-black/[0.06] sm:px-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{category.label}</p>
        <p className="text-xs text-ink-muted mt-0.5">
          {age || 'All ages'}
          {category.requiresAdult ? ' · Needs an adult' : ''}
        </p>
        <p className="text-sm font-medium text-ink tabular-nums mt-1">
          {formatMoney(category.priceUsd, currency)}
          <span className="text-ink-muted font-normal"> each</span>
        </p>
      </div>
      <div
        className="flex overflow-hidden rounded-xl bg-paper shadow-[0_0_0_1px_rgba(28,25,23,0.08)] shrink-0"
        role="group"
        aria-label={`${category.label} quantity`}
      >
        <button
          type="button"
          className="lux-flat flex h-11 w-11 items-center justify-center text-finland hover:bg-finland/5 disabled:opacity-30"
          aria-label={`Decrease ${category.label}`}
          disabled={atMin}
          onClick={tryDecrease}
        >
          <Minus className="h-4 w-4 stroke-[2.5]" aria-hidden />
        </button>
        <div className="flex min-w-[2.75rem] items-center justify-center border-x border-black/[0.06] text-sm font-semibold tabular-nums text-ink">
          {quantity}
        </div>
        <button
          type="button"
          className="lux-flat flex h-11 w-11 items-center justify-center text-finland hover:bg-finland/5 disabled:opacity-30"
          aria-label={`Increase ${category.label}`}
          disabled={atMax}
          onClick={tryIncrease}
        >
          <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden />
        </button>
      </div>
    </div>
  );
}
