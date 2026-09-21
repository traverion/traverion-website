import { Check } from 'lucide-react';
import type { ListingBookingOption } from '../../../types/listingExtras';
import type { TourOptionConfigPanel } from '../../../lib/listing-option-progression';
import {
  isOptionAvailabilityConfigured,
  isOptionCapacityConfigured,
  isOptionPricingConfigured,
  summarizeOptionAvailability,
  summarizeOptionCapacity,
  summarizeOptionChargeModel,
} from '../../../lib/listing-option-progression';
import { summarizeOptionPricing } from '../../../lib/price-categories';

export function TourOptionAvailabilityPricingSummary({
  option,
  currencyLabel,
  formatAmount,
  onConfigure,
}: {
  option: ListingBookingOption;
  currencyLabel: string;
  formatAmount: (n: number) => string;
  onConfigure: (panel: TourOptionConfigPanel) => void;
}) {
  const rows: Array<{
    id: TourOptionConfigPanel;
    title: string;
    ready: boolean;
    detail: string;
    hint: string;
  }> = [
    {
      id: 'availability',
      title: 'Availability',
      ready: isOptionAvailabilityConfigured(option),
      detail: summarizeOptionAvailability(option),
      hint: 'Set operating dates, weekdays, and start time',
    },
    {
      id: 'pricing',
      title: 'Pricing',
      ready: isOptionPricingConfigured(option),
      detail: isOptionPricingConfigured(option)
        ? `${summarizeOptionChargeModel(option)} · ${summarizeOptionPricing(option, formatAmount)}`
        : 'Not configured',
      hint: `Set how customers are charged (${currencyLabel})`,
    },
    {
      id: 'capacity',
      title: 'Capacity',
      ready: isOptionCapacityConfigured(option),
      detail: summarizeOptionCapacity(option),
      hint: 'Set booking limits for this option',
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="lc-tile flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-ink">{row.title}</p>
              {row.ready ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  Ready
                </span>
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Not configured
                </span>
              )}
            </div>
            <p className="text-sm text-ink">{row.ready ? row.detail : row.hint}</p>
            {row.ready ? <p className="text-xs text-ink-muted">{row.hint}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onConfigure(row.id)}
            className="tv-btn-secondary !min-h-11 shrink-0"
          >
            {row.ready ? 'Edit' : 'Configure'}
          </button>
        </div>
      ))}
    </div>
  );
}
