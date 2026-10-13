import type {
  ListingBookingOption,
  ListingPriceCategory,
  ListingPriceCategoryKind,
} from '../../types/listingExtras';
import {
  type BookingOptionDurationUnit,
  formatBookingOptionDuration,
  parseBookingOptionDuration,
  TOUR_OPTION_INFO_MAX,
} from '../../types/listingExtras';
import {
  createPriceCategory,
  defaultAgeDependentCategories,
  formatPriceCategoryAgeRange,
  PRICE_CATEGORY_KIND_PRESETS,
} from '../../lib/price-categories';
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import PartnerSelect from './PartnerSelect';
import { LISTING_CAPACITY_MAX } from '../../lib/listing-option-schedules';
import { localYmd } from '../../lib/local-ymd';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type BookingOptionEditorSection =
  | 'setup'
  | 'meeting'
  | 'pricing'
  | 'schedule'
  | 'availability'
  | 'booking_window'
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
  /** Listing-scoped timezone edited from the Availability scene (shared across options). */
  listingDepartureTimezone?: string;
  onListingDepartureTimezoneChange?: (timezone: string) => void;
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
  /** Guided option scenes: no nested card / duplicate heading — scene frame owns the title. */
  flat = false,
}: {
  kicker: string;
  title: string;
  support?: string;
  children: ReactNode;
  flat?: boolean;
}) {
  if (flat) {
    return <div className="space-y-4">{children}</div>;
  }
  return (
    <section className="lc-section space-y-5 rounded-2xl px-5 py-5 sm:px-6 sm:py-6">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{kicker}</p>
        <h3 className="mt-1.5 font-display text-xl font-bold tracking-tight text-ink">{title}</h3>
        {support ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{support}</p> : null}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function ChoiceCard({
  selected,
  title,
  hint,
  onClick,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`lc-choice flex w-full items-start gap-2.5 rounded-xl px-3.5 py-3 text-left ${
        selected ? 'lc-choice--selected' : ''
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-finland bg-finland' : 'border-black/25 bg-paper'
        }`}
        aria-hidden
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink sm:text-sm">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}

const DEPARTURE_TIMEZONE_OPTIONS = [
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (Finland — default)' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
  { value: 'UTC', label: 'UTC' },
];

export default function BookingOptionEditor({
  option,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onChange,
  activeSection,
  attempted = false,
  listingDepartureTimezone,
  onListingDepartureTimezoneChange,
}: Props) {
  const pricingMode = option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
  const categories = option.priceCategories ?? [];
  const durParts = parseBookingOptionDuration(option.duration);
  const groupPricing =
    option.chargeModel === 'flat_group' ||
    Boolean(option.isPrivate && option.privatePricing === 'flat_group');
  const chargeModelChosen =
    option.chargeModel === 'per_person' || option.chargeModel === 'flat_group';
  const startModeChosen = option.startMode === 'fixed' || option.startMode === 'flexible';

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
        chargeModel: 'flat_group',
        isPrivate: true,
        privatePricing: 'flat_group',
        privateGroupPriceUsd: option.privateGroupPriceUsd || option.priceUsd || 0,
      });
      return;
    }
    onChange({
      chargeModel: 'per_person',
      ...(option.chargeModel === 'flat_group'
        ? { isPrivate: false, privatePricing: undefined, privateGroupPriceUsd: undefined }
        : option.isPrivate
          ? { privatePricing: 'per_person' as const }
          : {}),
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

  const scheduleBased = Array.isArray(option.schedules);
  const showSetup = !activeSection || activeSection === 'setup';
  const showMeeting = !activeSection || activeSection === 'meeting';
  // Schedule price_capacity reuses amount/capacity fields only — charge model lives on Pricing.
  const showPricing = !activeSection || activeSection === 'pricing' || activeSection === 'price_capacity';
  const showChargeModelPicker = !activeSection || activeSection === 'pricing';
  const showFlatPriceAmounts =
    activeSection === 'price_capacity' ||
    ((!activeSection || activeSection === 'pricing') && !scheduleBased);
  const showPricingScheduleNote = Boolean(activeSection === 'pricing' && scheduleBased);
  const showAvailability =
    !activeSection || activeSection === 'schedule' || activeSection === 'availability';
  const showBookingWindow = !activeSection || activeSection === 'booking_window';
  const showCapacity =
    !activeSection ||
    activeSection === 'schedule' ||
    activeSection === 'capacity' ||
    activeSection === 'price_capacity' ||
    (activeSection === 'pricing' && !scheduleBased);

  const nameInvalid = attempted && !option.name.trim();
  const infoInvalid = attempted && option.optionInfo.trim().length < 3;
  const placeInvalid = attempted && option.pickupPlace.trim().length < 8;
  const startInstructionsInvalid =
    attempted && (option.travelerStartInstructions ?? '').trim().length < 8;
  const startInvalid =
    attempted && option.startMode !== 'flexible' && !option.startTime.trim();
  const guided = Boolean(activeSection);

  return (
    <div
      className={`grid grid-cols-1 ${
        guided ? 'gap-5' : 'gap-6 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8'
      }`}
    >
      {showSetup ? (
        <>
          <Section
            flat={guided}
            kicker="Option identity"
            title="What travelers choose"
            support="A category of this tour travelers pick — e.g. Small group or Bus."
          >
            <div id="supplier-listing-field-option-name" className="space-y-1.5">
              <label htmlFor="booking-option-name" className="block text-[13px] font-semibold text-ink">
                Option name *
              </label>
              <input
                id="booking-option-name"
                type="text"
                value={option.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="tv-input"
                placeholder="e.g. Small group"
                aria-invalid={nameInvalid || undefined}
              />
            </div>
            <div id="supplier-listing-field-pickup" className="space-y-1.5">
              <label htmlFor="booking-option-info" className="block text-[13px] font-semibold text-ink">
                Why choose this option *
              </label>
              <textarea
                id="booking-option-info"
                value={option.optionInfo}
                maxLength={TOUR_OPTION_INFO_MAX}
                onChange={(e) =>
                  onChange({ optionInfo: e.target.value.slice(0, TOUR_OPTION_INFO_MAX) })
                }
                rows={2}
                className="tv-input min-h-[4.25rem] resize-y text-[15px]"
                placeholder="e.g. Hotel pickup included · English guide · max 8 guests"
                aria-invalid={infoInvalid || undefined}
              />
              <p className="text-right text-[11px] tabular-nums text-ink-faint">
                {option.optionInfo.length}/{TOUR_OPTION_INFO_MAX}
              </p>
            </div>
            <div id="supplier-listing-field-option-duration" className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-ink">Duration *</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2.5">
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
                <div className="w-full shrink-0 sm:w-40">
                  <label htmlFor="booking-option-duration-unit" className="sr-only">
                    Duration unit
                  </label>
                  <PartnerSelect
                    id="booking-option-duration-unit"
                    value={durParts.unit}
                    aria-label="Duration unit"
                    onChange={(u) => {
                      onChange({
                        duration: formatBookingOptionDuration(
                          durParts.amount,
                          u as BookingOptionDurationUnit
                        ),
                      });
                    }}
                    options={[
                      { value: 'minutes', label: 'Minutes' },
                      { value: 'hours', label: 'Hours' },
                      { value: 'days', label: 'Days' },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div id="supplier-listing-field-option-start-mode" className="space-y-2">
              <p className="text-[13px] font-semibold text-ink">Start time style *</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Start time style">
                <ChoiceCard
                  selected={option.startMode === 'fixed'}
                  title="Fixed start time"
                  hint="Each schedule has a clock departure."
                  onClick={() => onChange({ startMode: 'fixed' })}
                />
                <ChoiceCard
                  selected={option.startMode === 'flexible'}
                  title="Flexible hours"
                  hint="Operating days without a fixed clock time."
                  onClick={() => onChange({ startMode: 'flexible' })}
                />
              </div>
              {attempted && !startModeChosen ? (
                <p className="text-[12px] text-red-600" role="alert">
                  Choose fixed start time or flexible operating hours.
                </p>
              ) : null}
            </div>
          </Section>
        </>
      ) : null}

      {showMeeting ? (
        <Section
          flat={guided}
          kicker="Fulfillment"
          title="How travelers start this option"
          support="Choose one. Only the fields for that start apply."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard
              selected={option.fulfillment === 'meeting_point'}
              title="Meeting point"
              hint="Guests arrive at a specified location."
              onClick={() => onChange({ fulfillment: 'meeting_point' })}
            />
            <ChoiceCard
              selected={option.fulfillment === 'pickup'}
              title="Pickup included"
              hint="Guests are collected from an eligible area."
              onClick={() => onChange({ fulfillment: 'pickup' })}
            />
          </div>
          {option.fulfillment || option.pickupPlace.trim() ? (
            <div id="supplier-listing-field-meeting" className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="booking-option-place" className="block text-[13px] font-semibold text-ink">
                  {option.fulfillment === 'pickup' ? 'Pickup place *' : 'Meeting point *'}
                </label>
                <textarea
                  id="booking-option-place"
                  value={option.pickupPlace}
                  onChange={(e) => onChange({ pickupPlace: e.target.value })}
                  rows={2}
                  className="tv-input text-[15px]"
                  placeholder={
                    option.fulfillment === 'pickup'
                      ? 'e.g. Arctic City Hotel — or city hotel zone for this option'
                      : 'e.g. Maakuntakatu 29, Rovaniemi — main entrance'
                  }
                  aria-invalid={placeInvalid || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="booking-option-start-instructions"
                  className="block text-[13px] font-semibold text-ink"
                >
                  Traveler start instructions *
                </label>
                <textarea
                  id="booking-option-start-instructions"
                  value={option.travelerStartInstructions ?? ''}
                  onChange={(e) => onChange({ travelerStartInstructions: e.target.value })}
                  rows={2}
                  className="tv-input text-[15px]"
                  placeholder={
                    option.fulfillment === 'pickup'
                      ? 'e.g. Wait outside the main entrance 10 minutes before pickup.'
                      : 'e.g. Meet your guide outside the main entrance; arrive 15 minutes early.'
                  }
                  aria-invalid={startInstructionsInvalid || undefined}
                />
              </div>
            </div>
          ) : (
            <div id="supplier-listing-field-meeting" />
          )}
        </Section>
      ) : null}

      {showPricing ? (
        <Section
          flat={guided}
          kicker="Pricing"
          title={
            showChargeModelPicker
              ? 'How do you charge for this option?'
              : groupPricing
                ? 'Group price for this schedule'
                : 'Price for this schedule'
          }
          support={
            showChargeModelPicker && !showPricingScheduleNote
              ? 'Per-person prices can include Adult and Child. A group price covers the whole party.'
              : undefined
          }
        >
          {showChargeModelPicker ? (
            <div
              id="supplier-listing-field-option-charge-model"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Pricing model"
            >
              <ChoiceCard
                selected={chargeModelChosen && !groupPricing}
                title="Per person"
                hint="Each traveler pays."
                onClick={() => setChargeModel('per_person')}
              />
              <ChoiceCard
                selected={chargeModelChosen && groupPricing}
                title="Per group"
                hint="One price covers the party."
                onClick={() => setChargeModel('flat_group')}
              />
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">
              {groupPricing ? 'Per group' : 'Per person'}
              {chargeModelChosen ? '' : ' — finish Pricing if this looks wrong.'}
            </p>
          )}
          {showChargeModelPicker && attempted && !chargeModelChosen ? (
            <p className="text-[12px] text-red-600" role="alert">
              Choose per person or per group.
            </p>
          ) : null}

          {showFlatPriceAmounts ? (
            groupPricing ? (
            <div id="supplier-listing-field-price">
              <label htmlFor="booking-option-group-price" className="mb-1 block text-sm font-semibold text-ink">
                Group price ({currencyLabel}) *
              </label>
              <input
                id="booking-option-group-price"
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
                  <label htmlFor="booking-option-unit-price" className="mb-1 block text-sm font-semibold text-ink">
                    Price per person ({currencyLabel}) *
                  </label>
                  <input
                    id="booking-option-unit-price"
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
                              <label htmlFor={`booking-option-cat-label-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                                Category
                              </label>
                              <input
                                id={`booking-option-cat-label-${c.id}`}
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
                              <label htmlFor={`booking-option-cat-price-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                                Price ({currencyLabel})
                              </label>
                              <input
                                id={`booking-option-cat-price-${c.id}`}
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
                            className="lc-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium"
                            aria-label={`Remove ${c.label || 'category'}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                          <div>
                            <label htmlFor={`booking-option-cat-age-from-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                              Age from
                            </label>
                            <input
                              id={`booking-option-cat-age-from-${c.id}`}
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
                            <label htmlFor={`booking-option-cat-age-to-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                              Age to
                            </label>
                            <input
                              id={`booking-option-cat-age-to-${c.id}`}
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
          )
          ) : null}
        </Section>
      ) : null}

      {showBookingWindow ? (
        <Section
          flat={guided}
          kicker="Booking window"
          title="When can travelers book?"
          support="Cutoff applies to every schedule on this option."
        >
          <div id="supplier-listing-field-option-cutoff" className="space-y-1.5">
            <label htmlFor="option-booking-cutoff" className="block text-[13px] font-semibold text-ink">
              Booking cutoff
            </label>
            <p className="text-[12px] leading-snug text-ink-muted">
              Hours before departure when booking closes. Leave blank to inherit the listing default —
              if the listing has no cutoff either, guests can book until departure.
            </p>
            <input
              id="option-booking-cutoff"
              type="number"
              min={0}
              max={168}
              inputMode="numeric"
              className="tv-input max-w-[9rem]"
              value={
                typeof option.bookingCutoffHoursBeforeStart === 'number' &&
                option.bookingCutoffHoursBeforeStart > 0
                  ? String(option.bookingCutoffHoursBeforeStart)
                  : ''
              }
              placeholder="Listing default"
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onChange({ bookingCutoffHoursBeforeStart: undefined });
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || n <= 0) {
                  onChange({ bookingCutoffHoursBeforeStart: undefined });
                  return;
                }
                onChange({ bookingCutoffHoursBeforeStart: Math.min(168, Math.floor(n)) });
              }}
            />
          </div>
          {onListingDepartureTimezoneChange ? (
            <div id="supplier-listing-field-option-timezone" className="space-y-1.5">
              <label htmlFor="option-departure-timezone" className="block text-[13px] font-semibold text-ink">
                Departure timezone
              </label>
              <p className="text-[12px] leading-snug text-ink-muted">
                Shared across every option on this listing.
              </p>
              <PartnerSelect
                id="option-departure-timezone"
                className="max-w-md"
                value={listingDepartureTimezone || 'Europe/Helsinki'}
                onChange={onListingDepartureTimezoneChange}
                options={DEPARTURE_TIMEZONE_OPTIONS}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {showAvailability ? (
        <Section
          flat={guided}
          kicker="Availability"
          title="When is this schedule available?"
          support="Travelers can only book dates that match this date window, these weekdays, and this start time. Ending date is optional."
        >
          <div id="supplier-listing-field-option-availability" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-paper-raised px-3.5 py-2 ring-1 ring-black/[0.06] transition-[box-shadow] duration-150 hover:ring-finland/25 focus-within:ring-2 focus-within:ring-finland/35">
                <TraverionSingleDateField
                  id="booking-option-date-from"
                  label="Starting date"
                  value={option.availabilityDateFrom}
                  minIso={localYmd()}
                  placeholder="Select a date"
                  onChange={(iso) => onChange({ availabilityDateFrom: iso })}
                />
              </div>
              <div className="space-y-2">
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
                    <span className="block text-sm font-semibold text-ink">Set an ending date</span>
                    <span className="block text-xs text-ink-muted">
                      Optional. Leave off if this schedule has no end date.
                    </span>
                  </span>
                </label>
                {hasEndingDate ? (
                  <div className="rounded-xl bg-paper-raised px-3.5 py-2 ring-1 ring-black/[0.06] transition-[box-shadow] duration-150 hover:ring-finland/25 focus-within:ring-2 focus-within:ring-finland/35">
                    <TraverionSingleDateField
                      id="booking-option-date-to"
                      label="Ending date"
                      value={option.availabilityDateTo}
                      minIso={
                        option.availabilityDateFrom.trim() &&
                        /^\d{4}-\d{2}-\d{2}$/.test(option.availabilityDateFrom)
                          ? option.availabilityDateFrom
                          : localYmd()
                      }
                      placeholder="Select a date"
                      onChange={(iso) => onChange({ availabilityDateTo: iso })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Operating days *</p>
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
            {option.startMode === 'flexible' ? (
              <p className="rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 py-2.5 text-sm leading-snug text-ink-muted">
                Flexible start — travelers book on these operating days without a single fixed clock time on this
                schedule.
              </p>
            ) : (
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
                  One departure time for this schedule. Another time is another schedule on the same option.
                </p>
              </div>
            )}
          </div>
        </Section>
      ) : null}

      {showCapacity ? (
        <Section
          flat={guided}
          kicker="Capacity"
          title="How many travelers can book?"
          support="Minimum and maximum guests on one booking, and how many spots you offer at this start time."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="supplier-listing-field-group">
            <div>
              <label htmlFor="booking-option-min-guests" className="mb-1 block text-sm font-semibold text-ink">
                Min guests per booking *
              </label>
              <input
                id="booking-option-min-guests"
                type="number"
                min={1}
                max={LISTING_CAPACITY_MAX}
                value={option.minPersons || ''}
                onChange={(e) => {
                  const nextMin = Math.min(
                    LISTING_CAPACITY_MAX,
                    Math.max(1, Math.floor(Number(e.target.value) || 1))
                  );
                  onChange({
                    minPersons: nextMin,
                    maxPersons: Math.min(
                      LISTING_CAPACITY_MAX,
                      Math.max(nextMin, option.maxPersons)
                    ),
                  });
                }}
                className="tv-input"
              />
            </div>
            <div>
              <label htmlFor="booking-option-max-guests" className="mb-1 block text-sm font-semibold text-ink">
                Max guests per booking *
              </label>
              <input
                id="booking-option-max-guests"
                type="number"
                min={1}
                max={LISTING_CAPACITY_MAX}
                value={option.maxPersons || ''}
                onChange={(e) =>
                  onChange({
                    maxPersons: Math.min(
                      LISTING_CAPACITY_MAX,
                      Math.max(
                        option.minPersons,
                        Math.floor(Number(e.target.value) || option.minPersons)
                      )
                    ),
                  })
                }
                className="tv-input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="booking-option-max-spots" className="mb-1 block text-sm font-semibold text-ink">
              Max spots per start time *
            </label>
            <input
              id="booking-option-max-spots"
              type="number"
              min={1}
              max={LISTING_CAPACITY_MAX}
              value={option.maxSpotsPerSlot || ''}
              onChange={(e) =>
                onChange({
                  maxSpotsPerSlot: Math.min(
                    LISTING_CAPACITY_MAX,
                    Math.max(1, Math.floor(Number(e.target.value) || 1))
                  ),
                })
              }
              className="tv-input w-full max-w-xs"
            />
            <p className="mt-1 text-xs text-ink-muted">Up to {LISTING_CAPACITY_MAX} travelers per departure.</p>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
