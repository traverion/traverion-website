import type { ListingBookingOption, ListingPriceCategory, ListingPriceCategoryKind } from '../../types/listingExtras';
import {
  type BookingOptionDurationUnit,
  formatBookingOptionDuration,
  parseBookingOptionDuration,
} from '../../types/listingExtras';
import {
  createPriceCategory,
  defaultAgeDependentCategories,
  formatPriceCategoryAgeRange,
  PRICE_CATEGORY_KIND_PRESETS,
} from '../../lib/price-categories';
import { Plus, Trash2 } from 'lucide-react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  option: ListingBookingOption;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onChange: (patch: Partial<ListingBookingOption>) => void;
};

function patchCategory(
  cats: ListingPriceCategory[],
  id: string,
  patch: Partial<ListingPriceCategory>
): ListingPriceCategory[] {
  return cats.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export default function BookingOptionEditor({
  option,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onChange,
}: Props) {
  const pricingMode = option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
  const categories = option.priceCategories ?? [];
  const durParts = parseBookingOptionDuration(option.duration);

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
  };

  const removeCategory = (id: string) => {
    onChange({ priceCategories: categories.filter((c) => c.id !== id) });
  };

  return (
    <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8">
      <div className="space-y-5 min-w-0">
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Option</p>
            <h3 className="font-display text-lg text-ink tracking-tight">What travelers choose</h3>
            <p className="mt-1 text-sm text-ink-muted leading-relaxed">
              An option is a bookable variant — for example hotel pickup vs meeting point, or 20:00 departure.
              Age prices (Adult / Child) are set below, not as separate options.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Option name *</label>
            <input
              type="text"
              value={option.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="tv-input"
              placeholder="e.g. Hotel pickup · 20:00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Usual start time</label>
            <input
              type="time"
              value={option.startTime}
              onChange={(e) => onChange({ startTime: e.target.value })}
              className="tv-input w-full max-w-[12rem]"
            />
            <p className="text-xs text-ink-muted mt-1">Shown to guests; you can adjust on the booking.</p>
          </div>
          <div id="supplier-listing-field-option-duration">
            <label className="block text-sm font-medium text-ink mb-1">Duration for this option *</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="booking-option-duration-amount" className="sr-only">
                  Duration amount
                </label>
                <input
                  id="booking-option-duration-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={durParts.amount}
                  onChange={(e) => {
                    onChange({
                      duration: formatBookingOptionDuration(e.target.value, durParts.unit),
                    });
                  }}
                  className="tv-input"
                  placeholder="e.g. 5"
                />
              </div>
              <div className="w-full shrink-0 sm:w-44">
                <label htmlFor="booking-option-duration-unit" className="sr-only">
                  Duration unit
                </label>
                <select
                  id="booking-option-duration-unit"
                  value={durParts.unit}
                  onChange={(e) => {
                    const u = e.target.value as BookingOptionDurationUnit;
                    onChange({
                      duration: formatBookingOptionDuration(durParts.amount, u),
                    });
                  }}
                  className="tv-input"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          </div>
          <div id="supplier-listing-field-meeting">
            <label className="block text-sm font-medium text-ink mb-1">Meeting or pickup place *</label>
            <textarea
              value={option.pickupPlace}
              onChange={(e) => onChange({ pickupPlace: e.target.value })}
              rows={3}
              className="tv-input"
              placeholder="Address, hotel zone, landmark, or how pickup is arranged for this option"
            />
          </div>
          <div id="supplier-listing-field-pickup">
            <label className="block text-sm font-medium text-ink mb-1">Why choose this option *</label>
            <textarea
              value={option.optionInfo}
              onChange={(e) => onChange({ optionInfo: e.target.value })}
              rows={3}
              className="tv-input"
              placeholder="e.g. Includes hotel pickup · English guide · small group"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-xl bg-paper px-4 py-4 ring-1 ring-black/[0.06]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Private</p>
            <h3 className="font-display text-lg text-ink tracking-tight">Private booking</h3>
          </div>
          <label className="flex cursor-pointer items-start gap-3 touch-manipulation">
            <input
              type="checkbox"
              checked={Boolean(option.isPrivate)}
              onChange={(e) => {
                const on = e.target.checked;
                onChange(
                  on
                    ? { isPrivate: true, privatePricing: option.privatePricing ?? 'per_person' }
                    : { isPrivate: false, privatePricing: undefined, privateGroupPriceUsd: undefined }
                );
              }}
              className="mt-0.5 h-5 w-5 rounded border-black/20 text-finland focus:ring-finland shrink-0"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Travelers can reserve this privately</span>
              <span className="block text-xs text-ink-muted mt-0.5">
                Shows as a private experience. Leave off for shared / public groups.
              </span>
            </span>
          </label>
          {option.isPrivate ? (
            <div className="space-y-3 pl-8">
              <div className="flex flex-col gap-2">
                {(
                  [
                    { value: 'per_person' as const, label: 'Price per person (same categories as below)' },
                    { value: 'flat_group' as const, label: 'One flat price for the private group' },
                  ] as const
                ).map((row) => (
                  <label key={row.value} className="flex items-center gap-2 cursor-pointer text-sm text-ink">
                    <input
                      type="radio"
                      name={`private-pricing-${option.id}`}
                      checked={(option.privatePricing ?? 'per_person') === row.value}
                      onChange={() => onChange({ privatePricing: row.value })}
                      className="text-finland focus:ring-finland"
                    />
                    {row.label}
                  </label>
                ))}
              </div>
              {option.privatePricing === 'flat_group' ? (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    Private group price ({currencyLabel}) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={option.privateGroupPriceUsd || ''}
                    onChange={(e) =>
                      onChange({
                        privateGroupPriceUsd: Math.max(0, Number(e.target.value) || 0),
                        priceUsd: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="tv-input w-full max-w-xs"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-5 min-w-0">
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Pricing</p>
            <h3 className="font-display text-lg text-ink tracking-tight">Who pays what</h3>
            <p className="mt-1 text-sm text-ink-muted leading-relaxed">
              Same price for everyone, or age-based categories with quantities at checkout.
            </p>
          </div>

          {!(option.isPrivate && option.privatePricing === 'flat_group') ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: 'uniform' as const,
                    title: 'Same price for everyone',
                    hint: 'One per-person price',
                  },
                  {
                    value: 'age_dependent' as const,
                    title: 'Price depends on age',
                    hint: 'Adult, Child, Infant…',
                  },
                ] as const
              ).map((row) => {
                const selected = pricingMode === row.value;
                return (
                  <button
                    key={row.value}
                    type="button"
                    onClick={() => setPricingMode(row.value)}
                    className={`rounded-xl px-4 py-3 text-left transition-colors min-h-[72px] ring-1 ${
                      selected
                        ? 'bg-finland/10 ring-finland/40 shadow-sm'
                        : 'bg-paper-raised ring-black/[0.06] hover:bg-finland/[0.04]'
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="block text-sm font-semibold text-ink">{row.title}</span>
                    <span className="block text-xs text-ink-muted mt-0.5">{row.hint}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {pricingMode === 'uniform' && !(option.isPrivate && option.privatePricing === 'flat_group') ? (
            <div id="supplier-listing-field-price">
              <label className="block text-sm font-medium text-ink mb-1">Price per person ({currencyLabel}) *</label>
              <input
                type="number"
                min={0}
                step={1}
                value={option.priceUsd || ''}
                onChange={(e) => onChange({ priceUsd: Math.max(0, Number(e.target.value) || 0) })}
                className="tv-input w-full max-w-xs"
              />
            </div>
          ) : null}

          {pricingMode === 'age_dependent' && !(option.isPrivate && option.privatePricing === 'flat_group') ? (
            <div className="space-y-3" id="supplier-listing-field-price">
              <ul className="divide-y divide-black/[0.06] rounded-xl ring-1 ring-black/[0.06] overflow-hidden bg-paper-raised">
                {categories.map((c) => (
                  <li key={c.id} className="p-3 sm:p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-ink-muted mb-1">Category</label>
                          <input
                            type="text"
                            value={c.label}
                            onChange={(e) =>
                              onChange({
                                priceCategories: patchCategory(categories, c.id, {
                                  label: e.target.value,
                                }),
                              })
                            }
                            className="tv-input"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-muted mb-1">
                            Price ({currencyLabel})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={c.priceUsd || ''}
                            onChange={(e) =>
                              onChange({
                                priceCategories: patchCategory(categories, c.id, {
                                  priceUsd: Math.max(0, Number(e.target.value) || 0),
                                }),
                              })
                            }
                            className="tv-input"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCategory(c.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 min-h-[40px]"
                        aria-label={`Remove ${c.label || 'category'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                      <div>
                        <label className="block text-xs font-medium text-ink-muted mb-1">Age from</label>
                        <input
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
                          className="tv-input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-muted mb-1">Age to</label>
                        <input
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
                          className="tv-input"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {formatPriceCategoryAgeRange(c) || 'Add an age range travelers will see'}
                      {c.requiresAdult ? ' · Needs an adult on the booking' : ''}
                    </p>
                    {(c.kind === 'child' || c.kind === 'infant') && (
                      <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
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
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {PRICE_CATEGORY_KIND_PRESETS.filter(
                  (p) => !categories.some((c) => c.kind === p.kind && c.kind !== 'participant')
                ).map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => addCategory(p.kind)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-finland ring-1 ring-finland/25 hover:bg-finland/10 min-h-[40px]"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden />
                    Add {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Capacity &amp; schedule</p>
            <h3 className="font-display text-lg text-ink tracking-tight">When it runs</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="supplier-listing-field-group">
              <label className="block text-sm font-medium text-ink mb-1">Min guests per booking *</label>
              <input
                type="number"
                min={1}
                value={option.minPersons || ''}
                onChange={(e) => {
                  const nextMin = Math.max(1, Math.floor(Number(e.target.value) || 1));
                  onChange({
                    minPersons: nextMin,
                    maxPersons: Math.max(nextMin, option.maxPersons),
                  });
                }}
                className="tv-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Max guests per booking *</label>
              <input
                type="number"
                min={1}
                value={option.maxPersons || ''}
                onChange={(e) =>
                  onChange({
                    maxPersons: Math.max(
                      option.minPersons,
                      Math.floor(Number(e.target.value) || option.minPersons)
                    ),
                  })
                }
                className="tv-input"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Max spots per start time *</label>
            <input
              type="number"
              min={1}
              value={option.maxSpotsPerSlot || ''}
              onChange={(e) =>
                onChange({
                  maxSpotsPerSlot: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                })
              }
              className="tv-input w-full max-w-xs"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-ink mb-2">Runs on these weekdays *</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, di) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const next = [...option.weekdays];
                    next[di] = !next[di];
                    onChange({ weekdays: next });
                  }}
                  className={`lux-flat min-h-[40px] min-w-[2.75rem] rounded-full px-2.5 text-xs font-semibold transition-colors ${
                    option.weekdays[di]
                      ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                      : 'bg-paper text-ink-muted ring-1 ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Starting date <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                type="date"
                value={option.availabilityDateFrom}
                onChange={(e) => onChange({ availabilityDateFrom: e.target.value })}
                className="tv-input w-full max-w-xs"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 py-1 touch-manipulation">
              <input
                type="checkbox"
                checked={hasEndingDate}
                onChange={(e) => {
                  const on = e.target.checked;
                  onHasEndingDateChange(on);
                  if (!on) onChange({ availabilityDateTo: '' });
                }}
                className="mt-0.5 h-5 w-5 rounded border-black/20 text-finland focus:ring-finland shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-ink">This activity has an ending date</span>
                <span className="block text-xs text-ink-muted mt-0.5">Seasonal tours — last day guests can book.</span>
              </span>
            </label>
            {hasEndingDate ? (
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Ending date *</label>
                <input
                  type="date"
                  value={option.availabilityDateTo}
                  onChange={(e) => onChange({ availabilityDateTo: e.target.value })}
                  className="tv-input w-full max-w-xs"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
