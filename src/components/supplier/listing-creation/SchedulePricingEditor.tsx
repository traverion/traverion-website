import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  ListingBookingOption,
  ListingPriceCategory,
  ListingPriceCategoryKind,
} from '../../../types/listingExtras';
import {
  createPriceCategory,
  defaultAgeDependentCategories,
  formatPriceCategoryAgeRange,
  PRICE_CATEGORY_KIND_PRESETS,
} from '../../../lib/price-categories';
import {
  previewSupplierEarningsFromGross,
  SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS,
} from '../../../lib/supplier-pricing-preview';
import { formatBpsAsPercent } from '../../../lib/commercial-money';

function patchCategory(
  cats: ListingPriceCategory[],
  id: string,
  patch: Partial<ListingPriceCategory>
): ListingPriceCategory[] {
  return cats.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

function parsePriceInput(raw: string): number {
  if (raw.trim() === '') return 0;
  return Math.max(0, Number(raw) || 0);
}

function earningsLabel(gross: number, formatAmount: (n: number) => string): string {
  const preview = previewSupplierEarningsFromGross(gross);
  return preview ? formatAmount(preview.supplierMajor) : '—';
}

/**
 * Compact schedule Pricing step — editorial layout, no overlaid currency prefixes.
 */
export function SchedulePricingEditor({
  option,
  currencyLabel,
  formatAmount,
  onChange,
  groupPricing,
}: {
  option: ListingBookingOption;
  currencyLabel: string;
  formatAmount: (n: number) => string;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  groupPricing: boolean;
}) {
  const pricingMode = option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
  const categories = option.priceCategories ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const commissionPct = formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS);

  const setPricingMode = (mode: 'uniform' | 'age_dependent') => {
    if (mode === 'age_dependent') {
      const seed =
        categories.length > 0
          ? categories
          : defaultAgeDependentCategories(option.priceUsd > 0 ? option.priceUsd : 0, 0);
      onChange({ pricingMode: 'age_dependent', priceCategories: seed });
      return;
    }
    onChange({ pricingMode: 'uniform' });
  };

  const addCategory = (kind: ListingPriceCategoryKind) => {
    const preset = PRICE_CATEGORY_KIND_PRESETS.find((p) => p.kind === kind);
    const next = createPriceCategory({
      kind,
      label: preset?.label ?? 'Participant',
      ageMin: preset?.ageMin ?? null,
      ageMax: preset?.ageMax ?? null,
      priceUsd: 0,
      requiresAdult: kind === 'child' || kind === 'infant',
    });
    onChange({
      pricingMode: 'age_dependent',
      priceCategories: [...categories, next].slice(0, 8),
    });
    setExpandedId(next.id);
  };

  if (groupPricing) {
    const gross = option.privateGroupPriceUsd || option.priceUsd || 0;
    return (
      <div id="supplier-listing-field-price" className="max-w-md space-y-5">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          One price for the whole party. You receive is after {commissionPct} Traverion commission.
        </p>
        <PriceEarnRow
          id="booking-option-group-price"
          currencyLabel={currencyLabel}
          value={gross}
          formatAmount={formatAmount}
          onChange={(n) => onChange({ privateGroupPriceUsd: n, priceUsd: n })}
        />
      </div>
    );
  }

  return (
    <div id="supplier-listing-field-price" className="max-w-xl space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" role="radiogroup" aria-label="Pricing model">
        {(
          [
            { value: 'uniform' as const, title: 'Same price for everyone' },
            { value: 'age_dependent' as const, title: 'Age-based' },
          ] as const
        ).map((row) => {
          const selected = pricingMode === row.value;
          return (
            <button
              key={row.value}
              type="button"
              onClick={() => setPricingMode(row.value)}
              className={`border-b-2 pb-1 text-[13.5px] transition-colors ${
                selected
                  ? 'border-finland font-semibold text-ink'
                  : 'border-transparent font-medium text-ink-muted hover:text-ink'
              }`}
              aria-pressed={selected}
            >
              {row.title}
            </button>
          );
        })}
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Traveler price before commission. You receive is after {commissionPct} Traverion commission.
      </p>

      {pricingMode === 'uniform' ? (
        <PriceEarnRow
          id="booking-option-unit-price"
          currencyLabel={currencyLabel}
          value={option.priceUsd || 0}
          formatAmount={formatAmount}
          onChange={(n) => onChange({ priceUsd: n })}
        />
      ) : (
        <div className="space-y-0">
          <ul className="divide-y divide-black/[0.08]">
            {categories.map((c) => {
              const expanded = expandedId === c.id;
              return (
                <li key={c.id} className="py-5 first:pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold tracking-tight text-ink">
                        {c.label || 'Category'}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">
                        {formatPriceCategoryAgeRange(c) || 'Age range not set'}
                        {c.requiresAdult ? ' · Needs an adult' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center -mr-1">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Close details' : `Edit ${c.label || 'category'}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({ priceCategories: categories.filter((x) => x.id !== c.id) })
                        }
                        className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove ${c.label || 'category'}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <PriceEarnRow
                      id={`sch-cat-price-${c.id}`}
                      currencyLabel={currencyLabel}
                      value={c.priceUsd}
                      formatAmount={formatAmount}
                      ariaLabel={`Customer price for ${c.label || 'category'}`}
                      onChange={(n) =>
                        onChange({
                          priceCategories: patchCategory(categories, c.id, { priceUsd: n }),
                        })
                      }
                    />
                  </div>

                  {expanded ? (
                    <div className="mt-4 grid max-w-sm grid-cols-2 gap-3 border-t border-black/[0.06] pt-4">
                      <div className="col-span-2">
                        <label
                          htmlFor={`sch-cat-label-${c.id}`}
                          className="mb-1 block text-[12px] font-medium text-ink-muted"
                        >
                          Name
                        </label>
                        <input
                          id={`sch-cat-label-${c.id}`}
                          type="text"
                          value={c.label}
                          onChange={(e) =>
                            onChange({
                              priceCategories: patchCategory(categories, c.id, {
                                label: e.target.value,
                              }),
                            })
                          }
                          className="tv-input !min-h-9"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`sch-cat-age-from-${c.id}`}
                          className="mb-1 block text-[12px] font-medium text-ink-muted"
                        >
                          Age from
                        </label>
                        <input
                          id={`sch-cat-age-from-${c.id}`}
                          type="number"
                          min={0}
                          max={120}
                          value={c.ageMin ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            onChange({
                              priceCategories: patchCategory(categories, c.id, {
                                ageMin: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)),
                              }),
                            });
                          }}
                          className="tv-input !min-h-9"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`sch-cat-age-to-${c.id}`}
                          className="mb-1 block text-[12px] font-medium text-ink-muted"
                        >
                          Age to
                        </label>
                        <input
                          id={`sch-cat-age-to-${c.id}`}
                          type="number"
                          min={0}
                          max={120}
                          value={c.ageMax ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            onChange({
                              priceCategories: patchCategory(categories, c.id, {
                                ageMax: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)),
                              }),
                            });
                          }}
                          className="tv-input !min-h-9"
                        />
                      </div>
                      {(c.kind === 'child' || c.kind === 'infant') && (
                        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            checked={Boolean(c.requiresAdult)}
                            onChange={(e) =>
                              onChange({
                                priceCategories: patchCategory(categories, c.id, {
                                  requiresAdult: e.target.checked,
                                }),
                              })
                            }
                            className="rounded border-black/20 text-finland focus:ring-finland"
                          />
                          Must be accompanied by an adult
                        </label>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-black/[0.08] pt-4">
            {PRICE_CATEGORY_KIND_PRESETS.filter(
              (p) => !categories.some((c) => c.kind === p.kind && c.kind !== 'participant')
            ).map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => addCategory(p.kind)}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-finland hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Customer price input + You receive — currency lives in the label, never overlaid on the field. */
function PriceEarnRow({
  id,
  currencyLabel,
  value,
  onChange,
  formatAmount,
  ariaLabel,
}: {
  id: string;
  currencyLabel: string;
  value: number;
  onChange: (n: number) => void;
  formatAmount: (n: number) => string;
  ariaLabel?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-end sm:gap-10">
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-ink-muted">
          Customer price ({currencyLabel})
        </label>
        <input
          id={id}
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          aria-label={ariaLabel}
          value={value > 0 ? value : ''}
          onChange={(e) => onChange(parsePriceInput(e.target.value))}
          className="tv-input !min-h-10 w-full max-w-[11rem] tabular-nums"
        />
      </div>
      <div className="sm:pb-1.5">
        <p className="mb-1.5 text-[12px] font-medium text-ink-muted">You receive</p>
        <p className="text-[1.125rem] font-semibold tabular-nums tracking-tight text-ink">
          {earningsLabel(value, formatAmount)}
        </p>
      </div>
    </div>
  );
}
