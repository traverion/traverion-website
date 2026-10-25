import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { KeyRound, MoreHorizontal, Pencil, UserRound } from 'lucide-react';
import {
  RENTAL_COMPLETION_GROUPS,
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalPublishBlockers,
  rentalScreenIndex,
  rentalScreenIndexForPublishLine,
  rentalStageBlocker,
  type RentalOnboardingCheck,
  type RentalOnboardingScreenId,
} from '../../../lib/rental-onboarding';
import {
  RENTAL_CATEGORY_CONFIG,
  rentalCategoryConfig,
  rentalHighlightSuggestions,
  rentalItemTypeLabel,
  rentalRestrictionSuggestions,
  type RentalCategoryConfig,
} from '../../../lib/rental-categories';
import {
  applyRentalAddressSelection,
  applyRentalCollectionPin,
  applyRentalStandardHours,
  copyRentalDayHours,
  rentalHourExceptions,
  rentalHoursWindow,
  rentalOperatingHoursIssue,
  rentalStandardHours,
  resetRentalHourOverrides,
  setRentalDayHours,
  toggleRentalOperatingDay,
  clearRentalDepositAmounts,
  createDefaultRentalVariant,
  defaultRentalOperatingDays,
  effectiveVariantPricing,
  ensureRentalHasDefaultVariant,
  groupRentalOperatingHours,
  newRentalVariantId,
  rentalCustomerSkillSuitability,
  rentalHasDepositInfo,
  rentalHasInsuranceInfo,
  rentalSkillConflictsDifficulty,
  rentalDurationFieldIssue,
  rentalLowestDayPriceMinor,
  rentalLowestHourPriceMinor,
  rentalVariantComplete,
  rentalVariantMetaLine,
  upsertRentalVariant,
} from '../../../lib/rental-details';
import { clampListingDescriptionInput, clampListingTitleInput, MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../../../lib/listingQualityScore';
import { LISTING_PHOTO_MAX, type ListingPhotoCropSettings } from '../../../lib/listingPhotoGrid';
import { normalizeCurrency } from '../../../lib/money';
import { travelerDestinationLabel } from '../../../lib/destination-place';
import { RENTAL_CANCELLATION_PRESETS } from '../../../lib/rental-cancellation';
import { RENTAL_CATEGORIES } from '../../../types/rental';
import type {
  RentalAccessibilityStatus,
  RentalCategoryId,
  RentalDetails,
  RentalDifficulty,
  RentalDurationMode,
  RentalOperatingDay,
  RentalWeekday,
  RentalVariant,
} from '../../../types/rental';
import ListingImageFields, { type ListingPhotosValue } from '../ListingImageFields';
import PartnerSelect, { type PartnerSelectOption } from '../PartnerSelect';
import DestinationSearch from '../DestinationSearch';
import { verifiedDestination, type VerifiedDestination } from '../../../lib/destination-place';
import RentalOptionEditor, {
  RentalIntegerInput,
  RentalMoneyInput,
  formatRentalMinor,
  formatRentalOptionRates,
} from './RentalOptionEditor';
import { StayChoice, StayField, StayHelp } from './StayCreatorUi';
import RentalCollectionPoint from './RentalCollectionPoint';
import RentalCollectionMap from './RentalCollectionMap';
import { rentalReturnPoint } from '../../../lib/rental-presentation';

export type RentalFormSlice = {
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  city: string;
  country: string;
  destinationPlaceId: string;
  destinationCountryCode: string;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationFormatted: string;
  departureTimezone: string;
  experienceLanguage: string;
  /** Photo persistence — same shape ListingImageFields uses in the Stay Creator. */
  photoSlots: string[];
  photoSlotLabels: string[];
  photoOriginalUrls: string[];
  photoCropSettings: ListingPhotoCropSettings[];
};

type Values = RentalFormSlice & { rental: RentalDetails };

type Props = {
  stage: number;
  direction: 'forward' | 'back';
  attemptedContinue: boolean;
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  onEditStage: (stage: number) => void;
  returnStage: number | null;
  onBackToPreview: () => void;
  commissionBps: number | null; // null = loading/unknown
  listingCurrency: string;
  /** Required for photo uploads (same contract as ListingImageFields). */
  userId?: string | null;
  /** Defaults to Boolean(userId). */
  uploadsEnabled?: boolean;
};

type Ctx = {
  props: Props;
  values: Values;
  rental: RentalDetails;
  cfg: RentalCategoryConfig | null;
  mode: RentalDurationMode;
  currency: string;
  patch: (next: Partial<Values>) => void;
  patchRental: (next: Partial<RentalDetails>) => void;
  /** Accepts current or legacy screen ids; resolved via resolveRentalScreenId. */
  goTo: (id: string) => void;
  editVariant: (variant: RentalVariant, isNew: boolean) => void;
};

const MAX_VARIANTS = 40;
const MAX_HIGHLIGHTS = 8;
const MAX_INCLUSIONS = 24;

const LANGUAGES: PartnerSelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'fi', label: 'Finnish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ru', label: 'Russian' },
  { value: 'other', label: 'Other or multilingual (explain in the description)' },
];

const FALLBACK_TIMEZONES = [
  'Europe/Helsinki',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const ACCESS_FEATURES = [
  'Step-free pickup access',
  'Accessible collection location',
  'Assistance available at handover',
  'Physical handling is required',
];

const BUFFER_PRESETS = [0, 30, 60, 120, 240];
const NOTICE_PRESETS = [0, 2, 6, 12, 24, 48];

function timezoneOptions(current: string): PartnerSelectOption[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try {
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_TIMEZONES;
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function durationLabel(mode: RentalDurationMode): string {
  if (mode === 'hourly') return 'Hourly';
  if (mode === 'both') return 'Hourly or daily';
  return 'Daily';
}

function bufferLabel(minutes: number): string {
  if (minutes <= 0) return 'None';
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function noticeLabel(hours: number): string {
  if (hours <= 0) return 'No notice needed';
  if (hours === 24) return '1 day';
  if (hours > 24 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

function limitsSummary(rental: RentalDetails, mode: RentalDurationMode): string {
  const parts: string[] = [];
  if (mode === 'hourly' || mode === 'both') {
    parts.push(
      rental.minDurationHours != null && rental.maxDurationHours != null
        ? `${rental.minDurationHours}–${rental.maxDurationHours} hours`
        : 'Hours not set'
    );
  }
  if (mode === 'daily' || mode === 'both') {
    parts.push(
      rental.minDurationDays != null && rental.maxDurationDays != null
        ? `${rental.minDurationDays}–${rental.maxDurationDays} days`
        : 'Days not set'
    );
  }
  return parts.join(' · ');
}

function fullOperatingDays(rental: RentalDetails): RentalOperatingDay[] {
  return defaultRentalOperatingDays().map(
    (base) => rental.operatingDays?.find((d) => d.day === base.day) ?? { ...base, open: false }
  );
}

function hoursLines(rental: RentalDetails): string[] {
  return groupRentalOperatingHours(fullOperatingDays(rental));
}

function itemTypeText(rental: RentalDetails): string {
  if (rental.itemType === 'custom') return (rental.customItemType ?? '').trim();
  return rentalItemTypeLabel(rental.category, rental.itemType);
}

function variantAttributeText(variant: RentalVariant, cfg: RentalCategoryConfig | null): string {
  return rentalVariantMetaLine(variant, cfg?.variantAttributeKeys ?? []);
}

function variantSpecLine(variant: RentalVariant, cfg: RentalCategoryConfig | null): string {
  const keys = cfg?.variantAttributeKeys ?? [];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const key of keys) {
    const value = (variant.attributes?.[key.key] ?? '').trim();
    if (!value) continue;
    seen.add(key.key);
    parts.push(`${key.label}: ${value}`);
  }
  for (const [key, raw] of Object.entries(variant.attributes ?? {})) {
    const value = raw.trim();
    if (!value || seen.has(key)) continue;
    parts.push(value);
  }
  return parts.join(' · ');
}

function galleryUrlsOf(values: Values): string[] {
  return values.photoSlots.filter((url) => url.startsWith('http'));
}

/** Lowest applicable option rate, matching the public starting price. */
function startingPrice(rental: RentalDetails): { minor: number; unit: 'hour' | 'day' } | null {
  const hourly = rental.durationMode === 'hourly';
  const minor = hourly ? rentalLowestHourPriceMinor(rental) : rentalLowestDayPriceMinor(rental);
  return minor == null ? null : { minor, unit: hourly ? 'hour' : 'day' };
}

function cloneVariant(variant: RentalVariant): RentalVariant {
  return {
    ...variant,
    attributes: { ...(variant.attributes ?? {}) },
    pricingOverride: variant.pricingOverride ? { ...variant.pricingOverride } : variant.pricingOverride ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

function Pill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`rental-pill stay-choice lc-choice min-h-11 rounded-full px-3.5 text-sm font-semibold ${pressed ? 'lc-choice--selected text-[#073b83]' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MissingCategory({ ctx }: { ctx: Ctx }) {
  return (
    <section className="stay-panel space-y-2">
      <p className="text-sm text-ink">Choose a rental category first so we can show the right fields.</p>
      <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => ctx.goTo('category')}>
        Choose category
      </button>
    </section>
  );
}

function PreviewEdit({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="stay-preview-edit inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-finland hover:bg-[#073b83]/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83]"
      aria-label={label}
      onClick={onClick}
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      <span>Edit</span>
    </button>
  );
}

function PreviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="stay-preview-section">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h5 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h5>
        <PreviewEdit onClick={onEdit} label={`Edit ${title}`} />
      </div>
      {children}
    </section>
  );
}

function ChipEditor({
  items,
  suggestions,
  max,
  placeholder,
  addLabel,
  emptyHelp,
  onChange,
}: {
  items: string[];
  suggestions: string[];
  max: number;
  placeholder: string;
  addLabel: string;
  emptyHelp: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const has = (label: string) => items.some((line) => line.toLowerCase() === label.toLowerCase());
  const toggle = (label: string) => {
    onChange(has(label) ? items.filter((line) => line.toLowerCase() !== label.toLowerCase()) : [...items, label].slice(0, max));
  };
  const addCustom = () => {
    const value = draft.trim().slice(0, 80);
    setDraft('');
    if (!value || has(value) || items.length >= max) return;
    onChange([...items, value]);
  };
  const open = suggestions.filter((label) => !has(label));
  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <div>
          <p className="stay-kicker">Added ({items.length}/{max})</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {items.map((line) => (
              <li key={line}>
                <button
                  type="button"
                  aria-label={`Remove ${line}`}
                  className="stay-choice lc-choice lc-choice--selected min-h-11 rounded-full px-3 text-sm font-semibold text-[#073b83]"
                  onClick={() => toggle(line)}
                >
                  {line} <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <StayHelp>{emptyHelp}</StayHelp>
      )}
      {open.length > 0 ? (
        <div>
          <p className="stay-kicker">Suggestions</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {open.map((label) => (
              <li key={label}>
                <Pill pressed={false} onClick={() => toggle(label)}>
                  + {label}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          className="tv-input w-full"
          value={draft}
          maxLength={80}
          placeholder={placeholder}
          aria-label={addLabel}
          disabled={items.length >= max}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button
          type="button"
          className="tv-btn-secondary min-h-11 shrink-0 px-4 text-sm font-semibold"
          disabled={!draft.trim() || items.length >= max}
          onClick={addCustom}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Getting started                                                     */
/* ------------------------------------------------------------------ */

function CategoryStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const choose = (id: RentalCategoryId) => {
    if (rental.category === id) return;
    const nextCfg = RENTAL_CATEGORY_CONFIG[id];
    const attrKeys = new Set(nextCfg.variantAttributeKeys.map((a) => a.key));
    const specKeys = new Set(nextCfg.listingSpecKeys.map((s) => s.key));
    const reqKeys = new Set(nextCfg.requirementKeys.map((r) => r.key));
    const keepItem =
      rental.itemType === 'custom' && nextCfg.allowCustomItemType
        ? 'custom'
        : nextCfg.itemTypes.some((t) => t.id === rental.itemType)
          ? rental.itemType
          : undefined;
    const variants = (rental.variants ?? []).map((v) => ({
      ...v,
      attributes: Object.fromEntries(Object.entries(v.attributes ?? {}).filter(([k]) => attrKeys.has(k))),
    }));
    patchRental({
      category: id,
      itemType: keepItem,
      customItemType: keepItem === 'custom' ? rental.customItemType : undefined,
      specifications: Object.fromEntries(
        Object.entries(rental.specifications ?? {}).filter(
          ([k, v]) => k !== 'skillLevel' && specKeys.has(k) && String(v).trim(),
        )
      ),
      skillSuitability: (rental.skillSuitability ?? rental.specifications?.skillLevel ?? '').trim() || undefined,
      requirements: Object.fromEntries(
        Object.entries(rental.requirements ?? {}).filter(([k, v]) => reqKeys.has(k) && String(v).trim())
      ),
      variants,
      difficulty: nextCfg.difficultyApplies
        ? rental.difficulty === 'not_applicable'
          ? null
          : rental.difficulty
        : 'not_applicable',
    });
  };
  return (
    <div className="grid gap-2" role="group" aria-label="Rental category">
      {RENTAL_CATEGORIES.map((id) => {
        const cfg = RENTAL_CATEGORY_CONFIG[id];
        return (
          <StayChoice key={id} pressed={rental.category === id} onClick={() => choose(id)}>
            <span className="block">{cfg.title}</span>
            <span className="stay-help mt-0.5 block font-normal">{cfg.description}</span>
          </StayChoice>
        );
      })}
    </div>
  );
}

function ItemTypeStage({ ctx }: { ctx: Ctx }) {
  const { cfg, rental, patchRental } = ctx;
  if (!cfg) return <MissingCategory ctx={ctx} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Item type">
        {cfg.itemTypes.map((type) => (
          <StayChoice
            key={type.id}
            pressed={rental.itemType === type.id}
            onClick={() => patchRental({ itemType: type.id, customItemType: undefined })}
          >
            {type.label}
          </StayChoice>
        ))}
        {cfg.allowCustomItemType ? (
          <StayChoice pressed={rental.itemType === 'custom'} onClick={() => patchRental({ itemType: 'custom' })}>
            Something else
          </StayChoice>
        ) : null}
      </div>
      {rental.itemType === 'custom' ? (
        <StayField label="Describe the item type">
          <input
            className="tv-input w-full"
            value={rental.customItemType ?? ''}
            maxLength={80}
            placeholder="e.g. Cargo e-bike"
            onChange={(e) => patchRental({ customItemType: e.target.value.slice(0, 80) })}
          />
        </StayField>
      ) : null}
    </div>
  );
}

function LocationStage({ ctx }: { ctx: Ctx }) {
  const { values, patch } = ctx;
  const zones = useMemo(() => timezoneOptions(values.departureTimezone), [values.departureTimezone]);
  const device = deviceTimezone();
  const selected: VerifiedDestination | null = verifiedDestination({
    placeId: values.destinationPlaceId,
    city: values.city,
    country: values.country,
    countryCode: values.destinationCountryCode,
    formatted: values.destinationFormatted,
    lat: values.destinationLat,
    lng: values.destinationLng,
  });
  return (
    <div className="space-y-4">
      <DestinationSearch
        id="rental-onboarding-destination"
        selected={selected}
        savedLabel={travelerDestinationLabel(values.city, values.country)}
        onSelect={(place: VerifiedDestination) =>
          patch({
            city: place.city,
            country: place.country,
            destinationPlaceId: place.placeId,
            destinationCountryCode: place.countryCode,
            destinationLat: place.lat,
            destinationLng: place.lng,
            destinationFormatted: place.formatted,
          })
        }
        onClear={() =>
          patch({
            city: '',
            country: '',
            destinationPlaceId: '',
            destinationCountryCode: '',
            destinationLat: null,
            destinationLng: null,
            destinationFormatted: '',
          })
        }
      />
      <div>
        <p className="stay-field">
          <span>Time zone</span>
        </p>
        <div className="mt-1.5">
          <PartnerSelect
            value={values.departureTimezone}
            options={zones}
            placeholder="Choose a time zone"
            searchable
            aria-label="Time zone"
            onChange={(departureTimezone) => patch({ departureTimezone })}
          />
        </div>
        <StayHelp>Pickup and return hours are shown in this time zone.</StayHelp>
        {device && device !== values.departureTimezone ? (
          <button
            type="button"
            className="mt-1 min-h-11 text-sm font-semibold text-finland"
            onClick={() => patch({ departureTimezone: device })}
          >
            Use this device’s time zone ({device.replace(/_/g, ' ')})
          </button>
        ) : null}
      </div>
      {values.city.trim() && values.country.trim() ? (
        <StayHelp>Customers will see “{travelerDestinationLabel(values.city, values.country)}”.</StayHelp>
      ) : null}
    </div>
  );
}

function LanguageStage({ ctx }: { ctx: Ctx }) {
  const { values, patch } = ctx;
  return (
    <div className="space-y-3">
      <PartnerSelect
        value={values.experienceLanguage}
        options={LANGUAGES}
        placeholder="Choose a language"
        aria-label="Listing language"
        onChange={(experienceLanguage) => patch({ experienceLanguage })}
      />
      <StayHelp>This is the language you write your title and descriptions in.</StayHelp>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rental details                                                      */
/* ------------------------------------------------------------------ */

function TitleStage({ ctx }: { ctx: Ctx }) {
  const { values, patch } = ctx;
  return (
    <div className="space-y-2">
      <StayField label="Rental title">
        <input
          className="tv-input w-full"
          value={values.title}
          placeholder="e.g. Electric mountain bike rental in Rovaniemi"
          onChange={(e) => patch({ title: clampListingTitleInput(e.target.value, values.title) })}
        />
      </StayField>
      <StayHelp>
        {values.title.trim().length}/{MAX_LISTING_TITLE_LENGTH} · at least 8 characters. Say what it is and where.
      </StayHelp>
    </div>
  );
}

function IntroStage({ ctx }: { ctx: Ctx }) {
  const { values, rental, patch } = ctx;
  const value = rental.shortIntro ?? values.subtitle;
  return (
    <div className="space-y-2">
      <StayField label="Short introduction">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={280}
          value={value}
          placeholder="e.g. Lightweight e-bikes with helmets and a map of local trails."
          onChange={(e) => {
            const next = e.target.value.slice(0, 280);
            patch({ subtitle: next, rental: { ...rental, shortIntro: next } });
          }}
        />
      </StayField>
      <StayHelp>{value.length}/280 · at least 12 characters.</StayHelp>
    </div>
  );
}

function DescriptionStage({ ctx }: { ctx: Ctx }) {
  const { values, patch } = ctx;
  const length = values.description.trim().length;
  return (
    <div className="space-y-2">
      <StayField label="Description">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={8}
          value={values.description}
          placeholder="What the rental is, how it is used, and what the customer should expect."
          onChange={(e) => patch({ description: clampListingDescriptionInput(e.target.value, values.description) })}
        />
      </StayField>
      <StayHelp>
        {length}/{MAX_LISTING_DESCRIPTION_LENGTH} · at least 40 characters
        {length > 0 && length < 40 ? ` (${40 - length} more)` : ''}.
      </StayHelp>
    </div>
  );
}

function HighlightsStage({ ctx }: { ctx: Ctx }) {
  const { values, rental, patch } = ctx;
  const items = values.highlights.map((line) => line.trim()).filter(Boolean);
  return (
    <ChipEditor
      items={items}
      suggestions={rentalHighlightSuggestions(rental.category)}
      max={MAX_HIGHLIGHTS}
      placeholder="Add your own highlight"
      addLabel="Add a highlight"
      emptyHelp={
        rental.category
          ? 'Optional. Tap a suggestion only if it is true for this rental, or write your own. Nothing is saved until you add it.'
          : 'Optional. Choose a category first to see relevant ideas, or write your own highlight.'
      }
      onChange={(next) => patch({ highlights: next, rental: { ...rental, highlights: next } })}
    />
  );
}

function SpecsStage({ ctx }: { ctx: Ctx }) {
  const { cfg, rental, patchRental } = ctx;
  if (!cfg) return <MissingCategory ctx={ctx} />;
  const specs = rental.specifications ?? {};
  const write = (key: string, value: string) => {
    const next = { ...specs };
    if (value.trim()) next[key] = value.slice(0, 160);
    else delete next[key];
    patchRental({ specifications: next });
  };
  return (
    <div className="space-y-4">
      {cfg.listingSpecKeys.map((spec) => (
        <StayField key={spec.key} label={spec.label} optional>
          <input
            className="tv-input w-full"
            value={specs[spec.key] ?? ''}
            maxLength={160}
            placeholder={spec.placeholder}
            onChange={(e) => write(spec.key, e.target.value)}
          />
        </StayField>
      ))}
      <StayHelp>Shared facts only. Sizes and models that differ belong in Rental options.</StayHelp>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

function PhotosStage({ ctx, review }: { ctx: Ctx; review: boolean }) {
  const { props, values, patch } = ctx;
  const count = galleryUrlsOf(values).length;
  const uploadsEnabled = props.uploadsEnabled ?? Boolean(props.userId);
  return (
    <div className="space-y-3">
      <ListingImageFields
        presentation="stay"
        photoSlots={values.photoSlots}
        photoSlotLabels={values.photoSlotLabels}
        photoOriginalUrls={values.photoOriginalUrls}
        photoCropSettings={values.photoCropSettings}
        userId={props.userId}
        uploadsEnabled={uploadsEnabled}
        onPhotosChange={({ slots, labels, originals, crops }: ListingPhotosValue) =>
          patch({
            photoSlots: slots,
            photoSlotLabels: labels,
            photoOriginalUrls: originals,
            photoCropSettings: crops,
          })
        }
      />
      <StayHelp>
        {count < 3
          ? `Add at least three photos to continue (${count} so far, up to ${LISTING_PHOTO_MAX}). The first photo is the cover.`
          : review
            ? `You have ${count} photos. The first photo is the cover. Use the arrows or menu on a photo to reorder, crop, or remove it.`
            : `You have ${count} photos. The first photo is the cover.`}
      </StayHelp>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pickup & return                                                     */
/* ------------------------------------------------------------------ */

function collectionBias(values: Values): { lat: number; lng: number } | null {
  if (values.destinationLat == null || values.destinationLng == null) return null;
  if (!Number.isFinite(values.destinationLat) || !Number.isFinite(values.destinationLng)) return null;
  return { lat: values.destinationLat, lng: values.destinationLng };
}

function PickupStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental, values } = ctx;
  return (
    <div className="space-y-4">
      <RentalCollectionPoint
        id="rental-pickup-address"
        label="Collection address"
        address={rental.pickupAddress ?? ''}
        lat={rental.pickupLat}
        lng={rental.pickupLng}
        bias={collectionBias(values)}
        onSelect={(selection) => {
          const next = applyRentalAddressSelection(rental, 'pickup', selection);
          patchRental({
            pickupAddress: next.pickupAddress,
            pickupLat: next.pickupLat,
            pickupLng: next.pickupLng,
          });
        }}
        onMovePin={(point) => {
          const next = applyRentalCollectionPin(rental, 'pickup', point);
          patchRental({ pickupLat: next.pickupLat, pickupLng: next.pickupLng });
        }}
        onAddressText={(pickupAddress) => patchRental({ pickupAddress })}
      />
      <StayField label="Finding the spot" optional>
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={1000}
          value={rental.pickupInstructions ?? ''}
          placeholder="Parking, entrance, landmarks, who to ask for"
          onChange={(e) => patchRental({ pickupInstructions: e.target.value.slice(0, 1000) })}
        />
      </StayField>
      <StayHelp>Add at least 5 characters to the address. Customers see this after booking opens.</StayHelp>
    </div>
  );
}

function ReturnStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental, values } = ctx;
  const same = rental.returnSameAsPickup !== false;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Return location">
        <StayChoice pressed={same} onClick={() => patchRental({ returnSameAsPickup: true })}>
          Same as pickup location
        </StayChoice>
        <StayChoice pressed={!same} onClick={() => patchRental({ returnSameAsPickup: false })}>
          A different place
        </StayChoice>
      </div>
      {same ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">Pickup address: </span>
            {rental.pickupAddress?.trim() || 'Add the pickup address on the previous screen.'}
          </p>
          {typeof rental.pickupLat === 'number' && typeof rental.pickupLng === 'number' ? (
            <RentalCollectionMap lat={rental.pickupLat} lng={rental.pickupLng} label="Return uses the pickup point" />
          ) : null}
          <StayHelp>Customers return the item here. Move the pin on the pickup screen.</StayHelp>
        </div>
      ) : (
        <>
          <RentalCollectionPoint
            id="rental-return-address"
            label="Return address"
            address={rental.returnAddress ?? ''}
            lat={rental.returnLat}
            lng={rental.returnLng}
            bias={collectionBias(values)}
            onSelect={(selection) => {
              const next = applyRentalAddressSelection(rental, 'return', selection);
              patchRental({
                returnSameAsPickup: false,
                returnAddress: next.returnAddress,
                returnLat: next.returnLat,
                returnLng: next.returnLng,
              });
            }}
            onMovePin={(point) => {
              const next = applyRentalCollectionPin(rental, 'return', point);
              patchRental({ returnLat: next.returnLat, returnLng: next.returnLng });
            }}
            onAddressText={(returnAddress) => patchRental({ returnAddress })}
          />
          <StayField label="Return instructions" optional>
            <textarea
              className="tv-input w-full resize-y py-2"
              rows={3}
              maxLength={1000}
              value={rental.returnInstructions ?? ''}
              placeholder="Entrance, parking, or who to hand it to"
              onChange={(e) => patchRental({ returnInstructions: e.target.value.slice(0, 1000) })}
            />
          </StayField>
        </>
      )}
    </div>
  );
}

const DAY_CHIP: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function HoursWindowFields({
  window,
  onChange,
  pickupLabel,
  returnLabel,
}: {
  window: { earliestPickupHm: string; latestPickupHm: string; earliestReturnHm: string; latestReturnHm: string };
  onChange: (next: typeof window) => void;
  pickupLabel: string;
  returnLabel: string;
}) {
  const field = (key: keyof typeof window, label: string) => (
    <StayField label={label}>
      <input
        type="time"
        className="tv-input w-full"
        value={window[key]}
        aria-label={label}
        onChange={(event) => onChange({ ...window, [key]: event.target.value })}
      />
    </StayField>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {field('earliestPickupHm', `${pickupLabel} from`)}
      {field('latestPickupHm', `${pickupLabel} until`)}
      {field('earliestReturnHm', `${returnLabel} from`)}
      {field('latestReturnHm', `${returnLabel} until`)}
    </div>
  );
}

function HoursStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const days = fullOperatingDays(rental);
  const standard = rentalStandardHours(days);
  const exceptions = rentalHourExceptions(days);
  const issue = rentalOperatingHoursIssue(days);
  const openCount = days.filter((day) => day.open).length;
  const [customDay, setCustomDay] = useState<RentalWeekday>('mon');
  const [copyFrom, setCopyFrom] = useState<RentalWeekday>('mon');
  const [copyTo, setCopyTo] = useState<RentalWeekday>('sat');
  const selected = days.find((day) => day.day === customDay) ?? days[0];
  const save = (operatingDays: RentalOperatingDay[]) => patchRental({ operatingDays });

  return (
    <div className="space-y-4">
      <div>
        <p className="stay-field">Operating days</p>
        <div className="mt-1.5 grid grid-cols-7 gap-1 sm:gap-1.5" role="group" aria-label="Operating days">
          {days.map((day) => (
            <button
              key={day.day}
              type="button"
              aria-pressed={day.open}
              aria-label={`${DAY_LABELS[day.day]} ${day.open ? 'open' : 'closed'}`}
              className={`min-h-11 rounded-xl px-0.5 text-xs font-semibold sm:text-sm ${
                day.open
                  ? 'bg-[#073b83] text-white'
                  : 'border border-[#E6EAF0] bg-white text-ink'
              }`}
              onClick={() => save(toggleRentalOperatingDay(days, day.day))}
            >
              {DAY_CHIP[day.day]}
            </button>
          ))}
        </div>
        <StayHelp>
          {openCount === 0 ? 'Select at least one open day.' : `${openCount} open ${openCount === 1 ? 'day' : 'days'}. Closed days stay off the booking calendar.`}
        </StayHelp>
      </div>

      <section className="stay-panel space-y-3" aria-label="Standard hours">
        <div>
          <p className="text-sm font-semibold text-ink">Standard hours</p>
          <p className="stay-help">Pickup and return windows for every selected day, unless a day is customized below.</p>
        </div>
        <HoursWindowFields
          window={standard}
          pickupLabel="Pickup"
          returnLabel="Return"
          onChange={(next) => save(applyRentalStandardHours(days, next))}
        />
      </section>

      {exceptions.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Custom days">
          {exceptions.map((day) => {
            const hours = rentalHoursWindow(day);
            return (
              <li
                key={day.day}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#E6EAF0] bg-white px-3 py-2 text-sm"
              >
                <p className="min-w-0 text-ink">
                  <span className="font-semibold">{DAY_LABELS[day.day]}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · Pickup {hours.earliestPickupHm}–{hours.latestPickupHm} · Return {hours.earliestReturnHm}–{hours.latestReturnHm}
                  </span>
                </p>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-[#073b83]"
                  onClick={() => save(setRentalDayHours(days, day.day, standard))}
                >
                  Reset
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <details className="rounded-2xl border border-[#E6EAF0] bg-white px-3 py-2">
        <summary className="cursor-pointer py-1 text-sm font-semibold text-ink">Customize individual days</summary>
        <div className="space-y-3 pb-1 pt-3">
          <label className="stay-field block">
            <span>Day</span>
            <select
              className="tv-input mt-1.5 w-full font-normal"
              value={customDay}
              onChange={(event) => setCustomDay(event.target.value as RentalWeekday)}
            >
              {days.map((day) => (
                <option key={day.day} value={day.day}>
                  {DAY_LABELS[day.day]}
                  {day.open ? '' : ' (closed)'}
                </option>
              ))}
            </select>
          </label>
          <HoursWindowFields
            window={rentalHoursWindow(selected)}
            pickupLabel="Pickup"
            returnLabel="Return"
            onChange={(next) => save(setRentalDayHours(days, customDay, next))}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="stay-field block">
              <span>Copy from</span>
              <select
                className="tv-input mt-1.5 w-full font-normal"
                value={copyFrom}
                aria-label="Copy hours from"
                onChange={(event) => setCopyFrom(event.target.value as RentalWeekday)}
              >
                {days.map((day) => (
                  <option key={day.day} value={day.day}>
                    {DAY_LABELS[day.day]}
                  </option>
                ))}
              </select>
            </label>
            <label className="stay-field block">
              <span>Copy to</span>
              <select
                className="tv-input mt-1.5 w-full font-normal"
                value={copyTo}
                aria-label="Copy hours to"
                onChange={(event) => setCopyTo(event.target.value as RentalWeekday)}
              >
                {days.map((day) => (
                  <option key={day.day} value={day.day}>
                    {DAY_LABELS[day.day]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="tv-btn-secondary min-h-11 px-4 text-sm font-semibold"
              onClick={() => save(copyRentalDayHours(days, copyFrom, copyTo))}
            >
              Copy hours
            </button>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-[#073b83]"
            disabled={exceptions.length === 0}
            onClick={() => save(resetRentalHourOverrides(days))}
          >
            Reset all custom days to standard hours
          </button>
        </div>
      </details>

      {issue ? (
        <p className="text-sm text-red-700" role="alert">
          {issue}
        </p>
      ) : null}
      {openCount === 0 ? (
        <p className="text-sm text-red-700" role="alert">
          Open at least one day for pickup and return.
        </p>
      ) : null}
      <StayHelp>Times use this listing’s time zone. Custom days keep their own windows when you change the standard hours.</StayHelp>
    </div>
  );
}

function CollectionStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const staff = rental.staffAssisted === true;
  const selfService = rental.staffAssisted === false;
  const placeholder = staff
    ? 'e.g. Meet staff at the counter. They fit the helmet and show how the lock works.'
    : selfService
      ? 'e.g. The lockbox is by the blue door. The code is shared after booking.'
      : 'Where to meet, what to look for, and how the item is handed over.';
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Handover method">
        <StayChoice pressed={staff} onClick={() => patchRental({ staffAssisted: true })} icon={<UserRound className="h-4 w-4" />}>
          <span className="block">Staff handover</span>
          <span className="stay-help mt-0.5 block font-normal">Someone hands the item to the customer.</span>
        </StayChoice>
        <StayChoice pressed={selfService} onClick={() => patchRental({ staffAssisted: false })} icon={<KeyRound className="h-4 w-4" />}>
          <span className="block">Self-service pickup</span>
          <span className="stay-help mt-0.5 block font-normal">Customers collect it without staff present.</span>
        </StayChoice>
      </div>
      <StayField label="Handover instructions" optional>
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={1000}
          value={rental.collectionNotes ?? ''}
          placeholder={placeholder}
          onChange={(e) => patchRental({ collectionNotes: e.target.value.slice(0, 1000) })}
        />
      </StayField>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

function OptionsStage({ ctx }: { ctx: Ctx }) {
  const { rental, cfg, currency, patchRental, editVariant } = ctx;
  const variants = rental.variants ?? [];
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const canAdd = variants.length < MAX_VARIANTS;

  useEffect(() => {
    if (!menuId) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      const root = document.getElementById(`rental-option-menu-${menuId}`);
      if (target instanceof Node && root?.contains(target)) return;
      setMenuId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuId(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  const duplicate = (variant: RentalVariant) => {
    if (!canAdd) return;
    const copy = cloneVariant(variant);
    editVariant({ ...copy, id: newRentalVariantId(), name: `${variant.name} copy`.slice(0, 80) }, true);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {variants.map((variant) => {
          const pricing = effectiveVariantPricing(rental, variant);
          const complete = rentalVariantComplete(variant, rental);
          const basicsOk = Boolean(variant.name.trim()) && variant.quantity >= 1;
          const specs = variantSpecLine(variant, cfg);
          const confirming = confirmId === variant.id;
          const menuOpen = menuId === variant.id;
          const name = variant.name.trim() || 'Untitled option';
          const units = `${variant.quantity} ${variant.quantity === 1 ? 'unit' : 'units'} available`;
          return (
            <li key={variant.id} className="stay-panel space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{name}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{units}</p>
                  {specs ? <p className="mt-0.5 text-sm text-ink">{specs}</p> : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    complete ? 'bg-[#073b83]/10 text-[#073b83]' : 'bg-[#fff1f2] text-[#9f1239]'
                  }`}
                >
                  {complete ? 'Complete' : basicsOk ? 'Needs pricing' : 'Incomplete'}
                </span>
              </div>
              <p className="text-sm font-semibold text-ink">{formatRentalOptionRates(pricing, rental.durationMode, currency)}</p>
              {confirming ? (
                <div className="space-y-2 rounded-xl bg-[#fff7f7] p-3" role="alert">
                  <p className="text-sm font-semibold text-[#9f1239]">Delete “{name}”? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button type="button" className="tv-btn-secondary min-h-11 px-4 text-sm font-semibold" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="lc-btn-danger min-h-11 rounded-xl px-4 text-sm font-semibold"
                      onClick={() => {
                        setConfirmId(null);
                        patchRental({ variants: variants.filter((row) => row.id !== variant.id) });
                      }}
                    >
                      Delete option
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="tv-btn-primary min-h-11 px-4 text-sm font-semibold" onClick={() => editVariant(cloneVariant(variant), false)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="tv-btn-secondary min-h-11 px-4 text-sm font-semibold"
                    disabled={!canAdd}
                    onClick={() => duplicate(variant)}
                  >
                    Duplicate
                  </button>
                  <div className="relative" id={`rental-option-menu-${variant.id}`}>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E6EAF0] bg-white text-[#073b83]"
                      aria-label={`More actions for ${name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuId(menuOpen ? null : variant.id)}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {menuOpen ? (
                      <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-[#E6EAF0] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#9f1239] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={variants.length <= 1}
                          title={variants.length <= 1 ? 'Keep at least one option' : undefined}
                          onClick={() => {
                            setMenuId(null);
                            setConfirmId(variant.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed border-[#073b83]/35 bg-white px-4 text-sm font-semibold text-[#073b83] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canAdd}
        onClick={() => editVariant(createDefaultRentalVariant(variants.length === 0 ? 'Standard' : 'New option'), true)}
      >
        Add option
      </button>
      <StayHelp>
        One standard option is enough. Add another when a size, model, or variant has its own stock. Quantity is how
        many identical units of that option you can rent at once.
      </StayHelp>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

function DurationModeStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, patchRental } = ctx;
  const choose = (next: RentalDurationMode) => {
    const defaults: Partial<RentalDetails> = { durationMode: next };
    if (next !== 'daily' && rental.minDurationHours == null && rental.maxDurationHours == null) {
      defaults.minDurationHours = 1;
      defaults.maxDurationHours = 8;
    }
    if (next !== 'hourly' && rental.minDurationDays == null && rental.maxDurationDays == null) {
      defaults.minDurationDays = 1;
      defaults.maxDurationDays = 14;
    }
    patchRental(defaults);
  };
  const options: { id: RentalDurationMode; title: string; body: string }[] = [
    { id: 'hourly', title: 'By the hour', body: 'Short rentals, such as a few hours on the trail.' },
    { id: 'daily', title: 'By the day', body: 'Full-day or multi-day rentals.' },
    { id: 'both', title: 'Hourly and daily', body: 'Customers pick whichever suits them.' },
  ];
  return (
    <div className="grid gap-2" role="group" aria-label="Rental duration">
      {options.map((o) => (
        <StayChoice key={o.id} pressed={rental.durationMode != null && mode === o.id} onClick={() => choose(o.id)}>
          <span className="block">{o.title}</span>
          <span className="stay-help mt-0.5 block font-normal">{o.body}</span>
        </StayChoice>
      ))}
    </div>
  );
}

function DurationLimitFields({
  label,
  min,
  max,
  minLabel,
  maxLabel,
  maxValue,
  unit,
  showError,
  onMin,
  onMax,
}: {
  label: string;
  min: number | null | undefined;
  max: number | null | undefined;
  minLabel: string;
  maxLabel: string;
  maxValue: number;
  unit: 'hours' | 'days';
  showError: boolean;
  onMin: (n: number | null) => void;
  onMax: (n: number | null) => void;
}) {
  const issue = rentalDurationFieldIssue(min, max, unit);
  const clash = typeof min === 'number' && typeof max === 'number' && max < min;
  return (
    <section className="space-y-3" aria-label={label}>
      <p className="stay-kicker">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <StayField label={minLabel}>
          <RentalIntegerInput value={min} min={1} max={maxValue} allowEmpty stepper ariaLabel={minLabel} onChange={onMin} />
        </StayField>
        <StayField label={maxLabel}>
          <RentalIntegerInput value={max} min={1} max={maxValue} allowEmpty stepper ariaLabel={maxLabel} onChange={onMax} />
        </StayField>
      </div>
      {issue && (showError || clash) ? (
        <p className="stay-alert !mt-0" role="alert">
          {issue}
        </p>
      ) : null}
    </section>
  );
}

function DurationLimitsStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental, props } = ctx;
  const mode = rental.durationMode;
  const hourly = mode === 'hourly' || mode === 'both';
  const daily = mode === 'daily' || mode === 'both';
  if (!hourly && !daily) return null;
  return (
    <div className="space-y-6">
      {hourly ? (
        <DurationLimitFields
          label="Hourly rentals"
          min={rental.minDurationHours}
          max={rental.maxDurationHours}
          minLabel="Minimum hours"
          maxLabel="Maximum hours"
          maxValue={720}
          unit="hours"
          showError={props.attemptedContinue}
          onMin={(n) => patchRental({ minDurationHours: n })}
          onMax={(n) => patchRental({ maxDurationHours: n })}
        />
      ) : null}
      {daily ? (
        <DurationLimitFields
          label="Daily rentals"
          min={rental.minDurationDays}
          max={rental.maxDurationDays}
          minLabel="Minimum days"
          maxLabel="Maximum days"
          maxValue={365}
          unit="days"
          showError={props.attemptedContinue}
          onMin={(n) => patchRental({ minDurationDays: n })}
          onMax={(n) => patchRental({ maxDurationDays: n })}
        />
      ) : null}
    </div>
  );
}

function DailyRulesStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  useEffect(() => {
    if (rental.calendarDayRentals === false) patchRental({ calendarDayRentals: true });
  }, [patchRental, rental.calendarDayRentals]);
  return (
    <div className="grid gap-2" role="group" aria-label="How a rental day is counted">
      <StayChoice
        pressed
        onClick={() => {
          if (rental.calendarDayRentals === false) patchRental({ calendarDayRentals: true });
        }}
      >
        <span className="block">Calendar days</span>
        <span className="stay-help mt-0.5 block font-normal">
          The pickup date through the return date. The same date counts as one day. Pickup and return stay inside your opening hours.
        </span>
      </StayChoice>
      <StayChoice pressed={false} disabled onClick={() => undefined}>
        <span className="block">24-hour periods</span>
        <span className="stay-help mt-0.5 block font-normal">Coming later</span>
      </StayChoice>
    </div>
  );
}

function PresetNumber({
  label,
  value,
  presets,
  format,
  max,
  customLabel,
  customSuffix,
  onChange,
}: {
  label: string;
  value: number;
  presets: number[];
  format: (n: number) => string;
  max: number;
  customLabel: string;
  customSuffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="stay-kicker">{label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((n) => (
            <Pill key={n} pressed={value === n} onClick={() => onChange(n)}>
              {format(n)}
            </Pill>
          ))}
        </div>
      </fieldset>
      <StayField label={customLabel}>
        <RentalIntegerInput value={value} min={0} max={max} ariaLabel={customLabel} suffix={customSuffix} onChange={(n) => onChange(n ?? 0)} />
      </StayField>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

function RequirementsStage({ ctx }: { ctx: Ctx }) {
  const { cfg, rental, patchRental } = ctx;
  if (!cfg) return <MissingCategory ctx={ctx} />;
  const reqs = rental.requirements ?? {};
  const write = (key: string, value: string) => {
    const next = { ...reqs };
    if (value.trim()) next[key] = value.slice(0, 240);
    else delete next[key];
    patchRental({ requirements: next });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Identification at pickup">
        <StayChoice pressed={rental.idRequired === true} onClick={() => patchRental({ idRequired: true })}>
          <span className="block">ID required at pickup</span>
          <span className="stay-help mt-0.5 block font-normal">Customers bring a valid ID.</span>
        </StayChoice>
        <StayChoice pressed={rental.idRequired === false} onClick={() => patchRental({ idRequired: false })}>
          <span className="block">No ID required</span>
          <span className="stay-help mt-0.5 block font-normal">Identification is not part of this rental.</span>
        </StayChoice>
      </div>
      {cfg.requirementKeys.map((req) => {
        if (req.key === 'idRequiredNote' && rental.idRequired !== true && !(reqs[req.key] ?? '').trim()) return null;
        const required = (cfg.id === 'snowmobiles' || cfg.id === 'vehicles') && req.key === 'license';
        return (
          <StayField key={req.key} label={req.label} optional={!required} required={required}>
            <input
              className="tv-input w-full"
              value={reqs[req.key] ?? ''}
              maxLength={240}
              placeholder={req.placeholder}
              aria-required={required}
              onChange={(e) => write(req.key, e.target.value)}
            />
          </StayField>
        );
      })}
      <StayHelp>
        Identification is set here only. Leave a line blank when it does not apply. Customers see what you fill in.
      </StayHelp>
    </div>
  );
}

function AccessibilityStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const status = rental.accessibilityStatus ?? 'not_specified';
  const features = rental.accessibilityFeatures ?? [];
  const setStatus = (accessibilityStatus: RentalAccessibilityStatus) => patchRental({ accessibilityStatus });
  const toggle = (label: string) => {
    const has = features.some((item) => item.toLowerCase() === label.toLowerCase());
    patchRental({
      accessibilityStatus: 'details_provided',
      accessibilityFeatures: has ? features.filter((item) => item.toLowerCase() !== label.toLowerCase()) : [...features, label],
    });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2" role="group" aria-label="Accessibility status">
        <StayChoice pressed={status === 'not_specified'} onClick={() => setStatus('not_specified')}>
          <span className="block">Not specified</span>
          <span className="stay-help mt-0.5 block font-normal">You have not confirmed access at pickup.</span>
        </StayChoice>
        <StayChoice pressed={status === 'not_applicable'} onClick={() => setStatus('not_applicable')}>
          <span className="block">Not applicable</span>
          <span className="stay-help mt-0.5 block font-normal">Access details do not apply to this rental.</span>
        </StayChoice>
        <StayChoice pressed={status === 'details_provided'} onClick={() => setStatus('details_provided')}>
          <span className="block">I have access details</span>
          <span className="stay-help mt-0.5 block font-normal">Describe the pickup place, not how hard the product is.</span>
        </StayChoice>
      </div>
      {status === 'details_provided' ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Access details">
            {ACCESS_FEATURES.map((label) => (
              <Pill key={label} pressed={features.some((item) => item.toLowerCase() === label.toLowerCase())} onClick={() => toggle(label)}>
                {label}
              </Pill>
            ))}
          </div>
          <StayField label="Notes" optional>
            <textarea
              className="tv-input w-full resize-y py-2"
              rows={3}
              maxLength={1000}
              value={rental.accessibilityNotes ?? ''}
              placeholder="For example, a ramp at the side door, or help carrying heavier kits."
              onChange={(e) => patchRental({ accessibilityNotes: e.target.value.slice(0, 1000) })}
            />
          </StayField>
        </>
      ) : (
        <StayHelp>
          Not specified means access is unknown. Not applicable means you chose not to describe it. Neither means the
          pickup is inaccessible.
        </StayHelp>
      )}
    </div>
  );
}

function SuitabilityStage({ ctx }: { ctx: Ctx }) {
  const { cfg, rental, patchRental } = ctx;
  const applies = cfg?.difficultyApplies === true;
  const choices: { id: RentalDifficulty; label: string }[] = [
    { id: 'easy', label: 'Easy' },
    { id: 'moderate', label: 'Moderate' },
    { id: 'challenging', label: 'Challenging' },
    { id: 'not_applicable', label: 'Not applicable' },
  ];
  return (
    <div className="space-y-4">
      {applies ? (
        <div className="space-y-2">
        <p className="stay-kicker">Difficulty</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Difficulty">
          {choices.map((choice) => (
            <Pill
              key={choice.id}
              pressed={rental.difficulty === choice.id}
              onClick={() => patchRental({ difficulty: choice.id })}
            >
              {choice.label}
            </Pill>
          ))}
        </div>
        </div>
      ) : (
        <StayHelp>Difficulty is not used for this category. You can still say who it suits.</StayHelp>
      )}
      {applies || (rental.skillSuitability ?? rental.specifications?.skillLevel ?? '').trim() ? (
        <StayField label="Skill suitability" optional>
          <input
            className="tv-input w-full"
            maxLength={160}
            value={rental.skillSuitability ?? rental.specifications?.skillLevel ?? ''}
            placeholder="e.g. Beginner to intermediate"
            onChange={(e) => {
              const specifications = { ...(rental.specifications ?? {}) };
              delete specifications.skillLevel;
              const skillSuitability = e.target.value.slice(0, 160);
              patchRental({
                skillSuitability,
                specifications,
              });
            }}
          />
        </StayField>
      ) : null}
      {rentalSkillConflictsDifficulty(rental.difficulty, rental.skillSuitability) ? (
        <p className="stay-alert !mt-0" role="alert">
          This skill line disagrees with the level above. Customers will see the level only until the two match.
        </p>
      ) : applies ? (
        <StayHelp>Use the level for the main fit. Add a skill line only when you need a range the level does not say.</StayHelp>
      ) : null}
      <StayField label="Who is this rental suitable for?" optional>
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={500}
          value={rental.suitableFor ?? ''}
          placeholder="e.g. Riders who want a relaxed day on marked trails"
          onChange={(e) => patchRental({ suitableFor: e.target.value.slice(0, 500) })}
        />
      </StayField>
      <StayField label="Who is this rental not suitable for?" optional>
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={500}
          value={rental.notSuitableFor ?? ''}
          placeholder="Practical limits, such as a size range. Do not exclude people for personal characteristics."
          onChange={(e) => patchRental({ notSuitableFor: e.target.value.slice(0, 500) })}
        />
      </StayField>
    </div>
  );
}

function RestrictionsStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <ChipEditor
      items={rental.restrictions ?? []}
      suggestions={rentalRestrictionSuggestions(rental.category)}
      max={16}
      placeholder="Add a restriction"
      addLabel="Add a restriction"
      emptyHelp="Optional. List uses you do not allow. Customers will see these before booking."
      onChange={(restrictions) => patchRental({ restrictions })}
    />
  );
}

function InclusionsStage({ ctx }: { ctx: Ctx }) {
  const { cfg, rental, patchRental } = ctx;
  return (
    <ChipEditor
      items={rental.inclusions ?? []}
      suggestions={cfg?.inclusionSuggestions ?? []}
      max={MAX_INCLUSIONS}
      placeholder="Add something that is included"
      addLabel="Add an included item"
      emptyHelp="List what comes with the rental at no extra charge. This step is optional."
      onChange={(next) => patchRental({ inclusions: next })}
    />
  );
}

function RulesStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const value = rental.rentalRules ?? '';
  return (
    <div className="space-y-2">
      <StayField label="Rental rules" optional>
        <textarea
          className="tv-input rental-rules-input w-full resize-y py-2.5"
          rows={7}
          maxLength={4000}
          value={value}
          placeholder="Where the item may be used, how it must be returned, cleaning, damage reporting, and late returns."
          onChange={(e) => patchRental({ rentalRules: e.target.value.slice(0, 4000) })}
        />
      </StayField>
      <StayHelp>
        {value.length}/4000 · Cover permitted use, return condition, cleaning, damage reporting, and late returns if
        they matter. Keep this practical.
      </StayHelp>
    </div>
  );
}

function CancellationStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <div className="space-y-4">
      <div className="grid gap-2" role="group" aria-label="Cancellation policy">
        {RENTAL_CANCELLATION_PRESETS.map((preset) => (
          <StayChoice
            key={preset.id}
            pressed={rental.cancellationPreset === preset.id}
            onClick={() => patchRental({ cancellationPreset: preset.id })}
          >
            <span className="block">{preset.title}</span>
            <span className="stay-help mt-0.5 block font-normal">{preset.body}</span>
          </StayChoice>
        ))}
      </div>
      <StayHelp>
        Choose one window before you finish. Customers see this wording. Traverion does not issue automatic rental refunds.
      </StayHelp>
    </div>
  );
}

function DepositStage({ ctx }: { ctx: Ctx }) {
  const { rental, currency, patchRental } = ctx;
  const method = rental.depositCollectionMethod ?? null;
  const methodLabel = (id: typeof method) => {
    if (id === 'cash_at_pickup') return 'Cash at pickup';
    if (id === 'card_at_pickup') return 'Card at pickup (supplier-managed)';
    if (id === 'other') return 'Other supplier-managed method';
    return '';
  };
  return (
    <div className="space-y-5">
      <section className="stay-panel space-y-2" aria-label="Traverion deposit policy">
        <p className="stay-kicker">Important</p>
        <p className="text-sm font-semibold leading-relaxed text-ink">
          Traverion does not currently collect security deposits online.
        </p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Anything you configure here is informational for customers. It is not charged, held, or released through
          Traverion checkout.
        </p>
      </section>

      <section className="space-y-3" aria-label="Security deposit">
        <p className="stay-kicker">Security deposit</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Is a deposit required?">
          <StayChoice
            pressed={rental.depositRequired === true}
            onClick={() => patchRental({ depositRequired: true })}
          >
            Deposit required
          </StayChoice>
          <StayChoice
            pressed={rental.depositRequired === false}
            onClick={() => patchRental(clearRentalDepositAmounts(rental))}
          >
            No deposit
          </StayChoice>
        </div>
        {rental.depositRequired === true ? (
          <div className="space-y-3">
            <StayField label={`Deposit amount (${currency})`}>
              <RentalMoneyInput
                value={rental.depositAmountMinor}
                currency={currency}
                ariaLabel="Deposit amount"
                onChange={(depositAmountMinor) =>
                  patchRental({ depositAmountMinor, depositCurrency: currency })
                }
              />
            </StayField>
            <div>
              <p className="stay-field">
                <span>How you collect it</span>
              </p>
              <div className="mt-1.5 grid gap-2" role="group" aria-label="Deposit collection method">
                {(
                  [
                    ['cash_at_pickup', 'Cash at pickup'],
                    ['card_at_pickup', 'Card at pickup (you handle it)'],
                    ['other', 'Other'],
                  ] as const
                ).map(([id, label]) => (
                  <StayChoice
                    key={id}
                    pressed={method === id}
                    onClick={() => patchRental({ depositCollectionMethod: id })}
                  >
                    {label}
                  </StayChoice>
                ))}
              </div>
            </div>
            <StayField label="Return / refund conditions" optional>
              <textarea
                className="tv-input w-full resize-y py-2"
                rows={3}
                maxLength={500}
                value={rental.depositReturnNotes ?? ''}
                placeholder="When and how the deposit is returned after the rental."
                onChange={(e) => patchRental({ depositReturnNotes: e.target.value.slice(0, 500) })}
              />
            </StayField>
            {method ? <StayHelp>Customers will see: {methodLabel(method)}.</StayHelp> : null}
          </div>
        ) : null}
        <StayField label="Extra deposit notes" optional>
          <textarea
            className="tv-input w-full resize-y py-2"
            rows={3}
            maxLength={1000}
            value={rental.depositDisclosure ?? ''}
            placeholder="Anything else customers should know about the deposit."
            onChange={(e) => patchRental({ depositDisclosure: e.target.value.slice(0, 1000) })}
          />
        </StayField>
      </section>

      <section className="space-y-3" aria-label="Insurance">
        <p className="stay-kicker">Insurance</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Is insurance included?">
          <StayChoice
            pressed={rental.insuranceIncluded === true}
            onClick={() => patchRental({ insuranceIncluded: true })}
          >
            Insurance included
          </StayChoice>
          <StayChoice
            pressed={rental.insuranceIncluded === false}
            onClick={() => patchRental({ insuranceIncluded: false })}
          >
            Not included
          </StayChoice>
        </div>
        <StayField label="Coverage notes" optional>
          <textarea
            className="tv-input w-full resize-y py-2"
            rows={2}
            maxLength={1000}
            value={rental.insuranceCoverageNotes ?? rental.insuranceDisclosure ?? ''}
            placeholder="What is covered, if anything."
            onChange={(e) =>
              patchRental({
                insuranceCoverageNotes: e.target.value.slice(0, 1000),
                insuranceDisclosure: e.target.value.slice(0, 1000),
              })
            }
          />
        </StayField>
        <StayField label="Exclusions" optional>
          <textarea
            className="tv-input w-full resize-y py-2"
            rows={2}
            maxLength={1000}
            value={rental.insuranceExclusions ?? ''}
            placeholder="What is not covered."
            onChange={(e) => patchRental({ insuranceExclusions: e.target.value.slice(0, 1000) })}
          />
        </StayField>
        <StayHelp>Traverion does not provide this insurance and does not handle claims.</StayHelp>
        <StayField label="Excess / deductible" optional>
          <input
            className="tv-input w-full"
            maxLength={500}
            value={rental.insuranceExcessNotes ?? ''}
            placeholder="e.g. €200 excess on damage claims"
            onChange={(e) => patchRental({ insuranceExcessNotes: e.target.value.slice(0, 500) })}
          />
        </StayField>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview & publish                                                   */
/* ------------------------------------------------------------------ */

function RentalPreviewGallery({ photos, title }: { photos: string[]; title: string }) {
  const n = photos.length;
  const alt = title.trim() ? `${title.trim()} photo` : 'Rental photo';
  if (n === 0) {
    return (
      <div className="rental-preview-gallery rental-preview-gallery--empty flex min-h-[10rem] items-center justify-center rounded-xl bg-[#F4F6F8] text-sm text-ink-muted">
        Add photos to preview the gallery
      </div>
    );
  }
  if (n === 1) {
    return (
      <div className="rental-preview-gallery rental-preview-gallery--solo overflow-hidden rounded-xl bg-[#F4F6F8]">
        <img src={photos[0]} alt={alt} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className="rental-preview-gallery rental-preview-gallery--duo overflow-hidden rounded-xl">
        {photos.slice(0, 2).map((url, i) => (
          <div key={url} className="rental-preview-gallery-cell bg-[#F4F6F8]">
            <img src={url} alt={`${alt} ${i + 1}`} />
          </div>
        ))}
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="rental-preview-gallery rental-preview-gallery--trio overflow-hidden rounded-xl">
        <div className="rental-preview-gallery-main bg-[#F4F6F8]">
          <img src={photos[0]} alt={`${alt} 1`} />
        </div>
        <div className="rental-preview-gallery-side">
          {photos.slice(1, 3).map((url, i) => (
            <div key={url} className="rental-preview-gallery-cell bg-[#F4F6F8]">
              <img src={url} alt={`${alt} ${i + 2}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const side = photos.slice(1, 5);
  return (
    <div className="rental-preview-gallery rental-preview-gallery--multi overflow-hidden rounded-xl">
      <div className="rental-preview-gallery-main bg-[#F4F6F8]">
        <img src={photos[0]} alt={`${alt} 1`} />
      </div>
      <div className="rental-preview-gallery-side rental-preview-gallery-side--grid">
        {side.map((url, i) => (
          <div key={url} className="rental-preview-gallery-cell relative bg-[#F4F6F8]">
            <img src={url} alt={`${alt} ${i + 2}`} />
            {i === side.length - 1 && n > 5 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
                +{n - 5} more
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewStage({ ctx }: { ctx: Ctx }) {
  const { values, rental, cfg, mode, currency, goTo } = ctx;
  const photos = galleryUrlsOf(values);
  const variants = rental.variants ?? [];
  const from = startingPrice(rental);
  const highlights = values.highlights.map((l) => l.trim()).filter(Boolean);
  const inclusions = (rental.inclusions ?? []).map((l) => l.trim()).filter(Boolean);
  const specs = Object.entries(rental.specifications ?? {}).filter(([key, value]) => key !== 'skillLevel' && value.trim());
  const specLabel = (key: string) => cfg?.listingSpecKeys.find((s) => s.key === key)?.label ?? key;
  const reqs = Object.entries(rental.requirements ?? {}).filter(([, v]) => v.trim());
  const reqLabel = (key: string) => cfg?.requirementKeys.find((r) => r.key === key)?.label ?? key;
  const hours = hoursLines(rental);
  const returnPoint = rentalReturnPoint(rental);
  const cancellation = RENTAL_CANCELLATION_PRESETS.find((p) => p.id === rental.cancellationPreset);
  const place = travelerDestinationLabel(values.city, values.country);
  const description = values.description.trim();
  const intro = (rental.shortIntro || values.subtitle || '').trim();
  const showDeposit = rentalHasDepositInfo(rental);
  const showInsurance = rentalHasInsuranceInfo(rental);
  const depositMethod =
    rental.depositCollectionMethod === 'cash_at_pickup'
      ? 'Cash at pickup'
      : rental.depositCollectionMethod === 'card_at_pickup'
        ? 'Card at pickup (supplier-managed)'
        : rental.depositCollectionMethod === 'other'
          ? 'Other supplier-managed method'
          : null;

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-[#F4F6F8] px-3.5 py-2.5 text-sm text-ink-muted" role="note">
        Supplier preview of the saved listing. It is wider so you can read it like a product page. Travelers cannot
        book it, and it is not published.
      </p>
      <article className="stay-preview-shell overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]">
        <div className="space-y-5 p-4 sm:p-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h5 className="font-display text-base font-semibold text-ink">Photos</h5>
              <PreviewEdit onClick={() => goTo('photos')} label="Edit photos" />
            </div>
            <RentalPreviewGallery photos={photos} title={values.title} />
          </section>

          <section className="stay-preview-section">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="stay-kicker">
                  {[cfg?.title, itemTypeText(rental)].filter(Boolean).join(' · ') || 'Rental'}
                </p>
                <h4 className="mt-1 font-display text-xl font-semibold text-ink sm:text-2xl">
                  {values.title.trim() || 'Untitled rental'}
                </h4>
                <p className="mt-1 text-sm text-ink-muted">{place || 'Location not set'}</p>
              </div>
              <PreviewEdit onClick={() => goTo('title')} label="Edit title" />
            </div>
            {from ? (
              <p className="mt-3 text-base font-semibold text-ink">
                From {formatRentalMinor(from.minor, currency)}
                <span className="font-normal text-ink-muted"> / {from.unit}</span>
                <span className="ml-1 font-normal text-ink-muted">per unit</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Add prices to show a starting rate.</p>
            )}
            {intro ? <p className="mt-2 text-sm leading-relaxed text-ink">{intro}</p> : null}
          </section>

          <PreviewSection title="Rental options" onEdit={() => goTo('options')}>
            {variants.length === 0 ? (
              <p className="text-sm text-ink-muted">No options yet.</p>
            ) : (
              <ul className="space-y-2">
                {variants.map((variant) => {
                  const attrs = variantAttributeText(variant, cfg);
                  const price = formatRentalOptionRates(effectiveVariantPricing(rental, variant), rental.durationMode, currency);
                  return (
                    <li
                      key={variant.id}
                      className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-[#E6EAF0]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{variant.name.trim() || 'Untitled option'}</p>
                        <p className="stay-help">{attrs}</p>
                        {variant.description?.trim() ? (
                          <p className="mt-1 text-sm text-ink-muted">{variant.description.trim()}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-right text-sm font-semibold text-ink">{price}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </PreviewSection>

          {description ? (
            <PreviewSection title="About this rental" onEdit={() => goTo('description')}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{description}</p>
            </PreviewSection>
          ) : null}

          {highlights.length > 0 ? (
            <PreviewSection title="Highlights" onEdit={() => goTo('basics-highlights')}>
              <ul className="flex flex-wrap gap-2">
                {highlights.map((line) => (
                  <li key={line} className="rounded-full bg-[#F4F6F8] px-3 py-1.5 text-sm text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          {specs.length > 0 ? (
            <PreviewSection title="Specifications" onEdit={() => goTo('specs')}>
              <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {specs.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-ink-muted">{specLabel(key)}</dt>
                    <dd className="font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </PreviewSection>
          ) : null}

          <PreviewSection title="Availability & duration" onEdit={() => goTo('availability-summary')}>
            <ul className="space-y-1 text-sm text-ink">
              <li>
                Rent {durationLabel(mode).toLowerCase()} · {limitsSummary(rental, mode)}
              </li>
              {(rental.bookingNoticeHours ?? 0) > 0 ? (
                <li>Book at least {noticeLabel(rental.bookingNoticeHours ?? 0)} ahead</li>
              ) : null}
              {Number(rental.bufferMinutes ?? 0) > 0 ? (
                <li>{bufferLabel(Number(rental.bufferMinutes))} preparation between rentals</li>
              ) : null}
              {mode === 'daily' || mode === 'both' ? (
                <li>Daily rentals run from the pickup date to the return date</li>
              ) : null}
            </ul>
          </PreviewSection>

          <PreviewSection title="Pickup & return" onEdit={() => goTo('pickup')}>
            <div className="space-y-2 text-sm text-ink">
              <p>
                <span className="font-semibold">Pickup:</span> {rental.pickupAddress?.trim() || 'Not set'}
              </p>
              {typeof rental.pickupLat === 'number' && typeof rental.pickupLng === 'number' ? (
                <RentalCollectionMap lat={rental.pickupLat} lng={rental.pickupLng} label="Pickup location map" />
              ) : null}
              <p>
                <span className="font-semibold">Return:</span>{' '}
                {returnPoint.sameAsPickup
                  ? returnPoint.address
                    ? `Same as pickup · ${returnPoint.address}`
                    : 'Same as pickup location'
                  : returnPoint.address || 'Not set'}
              </p>
              {!returnPoint.sameAsPickup && returnPoint.lat != null && returnPoint.lng != null ? (
                <RentalCollectionMap lat={returnPoint.lat} lng={returnPoint.lng} label="Return location map" />
              ) : null}
              {rental.pickupInstructions?.trim() ? <p className="text-ink-muted">{rental.pickupInstructions.trim()}</p> : null}
              {rental.returnSameAsPickup === false && rental.returnInstructions?.trim() ? (
                <p className="text-ink-muted">{rental.returnInstructions.trim()}</p>
              ) : null}
              {hours.length > 0 ? (
                <ul className="stay-help space-y-0.5">
                  {hours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {rental.collectionNotes?.trim() ? <p className="text-ink-muted">{rental.collectionNotes.trim()}</p> : null}
              {rental.staffAssisted != null ? (
                <p className="text-ink-muted">
                  {rental.staffAssisted ? 'Staff hand over the item' : 'Self-service pickup'}
                </p>
              ) : null}
            </div>
          </PreviewSection>

          {inclusions.length > 0 ? (
            <PreviewSection title="What's included" onEdit={() => goTo('inclusions')}>
              <ul className="grid gap-1 text-sm text-ink sm:grid-cols-2">
                {inclusions.map((line) => (
                  <li key={line}>✓ {line}</li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          {reqs.length > 0 || rental.idRequired != null ? (
            <PreviewSection title="Customer requirements" onEdit={() => goTo('requirements')}>
              <dl className="space-y-1.5 text-sm">
                {reqs.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-ink-muted">{reqLabel(key)}</dt>
                    <dd className="text-right font-semibold text-ink">{value}</dd>
                  </div>
                ))}
                {rental.idRequired != null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">ID at pickup</dt>
                    <dd className="font-semibold text-ink">{rental.idRequired ? 'Required' : 'Not required'}</dd>
                  </div>
                ) : null}
              </dl>
            </PreviewSection>
          ) : null}

          {rental.accessibilityStatus === 'details_provided' || rental.accessibilityStatus === 'not_applicable' ? (
            <PreviewSection title="Accessibility" onEdit={() => goTo('accessibility')}>
              <div className="space-y-1 text-sm text-ink">
                {rental.accessibilityStatus === 'not_applicable' ? <p>Not applicable for this rental.</p> : null}
                {(rental.accessibilityFeatures ?? []).length > 0 ? (
                  <ul className="space-y-1">
                    {(rental.accessibilityFeatures ?? []).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {rental.accessibilityNotes?.trim() ? <p>{rental.accessibilityNotes.trim()}</p> : null}
              </div>
            </PreviewSection>
          ) : null}

          {rental.difficulty ||
          rental.suitableFor?.trim() ||
          rental.notSuitableFor?.trim() ||
          (rental.skillSuitability ?? '').trim() ? (
            <PreviewSection title="Suitability" onEdit={() => goTo('suitability')}>
              <div className="space-y-1 text-sm text-ink">
                {rental.difficulty === 'easy' ? <p>Easy</p> : null}
                {rental.difficulty === 'moderate' ? <p>Moderate</p> : null}
                {rental.difficulty === 'challenging' ? <p>Challenging</p> : null}
                {rental.difficulty === 'not_applicable' ? <p>Difficulty is not used for this rental.</p> : null}
                {rentalCustomerSkillSuitability(rental) ? <p>Skill suitability: {rentalCustomerSkillSuitability(rental)}</p> : null}
                {rentalSkillConflictsDifficulty(rental.difficulty, rental.skillSuitability) ? (
                  <p className="text-ink-muted">
                    Saved skill line “{rental.skillSuitability?.trim()}” conflicts with the level, so customers will not see it.
                  </p>
                ) : null}
                {rental.suitableFor?.trim() ? <p>Suitable for: {rental.suitableFor.trim()}</p> : null}
                {rental.notSuitableFor?.trim() ? <p>Not suitable for: {rental.notSuitableFor.trim()}</p> : null}
              </div>
            </PreviewSection>
          ) : null}

          {(rental.restrictions ?? []).length > 0 ? (
            <PreviewSection title="Restrictions" onEdit={() => goTo('restrictions')}>
              <ul className="space-y-1 text-sm text-ink">
                {(rental.restrictions ?? []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          {rental.rentalRules?.trim() ? (
            <PreviewSection title="Rental rules" onEdit={() => goTo('rules')}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{rental.rentalRules.trim()}</p>
            </PreviewSection>
          ) : null}

          {cancellation ? (
            <PreviewSection title="Cancellation policy" onEdit={() => goTo('cancellation')}>
              <p className="text-sm text-ink">
                <span className="font-semibold">{cancellation.title}.</span> {cancellation.body}
              </p>
              <p className="stay-help mt-1">Shown to customers once rental bookings open — not active yet.</p>
            </PreviewSection>
          ) : null}

          {showDeposit || showInsurance ? (
            <PreviewSection title="Deposit & insurance" onEdit={() => goTo('deposit-info')}>
              <div className="space-y-2 text-sm text-ink">
                {showDeposit ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Security deposit</p>
                    {rental.depositRequired === false ? <p>No deposit required</p> : null}
                    {rental.depositRequired === true ? (
                      <>
                        {rental.depositAmountMinor != null && rental.depositAmountMinor > 0 ? (
                          <p>{formatRentalMinor(rental.depositAmountMinor, rental.depositCurrency || currency)}</p>
                        ) : null}
                        {depositMethod ? <p>{depositMethod}</p> : null}
                        {rental.depositReturnNotes?.trim() ? <p>{rental.depositReturnNotes.trim()}</p> : null}
                      </>
                    ) : null}
                    {rental.depositDisclosure?.trim() ? <p>{rental.depositDisclosure.trim()}</p> : null}
                  </div>
                ) : null}
                {showInsurance ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Insurance</p>
                    {rental.insuranceIncluded === true ? <p>Included</p> : null}
                    {rental.insuranceIncluded === false ? <p>Not included</p> : null}
                    {(rental.insuranceCoverageNotes || rental.insuranceDisclosure)?.trim() ? (
                      <p>{(rental.insuranceCoverageNotes || rental.insuranceDisclosure || '').trim()}</p>
                    ) : null}
                    {rental.insuranceExclusions?.trim() ? (
                      <p>
                        <span className="text-ink-muted">Exclusions:</span> {rental.insuranceExclusions.trim()}
                      </p>
                    ) : null}
                    {rental.insuranceExcessNotes?.trim() ? (
                      <p>
                        <span className="text-ink-muted">Excess:</span> {rental.insuranceExcessNotes.trim()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="stay-help">Traverion does not collect security deposits online.</p>
              </div>
            </PreviewSection>
          ) : null}

          <section className="rounded-xl bg-[#F8FAFC] px-3.5 py-3 ring-1 ring-[#E6EAF0]" aria-label="Booking status">
            <p className="text-sm font-semibold text-ink">Booking stays closed</p>
            <p className="mt-1 text-sm text-ink-muted">
              This preview does not take payment. Online rental checkout stays closed until Traverion opens it.
            </p>
            <button
              type="button"
              disabled
              className="tv-btn-primary mt-3 min-h-11 w-full cursor-not-allowed px-4 text-sm font-semibold opacity-50"
            >
              Booking unavailable
            </button>
          </section>
        </div>
      </article>
    </div>
  );
}

function PublishStage({ ctx, check }: { ctx: Ctx; check: RentalOnboardingCheck }) {
  const { values, props, goTo } = ctx;
  const issues = rentalPublishBlockers(check);
  const ready = issues.length === 0;
  const cover = galleryUrlsOf(values)[0];
  const groups = RENTAL_COMPLETION_GROUPS.map((group) => {
    const blockers = group.screens
      .map((screenId) => ({ screenId, issue: rentalStageBlocker(screenId, check) }))
      .filter((row) => row.issue);
    return { ...group, blockers, complete: blockers.length === 0 };
  }).sort((a, b) => Number(a.complete) - Number(b.complete));

  return (
    <div className="space-y-4">
      <div className="stay-panel flex flex-col gap-3 sm:flex-row sm:items-center">
        {cover ? (
          <img src={cover} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-xs text-ink-muted">
            No photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-ink">
            {values.title.trim() || 'Untitled rental'}
          </p>
          <p className="text-sm text-ink-muted">
            {travelerDestinationLabel(values.city, values.country) || 'Location not set'}
          </p>
          <p className={`mt-1 text-sm font-semibold ${ready ? 'text-[#073b83]' : 'text-[#9f1239]'}`} role="status">
            {ready
              ? 'Setup complete — ready to save as a finished draft'
              : `${issues.length} item${issues.length === 1 ? '' : 's'} still need${issues.length === 1 ? 's' : ''} attention`}
          </p>
        </div>
      </div>

      {ready ? (
        <section className="stay-panel space-y-2" aria-label="Completion confirmation">
          <p className="text-sm font-semibold text-ink">Everything required for this draft is filled in.</p>
          <p className="text-sm text-ink-muted">
            Finishing setup saves your draft. The listing stays unpublished, and travelers cannot book until Traverion
            Rentals launches.
          </p>
        </section>
      ) : (
        <section className="stay-panel space-y-2" aria-label="Still needed">
          <p className="stay-kicker">Still needed</p>
          <ul className="overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
            {issues.map((line) => (
              <li
                key={line}
                className="flex items-start justify-between gap-3 border-t border-[#E6EAF0] bg-[#FFF8F8] px-3 py-2.5 first:border-t-0"
              >
                <p className="min-w-0 text-sm text-ink">{line}</p>
                <PreviewEdit
                  onClick={() => props.onEditStage(rentalScreenIndexForPublishLine(line))}
                  label={`Fix: ${line}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-label="Setup checklist by section">
        <p className="stay-kicker">Sections</p>
        {groups.map((group) => (
          <div
            key={group.id}
            className={`stay-panel space-y-2 ${group.complete ? '' : 'ring-1 ring-[#fecdd3]'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{group.label}</p>
                <p className={`text-sm ${group.complete ? 'text-ink-muted' : 'text-[#9f1239]'}`}>
                  {group.complete ? 'Complete' : group.blockers[0]?.issue}
                </p>
              </div>
              <PreviewEdit
                onClick={() => goTo(group.blockers[0]?.screenId ?? group.screens[0])}
                label={`Edit ${group.label}`}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="stay-panel space-y-1" aria-label="Booking status">
        <p className="stay-kicker">Before you finish</p>
        <p className="text-sm leading-relaxed text-ink">
          Finish rental setup saves a complete draft only. Travelers cannot book rentals yet, and your listing stays
          unpublished until Traverion Rentals launches.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main flow                                                           */
/* ------------------------------------------------------------------ */

export default function RentalOnboardingFlow(props: Props) {
  const { values, onChange } = props;
  const stage = RENTAL_ONBOARDING_SCREENS[props.stage] ?? RENTAL_ONBOARDING_SCREENS[0];
  const id: RentalOnboardingScreenId = stage.id;
  const rental = values.rental;
  const cfg = rentalCategoryConfig(rental.category);
  const mode: RentalDurationMode = rental.durationMode ?? 'daily';
  const currency = normalizeCurrency(props.listingCurrency);
  const [editing, setEditing] = useState<{ variant: RentalVariant; isNew: boolean } | null>(null);

  // Stale-closure-safe access for effects.
  const latest = useRef({ values, onChange });
  latest.current = { values, onChange };

  const variantCount = rental.variants?.length ?? 0;
  useEffect(() => {
    if ((id === 'options' || id === 'pricing-overrides') && variantCount === 0) {
      const { values: v, onChange: change } = latest.current;
      change({ rental: ensureRentalHasDefaultVariant(v.rental) });
    }
  }, [id, variantCount]);

  // Close any open option editor when the stage changes.
  useEffect(() => {
    setEditing(null);
  }, [id]);

  const ctx: Ctx = {
    props,
    values,
    rental,
    cfg,
    mode,
    currency,
    patch: onChange,
    patchRental: (next) => onChange({ rental: { ...rental, ...next } }),
    goTo: (target) => props.onEditStage(rentalScreenIndex(resolveRentalScreenId(target))),
    editVariant: (variant, isNew) => setEditing({ variant, isNew }),
  };

  const check: RentalOnboardingCheck = {
    title: values.title,
    subtitle: values.subtitle,
    description: values.description,
    highlights: values.highlights,
    galleryCount: galleryUrlsOf(values).length,
    city: values.city,
    country: values.country,
    experienceLanguage: values.experienceLanguage,
    rental,
  };
  const blocker = rentalStageBlocker(id, check);

  const saveEditing = () => {
    if (!editing) return;
    onChange({ rental: { ...rental, variants: upsertRentalVariant(rental.variants ?? [], editing.variant) } });
    setEditing(null);
  };

  const previewWide = id === 'preview' || id === 'publish';
  const wide =
    previewWide ||
    id === 'photos' ||
    id === 'hours' ||
    id === 'options' ||
    id === 'pickup-location' ||
    id === 'return-location' ||
    id === 'handover' ||
    id === 'duration' ||
    id === 'daily-counting' ||
    id === 'booking-rules';

  const showBack = props.returnStage != null && props.stage !== props.returnStage;

  let body: ReactNode = null;
  switch (id) {
    case 'basics-category':
      body = <CategoryStage ctx={ctx} />;
      break;
    case 'basics-item':
      body = <ItemTypeStage ctx={ctx} />;
      break;
    case 'basics-location':
      body = (
        <div className="space-y-6">
          <LocationStage ctx={ctx} />
          <div className="space-y-2">
            <p className="stay-kicker">Listing language</p>
            <LanguageStage ctx={ctx} />
          </div>
        </div>
      );
      break;
    case 'basics-title':
      body = (
        <div className="space-y-6">
          <TitleStage ctx={ctx} />
          <IntroStage ctx={ctx} />
        </div>
      );
      break;
    case 'basics-description':
      body = <DescriptionStage ctx={ctx} />;
      break;
    case 'basics-highlights':
      body = <HighlightsStage ctx={ctx} />;
      break;
    case 'basics-specs':
      body = <SpecsStage ctx={ctx} />;
      break;
    case 'photos':
      body = <PhotosStage ctx={ctx} review={false} />;
      break;
    case 'pickup-location':
      body = <PickupStage ctx={ctx} />;
      break;
    case 'return-location':
      body = <ReturnStage ctx={ctx} />;
      break;
    case 'handover':
      body = <CollectionStage ctx={ctx} />;
      break;
    case 'hours':
      body = <HoursStage ctx={ctx} />;
      break;
    case 'options':
      body = <OptionsStage ctx={ctx} />;
      break;
    case 'duration':
      body = (
        <div className="space-y-6">
          <DurationModeStage ctx={ctx} />
          <DurationLimitsStage ctx={ctx} />
        </div>
      );
      break;
    case 'daily-counting':
      body = <DailyRulesStage ctx={ctx} />;
      break;
    case 'booking-rules':
      body = (
        <div className="space-y-6">
          <PresetNumber
            label="Preparation time between bookings"
            value={Number(rental.bufferMinutes ?? 0)}
            presets={BUFFER_PRESETS}
            format={bufferLabel}
            max={1440}
            customLabel="Custom preparation time"
            customSuffix="min"
            onChange={(bufferMinutes) => ctx.patchRental({ bufferMinutes })}
          />
          <PresetNumber
            label="Minimum booking notice"
            value={rental.bookingNoticeHours ?? 0}
            presets={NOTICE_PRESETS}
            format={noticeLabel}
            max={168}
            customLabel="Custom notice"
            customSuffix="hours"
            onChange={(bookingNoticeHours) => ctx.patchRental({ bookingNoticeHours })}
          />
        </div>
      );
      break;
    case 'requirements':
      body = <RequirementsStage ctx={ctx} />;
      break;
    case 'accessibility':
      body = <AccessibilityStage ctx={ctx} />;
      break;
    case 'suitability':
      body = <SuitabilityStage ctx={ctx} />;
      break;
    case 'restrictions':
      body = <RestrictionsStage ctx={ctx} />;
      break;
    case 'inclusions':
      body = <InclusionsStage ctx={ctx} />;
      break;
    case 'rules':
      body = <RulesStage ctx={ctx} />;
      break;
    case 'cancellation':
      body = <CancellationStage ctx={ctx} />;
      break;
    case 'deposit-info':
      body = <DepositStage ctx={ctx} />;
      break;
    case 'preview':
      body = <PreviewStage ctx={ctx} />;
      break;
    case 'publish':
      body = <PublishStage ctx={ctx} check={check} />;
      break;
  }

  return (
    <>
    <div
      key={props.stage}
      className={`stay-creator rental-creator mx-auto w-full ${previewWide ? 'max-w-[72rem]' : wide ? 'max-w-3xl' : 'max-w-xl'} ${
        props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="stay-kicker">
            {stage.group}
            {stage.part && !/of 1$/.test(stage.part) ? ` · ${stage.part}` : ''}
          </p>
        </div>
        {showBack ? (
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={props.onBackToPreview}>
            Back to preview
          </button>
        ) : null}
      </div>
      <h3 className="stay-title font-display font-semibold">{stage.title}</h3>
      <p className="stay-lede mt-2">{stage.body}</p>
      <div className="mt-6">{body}</div>
      {props.attemptedContinue && blocker ? (
        <p className="stay-alert" role="alert">
          {blocker}
        </p>
      ) : null}
    </div>
    {/* Rendered outside the animated stage wrapper so position:fixed is not affected by its transform. */}
    {editing ? (
      <RentalOptionEditor
        open
        variant={editing.variant}
        rental={rental}
        listingCurrency={currency}
        commissionBps={props.commissionBps}
        onChange={(variant) => setEditing((cur) => (cur ? { ...cur, variant } : cur))}
        onSave={saveEditing}
        onCancel={() => setEditing(null)}
      />
    ) : null}
    </>
  );
}
