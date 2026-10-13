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

function CustomerPriceInput({
  id,
  currencyLabel,
  value,
  onChange,
  ariaLabel,
}: {
  id: string;
  currencyLabel: string;
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[12px] text-ink-muted">
        {currencyLabel}
      </span>
      <input
        id={id}
        type="number"
        min={0}
        step={0.01}
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value > 0 ? value : ''}
        onChange={(e) => onChange(parsePriceInput(e.target.value))}
        className="tv-input !min-h-10 w-full pl-12 tabular-nums"
      />
    </div>
  );
}

function YouReceiveValue({
  gross,
  formatAmount,
}: {
  gross: number;
  formatAmount: (n: number) => string;
}) {
  const preview = previewSupplierEarningsFromGross(gross);
  return (
    <p className="flex min-h-10 items-center text-[15px] font-semibold tabular-nums tracking-tight text-ink">
      {preview ? formatAmount(preview.supplierMajor) : '—'}
    </p>
  );
}

function GrossNetPair({
  id,
  currencyLabel,
  value,
  onChange,
  formatAmount,
}: {
  id: string;
  currencyLabel: string;
  value: number;
  onChange: (n: number) => void;
  formatAmount: (n: number) => string;
}) {
  return (
    <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-ink">
          Customer price
        </label>
        <CustomerPriceInput
          id={id}
          currencyLabel={currencyLabel}
          value={value}
          onChange={onChange}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-ink">You receive</p>
        <YouReceiveValue gross={value} formatAmount={formatAmount} />
        <p className="mt-1 text-[11px] leading-snug text-ink-muted">
          After {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} commission
        </p>
      </div>
    </div>
  );
}

/**
 * Compact schedule Pricing step: uniform / age-based / whole-group with live 15% earnings preview.
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
      <div id="supplier-listing-field-price" className="space-y-4">
        <p className="text-[12.5px] leading-snug text-ink-muted">
          One price for the whole party. You receive is after{' '}
          {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} Traverion commission.
        </p>
        <GrossNetPair
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
    <div id="supplier-listing-field-price" className="space-y-5">
      <div
        className="inline-flex rounded-lg border border-black/[0.1] p-0.5"
        role="radiogroup"
        aria-label="Pricing model"
      >
        {(
          [
            { value: 'uniform' as const, title: 'Same price' },
            { value: 'age_dependent' as const, title: 'Age-based' },
          ] as const
        ).map((row) => {
          const selected = pricingMode === row.value;
          return (
            <button
              key={row.value}
              type="button"
              onClick={() => setPricingMode(row.value)}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                selected
                  ? 'bg-finland text-white'
                  : 'text-ink-muted hover:bg-black/[0.03] hover:text-ink'
              }`}
              aria-pressed={selected}
            >
              {row.title}
            </button>
          );
        })}
      </div>

      <p className="text-[12px] leading-snug text-ink-muted">
        Customer price is what travelers pay. You receive is after{' '}
        {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} Traverion commission.
      </p>

      {pricingMode === 'uniform' ? (
        <GrossNetPair
          id="booking-option-unit-price"
          currencyLabel={currencyLabel}
          value={option.priceUsd || 0}
          formatAmount={formatAmount}
          onChange={(n) => onChange({ priceUsd: n })}
        />
      ) : (
        <div className="space-y-2.5">
          <ul className="divide-y divide-black/[0.07] rounded-lg border border-black/[0.08] bg-white">
            {categories.map((c) => {
              const expanded = expandedId === c.id;
              return (
                <li key={c.id} className="px-3.5 py-3 sm:px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold tracking-tight text-ink">
                        {c.label || 'Category'}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {formatPriceCategoryAgeRange(c) || 'Age range not set'}
                        {c.requiresAdult ? ' · Adult required' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                        aria-expanded={expanded}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({ priceCategories: categories.filter((x) => x.id !== c.id) })
                        }
                        className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove ${c.label || 'category'}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 sm:max-w-md">
                    <div>
                      <label
                        htmlFor={`sch-cat-price-${c.id}`}
                        className="mb-1.5 block text-[12px] font-semibold text-ink"
                      >
                        Customer price
                      </label>
                      <CustomerPriceInput
                        id={`sch-cat-price-${c.id}`}
                        currencyLabel={currencyLabel}
                        value={c.priceUsd}
                        ariaLabel={`Customer price for ${c.label || 'category'}`}
                        onChange={(n) =>
                          onChange({
                            priceCategories: patchCategory(categories, c.id, { priceUsd: n }),
                          })
                        }
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[12px] font-semibold text-ink">You receive</p>
                      <YouReceiveValue gross={c.priceUsd} formatAmount={formatAmount} />
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-3 grid max-w-md grid-cols-2 gap-2.5 border-t border-black/[0.06] pt-3">
                      <div className="col-span-2">
                        <label
                          htmlFor={`sch-cat-label-${c.id}`}
                          className="mb-1 block text-[11.5px] font-medium text-ink-muted"
                        >
                          Category name
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
                          className="mb-1 block text-[11.5px] font-medium text-ink-muted"
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
                          className="mb-1 block text-[11.5px] font-medium text-ink-muted"
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
                        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12px] text-ink">
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

          <div className="flex flex-wrap gap-1">
            {PRICE_CATEGORY_KIND_PRESETS.filter(
              (p) => !categories.some((c) => c.kind === p.kind && c.kind !== 'participant')
            ).map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => addCategory(p.kind)}
                className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[12px] font-semibold text-finland hover:bg-finland/[0.06]"
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
