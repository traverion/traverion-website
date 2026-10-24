import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import {
  RENTAL_ONBOARDING_SCREENS,
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
  rentalItemTypeLabel,
  type RentalCategoryConfig,
} from '../../../lib/rental-categories';
import {
  createDefaultRentalVariant,
  defaultRentalOperatingDays,
  effectiveVariantPricing,
  ensureRentalHasDefaultVariant,
  newRentalVariantId,
  rentalVariantComplete,
} from '../../../lib/rental-details';
import { formatBpsAsPercent, splitGrossByCommissionBps } from '../../../lib/commercial-money';
import { clampListingDescriptionInput, clampListingTitleInput, MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH } from '../../../lib/listingQualityScore';
import { LISTING_PHOTO_MAX, type ListingPhotoCropSettings } from '../../../lib/listingPhotoGrid';
import { normalizeCurrency } from '../../../lib/money';
import { travelerDestinationLabel } from '../../../lib/destination-place';
import { RENTAL_CATEGORIES } from '../../../types/rental';
import type {
  RentalCategoryId,
  RentalDetails,
  RentalDurationMode,
  RentalOperatingDay,
  RentalPricing,
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
  rentalPricingSummary,
} from './RentalOptionEditor';
import { StayChoice, StayField, StayHelp } from './StayCreatorUi';

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
  goTo: (id: RentalOnboardingScreenId) => void;
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

const HIGHLIGHT_SUGGESTIONS = [
  'Well maintained',
  'Easy pickup and return',
  'Suitable for beginners',
  'Safety briefing included',
  'Family friendly',
];

const CANCELLATION_PRESETS: { id: string; title: string; body: string }[] = [
  { id: 'flexible_24h', title: 'Flexible', body: 'Free cancellation until 24 hours before pickup.' },
  { id: 'moderate_72h', title: 'Moderate', body: 'Free cancellation until 72 hours before pickup.' },
  { id: 'firm_7d', title: 'Firm', body: 'Free cancellation until 7 days before pickup.' },
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
  return fullOperatingDays(rental)
    .filter((d) => d.open)
    .map(
      (d) =>
        `${DAY_LABELS[d.day] ?? d.day}: pickup ${d.earliestPickupHm ?? '—'}–${d.latestPickupHm ?? '—'}, return ${d.earliestReturnHm ?? '—'}–${d.latestReturnHm ?? '—'}`
    );
}

function itemTypeText(rental: RentalDetails): string {
  if (rental.itemType === 'custom') return (rental.customItemType ?? '').trim();
  return rentalItemTypeLabel(rental.category, rental.itemType);
}

function variantAttributeText(variant: RentalVariant, cfg: RentalCategoryConfig | null): string {
  const attrs = variant.attributes ?? {};
  const keys = cfg?.variantAttributeKeys ?? [];
  return keys
    .map((k) => (attrs[k.key] ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

function galleryUrlsOf(values: Values): string[] {
  return values.photoSlots.filter((url) => url.startsWith('http'));
}

/** Lowest per-unit price across all options for the primary duration unit. */
function startingPrice(rental: RentalDetails, mode: RentalDurationMode): { minor: number; unit: string } | null {
  const unit = mode === 'hourly' ? 'hour' : 'day';
  let best: number | null = null;
  for (const v of rental.variants ?? []) {
    const p = effectiveVariantPricing(rental, v);
    const minor = unit === 'hour' ? p.pricePerHourMinor : p.pricePerDayMinor;
    if (minor != null && minor > 0 && (best == null || minor < best)) best = minor;
  }
  return best == null ? null : { minor: best, unit };
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
      className={`stay-choice lc-choice min-h-11 rounded-full px-3 text-sm font-semibold ${pressed ? 'lc-choice--selected text-[#073b83]' : ''}`}
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

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <li className="flex items-start justify-between gap-3 border-t border-[#E6EAF0] px-3 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm text-ink-muted">{value}</p>
      </div>
      <PreviewEdit onClick={onEdit} label={`Edit ${label}`} />
    </li>
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
    const keys = new Set(RENTAL_CATEGORY_CONFIG[id].variantAttributeKeys.map((a) => a.key));
    const variants = (rental.variants ?? []).map((v) => ({
      ...v,
      attributes: Object.fromEntries(Object.entries(v.attributes ?? {}).filter(([k]) => keys.has(k))),
    }));
    patchRental({
      category: id,
      itemType: undefined,
      customItemType: undefined,
      specifications: {},
      requirements: {},
      variants,
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
          placeholder="What is included, who it suits, how handover works, and what to expect."
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
      suggestions={HIGHLIGHT_SUGGESTIONS}
      max={MAX_HIGHLIGHTS}
      placeholder="Add your own highlight"
      addLabel="Add a highlight"
      emptyHelp="Customers only see highlights you add. This step is optional."
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
        <StayField key={spec.key} label={spec.label}>
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

function PickupStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <div className="space-y-4">
      <StayField label="Pickup address or meeting place">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={2}
          maxLength={240}
          value={rental.pickupAddress ?? ''}
          placeholder="Street, number, and area — or a clear meeting point"
          onChange={(e) => patchRental({ pickupAddress: e.target.value.slice(0, 240) })}
        />
      </StayField>
      <StayField label="Finding the spot (optional)">
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
  const { rental, patchRental } = ctx;
  const same = rental.returnSameAsPickup !== false;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Return location">
        <StayChoice pressed={same} onClick={() => patchRental({ returnSameAsPickup: true })}>
          Same as pickup
        </StayChoice>
        <StayChoice pressed={!same} onClick={() => patchRental({ returnSameAsPickup: false })}>
          A different place
        </StayChoice>
      </div>
      {!same ? (
        <>
          <StayField label="Return address or meeting place">
            <textarea
              className="tv-input w-full resize-y py-2"
              rows={2}
              maxLength={240}
              value={rental.returnAddress ?? ''}
              onChange={(e) => patchRental({ returnAddress: e.target.value.slice(0, 240) })}
            />
          </StayField>
          <StayField label="Return instructions (optional)">
            <textarea
              className="tv-input w-full resize-y py-2"
              rows={3}
              maxLength={1000}
              value={rental.returnInstructions ?? ''}
              onChange={(e) => patchRental({ returnInstructions: e.target.value.slice(0, 1000) })}
            />
          </StayField>
        </>
      ) : (
        <StayHelp>Customers return the item to the pickup place.</StayHelp>
      )}
    </div>
  );
}

function HoursStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  const days = fullOperatingDays(rental);
  const write = (day: string, next: Partial<RentalOperatingDay>) =>
    patchRental({ operatingDays: days.map((d) => (d.day === day ? { ...d, ...next } : d)) });
  const source = days.find((d) => d.open);
  const copyToAll = () => {
    if (!source) return;
    patchRental({
      operatingDays: days.map((d) =>
        d.open
          ? {
              ...d,
              earliestPickupHm: source.earliestPickupHm,
              latestPickupHm: source.latestPickupHm,
              earliestReturnHm: source.earliestReturnHm,
              latestReturnHm: source.latestReturnHm,
            }
          : d
      ),
    });
  };
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const name = DAY_LABELS[d.day] ?? d.day;
        return (
          <section key={d.day} className="stay-panel space-y-3" aria-label={name}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <Pill pressed={d.open} onClick={() => write(d.day, { open: !d.open })}>
                {d.open ? 'Open' : 'Closed'}
              </Pill>
            </div>
            {d.open ? (
              <div className="grid grid-cols-2 gap-3">
                <StayField label="Pickup from">
                  <input
                    type="time"
                    className="tv-input w-full"
                    value={d.earliestPickupHm ?? ''}
                    aria-label={`${name} earliest pickup`}
                    onChange={(e) => write(d.day, { earliestPickupHm: e.target.value })}
                  />
                </StayField>
                <StayField label="Pickup until">
                  <input
                    type="time"
                    className="tv-input w-full"
                    value={d.latestPickupHm ?? ''}
                    aria-label={`${name} latest pickup`}
                    onChange={(e) => write(d.day, { latestPickupHm: e.target.value })}
                  />
                </StayField>
                <StayField label="Return from">
                  <input
                    type="time"
                    className="tv-input w-full"
                    value={d.earliestReturnHm ?? ''}
                    aria-label={`${name} earliest return`}
                    onChange={(e) => write(d.day, { earliestReturnHm: e.target.value })}
                  />
                </StayField>
                <StayField label="Return until">
                  <input
                    type="time"
                    className="tv-input w-full"
                    value={d.latestReturnHm ?? ''}
                    aria-label={`${name} latest return`}
                    onChange={(e) => write(d.day, { latestReturnHm: e.target.value })}
                  />
                </StayField>
              </div>
            ) : null}
          </section>
        );
      })}
      {source ? (
        <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={copyToAll}>
          Use {DAY_LABELS[source.day]}’s times for every open day
        </button>
      ) : null}
      <StayHelp>Open at least one day. Times are in your listing’s time zone.</StayHelp>
    </div>
  );
}

function CollectionStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <div className="space-y-4">
      <StayField label="How customers receive the item (optional)">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={4}
          maxLength={1000}
          value={rental.collectionNotes ?? ''}
          placeholder="e.g. We fit the helmet, adjust the seat, and show how the lock works."
          onChange={(e) => patchRental({ collectionNotes: e.target.value.slice(0, 1000) })}
        />
      </StayField>
      <fieldset>
        <legend className="stay-kicker">Handover</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill pressed={rental.staffAssisted === true} onClick={() => patchRental({ staffAssisted: true })}>
            Staff hand over the item
          </Pill>
          <Pill pressed={rental.staffAssisted === false} onClick={() => patchRental({ staffAssisted: false })}>
            Self-service pickup
          </Pill>
        </div>
      </fieldset>
      <fieldset>
        <legend className="stay-kicker">ID at pickup</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill pressed={rental.idRequired === true} onClick={() => patchRental({ idRequired: true })}>
            ID required
          </Pill>
          <Pill pressed={rental.idRequired === false} onClick={() => patchRental({ idRequired: false })}>
            ID not required
          </Pill>
        </div>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

function OptionsStage({ ctx }: { ctx: Ctx }) {
  const { rental, cfg, mode, currency, patchRental, editVariant } = ctx;
  const variants = rental.variants ?? [];
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canAdd = variants.length < MAX_VARIANTS;

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
          const attrs = variantAttributeText(variant, cfg);
          const confirming = confirmId === variant.id;
          return (
            <li key={variant.id} className="stay-panel space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{variant.name.trim() || 'Untitled option'}</p>
                  <p className="text-sm text-ink-muted">
                    {variant.quantity} {variant.quantity === 1 ? 'unit' : 'units'}
                    {attrs ? ` · ${attrs}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    complete ? 'bg-[#073b83]/10 text-[#073b83]' : 'bg-[#fff1f2] text-[#9f1239]'
                  }`}
                >
                  {complete ? 'Complete' : basicsOk ? 'Needs pricing' : 'Incomplete'}
                </span>
              </div>
              <p className="text-sm text-ink">
                {rentalPricingSummary(pricing, mode, currency)}
                <span className="stay-help"> · {variant.pricingOverride ? 'Custom price' : 'Shared rate'}</span>
              </p>
              {confirming ? (
                <div className="space-y-2 rounded-xl bg-[#fff7f7] p-3" role="alert">
                  <p className="text-sm font-semibold text-[#9f1239]">
                    Delete “{variant.name.trim() || 'this option'}”? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="tv-btn-secondary min-h-11 px-4 text-sm font-semibold" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="lc-btn-danger min-h-11 rounded-xl px-4 text-sm font-semibold"
                      onClick={() => {
                        setConfirmId(null);
                        patchRental({ variants: variants.filter((v) => v.id !== variant.id) });
                      }}
                    >
                      Delete option
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
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
                  <button
                    type="button"
                    className="lc-btn-danger min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
                    disabled={variants.length <= 1}
                    title={variants.length <= 1 ? 'Keep at least one option' : undefined}
                    onClick={() => setConfirmId(variant.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="tv-btn-secondary min-h-11 w-full px-4 text-sm font-semibold"
        disabled={!canAdd}
        onClick={() => editVariant(createDefaultRentalVariant(variants.length === 0 ? 'Standard' : 'New option'), true)}
      >
        + Add option
      </button>
      <StayHelp>
        Most rentals need just one option. Add more for different sizes or models, each with its own stock. Keep at
        least one.
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

function DurationLimitsStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, patchRental } = ctx;
  const hourly = mode === 'hourly' || mode === 'both';
  const daily = mode === 'daily' || mode === 'both';
  return (
    <div className="space-y-5">
      {hourly ? (
        <section className="stay-panel space-y-3" aria-label="Hourly limits">
          <p className="stay-kicker">Hourly rentals</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StayField label="Minimum hours">
              <RentalIntegerInput
                value={rental.minDurationHours}
                min={1}
                max={720}
                allowEmpty
                stepper
                ariaLabel="Minimum hours"
                onChange={(n) => patchRental({ minDurationHours: n })}
              />
            </StayField>
            <StayField label="Maximum hours">
              <RentalIntegerInput
                value={rental.maxDurationHours}
                min={1}
                max={720}
                allowEmpty
                stepper
                ariaLabel="Maximum hours"
                onChange={(n) => patchRental({ maxDurationHours: n })}
              />
            </StayField>
          </div>
        </section>
      ) : null}
      {daily ? (
        <section className="stay-panel space-y-3" aria-label="Daily limits">
          <p className="stay-kicker">Daily rentals</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <StayField label="Minimum days">
              <RentalIntegerInput
                value={rental.minDurationDays}
                min={1}
                max={365}
                allowEmpty
                stepper
                ariaLabel="Minimum days"
                onChange={(n) => patchRental({ minDurationDays: n })}
              />
            </StayField>
            <StayField label="Maximum days">
              <RentalIntegerInput
                value={rental.maxDurationDays}
                min={1}
                max={365}
                allowEmpty
                stepper
                ariaLabel="Maximum days"
                onChange={(n) => patchRental({ maxDurationDays: n })}
              />
            </StayField>
          </div>
        </section>
      ) : null}
      <StayHelp>The maximum must be at least the minimum.</StayHelp>
    </div>
  );
}

function DailyRulesStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, patchRental } = ctx;
  const calendar = rental.calendarDayRentals !== false;
  if (mode === 'hourly') {
    return (
      <section className="stay-panel space-y-2">
        <p className="text-sm text-ink">Daily rules only apply when you offer daily rentals.</p>
        <p className="stay-help">Your rental is hourly. Change this in Availability if you want to add daily rentals.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-2" role="group" aria-label="Daily rental style">
        <StayChoice pressed={calendar} onClick={() => patchRental({ calendarDayRentals: true })}>
          <span className="block">Calendar days</span>
          <span className="stay-help mt-0.5 block font-normal">
            A day runs from pickup to return within your opening hours. Customers pick up and return on open days.
          </span>
        </StayChoice>
        <StayChoice pressed={!calendar} onClick={() => patchRental({ calendarDayRentals: false })}>
          <span className="block">24-hour periods</span>
          <span className="stay-help mt-0.5 block font-normal">
            Each day lasts 24 hours from the pickup time the customer chooses.
          </span>
        </StayChoice>
      </div>
      <StayHelp>Pickup and return hours come from the Pickup & return step.</StayHelp>
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

function AvailabilitySummaryStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, goTo } = ctx;
  const hours = hoursLines(rental);
  return (
    <div className="space-y-3">
      <ul className="overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
        <SummaryRow label="Rental length" value={durationLabel(mode)} onEdit={() => goTo('duration-mode')} />
        <SummaryRow label="Minimum and maximum" value={limitsSummary(rental, mode) || '—'} onEdit={() => goTo('duration-limits')} />
        <SummaryRow
          label="Daily rules"
          value={mode === 'hourly' ? 'Not used for hourly rentals' : rental.calendarDayRentals === false ? '24-hour periods' : 'Calendar days'}
          onEdit={() => goTo('daily-rules')}
        />
        <SummaryRow label="Preparation time" value={bufferLabel(Number(rental.bufferMinutes ?? 0))} onEdit={() => goTo('buffers')} />
        <SummaryRow label="Booking notice" value={noticeLabel(rental.bookingNoticeHours ?? 0)} onEdit={() => goTo('notice')} />
        <SummaryRow
          label="Pickup and return hours"
          value={hours.length > 0 ? `${hours.length} open ${hours.length === 1 ? 'day' : 'days'}` : 'No open days'}
          onEdit={() => goTo('hours')}
        />
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

function PricingStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, currency, patchRental } = ctx;
  const shared = rental.sharedPricing ?? {};
  const write = (next: Partial<RentalPricing>) => patchRental({ sharedPricing: { ...shared, currency, ...next } });
  return (
    <div className="space-y-4">
      {mode === 'daily' || mode === 'both' ? (
        <StayField label="Price per day">
          <RentalMoneyInput
            value={shared.pricePerDayMinor}
            currency={currency}
            ariaLabel="Price per day"
            onChange={(minor) => write({ pricePerDayMinor: minor })}
          />
        </StayField>
      ) : null}
      {mode === 'hourly' || mode === 'both' ? (
        <StayField label="Price per hour">
          <RentalMoneyInput
            value={shared.pricePerHourMinor}
            currency={currency}
            ariaLabel="Price per hour"
            onChange={(minor) => write({ pricePerHourMinor: minor })}
          />
        </StayField>
      ) : null}
      <StayHelp>
        Enter the price customers pay per unit, in {currency}. Every option uses it unless you set a custom price.
      </StayHelp>
    </div>
  );
}

function MultiDayStage({ ctx }: { ctx: Ctx }) {
  const { rental, mode, currency, patchRental } = ctx;
  const shared = rental.sharedPricing ?? {};
  if (mode === 'hourly') {
    return (
      <section className="stay-panel space-y-2">
        <p className="text-sm text-ink">Multi-day discounts only apply to daily rentals.</p>
        <p className="stay-help">You can skip this step.</p>
      </section>
    );
  }
  const percent = shared.multiDayDiscountPercent ?? 0;
  const enabled = percent > 0;
  const minDays = shared.multiDayDiscountMinDays ?? 3;
  const write = (next: Partial<RentalPricing>) => patchRental({ sharedPricing: { ...shared, currency, ...next } });
  const day = shared.pricePerDayMinor ?? 0;
  const discounted = Math.round(day * (1 - percent / 100));
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Multi-day discount">
        <StayChoice pressed={!enabled} onClick={() => write({ multiDayDiscountPercent: null, multiDayDiscountMinDays: null })}>
          No discount
        </StayChoice>
        <StayChoice
          pressed={enabled}
          onClick={() => {
            if (!enabled) write({ multiDayDiscountPercent: 10, multiDayDiscountMinDays: 3 });
          }}
        >
          Discount for longer rentals
        </StayChoice>
      </div>
      {enabled ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <StayField label="Discount">
              <RentalIntegerInput
                value={percent}
                min={1}
                max={90}
                stepper
                suffix="%"
                ariaLabel="Discount percent"
                onChange={(n) => write({ multiDayDiscountPercent: n ?? 10 })}
              />
            </StayField>
            <StayField label="From this many days">
              <RentalIntegerInput
                value={minDays}
                min={2}
                max={90}
                stepper
                ariaLabel="Minimum days for discount"
                onChange={(n) => write({ multiDayDiscountMinDays: n ?? 3 })}
              />
            </StayField>
          </div>
          {day > 0 ? (
            <StayHelp>
              Example: from {minDays} days, each day costs {formatRentalMinor(discounted, currency)} instead of{' '}
              {formatRentalMinor(day, currency)}.
            </StayHelp>
          ) : (
            <StayHelp>Set a daily price in the previous step to see an example.</StayHelp>
          )}
        </div>
      ) : (
        <StayHelp>Optional. You can skip this step.</StayHelp>
      )}
    </div>
  );
}

function PricingOverridesStage({ ctx }: { ctx: Ctx }) {
  const { rental, cfg, mode, currency, goTo, editVariant } = ctx;
  const variants = rental.variants ?? [];
  return (
    <div className="space-y-4">
      <section className="stay-panel flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="stay-kicker">Shared rates</p>
          <p className="mt-1 text-base font-semibold text-ink">
            {rentalPricingSummary(rental.sharedPricing ?? {}, mode, currency)}
          </p>
          <p className="stay-help mt-1">Options inherit these unless you set a custom price.</p>
        </div>
        <PreviewEdit onClick={() => goTo('pricing')} label="Edit shared rates" />
      </section>
      <ul className="space-y-2">
        {variants.map((variant) => {
          const pricing = effectiveVariantPricing(rental, variant);
          const attrs = variantAttributeText(variant, cfg);
          return (
            <li key={variant.id} className="stay-panel flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{variant.name.trim() || 'Untitled option'}</p>
                {attrs ? <p className="stay-help">{attrs}</p> : null}
                <p className="mt-1 text-sm text-ink">{rentalPricingSummary(pricing, mode, currency)}</p>
                <p className="stay-help">{variant.pricingOverride ? 'Custom price' : 'Uses shared rate'}</p>
              </div>
              <button
                type="button"
                className="tv-btn-secondary min-h-11 shrink-0 px-4 text-sm font-semibold"
                onClick={() => editVariant(cloneVariant(variant), false)}
              >
                {variant.pricingOverride ? 'Edit price' : 'Set custom'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EarningsStage({ ctx }: { ctx: Ctx }) {
  const { props, rental, mode, currency, goTo } = ctx;
  const bps = props.commissionBps;
  const [bothUnit, setBothUnit] = useState<'day' | 'hour'>('day');
  const unit: 'day' | 'hour' = mode === 'hourly' ? 'hour' : mode === 'daily' ? 'day' : bothUnit;
  const shared = rental.sharedPricing ?? {};
  const gross = unit === 'day' ? shared.pricePerDayMinor : shared.pricePerHourMinor;
  const hasPrice = gross != null && gross > 0 && Number.isInteger(gross);

  let split: { commissionMinor: number; supplierMinor: number } | null = null;
  if (hasPrice && bps != null) {
    try {
      const s = splitGrossByCommissionBps(gross, bps);
      split = { commissionMinor: s.commissionMinor, supplierMinor: s.supplierMinor };
    } catch {
      split = null;
    }
  }
  let percent = '';
  if (bps != null) {
    try {
      percent = formatBpsAsPercent(bps);
    } catch {
      percent = '';
    }
  }

  return (
    <div className="space-y-4">
      {mode === 'both' ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Example duration">
          <Pill pressed={unit === 'day'} onClick={() => setBothUnit('day')}>
            1 day
          </Pill>
          <Pill pressed={unit === 'hour'} onClick={() => setBothUnit('hour')}>
            1 hour
          </Pill>
        </div>
      ) : null}
      {!hasPrice ? (
        <section className="stay-panel space-y-2">
          <p className="text-sm text-ink">Set a {unit === 'day' ? 'daily' : 'hourly'} price to see an example.</p>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => goTo('pricing')}>
            Set prices
          </button>
        </section>
      ) : (
        <section className="stay-panel space-y-3" aria-label="Example earnings">
          <p className="stay-kicker">Example · 1 {unit} × 1 unit</p>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink">Customer pays</dt>
              <dd className="font-semibold text-ink">{formatRentalMinor(gross, currency)}</dd>
            </div>
            {split ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Traverion commission{percent ? ` (${percent})` : ''}</dt>
                  <dd className="text-ink-muted">− {formatRentalMinor(split.commissionMinor, currency)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-[#E6EAF0] pt-2">
                  <dt className="font-semibold text-ink">You earn</dt>
                  <dd className="text-base font-semibold text-[#073b83]">{formatRentalMinor(split.supplierMinor, currency)}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {!split ? (
            <p className="text-sm text-ink-muted" role="status">
              {bps == null
                ? 'Your commission and earnings load from your commercial terms. They will appear here once available.'
                : 'We could not calculate earnings for this example.'}
            </p>
          ) : null}
        </section>
      )}
      <StayHelp>
        This is an example based on your shared {unit === 'day' ? 'daily' : 'hourly'} rate. It is not a final checkout
        quote, and travelers cannot book rentals yet.
      </StayHelp>
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
      {cfg.requirementKeys.map((req) => {
        const required = cfg.id === 'snowmobiles' && req.key === 'license';
        return (
          <StayField key={req.key} label={required ? `${req.label} (required)` : req.label}>
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
      <StayHelp>Customers see these before they book. Leave blank what does not apply.</StayHelp>
    </div>
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
      <StayField label="Rental rules (optional)">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={7}
          maxLength={4000}
          value={value}
          placeholder="Where the item may be used, how it must be returned, cleaning, damage, and late returns."
          onChange={(e) => patchRental({ rentalRules: e.target.value.slice(0, 4000) })}
        />
      </StayField>
      <StayHelp>{value.length}/4000</StayHelp>
    </div>
  );
}

function CancellationStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <div className="space-y-4">
      <div className="grid gap-2" role="group" aria-label="Cancellation policy">
        {CANCELLATION_PRESETS.map((preset) => (
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
        Your choice is saved with this draft. Customers see the terms before they pay once rental bookings open.
      </StayHelp>
    </div>
  );
}

function DepositStage({ ctx }: { ctx: Ctx }) {
  const { rental, patchRental } = ctx;
  return (
    <div className="space-y-4">
      <section className="stay-panel space-y-2">
        <p className="stay-kicker">Traverion standard</p>
        <p className="text-sm font-semibold leading-relaxed text-ink">
          Traverion does not collect security deposits online yet.
        </p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Customers are not charged a deposit at checkout. If you need a deposit or an insurance excess, explain how you
          handle it below. This is shown for information only and is not enforced or collected by Traverion.
        </p>
      </section>
      <StayField label="Deposit information (optional)">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={4}
          maxLength={1000}
          value={rental.depositDisclosure ?? ''}
          placeholder="e.g. A refundable €100 deposit is taken in cash at pickup."
          onChange={(e) => patchRental({ depositDisclosure: e.target.value.slice(0, 1000) })}
        />
      </StayField>
      <StayField label="Insurance information (optional)">
        <textarea
          className="tv-input w-full resize-y py-2"
          rows={3}
          maxLength={1000}
          value={rental.insuranceDisclosure ?? ''}
          placeholder="e.g. Basic damage cover is included; theft is not covered."
          onChange={(e) => patchRental({ insuranceDisclosure: e.target.value.slice(0, 1000) })}
        />
      </StayField>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview & publish                                                   */
/* ------------------------------------------------------------------ */

function PreviewStage({ ctx }: { ctx: Ctx }) {
  const { values, rental, cfg, mode, currency, goTo } = ctx;
  const photos = galleryUrlsOf(values);
  const cover = photos[0];
  const side = photos.slice(1, 4);
  const variants = rental.variants ?? [];
  const from = startingPrice(rental, mode);
  const highlights = values.highlights.map((l) => l.trim()).filter(Boolean);
  const inclusions = rental.inclusions ?? [];
  const specs = Object.entries(rental.specifications ?? {}).filter(([, v]) => v.trim());
  const specLabel = (key: string) => cfg?.listingSpecKeys.find((s) => s.key === key)?.label ?? key;
  const reqs = Object.entries(rental.requirements ?? {}).filter(([, v]) => v.trim());
  const reqLabel = (key: string) => cfg?.requirementKeys.find((r) => r.key === key)?.label ?? key;
  const hours = hoursLines(rental);
  const cancellation = CANCELLATION_PRESETS.find((p) => p.id === rental.cancellationPreset);
  const place = travelerDestinationLabel(values.city, values.country);
  const description = values.description.trim();
  const intro = (rental.shortIntro || values.subtitle || '').trim();

  return (
    <div className="space-y-5">
      <article className="stay-preview-shell overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]">
        <div className="space-y-5 p-4 sm:p-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h5 className="font-display text-base font-semibold text-ink">Photos</h5>
              <PreviewEdit onClick={() => goTo('photos')} label="Edit photos" />
            </div>
            <div className="stay-preview-gallery">
              <div className={`stay-preview-gallery-main ${side.length > 0 ? '' : 'stay-preview-gallery-main--solo'}`}>
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[12rem] items-center justify-center bg-[#F4F6F8] text-sm text-ink-muted">
                    Add a cover photo
                  </div>
                )}
              </div>
              {side.length > 0 ? (
                <div className="stay-preview-gallery-side">
                  {side.map((url) => (
                    <div key={url} className="stay-preview-gallery-thumb overflow-hidden rounded-xl">
                      <img src={url} alt="" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {photos.length > 4 ? <p className="stay-help">+ {photos.length - 4} more photos</p> : null}
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
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Add prices to show a “from” price.</p>
            )}
            {intro ? <p className="mt-2 text-sm leading-relaxed text-ink">{intro}</p> : null}
          </section>

          {description ? (
            <PreviewSection title="About this rental" onEdit={() => goTo('description')}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{description}</p>
            </PreviewSection>
          ) : null}

          {highlights.length > 0 ? (
            <PreviewSection title="Highlights" onEdit={() => goTo('highlights')}>
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

          <PreviewSection title="Options" onEdit={() => goTo('options')}>
            {variants.length === 0 ? (
              <p className="text-sm text-ink-muted">No options yet.</p>
            ) : (
              <ul className="space-y-2">
                {variants.map((variant) => {
                  const attrs = variantAttributeText(variant, cfg);
                  return (
                    <li key={variant.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-[#E6EAF0]">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{variant.name.trim() || 'Untitled option'}</p>
                        <p className="stay-help">
                          {variant.quantity} {variant.quantity === 1 ? 'unit' : 'units'}
                          {attrs ? ` · ${attrs}` : ''}
                        </p>
                        {variant.description?.trim() ? <p className="mt-1 text-sm text-ink-muted">{variant.description.trim()}</p> : null}
                      </div>
                      <p className="shrink-0 text-right text-sm font-semibold text-ink">
                        {rentalPricingSummary(effectiveVariantPricing(rental, variant), mode, currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </PreviewSection>

          <PreviewSection title="Availability" onEdit={() => goTo('availability-summary')}>
            <ul className="space-y-1 text-sm text-ink">
              <li>Rent {durationLabel(mode).toLowerCase()} · {limitsSummary(rental, mode)}</li>
              {(rental.bookingNoticeHours ?? 0) > 0 ? <li>Book at least {noticeLabel(rental.bookingNoticeHours ?? 0)} ahead</li> : null}
              {Number(rental.bufferMinutes ?? 0) > 0 ? <li>{bufferLabel(Number(rental.bufferMinutes))} preparation between rentals</li> : null}
            </ul>
          </PreviewSection>

          <PreviewSection title="Pickup & return" onEdit={() => goTo('pickup')}>
            <div className="space-y-2 text-sm text-ink">
              <p>
                <span className="font-semibold">Pickup:</span> {rental.pickupAddress?.trim() || 'Not set'}
              </p>
              <p>
                <span className="font-semibold">Return:</span>{' '}
                {rental.returnSameAsPickup === false ? rental.returnAddress?.trim() || 'Not set' : 'Same as pickup'}
              </p>
              {hours.length > 0 ? (
                <ul className="stay-help space-y-0.5">
                  {hours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {rental.collectionNotes?.trim() ? <p className="text-ink-muted">{rental.collectionNotes.trim()}</p> : null}
            </div>
          </PreviewSection>

          {inclusions.length > 0 ? (
            <PreviewSection title="Included" onEdit={() => goTo('inclusions')}>
              <ul className="grid gap-1 text-sm text-ink sm:grid-cols-2">
                {inclusions.map((line) => (
                  <li key={line}>✓ {line}</li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          {reqs.length > 0 || rental.idRequired != null ? (
            <PreviewSection title="Requirements" onEdit={() => goTo('requirements')}>
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

          {rental.rentalRules?.trim() ? (
            <PreviewSection title="Rental rules" onEdit={() => goTo('rules')}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{rental.rentalRules.trim()}</p>
            </PreviewSection>
          ) : null}

          <PreviewSection title="Cancellation" onEdit={() => goTo('cancellation')}>
            <p className="text-sm text-ink">{cancellation ? `${cancellation.title}: ${cancellation.body}` : 'No cancellation policy chosen yet.'}</p>
          </PreviewSection>

          {rental.depositDisclosure?.trim() || rental.insuranceDisclosure?.trim() ? (
            <PreviewSection title="Deposits and insurance" onEdit={() => goTo('deposit-info')}>
              <div className="space-y-2 text-sm text-ink">
                {rental.depositDisclosure?.trim() ? <p>{rental.depositDisclosure.trim()}</p> : null}
                {rental.insuranceDisclosure?.trim() ? <p>{rental.insuranceDisclosure.trim()}</p> : null}
                <p className="stay-help">Traverion does not collect security deposits online.</p>
              </div>
            </PreviewSection>
          ) : null}
        </div>
      </article>
      <p className="stay-help">Travelers cannot book rentals yet. This preview shows how the listing will read.</p>
    </div>
  );
}

const PUBLISH_ROWS: { id: RentalOnboardingScreenId; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'item-type', label: 'Item type' },
  { id: 'location', label: 'Location' },
  { id: 'language', label: 'Language' },
  { id: 'title', label: 'Title' },
  { id: 'intro', label: 'Introduction' },
  { id: 'description', label: 'Description' },
  { id: 'photos', label: 'Photos' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'return', label: 'Return' },
  { id: 'hours', label: 'Pickup and return hours' },
  { id: 'options', label: 'Options' },
  { id: 'duration-mode', label: 'Rental length' },
  { id: 'duration-limits', label: 'Duration limits' },
  { id: 'pricing', label: 'Prices' },
  { id: 'requirements', label: 'Requirements' },
];

function PublishStage({ ctx, check }: { ctx: Ctx; check: RentalOnboardingCheck }) {
  const { values, props, goTo } = ctx;
  const issues = rentalPublishBlockers(check);
  const ready = issues.length === 0;
  const cover = galleryUrlsOf(values)[0];
  return (
    <div className="space-y-4">
      <div className="stay-panel flex flex-col gap-3 sm:flex-row sm:items-center">
        {cover ? (
          <img src={cover} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-xs text-ink-muted">No photo</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-ink">{values.title.trim() || 'Untitled rental'}</p>
          <p className="text-sm text-ink-muted">{travelerDestinationLabel(values.city, values.country) || 'Location not set'}</p>
          <p className={`mt-1 text-sm font-semibold ${ready ? 'text-[#073b83]' : 'text-[#9f1239]'}`} role="status">
            {ready ? 'Ready to mark complete' : `${issues.length} thing${issues.length === 1 ? '' : 's'} still need${issues.length === 1 ? 's' : ''} attention`}
          </p>
        </div>
      </div>

      {issues.length > 0 ? (
        <section className="stay-panel space-y-2" aria-label="Still needed">
          <p className="stay-kicker">Still needed</p>
          <ul className="overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
            {issues.map((line) => (
              <li key={line} className="flex items-start justify-between gap-3 border-t border-[#E6EAF0] bg-[#FFF8F8] px-3 py-2.5 first:border-t-0">
                <p className="min-w-0 text-sm text-ink">{line}</p>
                <PreviewEdit onClick={() => props.onEditStage(rentalScreenIndexForPublishLine(line))} label={`Fix: ${line}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="stay-panel space-y-1">
          <p className="text-sm font-semibold text-ink">Everything required is filled in.</p>
          <p className="text-sm text-ink-muted">You can still edit any step from the checklist below.</p>
        </section>
      )}

      <details className="stay-panel">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink">Full checklist</summary>
        <ul className="mt-2 overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
          {PUBLISH_ROWS.map((row) => {
            const issue = rentalStageBlocker(row.id, check);
            return (
              <li key={row.id} className={`flex items-start justify-between gap-3 border-t border-[#E6EAF0] px-3 py-2.5 first:border-t-0 ${issue ? 'bg-[#FFF8F8]' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{row.label}</p>
                  <p className={`text-sm ${issue ? 'text-[#9f1239]' : 'text-ink-muted'}`}>{issue ?? 'Complete'}</p>
                </div>
                <PreviewEdit onClick={() => goTo(row.id)} label={`Edit ${row.label}`} />
              </li>
            );
          })}
        </ul>
      </details>

      <section className="stay-panel space-y-1" aria-label="Booking status">
        <p className="stay-kicker">Before you finish</p>
        <p className="text-sm leading-relaxed text-ink">
          Marking this complete saves a finished draft. Travelers cannot book rentals yet, and your listing stays
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
    goTo: (target) => props.onEditStage(rentalScreenIndex(target)),
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
    const current = rental.variants ?? [];
    const exists = current.some((v) => v.id === editing.variant.id);
    const variants = exists
      ? current.map((v) => (v.id === editing.variant.id ? editing.variant : v))
      : [...current, editing.variant];
    onChange({ rental: { ...rental, variants } });
    setEditing(null);
  };

  const previewWide = id === 'preview' || id === 'publish';
  const wide =
    previewWide ||
    id === 'photos' ||
    id === 'gallery' ||
    id === 'hours' ||
    id === 'options' ||
    id === 'pricing-overrides' ||
    id === 'availability-summary';

  const showBack = props.returnStage != null && props.stage !== props.returnStage;

  let body: ReactNode = null;
  switch (id) {
    case 'category':
      body = <CategoryStage ctx={ctx} />;
      break;
    case 'item-type':
      body = <ItemTypeStage ctx={ctx} />;
      break;
    case 'location':
      body = <LocationStage ctx={ctx} />;
      break;
    case 'language':
      body = <LanguageStage ctx={ctx} />;
      break;
    case 'title':
      body = <TitleStage ctx={ctx} />;
      break;
    case 'intro':
      body = <IntroStage ctx={ctx} />;
      break;
    case 'description':
      body = <DescriptionStage ctx={ctx} />;
      break;
    case 'highlights':
      body = <HighlightsStage ctx={ctx} />;
      break;
    case 'specs':
      body = <SpecsStage ctx={ctx} />;
      break;
    case 'photos':
      body = <PhotosStage ctx={ctx} review={false} />;
      break;
    case 'gallery':
      body = <PhotosStage ctx={ctx} review />;
      break;
    case 'pickup':
      body = <PickupStage ctx={ctx} />;
      break;
    case 'return':
      body = <ReturnStage ctx={ctx} />;
      break;
    case 'hours':
      body = <HoursStage ctx={ctx} />;
      break;
    case 'collection':
      body = <CollectionStage ctx={ctx} />;
      break;
    case 'options':
      body = <OptionsStage ctx={ctx} />;
      break;
    case 'duration-mode':
      body = <DurationModeStage ctx={ctx} />;
      break;
    case 'duration-limits':
      body = <DurationLimitsStage ctx={ctx} />;
      break;
    case 'daily-rules':
      body = <DailyRulesStage ctx={ctx} />;
      break;
    case 'buffers':
      body = (
        <PresetNumber
          label="Time between bookings"
          value={Number(rental.bufferMinutes ?? 0)}
          presets={BUFFER_PRESETS}
          format={bufferLabel}
          max={1440}
          customLabel="Custom preparation time"
          customSuffix="min"
          onChange={(bufferMinutes) => ctx.patchRental({ bufferMinutes })}
        />
      );
      break;
    case 'notice':
      body = (
        <PresetNumber
          label="Minimum notice"
          value={rental.bookingNoticeHours ?? 0}
          presets={NOTICE_PRESETS}
          format={noticeLabel}
          max={168}
          customLabel="Custom notice"
          customSuffix="hours"
          onChange={(bookingNoticeHours) => ctx.patchRental({ bookingNoticeHours })}
        />
      );
      break;
    case 'availability-summary':
      body = <AvailabilitySummaryStage ctx={ctx} />;
      break;
    case 'pricing':
      body = <PricingStage ctx={ctx} />;
      break;
    case 'multi-day':
      body = <MultiDayStage ctx={ctx} />;
      break;
    case 'pricing-overrides':
      body = <PricingOverridesStage ctx={ctx} />;
      break;
    case 'earnings':
      body = <EarningsStage ctx={ctx} />;
      break;
    case 'requirements':
      body = <RequirementsStage ctx={ctx} />;
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
      className={`stay-creator mx-auto w-full ${previewWide ? 'max-w-4xl' : wide ? 'max-w-3xl' : 'max-w-xl'} ${
        props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="stay-kicker">
            {stage.group}
            {stage.part && !/of 1$/.test(stage.part) ? ` · ${stage.part}` : ''}
          </p>
          <p className="stay-help mt-1">
            Step {props.stage + 1} of {RENTAL_ONBOARDING_SCREENS.length}
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
        onChange={(variant) => setEditing((cur) => (cur ? { ...cur, variant } : cur))}
        onSave={saveEditing}
        onCancel={() => setEditing(null)}
      />
    ) : null}
    </>
  );
}
