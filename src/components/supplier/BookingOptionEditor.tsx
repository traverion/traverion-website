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
import { localYmd } from '../../lib/local-ymd';

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
      className={`lc-choice flex w-full items-start gap-3 rounded-2xl px-4 py-4 text-left sm:px-5 sm:py-5 ${
        selected ? 'lc-choice--selected' : ''
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-finland bg-finland' : 'border-black/25 bg-paper'
        }`}
        aria-hidden
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink sm:text-base">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-muted sm:text-sm">{hint}</span>
      </span>
    </button>
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
  const startInstructionsInvalid =
    attempted && (option.travelerStartInstructions ?? '').trim().length < 8;
  const startInvalid =
    attempted && option.startMode !== 'flexible' && !option.startTime.trim();

  return (
    <div className={`grid grid-cols-1 gap-6 ${activeSection ? '' : 'p-4 sm:p-5 lg:grid-cols-2 lg:gap-8'}`}>
      {showSetup ? (
        <>
          <Section
            kicker="Option identity"
            title="What travelers choose"
            support="A category of this tour travelers pick — e.g. Small group or Bus. Pickup, meeting place, and departure times are set later for this option. Adult and Child prices belong in pricing, not as separate options."
          >
            <div id="supplier-listing-field-option-name">
              <label htmlFor="booking-option-name" className="mb-1 block text-sm font-semibold text-ink">
                Option name *
              </label>
              <p className="mb-1.5 text-xs text-ink-muted">
                Short label for this category of the tour (not the clock time — times go on schedules).
              </p>
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
            <div id="supplier-listing-field-pickup">
              <label htmlFor="booking-option-info" className="mb-1 block text-sm font-semibold text-ink">
                Why choose this option *
              </label>
              <p className="mb-1.5 text-xs text-ink-muted">
                Shown when travelers pick an option — what makes this one different (max{' '}
                {TOUR_OPTION_INFO_MAX} characters).
              </p>
              <textarea
                id="booking-option-info"
                value={option.optionInfo}
                maxLength={TOUR_OPTION_INFO_MAX}
                onChange={(e) =>
                  onChange({ optionInfo: e.target.value.slice(0, TOUR_OPTION_INFO_MAX) })
                }
                rows={3}
                className="tv-input min-h-[5.5rem] resize-y"
                placeholder="e.g. Hotel pickup included · English guide · max 8 guests"
                aria-invalid={infoInvalid || undefined}
              />
              <p className="mt-1 text-xs tabular-nums text-ink-muted">
                {option.optionInfo.length}/{TOUR_OPTION_INFO_MAX}
              </p>
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
          </Section>
          <Section
            kicker="Before schedules"
            title="Pricing and start style"
            support="Required before you can add schedules. You can still set exact prices and times on each schedule."
          >
            <div id="supplier-listing-field-option-charge-model" className="space-y-3">
              <p className="text-sm font-semibold text-ink">How do you charge? *</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Pricing model">
                <ChoiceCard
                  selected={option.chargeModel === 'per_person'}
                  title="Per person"
                  hint="Each traveler pays. Adult/child prices can be set on schedules."
                  onClick={() => setChargeModel('per_person')}
                />
                <ChoiceCard
                  selected={option.chargeModel === 'flat_group'}
                  title="Per group"
                  hint="One price covers the whole party up to your guest limit."
                  onClick={() => setChargeModel('flat_group')}
                />
              </div>
              {attempted && !chargeModelChosen ? (
                <p className="text-sm text-red-600" role="alert">
                  Choose per person or per group.
                </p>
              ) : null}
            </div>
            <div id="supplier-listing-field-option-start-mode" className="space-y-3">
              <p className="text-sm font-semibold text-ink">Start time style *</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Start time style">
                <ChoiceCard
                  selected={option.startMode === 'fixed'}
                  title="Fixed start time"
                  hint="Each schedule has a clock departure (e.g. 20:00)."
                  onClick={() => onChange({ startMode: 'fixed' })}
                />
                <ChoiceCard
                  selected={option.startMode === 'flexible'}
                  title="Flexible (operating hours)"
                  hint="Operating days without a single fixed departure time."
                  onClick={() => onChange({ startMode: 'flexible' })}
                />
              </div>
              {attempted && !startModeChosen ? (
                <p className="text-sm text-red-600" role="alert">
                  Choose fixed start time or flexible operating hours.
                </p>
              ) : null}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceCard
              selected={option.fulfillment === 'meeting_point'}
              title="Meeting point"
              hint="Travelers come to a specified location."
              onClick={() => onChange({ fulfillment: 'meeting_point' })}
            />
            <ChoiceCard
              selected={option.fulfillment === 'pickup'}
              title="Pickup included"
              hint="Travelers are collected from an eligible pickup area."
              onClick={() => onChange({ fulfillment: 'pickup' })}
            />
          </div>
          {option.fulfillment || option.pickupPlace.trim() ? (
            <div id="supplier-listing-field-meeting" className="space-y-4 listing-creation-hint">
              <div>
                <label htmlFor="booking-option-place" className="mb-1 block text-sm font-semibold text-ink">
                  {option.fulfillment === 'pickup' ? 'Pickup place *' : 'Meeting point *'}
                </label>
                <textarea
                  id="booking-option-place"
                  value={option.pickupPlace}
                  onChange={(e) => onChange({ pickupPlace: e.target.value })}
                  rows={2}
                  className="tv-input"
                  placeholder={
                    option.fulfillment === 'pickup'
                      ? 'e.g. Arctic City Hotel — or city hotel zone for this option'
                      : 'e.g. Maakuntakatu 29, Rovaniemi — main entrance'
                  }
                  aria-invalid={placeInvalid || undefined}
                />
              </div>
              <div>
                <label
                  htmlFor="booking-option-start-instructions"
                  className="mb-1 block text-sm font-semibold text-ink"
                >
                  Traveler start instructions *
                </label>
                <textarea
                  id="booking-option-start-instructions"
                  value={option.travelerStartInstructions ?? ''}
                  onChange={(e) => onChange({ travelerStartInstructions: e.target.value })}
                  rows={3}
                  className="tv-input"
                  placeholder={
                    option.fulfillment === 'pickup'
                      ? 'e.g. Please wait outside the main entrance 10 minutes before pickup. The guide will arrive in a marked vehicle.'
                      : 'e.g. Meet your guide outside the main entrance. Please arrive 15 minutes before departure.'
                  }
                  aria-invalid={startInstructionsInvalid || undefined}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  How travelers successfully begin — separate from the place name above.
                </p>
              </div>
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
              const selected = chargeModelChosen
                ? groupPricing
                  ? row.value === 'flat_group'
                  : row.value === 'per_person'
                : false;
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
          )}
        </Section>
      ) : null}

      {showAvailability ? (
        <Section
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
              <label htmlFor="booking-option-max-guests" className="mb-1 block text-sm font-semibold text-ink">
                Max guests per booking *
              </label>
              <input
                id="booking-option-max-guests"
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
            <label htmlFor="booking-option-max-spots" className="mb-1 block text-sm font-semibold text-ink">
              Max spots per start time *
            </label>
            <input
              id="booking-option-max-spots"
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
