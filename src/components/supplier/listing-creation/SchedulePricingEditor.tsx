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
  formatSupplierEarningsPreview,
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

function GrossNetPriceFields({
  id,
  label,
  currencyLabel,
  value,
  onChange,
  formatAmount,
}: {
  id: string;
  label: string;
  currencyLabel: string;
  value: number;
  onChange: (n: number) => void;
  formatAmount: (n: number) => string;
}) {
  const preview = previewSupplierEarningsFromGross(value);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
      <div>
        <label htmlFor={id} className="mb-1 block text-[12.5px] font-semibold text-ink">
          {label} ({currencyLabel}) *
        </label>
        <input
          id={id}
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={value > 0 ? value : ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === '') {
              onChange(0);
              return;
            }
            onChange(Math.max(0, Number(raw) || 0));
          }}
          className="tv-input w-full"
        />
        <p className="mt-1 text-[11px] text-ink-muted">Customer price (gross)</p>
      </div>
      <div>
        <p className="mb-1 text-[12.5px] font-semibold text-ink">You receive</p>
        <p className="flex min-h-10 items-center rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 text-[14px] font-medium tabular-nums text-ink">
          {preview ? formatAmount(preview.supplierMajor) : '—'}
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          After {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} Traverion commission
          {preview ? ` (${formatAmount(preview.commissionMajor)})` : ''}
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
      <div id="supplier-listing-field-price" className="space-y-3">
        <p className="text-[13px] font-medium text-ink">Whole-group price</p>
        <p className="text-[12px] text-ink-muted">
          One customer price for the entire party. Estimated earnings use the standard{' '}
          {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} Traverion commission.
        </p>
        <GrossNetPriceFields
          id="booking-option-group-price"
          label="Customer price"
          currencyLabel={currencyLabel}
          value={gross}
          formatAmount={formatAmount}
          onChange={(n) => onChange({ privateGroupPriceUsd: n, priceUsd: n })}
        />
      </div>
    );
  }

  return (
    <div id="supplier-listing-field-price" className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            { value: 'uniform' as const, title: 'Same price for everyone', hint: 'One per-person price' },
            { value: 'age_dependent' as const, title: 'Age-based pricing', hint: 'Adult, Child, Youth…' },
          ] as const
        ).map((row) => {
          const selected = pricingMode === row.value;
          return (
            <button
              key={row.value}
              type="button"
              onClick={() => setPricingMode(row.value)}
              className={`lc-choice rounded-lg px-3 py-2.5 text-left ${selected ? 'lc-choice--selected' : ''}`}
              aria-pressed={selected}
            >
              <span className="block text-[13px] font-semibold text-ink">{row.title}</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-muted">{row.hint}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11.5px] text-ink-muted">
        Customer price is what travelers pay. You receive is estimated after{' '}
        {formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS)} Traverion commission (before
        taxes or other adjustments).
      </p>

      {pricingMode === 'uniform' ? (
        <GrossNetPriceFields
          id="booking-option-unit-price"
          label="Customer price"
          currencyLabel={currencyLabel}
          value={option.priceUsd || 0}
          formatAmount={formatAmount}
          onChange={(n) => onChange({ priceUsd: n })}
        />
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted sm:grid">
            <span>Category</span>
            <span>Age range</span>
            <span>Customer price</span>
            <span>You receive</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-black/[0.08] rounded-lg border border-black/[0.08] bg-white">
            {categories.map((c) => {
              const expanded = expandedId === c.id;
              return (
                <li key={c.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]">
                    <p className="truncate text-[13px] font-semibold text-ink">{c.label || 'Category'}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {formatPriceCategoryAgeRange(c) || 'Not set'}
                      {c.requiresAdult ? ' · Adult required' : ''}
                    </p>
                    <div>
                      <label className="sr-only" htmlFor={`sch-cat-price-${c.id}`}>
                        Customer price for {c.label}
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[12px] text-ink-muted">{currencyLabel}</span>
                        <input
                          id={`sch-cat-price-${c.id}`}
                          type="number"
                          min={0}
                          step={0.01}
                          inputMode="decimal"
                          value={c.priceUsd > 0 ? c.priceUsd : ''}
                          onChange={(e) =>
                            onChange({
                              priceCategories: patchCategory(categories, c.id, {
                                priceUsd: Math.max(0, Number(e.target.value) || 0),
                              }),
                            })
                          }
                          className="tv-input !min-h-9 w-full"
                        />
                      </div>
                    </div>
                    <p className="text-[13px] font-medium tabular-nums text-ink">
                      {formatSupplierEarningsPreview(c.priceUsd, formatAmount)}
                    </p>
                    <div className="flex items-center gap-0.5 justify-self-end">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                        aria-expanded={expanded}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
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
                  {expanded ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-black/[0.06] pt-2.5 sm:max-w-md">
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
          <div className="flex flex-wrap gap-1.5">
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
                Add {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
