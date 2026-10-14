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

/**
 * Compact schedule Pricing step — category sections with customer / commission / payout.
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
      <div id="supplier-listing-field-price" className="max-w-2xl space-y-4">
        <article className="lc-pricing-category rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-white p-4 sm:p-5">
          <header className="mb-4">
            <h4 className="text-[16px] font-semibold tracking-tight text-ink">Whole group</h4>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              One price for the party · after {commissionPct} commission
            </p>
          </header>
          <PriceEarnRow
            id="booking-option-group-price"
            currencyLabel={currencyLabel}
            value={gross}
            formatAmount={formatAmount}
            commissionPct={commissionPct}
            onChange={(n) => onChange({ privateGroupPriceUsd: n, priceUsd: n })}
          />
        </article>
      </div>
    );
  }

  const addableKinds = PRICE_CATEGORY_KIND_PRESETS.filter(
    (p) => !categories.some((c) => c.kind === p.kind && c.kind !== 'participant')
  );

  return (
    <div id="supplier-listing-field-price" className="max-w-2xl space-y-5">
      <div
        className="inline-flex w-full max-w-md rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-[var(--lc-surface-subtle,#fafafb)] p-1 sm:w-auto"
        role="radiogroup"
        aria-label="Pricing model"
      >
        {(
          [
            { value: 'uniform' as const, title: 'Same price for everyone' },
            { value: 'age_dependent' as const, title: 'Age-based pricing' },
          ] as const
        ).map((row) => {
          const selected = pricingMode === row.value;
          return (
            <button
              key={row.value}
              type="button"
              onClick={() => setPricingMode(row.value)}
              className={`min-h-10 flex-1 rounded-lg px-3.5 text-[13px] transition-colors sm:flex-none sm:px-4 ${
                selected
                  ? 'bg-white font-semibold text-ink shadow-sm ring-1 ring-black/[0.06]'
                  : 'font-medium text-ink-muted hover:text-ink'
              }`}
              aria-pressed={selected}
            >
              {row.title}
            </button>
          );
        })}
      </div>

      {pricingMode === 'uniform' ? (
        <article className="lc-pricing-category rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-white p-4 sm:p-5">
          <header className="mb-4">
            <h4 className="text-[16px] font-semibold tracking-tight text-ink">Per person</h4>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Same traveler price · {commissionPct} Traverion commission
            </p>
          </header>
          <PriceEarnRow
            id="booking-option-unit-price"
            currencyLabel={currencyLabel}
            value={option.priceUsd || 0}
            formatAmount={formatAmount}
            commissionPct={commissionPct}
            onChange={(n) => onChange({ priceUsd: n })}
          />
        </article>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <article
                key={c.id}
                className="lc-pricing-category rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-white p-4 sm:p-5"
              >
                <header className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-[16px] font-semibold tracking-tight text-ink">
                      {c.label || 'Category'}
                    </h4>
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
                </header>

                <PriceEarnRow
                  id={`sch-cat-price-${c.id}`}
                  currencyLabel={currencyLabel}
                  value={c.priceUsd}
                  formatAmount={formatAmount}
                  commissionPct={commissionPct}
                  ariaLabel={`Customer price for ${c.label || 'category'}`}
                  onChange={(n) =>
                    onChange({
                      priceCategories: patchCategory(categories, c.id, { priceUsd: n }),
                    })
                  }
                />

                {expanded ? (
                  <div className="mt-4 grid max-w-sm grid-cols-2 gap-3 border-t border-[var(--lc-line,#E5E7EB)] pt-4">
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
              </article>
            );
          })}

          {addableKinds.length > 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--lc-line,#E5E7EB)] bg-[var(--lc-surface-subtle,#fafafb)] px-4 py-3.5">
              <p className="mb-2.5 text-[12px] font-medium text-ink-muted">Add a category</p>
              <div className="flex flex-wrap gap-2">
                {addableKinds.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => addCategory(p.kind)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--lc-line,#E5E7EB)] bg-white px-3 text-[13px] font-medium text-ink hover:border-finland/40 hover:text-finland"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Customer price → commission → payout. Currency in labels; editable field has no overlay. */
function PriceEarnRow({
  id,
  currencyLabel,
  value,
  onChange,
  formatAmount,
  commissionPct,
  ariaLabel,
}: {
  id: string;
  currencyLabel: string;
  value: number;
  onChange: (n: number) => void;
  formatAmount: (n: number) => string;
  commissionPct: string;
  ariaLabel?: string;
}) {
  const preview = previewSupplierEarningsFromGross(value);
  const commissionLabel = preview ? `−${formatAmount(preview.commissionMajor)}` : '—';
  const earnLabel = preview ? formatAmount(preview.supplierMajor) : '—';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.05fr)] sm:items-end sm:gap-x-3 sm:gap-y-0">
      <div className="min-w-0">
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
          className="tv-input !min-h-11 w-full max-w-[12rem] text-[1.125rem] font-semibold tabular-nums tracking-tight"
        />
      </div>

      <span
        className="hidden pb-3 text-[14px] text-ink-faint sm:block"
        aria-hidden
      >
        →
      </span>

      <div className="min-w-0 sm:pb-1">
        <p className="mb-1.5 text-[12px] font-medium text-ink-muted">
          Commission ({commissionPct})
        </p>
        <p className="text-[1.05rem] font-medium tabular-nums tracking-tight text-ink-muted">
          {commissionLabel}
        </p>
      </div>

      <span
        className="hidden pb-3 text-[14px] text-ink-faint sm:block"
        aria-hidden
      >
        →
      </span>

      <div className="min-w-0 border-t border-[var(--lc-line,#E5E7EB)] pt-3 sm:border-t-0 sm:pb-1 sm:pt-0">
        <p className="mb-1.5 text-[12px] font-medium text-ink-muted">You receive</p>
        <p className="text-[1.2rem] font-semibold tabular-nums tracking-tight text-ink">
          {earnLabel}
        </p>
      </div>
    </div>
  );
}
