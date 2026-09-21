import type {
  ListingBookingOption,
  ListingOptionFulfillment,
  ListingPriceCategory,
  ListingPriceCategoryKind,
} from '../../types/listingExtras';
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
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type BookingOptionEditorSection =
  | 'setup'
  | 'meeting'
  | 'pricing'
  | 'schedule'
  | 'availability'
  | 'capacity'
  | 'price_capacity';

type Props = {
  option: ListingBookingOption;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  activeSection?: BookingOptionEditorSection;
  attempted?: boolean;
};

function patchCategory(
  cats: ListingPriceCategory[],
  id: string,
  patch: Partial<ListingPriceCategory>
): ListingPriceCategory[] {
  return cats.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

function Section({
  kicker,
  title,
  support,
  children,
}: {
  kicker: string;
  title: string;
  support?: string;
  children: ReactNode;
}) {
  return (
    <section className="lc-section space-y-4 rounded-xl px-4 py-4 sm:px-5 sm:py-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{kicker}</p>
        <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">{title}</h3>
        {support ? <p className="mt-1 text-sm leading-relaxed text-ink-muted">{support}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function BookingOptionEditor({
  option,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onChange,
  activeSection,
  attempted = false,
}: Props) {
  const pricingMode = option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
  const categories = option.priceCategories ?? [];
  const durParts = parseBookingOptionDuration(option.duration);
  const groupPricing = Boolean(option.isPrivate && option.privatePricing === 'flat_group');

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

  const setChargeModel = (model: 'per_person' | 'flat_group') => {
    if (model === 'flat_group') {
      onChange({
        isPrivate: true,
        privatePricing: 'flat_group',
        privateGroupPriceUsd: option.privateGroupPriceUsd || option.priceUsd || 0,
      });
      return;
    }
    onChange({
      isPrivate: option.isPrivate && option.privatePricing !== 'flat_group' ? option.isPrivate : false,
      privatePricing: option.isPrivate ? 'per_person' : undefined,
    });
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

  const showSetup = !activeSection || activeSection === 'setup';
  const showMeeting = !activeSection || activeSection === 'meeting';
  const showPricing = !activeSection || activeSection === 'pricing' || activeSection === 'price_capacity';
  const showAvailability =
    !activeSection || activeSection === 'schedule' || activeSection === 'availability';
  const showCapacity =
    !activeSection ||
    activeSection === 'schedule' ||
    activeSection === 'capacity' ||
    activeSection === 'price_capacity';

  const nameInvalid = attempted && !option.name.trim();
  const infoInvalid = attempted && option.optionInfo.trim().length < 3;
  const placeInvalid = attempted && option.pickupPlace.trim().length < 8;
  const startInvalid = attempted && !option.startTime.trim();

  return (
    <div className={`grid grid-cols-1 gap-5 ${activeSection ? '' : 'p-4 sm:p-5 lg:grid-cols-2 lg:gap-8'}`}>
      {showSetup ? (
        <>
          <Section
            kicker="Option identity"
            title="What travelers choose"
            support="A bookable variant — hotel pickup vs meeting point, or a 20:00 departure. Adult and Child prices belong in pricing, not as extra options."
          >
            <div id="supplier-listing-field-option-name">
              <label htmlFor="booking-option-name" className="mb-1 block text-sm font-semibold text-ink">
                Option name *
              </label>
              <input
                id="booking-option-name"
                type="text"
                value={option.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="tv-input"
                placeholder="e.g. Hotel pickup · 20:00"
                aria-invalid={nameInvalid || undefined}
              />
            </div>
            <div id="supplier-listing-field-pickup">
              <label htmlFor="booking-option-info" className="mb-1 block text-sm font-semibold text-ink">
                Why choose this option *
              </label>
              <textarea
                id="booking-option-info"
                value={option.optionInfo}
                onChange={(e) => onChange({ optionInfo: e.target.value })}
                rows={3}
                className="tv-input"
                placeholder="e.g. Includes hotel pickup · English guide · small group"
                aria-invalid={infoInvalid || undefined}
              />
            </div>
          </Section>
          <Section kicker="Timing" title="How long it runs">
            <div id="supplier-listing-field-option-duration">
              <label className="mb-1 block text-sm font-semibold text-ink">Duration *</label>
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
          </Section>
        </>
      ) : null}

      {showMeeting ? (
        <Section
          kicker="Fulfillment"
          title="How travelers start this option"
          support="Choose one. Only the fields for that start apply."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: 'meeting_point' as ListingOptionFulfillment,
                  title: 'Meeting point',
                  hint: 'Travelers come to a specified location.',
                },
                {
                  value: 'pickup' as ListingOptionFulfillment,
                  title: 'Pickup included',
                  hint: 'Travelers are collected from an eligible pickup area.',
                },
              ] as const
            ).map((row) => {
              const selected = option.fulfillment === row.value;
              return (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => onChange({ fulfillment: row.value })}
                  className={`lc-choice rounded-xl px-4 py-4 text-left ${selected ? 'lc-choice--selected' : ''}`}
                  aria-pressed={selected}
                >
                  <span className="block text-sm font-bold text-ink">{row.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{row.hint}</span>
                </button>
              );
            })}
          </div>
          {option.fulfillment || option.pickupPlace.trim() ? (
            <div id="supplier-listing-field-meeting" className="listing-creation-hint">
              <label htmlFor="booking-option-place" className="mb-1 block text-sm font-semibold text-ink">
                {option.fulfillment === 'pickup' ? 'Pickup area *' : 'Meeting point *'}
              </label>
              <textarea
                id="booking-option-place"
                value={option.pickupPlace}
                onChange={(e) => onChange({ pickupPlace: e.target.value })}
                rows={3}
                className="tv-input"
                placeholder={
                  option.fulfillment === 'pickup'
                    ? 'Hotel zone, area, or how pickup is arranged for this option'
                    : 'Address, landmark, or exact meeting instructions'
                }
                aria-invalid={placeInvalid || undefined}
              />
            </div>
          ) : (
            <div id="supplier-listing-field-meeting" />
          )}
        </Section>
      ) : null}

      {showPricing ? (
        <Section
          kicker="Pricing"
          title="How do you charge for this option?"
          support="Per-person prices can include Adult and Child inside this same option. A group price covers the whole party."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: 'per_person' as const,
                  title: 'Per person',
                  hint: 'Each traveler pays a unit price.',
                },
                {
                  value: 'flat_group' as const,
                  title: 'Whole group',
                  hint: 'One price covers the party up to your guest limit.',
                },
              ] as const
            ).map((row) => {
              const selected = groupPricing ? row.value === 'flat_group' : row.value === 'per_person';
              return (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => setChargeModel(row.value)}
                  className={`lc-choice rounded-xl px-4 py-4 text-left ${selected ? 'lc-choice--selected' : ''}`}
                  aria-pressed={selected}
                >
                  <span className="block text-sm font-bold text-ink">{row.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{row.hint}</span>
                </button>
              );
            })}
          </div>

          {groupPricing ? (
            <div id="supplier-listing-field-price">
              <label className="mb-1 block text-sm font-semibold text-ink">
                Group price ({currencyLabel}) *
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
              <p className="mt-2 text-xs text-ink-muted">
                This price covers the whole group up to {option.maxPersons} travelers. Set capacity separately.
              </p>
            </div>
          ) : (
            <>
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
                      className={`lc-choice rounded-xl px-4 py-3 text-left ${selected ? 'lc-choice--selected' : ''}`}
                      aria-pressed={selected}
                    >
                      <span className="block text-sm font-semibold text-ink">{row.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{row.hint}</span>
                    </button>
                  );
                })}
              </div>

              {pricingMode === 'uniform' ? (
                <div id="supplier-listing-field-price">
                  <label className="mb-1 block text-sm font-semibold text-ink">
                    Price per person ({currencyLabel}) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={option.priceUsd || ''}
                    onChange={(e) => onChange({ priceUsd: Math.max(0, Number(e.target.value) || 0) })}
                    className="tv-input w-full max-w-xs"
                  />
                </div>
              ) : (
                <div className="space-y-3" id="supplier-listing-field-price">
                  <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-paper-raised ring-1 ring-black/[0.06]">
                    {categories.map((c) => (
                      <li key={c.id} className="space-y-3 p-3 sm:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-ink-muted">Category</label>
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
                              <label className="mb-1 block text-xs font-medium text-ink-muted">
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
                            className="lc-btn-danger inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium"
                            aria-label={`Remove ${c.label || 'category'}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-ink-muted">Age from</label>
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
                            <label className="mb-1 block text-xs font-medium text-ink-muted">Age to</label>
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
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
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
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-finland ring-1 ring-finland/25 hover:bg-finland/10"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      ) : null}

      {showAvailability ? (
        <Section
          kicker="Availability"
          title="When is this option available?"
          support="Travelers can only book dates that match this season, these weekdays, and this start time."
        >
          <div id="supplier-listing-field-option-availability" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-ink">Starting date</label>
                <input
                  type="date"
                  value={option.availabilityDateFrom}
                  onChange={(e) => onChange({ availabilityDateFrom: e.target.value })}
                  className="tv-input w-full"
                />
              </div>
              <div>
                <label className="flex cursor-pointer items-start gap-3 py-1 touch-manipulation">
                  <input
                    type="checkbox"
                    checked={hasEndingDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      onHasEndingDateChange(on);
                      if (!on) onChange({ availabilityDateTo: '' });
                    }}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-black/20 text-finland focus:ring-finland"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Has an ending date</span>
                    <span className="block text-xs text-ink-muted">Last day travelers can book.</span>
                  </span>
                </label>
                {hasEndingDate ? (
                  <input
                    type="date"
                    value={option.availabilityDateTo}
                    onChange={(e) => onChange({ availabilityDateTo: e.target.value })}
                    className="tv-input mt-2 w-full"
                    aria-label="Ending date"
                  />
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Which days does it operate? *</p>
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
                    className={`lc-choice min-h-[44px] min-w-[2.75rem] rounded-full px-2.5 text-xs font-semibold ${
                      option.weekdays[di] ? 'lc-choice--selected' : ''
                    }`}
                    aria-pressed={option.weekdays[di]}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="booking-option-start" className="mb-1 block text-sm font-semibold text-ink">
                Start time *
              </label>
              <input
                id="booking-option-start"
                type="time"
                value={option.startTime}
                onChange={(e) => onChange({ startTime: e.target.value })}
                className="tv-input w-full max-w-[12rem]"
                aria-invalid={startInvalid || undefined}
              />
              <p className="mt-1 text-xs text-ink-muted">
                One departure time for this schedule. A second time is another schedule on the same option.
              </p>
            </div>
          </div>
        </Section>
      ) : null}

      {showCapacity ? (
        <Section
          kicker="Capacity"
          title="How many travelers can book?"
          support="Minimum and maximum guests on one booking, and how many spots you offer at this start time."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="supplier-listing-field-group">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">Min guests per booking *</label>
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
              <label className="mb-1 block text-sm font-semibold text-ink">Max guests per booking *</label>
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
            <label className="mb-1 block text-sm font-semibold text-ink">Max spots per start time *</label>
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
        </Section>
      ) : null}
    </div>
  );
}
