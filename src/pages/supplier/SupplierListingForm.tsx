import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import type { ListingBookingOption, ListingExtras, ListingOptionSchedule, ScheduleStyle, VenueSetting } from '../../types/listingExtras';
import {
  formatBookingOptionDuration,
  isListingBookingOptionEffectivelyEmpty,
  materializedBookingOptions,
  normalizeListingBookingOption,
  parseBookingOptionDuration,
  parseListingExtras,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
} from '../../types/listingExtras';
import ListingImageFields from '../../components/supplier/ListingImageFields';
import { useAuth } from '../../contexts/AuthContext';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { scheduleSpotsBelowSoldWarning } from '../../lib/capacity-reduction-warn';
import {
  occupyingGuestsForBookingOption,
  occupyingGuestsForOptionDeparture,
  removeBookingOptionOccupancyNotice,
  removeScheduleOccupancyNotice,
} from '../../lib/schedule-edit-impact';
import { optionHeadlineUnitPrice, summarizeOptionPricing } from '../../lib/price-categories';
import { headlineStartingAmountFromBookingOptions } from '../../lib/headline-price';
import { listingDurationForPersist } from '../../lib/listing-option-ownership';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  clampTourOptionSceneIndex,
  duplicateBookingOption,
  nextTourOptionScene,
  previousTourOptionScene,
  readyBookingOptions,
  tourOptionContextNavItems,
  tourOptionReadiness,
  tourOptionReadinessLabel,
  upsertBookingOption,
} from '../../lib/listing-option-scenes';
import {
  canContinueTourOptionScene,
  canVisitTourOptionScene,
  isTourOptionSceneSatisfied,
  tourOptionLockedReason,
  tourOptionSceneContinueHint,
} from '../../lib/listing-option-progression';
import {
  firstBookingOptionIssueFocusId,
  getBookingOptionValidationMessages,
} from '../../lib/listing-option-validation';
import {
  blankOptionSchedule,
  duplicateOptionSchedule,
  ensureExplicitSchedules,
  formatScheduleRange,
  listingOptionReadySchedules,
  newListingOptionScheduleId,
  optionScheduleCountLabel,
  removeOptionSchedule,
  upsertOptionSchedule,
} from '../../lib/listing-option-schedules';
import {
  canContinueTourScheduleScene,
  canVisitTourScheduleScene,
  firstScheduleIssueFocusId,
  nextTourScheduleScene,
  previousTourScheduleScene,
  scheduleCanSaveReady,
  tourScheduleSceneContinueHint,
  clampTourScheduleSceneIndex,
} from '../../lib/listing-schedule-wizard';
import {
  compactPhotoSlotsAndLabels,
  normalizePhotoSlots,
  normalizePhotoSlotLabels,
  orderedPhotoUrls,
  photoSlotsFromTourPackage,
  isPlaceholderListingImageUrl,
  LISTING_PHOTO_GRID_SLOTS,
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
} from '../../lib/listingPhotoGrid';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import {
  listingPublishTruth,
  reviewBasicsSummary,
  reviewDetailsSummary,
  reviewOptionsSummary,
  reviewPhotosSummary,
  reviewStayLocationSummary,
  reviewStayPricingSummary,
} from '../../lib/listing-creation-review';
import { listingWizardPersistLabel } from '../../lib/listing-wizard-persist';
import {
  listingCreationNavItems,
  listingCreationProgressCopy,
} from '../../lib/listing-creation-workspace';
import {
  canContinueFromPhotos,
  canVisitListingCreationStep,
  listingCreationContinueHint,
  listingCreationLockedReason,
} from '../../lib/listing-creation-progression';
import {
  TOUR_BASICS_DESCRIPTION_MAX,
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SUBTITLE_MAX,
  TOUR_HIGHLIGHT_MIN_VISIBLE,
  canAdvanceTourBasicsScene,
  canSelectTourBasicsScene,
  isTourIdentitySatisfied,
  isTourProductTypeSatisfied,
  isTourStorySatisfied,
  clampTourBasicsSceneIndex,
  initialTourBasicsSceneIndex,
  nextTourBasicsScene,
  normalizeTourHighlightSlots,
  persistableTourHighlights,
  previousTourBasicsScene,
  tourBasicsSceneForFocusSection,
  type ListingCreationSceneDirection,
} from '../../lib/listing-creation-scenes';
import {
  STAY_HIGHLIGHT_MAX,
  STAY_HIGHLIGHT_MIN_VISIBLE,
  TOUR_EXCLUDE_MAX,
  TOUR_EXCLUDE_MIN_VISIBLE,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_VISIBLE,
  addProgressiveSlot,
  canAddProgressiveSlot,
  normalizeProgressiveSlots,
  persistableProgressiveSlots,
  removeProgressiveSlot,
} from '../../lib/listing-creation-lines';
import { ListingCreationWorkspace } from '../../components/supplier/listing-creation/ListingCreationWorkspace';
import { TourBasicsGuidedScenes } from '../../components/supplier/listing-creation/TourBasicsGuidedScenes';
import { TourOptionGuidedScenes } from '../../components/supplier/listing-creation/TourOptionGuidedScenes';
import { TourScheduleWorkspace } from '../../components/supplier/listing-creation/TourScheduleWorkspace';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  shouldHydrateExistingListing,
  shouldResetWizardOnEditingIdChange,
} from '../../lib/listing-creation-persist';
import { userFacingError } from '../../lib/userFacingError';
import { MIN_LISTING_DESCRIPTION_LENGTH } from '../../lib/listingQualityScore';
import {
  PARTNER_LISTING_PUBLISH_STEP_NOTE,
  PARTNER_LISTING_PUBLISH_STEP_TITLE,
} from '../../lib/booking-confirmation-copy';
import { DEFAULT_CURRENCY, formatMoney, normalizeCurrency } from '../../lib/money';
import { STAY_AMENITY_PRESETS } from '../../lib/stay-amenities';
import { publicStayListingUrl, publicTourListingUrl } from '../../lib/publicSiteUrl';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import NoticeCallout from '../../components/NoticeCallout';

const TAG_OPTIONS = [
  { id: 'free-cancellation', label: 'Free cancellation' },
  { id: 'small-group', label: 'Small group' },
  { id: 'pickup-available', label: 'Pickup available' },
  { id: 'mobile-ticket', label: 'Mobile ticket' },
];

function stayAmenityTokens(raw: string): string[] {
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function stayAmenityHas(raw: string, label: string): boolean {
  const key = label.toLowerCase();
  return stayAmenityTokens(raw).some((x) => x.toLowerCase() === key);
}

function toggleStayAmenity(raw: string, label: string): string {
  const cur = stayAmenityTokens(raw);
  const key = label.toLowerCase();
  const next = stayAmenityHas(raw, label)
    ? cur.filter((x) => x.toLowerCase() !== key)
    : [...cur, label];
  return next.join(', ');
}

const EXPERIENCE_START_OPTIONS: {
  value: 'unspecified' | 'fixed_meeting_place' | 'operator_pickup' | 'either_available';
  label: string;
}[] = [
  { value: 'unspecified', label: 'Not sure yet — describe per option under Options' },
  { value: 'fixed_meeting_place', label: 'Guests meet us at a fixed meeting point' },
  { value: 'operator_pickup', label: 'We pick guests up (for example from their accommodation area)' },
  { value: 'either_available', label: 'Both meeting at a set place and pickup are available' },
];

const MAX_SUBTITLE_LENGTH = TOUR_BASICS_SUBTITLE_MAX;
const MAX_DESCRIPTION_LENGTH = TOUR_BASICS_DESCRIPTION_MAX;
const MAX_ACCESSIBILITY_LENGTH = 500;
const MAX_TIMELINE_LENGTH = 800;

/** Tour: 5 steps. Stay: 6 (Property → Location → Space → Price → Photos → Review). */
function wizardStepCount(isStay: boolean): number {
  return isStay ? 6 : 5;
}

function wizardStepStorageKey(editingId: string | null, isStay: boolean) {
  return `traverion-listing-wizard-step-v4-${isStay ? 'stay' : 'tour'}-${editingId ?? 'create'}`;
}

function readWizardStepFromStorage(editingId: string | null, isStay: boolean): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(wizardStepStorageKey(editingId, isStay));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    const max = wizardStepCount(isStay);
    if (Number.isNaN(n) || n < 0 || n >= max) return null;
    return n;
  } catch {
    return null;
  }
}

function writeWizardStepToStorage(editingId: string | null, step: number, isStay: boolean) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(wizardStepStorageKey(editingId, isStay), String(step));
  } catch {
    // ignore quota / private mode
  }
}

function clearWizardStepStorage(editingId: string | null, isStay: boolean) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(wizardStepStorageKey(editingId, isStay));
  } catch {
    // ignore
  }
}

function basicsSceneStorageKey(editingId: string | null) {
  return `traverion-listing-wizard-basics-scene-v1-tour-${editingId ?? 'create'}`;
}

function readBasicsSceneFromStorage(editingId: string | null): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(basicsSceneStorageKey(editingId));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    return clampTourBasicsSceneIndex(n);
  } catch {
    return null;
  }
}

function writeBasicsSceneToStorage(editingId: string | null, scene: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(basicsSceneStorageKey(editingId), String(clampTourBasicsSceneIndex(scene)));
  } catch {
    // ignore quota / private mode
  }
}

function listingDraftBackupKey(editingId: string | null) {
  return `traverion_listing_form_v1_${editingId ?? 'new'}`;
}

function migrateListingEditorStorage(fromId: string | null, toId: string, isStay: boolean) {
  if (typeof window === 'undefined' || !toId || fromId === toId) return;
  try {
    const copy = (fromKey: string, toKey: string) => {
      const value = sessionStorage.getItem(fromKey);
      if (value == null) return;
      if (sessionStorage.getItem(toKey) == null) sessionStorage.setItem(toKey, value);
      sessionStorage.removeItem(fromKey);
    };
    copy(wizardStepStorageKey(fromId, isStay), wizardStepStorageKey(toId, isStay));
    copy(basicsSceneStorageKey(fromId), basicsSceneStorageKey(toId));
    copy(listingDraftBackupKey(fromId), listingDraftBackupKey(toId));
  } catch {
    // ignore quota / private mode
  }
}

function readListingDraftBackup(editingId: string | null): ListingFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(listingDraftBackupKey(editingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { form?: ListingFormState; savedAt?: string };
    if (!parsed?.form || typeof parsed.form !== 'object') return null;
    return parsed.form;
  } catch {
    return null;
  }
}

function writeListingDraftBackup(editingId: string | null, form: ListingFormState) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      listingDraftBackupKey(editingId),
      JSON.stringify({ savedAt: new Date().toISOString(), form })
    );
  } catch {
    /* quota / private mode */
  }
}

function clearListingDraftBackup(editingId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(listingDraftBackupKey(editingId));
  } catch {
    /* ignore */
  }
}

function newBookingOptionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyBookingOption(): ListingBookingOption {
  const id = newBookingOptionId();
  return normalizeListingBookingOption(
    {
      id,
      name: '',
      priceUsd: 0,
      startTime: '',
      duration: '',
      pickupPlace: '',
      minPersons: 1,
      maxPersons: 12,
      maxSpotsPerSlot: 12,
      optionInfo: '',
      weekdays: [true, true, true, true, true, false, false],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      schedules: [],
    },
    id
  );
}

function parseMinMaxFromGroupSize(s: string): { min: number; max: number } {
  const t = s.trim();
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }
  const upTo = t.match(/(?:up to|max\.?)\s*(\d+)/i);
  if (upTo) {
    const n = parseInt(upTo[1], 10);
    if (!Number.isNaN(n)) return { min: 1, max: Math.max(1, n) };
  }
  return { min: 1, max: 12 };
}

function legacyTourToBookingOptions(tour: TourPackage): ListingBookingOption[] {
  const extras = parseListingExtras(tour.listingExtras as unknown);
  if (extras.bookingOptions && extras.bookingOptions.length > 0) {
    return extras.bookingOptions;
  }
  const { min, max } = parseMinMaxFromGroupSize(tour.groupSize ?? '');
  const hi = Math.max(min, max);
  return [
    normalizeListingBookingOption(
      {
        id: newBookingOptionId(),
        name: 'Standard',
        priceUsd: typeof tour.price?.startingFrom === 'number' ? tour.price.startingFrom : 0,
        startTime: tour.defaultStartTime ?? '',
        duration: (tour.duration ?? '').trim(),
        pickupPlace: tour.meetingPoint ?? '',
        minPersons: min,
        maxPersons: hi,
        maxSpotsPerSlot: hi,
        optionInfo: tour.pickupInstructions ?? '',
        weekdays: [true, true, true, true, true, true, true],
        availabilityDateFrom: '',
        availabilityDateTo: '',
      },
      newBookingOptionId()
    ),
  ];
}

function optionValidationMessages(o: ListingBookingOption, hasEndingDate?: boolean): string[] {
  return getBookingOptionValidationMessages(o, {
    hasEndingDate: hasEndingDate ?? o.availabilityDateTo.trim().length > 0,
  });
}

function focusListingField(fieldId: string | null) {
  if (!fieldId || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const root = document.getElementById(fieldId);
    if (!root) return;
    root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = root.matches('input, textarea, select, button')
      ? root
      : root.querySelector<HTMLElement>('input, textarea, select, button');
    target?.focus();
  });
}

function normalizeHighlightSlots(fromDb: string[] | undefined): string[] {
  return normalizeProgressiveSlots(fromDb, STAY_HIGHLIGHT_MIN_VISIBLE, STAY_HIGHLIGHT_MAX);
}

function ProgressiveLinesEditor({
  fieldId,
  label,
  hint,
  values,
  minVisible,
  max,
  placeholder,
  onChange,
}: {
  fieldId: string;
  label: string;
  hint: string;
  values: string[];
  minVisible: number;
  max: number;
  placeholder: (index: number) => string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div id={fieldId}>
      <label className="mb-1 block text-sm font-semibold text-ink">{label}</label>
      <p className="mb-2 text-xs text-ink-muted">{hint}</p>
      <div className="space-y-2">
        {values.map((line, index) => (
          <div key={`${fieldId}-${index}`} className="flex items-start gap-2">
            <input
              type="text"
              value={line}
              onChange={(e) => onChange(values.map((s, i) => (i === index ? e.target.value : s)))}
              className="tv-input"
              placeholder={placeholder(index)}
            />
            {index >= minVisible ? (
              <button
                type="button"
                onClick={() => onChange(removeProgressiveSlot(values, index, minVisible))}
                className="tv-btn-ghost !min-h-11 shrink-0 text-sm"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canAddProgressiveSlot(values, max) ? (
        <button
          type="button"
          onClick={() => onChange(addProgressiveSlot(values, max))}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-finland"
        >
          + Add another
        </button>
      ) : null}
    </div>
  );
}

const SCHEDULE_STYLE_OPTIONS: { value: ScheduleStyle; label: string; hint: string }[] = [
  { value: 'flexible', label: 'Flexible timing', hint: 'Start time can vary or you confirm after booking.' },
  { value: 'fixed_slots', label: 'Fixed daily start', hint: 'You usually run at set times (set start time on each booking option).' },
  { value: 'on_request', label: 'On request / private', hint: 'Guests arrange timing with you directly.' },
];

const VENUE_SETTING_OPTIONS: { value: VenueSetting; label: string }[] = [
  { value: 'unspecified', label: 'Not specified' },
  { value: 'indoor', label: 'Mostly indoor' },
  { value: 'outdoor', label: 'Mostly outdoor' },
  { value: 'mixed', label: 'Mix of indoor and outdoor' },
];

/** ISO 639-1–style codes for the main language guests can expect. */
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'other', label: 'Other or multilingual (explain in the description)' },
];

function mapExperienceKindToStyle(kind: string): string {
  if (kind === 'ticket') return 'Ticket';
  if (kind === 'transportation') return 'Transportation';
  return 'Tour';
}

type ListingFormState = {
  experienceLanguage: string;
  experienceKind: '' | 'tour' | 'ticket' | 'transportation';
  title: string;
  subtitle: string;
  highlights: string[];
  destination: string;
  duration: string;
  /** 4×3 grid, row-major; slot 0 = main / first for travelers. */
  photoSlots: string[];
  /** Optional friendly names per slot (e.g. original upload filename); parallel to photoSlots. */
  photoSlotLabels: string[];
  description: string;
  city: string;
  country: string;
  tags: string[];
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  status: 'draft' | 'published';
  bookingOptions: ListingBookingOption[];
  experienceStartStyle: 'unspecified' | 'fixed_meeting_place' | 'operator_pickup' | 'either_available';
  includes: string[];
  excludes: string[];
  scheduleStyle: ScheduleStyle | '';
  typicalTimelineNotes: string;
  accessibilitySummary: string;
  minGuestAge: string;
  venueSetting: VenueSetting;
  additionalLanguages: string[];
  inventoryFamily: 'tour' | 'stay';
  stayPropertyType: string;
  stayBedrooms: string;
  stayBeds: string;
  stayBathrooms: string;
  stayMaxGuests: string;
  stayNightly: string;
  stayMinNights: string;
  stayCheckIn: string;
  stayCheckOut: string;
  stayAmenities: string;
  stayHouseRules: string;
  stayCleaningFee: string;
};

/** Stored listing destination label: optional custom text, or derived from city/country, or “Various locations”. */
function resolveListingDestinationLabel(
  form: Pick<ListingFormState, 'destination' | 'city' | 'country'>
): string {
  const custom = form.destination.trim();
  if (custom) return custom;
  const city = form.city.trim();
  const country = form.country.trim();
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (city) return city;
  return 'Various locations';
}

function buildListingFromForm(form: ListingFormState, existingId?: string): TourPackage {
  const id = existingId ?? `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const isStay = form.inventoryFamily === 'stay';
  const resolvedDestination = resolveListingDestinationLabel(form);
  const startLoc = form.city.trim() || resolvedDestination;
  const endLoc = startLoc;
  const opts = form.bookingOptions;
  const activeOpts = materializedBookingOptions(opts);
  const first = activeOpts[0];
  const stayNightly = Number.parseFloat(form.stayNightly);
  const stayMaxGuests = Number.parseInt(form.stayMaxGuests, 10);
  const stayMinNights = Number.parseInt(form.stayMinNights, 10);
  const stayBedrooms = Number.parseInt(form.stayBedrooms, 10);
  const stayBeds = Number.parseInt(form.stayBeds, 10);
  const stayBaths = Number.parseFloat(form.stayBathrooms);
  const stayCleaning = Number.parseFloat(form.stayCleaningFee);
  const derivedStarting =
    isStay && Number.isFinite(stayNightly) && stayNightly > 0
      ? stayNightly
      : headlineStartingAmountFromBookingOptions(activeOpts, 0);
  const groupSizeStr = isStay
    ? Number.isFinite(stayMaxGuests) && stayMaxGuests >= 1
      ? `Up to ${stayMaxGuests} guests`
      : 'Guests'
    : activeOpts.length === 0
      ? '1–12 guests'
      : activeOpts.length === 1
        ? `${activeOpts[0].minPersons}–${activeOpts[0].maxPersons} guests`
        : `${activeOpts.length} bookable options`;
  const kind =
    form.experienceKind === 'tour' ||
    form.experienceKind === 'ticket' ||
    form.experienceKind === 'transportation'
      ? form.experienceKind
      : undefined;
  const desc = form.description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  const highlightList =
    form.inventoryFamily === 'stay'
      ? persistableProgressiveSlots(form.highlights, STAY_HIGHLIGHT_MAX)
      : persistableTourHighlights(form.highlights);
  const includeList = persistableProgressiveSlots(form.includes, TOUR_INCLUDE_MAX);
  const excludeList = persistableProgressiveSlots(form.excludes, TOUR_EXCLUDE_MAX);
  const orderedPhotos = orderedPhotoUrls(form.photoSlots);
  const mainImage = orderedPhotos[0] ?? '';
  const galleryList = orderedPhotos.slice(1);
  const primaryLang = form.experienceLanguage.trim();
  const addLangs = form.additionalLanguages.filter((c) => c && c !== primaryLang);
  const labelsNorm = normalizePhotoSlotLabels(form.photoSlotLabels);
  const extras: ListingExtras = {
    ...(addLangs.length ? { additionalLanguages: addLangs } : {}),
    ...(form.venueSetting !== 'unspecified' ? { venueSetting: form.venueSetting } : {}),
    ...(form.accessibilitySummary.trim()
      ? { accessibilitySummary: form.accessibilitySummary.trim().slice(0, MAX_ACCESSIBILITY_LENGTH) }
      : {}),
    ...(form.minGuestAge.trim() ? { minGuestAge: form.minGuestAge.trim() } : {}),
    ...(form.scheduleStyle ? { scheduleStyle: form.scheduleStyle } : {}),
    ...(form.typicalTimelineNotes.trim()
      ? { typicalTimelineNotes: form.typicalTimelineNotes.trim().slice(0, MAX_TIMELINE_LENGTH) }
      : {}),
    ...(galleryList.length > 0 ? { galleryImageUrls: galleryList } : {}),
    ...(labelsNorm.some((l) => l.trim()) ? { photoSlotLabels: labelsNorm } : {}),
    ...(activeOpts.length > 0 && !isStay ? { bookingOptions: activeOpts } : {}),
    ...(isStay ? { inventoryFamily: 'stay' as const } : {}),
    ...(isStay
      ? {
          stay: {
            propertyType: form.stayPropertyType.trim() || undefined,
            bedrooms: Number.isFinite(stayBedrooms) ? stayBedrooms : undefined,
            beds: Number.isFinite(stayBeds) ? stayBeds : undefined,
            bathrooms: Number.isFinite(stayBaths) ? stayBaths : undefined,
            amenities: form.stayAmenities
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            checkInTime: form.stayCheckIn.trim() || undefined,
            checkOutTime: form.stayCheckOut.trim() || undefined,
            houseRules: form.stayHouseRules.trim() || undefined,
            nightlyPriceUsd: Number.isFinite(stayNightly) && stayNightly > 0 ? stayNightly : undefined,
            minNights: Number.isFinite(stayMinNights) && stayMinNights >= 1 ? stayMinNights : 1,
            maxGuests: Number.isFinite(stayMaxGuests) && stayMaxGuests >= 1 ? stayMaxGuests : undefined,
            cleaningFeeUsd: Number.isFinite(stayCleaning) && stayCleaning >= 0 ? stayCleaning : undefined,
          },
        }
      : {}),
  };
  return {
    id,
    title: form.title,
    subtitle: form.subtitle.trim().slice(0, MAX_SUBTITLE_LENGTH) || undefined,
    destination: resolvedDestination,
    duration: listingDurationForPersist({
      inventoryFamily: form.inventoryFamily,
      listingDuration: form.duration,
      bookingOptions: opts,
    }),
    style: mapExperienceKindToStyle(kind ?? 'tour'),
    startLocation: startLoc,
    endLocation: endLoc,
    price: {
      startingFrom: derivedStarting,
      currency: DEFAULT_CURRENCY,
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: mainImage,
    description: desc,
    highlights: highlightList,
    itinerary: [
      {
        day: 1,
        title: form.title,
        description: desc,
        meals: 'None',
        location: form.city.trim() || resolvedDestination,
        activities: ['Tour'],
      },
    ],
    includes: includeList,
    excludes: excludeList,
    hotels: [],
    difficulty: form.difficulty,
    groupSize: groupSizeStr,
    bestTime: 'Year round',
    rating: 0,
    reviews: 0,
    isPopular: false,
    city: form.city || undefined,
    country: form.country || undefined,
    tags: form.tags.length ? form.tags : undefined,
    supplierId: 'current',
    status: form.status,
    cancellationPolicy: TRAVERION_STANDARD_CANCELLATION_POLICY,
    listingExtras: Object.keys(extras).length > 0 ? extras : undefined,
    meetingPoint: first?.pickupPlace.trim() || undefined,
    pickupInstructions: first?.optionInfo.trim() || undefined,
    defaultStartTime: first?.startTime.trim() || undefined,
    pickupWindowMinutesBeforeMin: 0,
    pickupWindowMinutesBeforeMax: 30,
    experienceStartStyle: form.experienceStartStyle,
    dropoffMode: 'same_as_pickup',
    dropoffLocation: undefined,
    experienceLanguage: form.experienceLanguage.trim() || undefined,
    experienceKind: kind,
  };
}

function serializeListingFormState(f: ListingFormState): string {
  return JSON.stringify(f);
}

/** Four–twelve photos in order; first = main (not placeholder). */
function listingPhotosReadyToPublish(form: ListingFormState): boolean {
  const ordered = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots));
  if (ordered.length < LISTING_PHOTO_MIN || ordered.length > LISTING_PHOTO_MAX) return false;
  return !isPlaceholderListingImageUrl(ordered[0] ?? '');
}

function isStepSatisfied(idx: number, form: ListingFormState): boolean {
  const isStay = form.inventoryFamily === 'stay';
  if (idx === 0) {
    const sub = form.subtitle.trim();
    const desc = form.description.trim();
    const kindOk =
      isStay ||
      form.experienceKind === 'tour' ||
      form.experienceKind === 'ticket' ||
      form.experienceKind === 'transportation';
    return (
      (isStay || form.experienceLanguage.trim().length > 0) &&
      form.title.trim().length > 0 &&
      kindOk &&
      sub.length > 0 &&
      sub.length <= MAX_SUBTITLE_LENGTH &&
      desc.length >= MIN_LISTING_DESCRIPTION_LENGTH &&
      desc.length <= MAX_DESCRIPTION_LENGTH
    );
  }
  if (idx === 1) {
    if (isStay) {
      return form.city.trim().length > 0 && form.country.trim().length > 0;
    }
    const inc = form.includes.map((s) => s.trim()).filter(Boolean).length;
    const exc = form.excludes.map((s) => s.trim()).filter(Boolean).length;
    return (
      inc >= 2 &&
      exc >= 1 &&
      form.city.trim().length > 0 &&
      form.country.trim().length > 0
    );
  }
  if (idx === 2) {
    if (form.inventoryFamily === 'stay') {
      const maxG = Number.parseInt(form.stayMaxGuests, 10);
      return Number.isFinite(maxG) && maxG >= 1;
    }
    const active = materializedBookingOptions(form.bookingOptions);
    return readyBookingOptions(active, optionValidationMessages).length >= 1;
  }
  if (idx === 3) {
    if (form.inventoryFamily === 'stay') {
      const nightly = Number.parseFloat(form.stayNightly);
      const checkIn = form.stayCheckIn.trim();
      const checkOut = form.stayCheckOut.trim();
      return (
        Number.isFinite(nightly) &&
        nightly > 0 &&
        /^\d{2}:\d{2}$/.test(checkIn) &&
        /^\d{2}:\d{2}$/.test(checkOut)
      );
    }
    return listingPhotosReadyToPublish(form);
  }
  if (idx === 4) {
    if (form.inventoryFamily === 'stay') {
      return listingPhotosReadyToPublish(form);
    }
    return (
      isStepSatisfied(0, form) &&
      isStepSatisfied(1, form) &&
      isStepSatisfied(2, form) &&
      isStepSatisfied(3, form)
    );
  }
  if (idx === 5) {
    return (
      isStepSatisfied(0, form) &&
      isStepSatisfied(1, form) &&
      isStepSatisfied(2, form) &&
      isStepSatisfied(3, form) &&
      isStepSatisfied(4, form)
    );
  }
  return true;
}

/** Soft gate so existing drafts can move past Photos with a single cover. New creation requires publish-ready photos. */
function canContinueListingStep(idx: number, form: ListingFormState, isNewCreation: boolean): boolean {
  const photosIdx = form.inventoryFamily === 'stay' ? 4 : 3;
  if (idx === photosIdx) {
    const photoCount = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length;
    return canContinueFromPhotos({
      isNewCreation,
      photoCount,
      photosPublishReady: listingPhotosReadyToPublish(form),
    });
  }
  return isStepSatisfied(idx, form);
}

const emptyForm: ListingFormState = {
  experienceLanguage: '',
  experienceKind: '',
  title: '',
  subtitle: '',
  highlights: Array.from({ length: TOUR_HIGHLIGHT_MIN_VISIBLE }, () => ''),
  destination: '',
  duration: '',
  photoSlots: Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => ''),
  photoSlotLabels: Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => ''),
  description: '',
  city: '',
  country: '',
  tags: [] as string[],
  difficulty: 'Easy',
  status: 'draft',
  bookingOptions: [],
  experienceStartStyle: 'unspecified',
  includes: Array.from({ length: TOUR_INCLUDE_MIN_VISIBLE }, () => ''),
  excludes: Array.from({ length: TOUR_EXCLUDE_MIN_VISIBLE }, () => ''),
  scheduleStyle: 'flexible',
  typicalTimelineNotes: '',
  accessibilitySummary: '',
  minGuestAge: '',
  venueSetting: 'unspecified',
  additionalLanguages: [] as string[],
  inventoryFamily: 'tour',
  stayPropertyType: 'Apartment',
  stayBedrooms: '1',
  stayBeds: '1',
  stayBathrooms: '1',
  stayMaxGuests: '4',
  stayNightly: '',
  stayMinNights: '1',
  stayCheckIn: '16:00',
  stayCheckOut: '11:00',
  stayAmenities: '',
  stayHouseRules: '',
  stayCleaningFee: '',
};

export type ListingEditorSaveResult = { success: boolean; error?: string; listingId?: string };

interface SupplierListingFormProps {
  editingId: string | null;
  existingListings: TourPackage[];
  onSave: (tour: TourPackage) => ListingEditorSaveResult | Promise<ListingEditorSaveResult>;
  /** When closing the sheet, persist a draft if the form changed (Supabase only; parent implements save). */
  enableDraftOnClose?: boolean;
  onSaveDraft?: (tour: TourPackage) => Promise<boolean>;
  onCancel: () => void;
  /** Deep link: scroll/focus this section (see supplier-listing-field-* ids). */
  focusSection?: string | null;
  onFocusConsumed?: () => void;
  /** False when business / payout verification blocks going live (Settings). */
  canPostNewListing?: boolean;
  /** Truthful account-gate copy when canPostNewListing is false. */
  publishAccountBlockedReason?: string | null;
  createFamily?: 'tour' | 'stay';
}

type StepId = 'the_experience' | 'practical' | 'cost_options' | 'stay_price' | 'photos' | 'review';

export default function SupplierListingForm({
  editingId,
  existingListings,
  onSave,
  enableDraftOnClose = false,
  onSaveDraft,
  onCancel,
  focusSection,
  onFocusConsumed,
  canPostNewListing = true,
  publishAccountBlockedReason = null,
  createFamily = 'tour',
}: SupplierListingFormProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[] | null>(null);
  const isStayForm = form.inventoryFamily === 'stay' || createFamily === 'stay';

  const [stepIdx, setStepIdx] = useState(
    () => readWizardStepFromStorage(editingId, createFamily === 'stay') ?? 0
  );
  const formRef = useRef(form);
  formRef.current = form;
  const stepIdxRef = useRef(stepIdx);
  stepIdxRef.current = stepIdx;
  const [basicsSceneIdx, setBasicsSceneIdx] = useState(() =>
    initialTourBasicsSceneIndex({
      stored: readBasicsSceneFromStorage(editingId),
      isEditing: Boolean(editingId),
      focusSection,
      productTypeSelected: Boolean(editingId),
    })
  );
  const [basicsSceneDirection, setBasicsSceneDirection] = useState<ListingCreationSceneDirection>('forward');
  const setBasicsSceneIdxPersisted = useCallback(
    (next: number | ((prev: number) => number), direction: ListingCreationSceneDirection = 'forward') => {
      setBasicsSceneIdx((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        const clamped = clampTourBasicsSceneIndex(resolved);
        writeBasicsSceneToStorage(editingId, clamped);
        return clamped;
      });
      setBasicsSceneDirection(direction);
    },
    [editingId]
  );
  const [draftCloseBusy, setDraftCloseBusy] = useState(false);
  const [draftCloseError, setDraftCloseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const publishChecklistKey = editingId ? `traverion-publish-checklist-${editingId}` : null;
  const [publishChecklistDismissed, setPublishChecklistDismissed] = useState(false);
  /**
   * After moving to the last step, the footer swaps Continue for Save in the same screen area.
   * A second pointer/activation (common on touch) can immediately submit → insert + close editor,
   * which feels like “wizard jumped back to the start” when you reopen create.
   */
  const [lastStepSubmitArmed, setLastStepSubmitArmed] = useState(true);
  const [stepLockHint, setStepLockHint] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const lastFocused = useRef<string | null>(null);
  const stepContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFormSnapshotRef = useRef<string>(serializeListingFormState(emptyForm));
  /** When creating (editingId null), avoid resetting the form every time parent `listings` refetches. */
  const createModeEmptySeededRef = useRef(false);
  /** When editing, hydrate from server only once per opened listing — refetches must not wipe in-progress steps (e.g. photos). */
  const editModeHydratedIdRef = useRef<string | null>(null);
  /**
   * Pinned once per mount: true only if this editor opened as "Add listing" (editingId was null on first render).
   * If editingId briefly flickers to null during an edit session, we must not run the create empty reset — that
   * was wiping the wizard when opening Tour photos (flash + back to step 1).
   */
  const sessionOpenedAsCreateRef = useRef<boolean | null>(null);
  if (sessionOpenedAsCreateRef.current === null) {
    sessionOpenedAsCreateRef.current = editingId === null;
  }
  const closeIntentRunningRef = useRef(false);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [optionModalDraft, setOptionModalDraft] = useState<ListingBookingOption | null>(null);
  const [optionModalEditingId, setOptionModalEditingId] = useState<string | null>(null);
  const [optionModalErrors, setOptionModalErrors] = useState<string[]>([]);
  const [optionSceneIdx, setOptionSceneIdx] = useState(0);
  const [optionSceneDirection, setOptionSceneDirection] = useState<ListingCreationSceneDirection>('forward');
  const [optionPendingDeleteId, setOptionPendingDeleteId] = useState<string | null>(null);
  const [optionLockHint, setOptionLockHint] = useState<string | null>(null);
  const [optionAttempted, setOptionAttempted] = useState(false);
  const optionSessionOpenedAsCreateRef = useRef(false);
  const listingCurrency = useMemo(() => {
    const existing = editingId ? existingListings.find((t) => t.id === editingId) : undefined;
    return normalizeCurrency(existing?.price?.currency ?? DEFAULT_CURRENCY);
  }, [editingId, existingListings]);

  useEffect(() => {
    document.body.dataset.partnerOverlay = '1';
    return () => {
      delete document.body.dataset.partnerOverlay;
    };
  }, []);
  const [optionModalHasEndingDate, setOptionModalHasEndingDate] = useState(false);
  const optionModalOpenRef = useRef(false);
  const [scheduleDraft, setScheduleDraft] = useState<ListingOptionSchedule | null>(null);
  const [scheduleSceneIdx, setScheduleSceneIdx] = useState(0);
  const [scheduleHasEndingDate, setScheduleHasEndingDate] = useState(true);
  const [scheduleAttempted, setScheduleAttempted] = useState(false);
  const [schedulePersistLabel, setSchedulePersistLabel] = useState<string | null>(null);
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null);
  const [scheduleLeaveOpen, setScheduleLeaveOpen] = useState(false);
  const [pendingScheduleDeleteId, setPendingScheduleDeleteId] = useState<string | null>(null);
  const [listingOccupancyBookings, setListingOccupancyBookings] = useState<BookingRow[]>([]);
  const scheduleSessionOpenedAsCreateRef = useRef(false);
  const scheduleSnapshotRef = useRef<string>('');
  const scheduleDraftRef = useRef<ListingOptionSchedule | null>(null);
  const addScheduleLockRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !editingId) {
      setListingOccupancyBookings([]);
      return;
    }
    let cancelled = false;
    void fetchBookingsForSupplier(user.id)
      .then((rows) => {
        if (cancelled) return;
        setListingOccupancyBookings(rows.filter((b) => b.listing_id === editingId));
      })
      .catch(() => {
        if (!cancelled) setListingOccupancyBookings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, editingId]);

  const steps = useMemo(() => {
    const stay = form.inventoryFamily === 'stay' || createFamily === 'stay';
    if (stay) {
      return [
        { id: 'the_experience' as StepId, label: 'Property' },
        { id: 'practical' as StepId, label: 'Location' },
        { id: 'cost_options' as StepId, label: 'Space' },
        { id: 'stay_price' as StepId, label: 'Price' },
        { id: 'photos' as StepId, label: 'Photos' },
        { id: 'review' as StepId, label: 'Review' },
      ];
    }
    return [
      { id: 'the_experience' as StepId, label: 'Basics' },
      { id: 'practical' as StepId, label: 'Details' },
      { id: 'cost_options' as StepId, label: 'Options' },
      { id: 'photos' as StepId, label: 'Photos' },
      { id: 'review' as StepId, label: 'Review' },
    ];
  }, [form.inventoryFamily, createFamily]);

  const stepGuidance = useMemo(() => {
    const stay = form.inventoryFamily === 'stay' || createFamily === 'stay';
    if (stay) {
      return [
        'Choose the property type and a clear title guests will recognize.',
        'Where is it, and what should guests know before they arrive?',
        'How many guests can stay, and what space are they booking?',
        'Nightly rate and arrival times. Block unavailable nights on Calendar after you publish.',
        'Add your strongest photo first — it becomes the cover in search.',
        'Check what’s ready, fix gaps, then save as draft or publish.',
      ] as const;
    }
    return [
      'Name this listing, choose the language you run it in, and pick a category.',
      'What guests get, where it happens, and how it starts. Optional itinerary and guest notes fold away.',
      'Options are versions of this experience (pickup, time, private). Age prices live inside each option.',
      'Cover photo first, then supporting shots travelers swipe through.',
      'Check what’s ready, fix gaps, then save as draft or publish.',
    ] as const;
  }, [form.inventoryFamily, createFamily]);

  const reviewRows = useMemo(() => {
    const photoCount = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length;
    const coverUrl = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots))[0] ?? '';
    const coverSelected = Boolean(coverUrl && !isPlaceholderListingImageUrl(coverUrl));
    const photosStepIdx = isStayForm ? 4 : 3;
    const photosMissing = !isStepSatisfied(photosStepIdx, form)
      ? photoCount < LISTING_PHOTO_MIN
        ? `Add at least ${LISTING_PHOTO_MIN} photos, with a real cover.`
        : 'Replace the placeholder cover photo.'
      : null;
    if (isStayForm) {
      const nightly = Number.parseFloat(form.stayNightly);
      const nightlyLabel = Number.isFinite(nightly) && nightly > 0 ? formatMoney(nightly, listingCurrency) + ' / night' : '';
      const spaceSummary = [
        form.stayMaxGuests.trim() ? `${form.stayMaxGuests} guests` : null,
        form.stayBedrooms.trim() ? `${form.stayBedrooms} bedroom${form.stayBedrooms === '1' ? '' : 's'}` : null,
        form.stayBeds.trim() ? `${form.stayBeds} bed${form.stayBeds === '1' ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return [
        {
          step: 0,
          label: 'Property',
          summary: form.title.trim() || 'Untitled stay',
          ready: isStepSatisfied(0, form),
          missing: !form.title.trim() ? 'Add a clear title.' : null,
        },
        {
          step: 1,
          label: 'Location',
          summary: reviewStayLocationSummary(form.city, form.country),
          ready: isStepSatisfied(1, form),
          missing: !form.city.trim() || !form.country.trim() ? 'Add city and country.' : null,
        },
        {
          step: 2,
          label: 'Space',
          summary: spaceSummary || 'Guest capacity not set',
          ready: isStepSatisfied(2, form),
          missing: !isStepSatisfied(2, form) ? 'Set how many guests can stay.' : null,
        },
        {
          step: 3,
          label: 'Price',
          summary: reviewStayPricingSummary(nightlyLabel, form.stayMaxGuests),
          ready: isStepSatisfied(3, form),
          missing: !isStepSatisfied(3, form) ? 'Set nightly rate and check-in times.' : null,
        },
        {
          step: 4,
          label: 'Photos',
          summary: reviewPhotosSummary(photoCount, coverSelected && photoCount > 0),
          ready: isStepSatisfied(4, form),
          missing: photosMissing,
        },
      ];
    }
    const languageLabel =
      LANGUAGE_OPTIONS.find((row) => row.code === form.experienceLanguage)?.label ?? form.experienceLanguage;
    const options = materializedBookingOptions(form.bookingOptions);
    const readyCount = readyBookingOptions(options, optionValidationMessages).length;
    const amount = headlineStartingAmountFromBookingOptions(options);
    const priceSummary =
      typeof amount === 'number' && amount > 0 ? `From ${formatMoney(amount, listingCurrency)}` : '';
    return [
      {
        step: 0,
        label: 'Basics',
        summary: reviewBasicsSummary(form.title, form.experienceKind, languageLabel),
        ready: isStepSatisfied(0, form),
        missing: !isStepSatisfied(0, form)
          ? 'Finish product type, title, subtitle, language, and description.'
          : null,
      },
      {
        step: 1,
        label: 'Details',
        summary: reviewDetailsSummary(
          form.city,
          form.country,
          form.includes.map((s) => s.trim()).filter(Boolean).length,
          form.excludes.map((s) => s.trim()).filter(Boolean).length
        ),
        ready: isStepSatisfied(1, form),
        missing: !isStepSatisfied(1, form) ? 'Add city, country, inclusions, and exclusions.' : null,
      },
      {
        step: 2,
        label: 'Options',
        summary: reviewOptionsSummary(readyCount, options.length, priceSummary),
        ready: isStepSatisfied(2, form),
        missing: !isStepSatisfied(2, form) ? 'Add at least one complete bookable option.' : null,
      },
      {
        step: 3,
        label: 'Photos',
        summary: reviewPhotosSummary(photoCount, Boolean(coverSelected && photoCount > 0)),
        ready: isStepSatisfied(3, form),
        missing: photosMissing,
      },
    ];
  }, [form, isStayForm, listingCurrency]);

  useEffect(() => {
    const last = steps.length - 1;
    if (stepIdx !== last) {
      setLastStepSubmitArmed(true);
      return;
    }
    setLastStepSubmitArmed(false);
    const t = window.setTimeout(() => setLastStepSubmitArmed(true), 550);
    return () => window.clearTimeout(t);
  }, [stepIdx, steps.length]);

  const setStepIdxPersisted = useCallback(
    (next: number | ((prev: number) => number)) => {
      const prev = stepIdxRef.current;
      const resolved = typeof next === 'function' ? (next as (p: number) => number)(prev) : next;
      const currentForm = formRef.current;
      const isNew = sessionOpenedAsCreateRef.current === true;
      const allowed = canVisitListingCreationStep({
        targetIndex: resolved,
        isNewCreation: isNew,
        isSatisfied: (i) => isStepSatisfied(i, currentForm),
      });
      if (!allowed) {
        setStepLockHint(
          listingCreationLockedReason({
            targetIndex: resolved,
            isStay: currentForm.inventoryFamily === 'stay',
            isSatisfied: (i) => isStepSatisfied(i, currentForm),
          })
        );
        return;
      }
      setStepLockHint(null);
      writeWizardStepToStorage(editingId, resolved, currentForm.inventoryFamily === 'stay');
      stepIdxRef.current = resolved;
      setStepIdx(resolved);
    },
    [editingId]
  );

  useLayoutEffect(() => {
    if (sessionOpenedAsCreateRef.current !== true) return;
    if (
      canVisitListingCreationStep({
        targetIndex: stepIdx,
        isNewCreation: true,
        isSatisfied: (i) => isStepSatisfied(i, form),
      })
    ) {
      return;
    }
    let next = 0;
    for (let i = 0; i <= stepIdx; i += 1) {
      if (
        canVisitListingCreationStep({
          targetIndex: i,
          isNewCreation: true,
          isSatisfied: (idx) => isStepSatisfied(idx, form),
        })
      ) {
        next = i;
      }
    }
    if (next !== stepIdx) setStepIdxPersisted(next);
  }, [form, stepIdx, setStepIdxPersisted]);

  const focusToStep: Record<string, number> = useMemo(() => {
    const stay = form.inventoryFamily === 'stay';
    const photos = stay ? 4 : 3;
    return {
      language: 0,
      title: 0,
      category: 0,
      kind: 0,
      subtitle: 0,
      highlights: 0,
      description: 0,
      includes: 1,
      excludes: 1,
      accessibility: 1,
      venue: 1,
      languages: 1,
      location: 1,
      destination: 1,
      duration: 2,
      schedule: 1,
      start: 1,
      price: 2,
      group: 2,
      tags: 2,
      meeting: 2,
      pickup: 2,
      pickup_timing: 2,
      dropoff: 2,
      image: photos,
      gallery: photos,
      hero: photos,
      photos: photos,
      review: 4,
    };
  }, [form.inventoryFamily]);

  useEffect(() => {
    if (editingId) {
      createModeEmptySeededRef.current = false;
      const existing = existingListings.find(t => t.id === editingId);
      if (existing) {
        if (
          !shouldHydrateExistingListing({
            sessionOpenedAsCreate: Boolean(sessionOpenedAsCreateRef.current),
            editingId,
            alreadyHydratedId: editModeHydratedIdRef.current,
          })
        ) {
          editModeHydratedIdRef.current = editingId;
          return;
        }
        editModeHydratedIdRef.current = editingId;
        const extras = parseListingExtras(existing.listingExtras as unknown);
        const packed = compactPhotoSlotsAndLabels(
          photoSlotsFromTourPackage(existing),
          normalizePhotoSlotLabels(extras.photoSlotLabels)
        );
        const listingIsStay = extras.inventoryFamily === 'stay';
        const next: ListingFormState = {
          experienceLanguage: existing.experienceLanguage ?? '',
          experienceKind:
            existing.experienceKind === 'tour' ||
            existing.experienceKind === 'ticket' ||
            existing.experienceKind === 'transportation'
              ? existing.experienceKind
              : '',
          title: existing.title,
          subtitle: existing.subtitle?.trim() ?? '',
          highlights: listingIsStay
            ? normalizeHighlightSlots(existing.highlights)
            : normalizeTourHighlightSlots(existing.highlights),
          destination: existing.destination,
          duration: existing.duration,
          photoSlots: packed.slots,
          photoSlotLabels: packed.labels,
          description: existing.description,
          city: existing.city ?? '',
          country: existing.country ?? '',
          tags: existing.tags ?? [],
          difficulty: existing.difficulty,
          status: existing.status === 'draft' || existing.status === 'published' ? existing.status : 'draft',
          bookingOptions: legacyTourToBookingOptions(existing),
          experienceStartStyle: existing.experienceStartStyle ?? 'unspecified',
          includes: normalizeProgressiveSlots(existing.includes, TOUR_INCLUDE_MIN_VISIBLE, TOUR_INCLUDE_MAX),
          excludes: normalizeProgressiveSlots(existing.excludes, TOUR_EXCLUDE_MIN_VISIBLE, TOUR_EXCLUDE_MAX),
          scheduleStyle: extras.scheduleStyle ?? 'flexible',
          typicalTimelineNotes: extras.typicalTimelineNotes ?? '',
          accessibilitySummary: extras.accessibilitySummary ?? '',
          minGuestAge: extras.minGuestAge ?? '',
          venueSetting: extras.venueSetting ?? 'unspecified',
          additionalLanguages: extras.additionalLanguages ?? [],
          inventoryFamily: extras.inventoryFamily === 'stay' ? 'stay' : 'tour',
          stayPropertyType: extras.stay?.propertyType ?? 'Apartment',
          stayBedrooms: extras.stay?.bedrooms != null ? String(extras.stay.bedrooms) : '1',
          stayBeds: extras.stay?.beds != null ? String(extras.stay.beds) : '1',
          stayBathrooms: extras.stay?.bathrooms != null ? String(extras.stay.bathrooms) : '1',
          stayMaxGuests: extras.stay?.maxGuests != null ? String(extras.stay.maxGuests) : '4',
          stayNightly: extras.stay?.nightlyPriceUsd != null ? String(extras.stay.nightlyPriceUsd) : '',
          stayMinNights: extras.stay?.minNights != null ? String(extras.stay.minNights) : '1',
          stayCheckIn: extras.stay?.checkInTime ?? '16:00',
          stayCheckOut: extras.stay?.checkOutTime ?? '11:00',
          stayAmenities: (extras.stay?.amenities ?? []).join(', '),
          stayHouseRules: extras.stay?.houseRules ?? '',
          stayCleaningFee: extras.stay?.cleaningFeeUsd != null ? String(extras.stay.cleaningFeeUsd) : '',
        };
        initialFormSnapshotRef.current = serializeListingFormState(next);
        const backup = readListingDraftBackup(editingId);
        setForm(
          backup && serializeListingFormState(backup) !== serializeListingFormState(next) ? backup : next
        );
        setLastSavedAt(Date.now());
        const applied =
          backup && serializeListingFormState(backup) !== serializeListingFormState(next) ? backup : next;
        const scene = initialTourBasicsSceneIndex({
          stored: readBasicsSceneFromStorage(editingId),
          isEditing: true,
          productTypeSelected:
            applied.experienceKind === 'tour' ||
            applied.experienceKind === 'ticket' ||
            applied.experienceKind === 'transportation',
        });
        setBasicsSceneIdx(scene);
        writeBasicsSceneToStorage(editingId, scene);
      }
    } else {
      // Only clear edit hydration when we're genuinely in a create session (not a transient editingId=null during edit).
      if (sessionOpenedAsCreateRef.current) {
        editModeHydratedIdRef.current = null;
      }
      // Create flow: seed empty template once — never when this mount started as an edit (see sessionOpenedAsCreateRef).
      if (sessionOpenedAsCreateRef.current && !createModeEmptySeededRef.current) {
        createModeEmptySeededRef.current = true;
        const seeded = {
          ...emptyForm,
          inventoryFamily: createFamily,
          ...(createFamily === 'stay'
            ? {
                experienceLanguage: 'en',
                duration: 'Per night',
                experienceKind: 'tour' as const,
                highlights: Array.from({ length: STAY_HIGHLIGHT_MIN_VISIBLE }, () => ''),
              }
            : {}),
        };
        initialFormSnapshotRef.current = serializeListingFormState(seeded);
        const backup = readListingDraftBackup(null);
        setForm(
          backup && backup.inventoryFamily === createFamily && serializeListingFormState(backup) !== serializeListingFormState(seeded)
            ? backup
            : seeded
        );
      }
    }
  }, [editingId, existingListings, createFamily]);

  useEffect(() => {
    optionModalOpenRef.current = optionModalOpen;
  }, [optionModalOpen]);

  useEffect(() => {
    scheduleDraftRef.current = scheduleDraft;
  }, [scheduleDraft]);

  useEffect(() => {
    if (!publishChecklistKey) {
      setPublishChecklistDismissed(false);
      return;
    }
    setPublishChecklistDismissed(sessionStorage.getItem(publishChecklistKey) === '1');
  }, [publishChecklistKey]);

  const prevEditingIdForWizardRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevEditingIdForWizardRef.current === undefined) {
      prevEditingIdForWizardRef.current = editingId;
      return;
    }
    if (prevEditingIdForWizardRef.current !== editingId) {
      const previousId = prevEditingIdForWizardRef.current ?? null;
      prevEditingIdForWizardRef.current = editingId;
      lastFocused.current = null;
      if (
        !shouldResetWizardOnEditingIdChange({
          sessionOpenedAsCreate: Boolean(sessionOpenedAsCreateRef.current),
          previousId,
          nextId: editingId,
        })
      ) {
        if (editingId) migrateListingEditorStorage(previousId, editingId, form.inventoryFamily === 'stay');
        return;
      }
      const stored = readWizardStepFromStorage(editingId, form.inventoryFamily === 'stay');
      const next = stored !== null ? stored : 0;
      writeWizardStepToStorage(editingId, next, form.inventoryFamily === 'stay');
      setStepIdx(next);
      setBasicsSceneIdx(
        initialTourBasicsSceneIndex({
          stored: readBasicsSceneFromStorage(editingId),
          isEditing: Boolean(editingId),
          productTypeSelected: Boolean(editingId),
        })
      );
    }
  }, [editingId, form.inventoryFamily]);

  /** Backup: keep storage aligned if step changes without going through setStepIdxPersisted (e.g. focus effect). */
  useLayoutEffect(() => {
    writeWizardStepToStorage(editingId, stepIdx, form.inventoryFamily === 'stay');
  }, [stepIdx, editingId, form.inventoryFamily]);

  useEffect(() => {
    if (form.status === 'draft') setPublishBlockers(null);
  }, [form.status]);

  useEffect(() => {
    if (!focusSection || !editingId) return;
    const targetStep = focusToStep[focusSection];
    if (typeof targetStep !== 'number') return;

    const focusKey = `${editingId}:${focusSection}`;
    if (lastFocused.current === focusKey) return;

    writeWizardStepToStorage(editingId, targetStep, form.inventoryFamily === 'stay');
    setStepIdx(targetStep);
    const scene = tourBasicsSceneForFocusSection(focusSection);
    if (scene !== null) {
      writeBasicsSceneToStorage(editingId, scene);
      setBasicsSceneIdx(scene);
    }

    const focusField = () => {
      const el = document.getElementById(`supplier-listing-field-${focusSection}`);
      if (!el) return false;
      lastFocused.current = focusKey;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector<HTMLElement>('input, textarea, select, button');
      focusable?.focus?.();
      onFocusConsumed?.();
      return true;
    };

    if (focusField()) return;

    const optionFieldSections = new Set(['price', 'meeting', 'pickup', 'group', 'pickup_timing']);
    if (scene !== null) {
      const t = window.setTimeout(() => {
        focusField();
      }, 50);
      return () => window.clearTimeout(t);
    }

    if (optionFieldSections.has(focusSection) && targetStep === 2) {
      const preferredOptionId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('option')
          : null;
      const existing =
        (preferredOptionId
          ? form.bookingOptions.find((o) => o.id === preferredOptionId)
          : null) ?? form.bookingOptions[0];
      if (!existing) {
        // Options may still be hydrating — do not consume focus yet.
        return;
      }
      setOptionModalEditingId(existing.id);
      setOptionModalDraft(
        normalizeListingBookingOption({ ...(existing as unknown as Record<string, unknown>) }, existing.id)
      );
      setOptionModalHasEndingDate(existing.availabilityDateTo.trim().length > 0);
      setOptionModalErrors([]);
      setOptionModalOpen(true);
      const t = window.setTimeout(() => {
        const inner = document.getElementById(`supplier-listing-field-${focusSection}`);
        if (!inner) return;
        lastFocused.current = focusKey;
        inner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = inner.querySelector<HTMLElement>('input, textarea, select, button');
        focusable?.focus?.();
        onFocusConsumed?.();
      }, 100);
      return () => window.clearTimeout(t);
    }
  }, [focusSection, editingId, onFocusConsumed, focusToStep, form.bookingOptions]);

  useEffect(() => {
    if (!stepContainerRef.current) return;
    stepContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
  }, [stepIdx, basicsSceneIdx]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const isDirty = useCallback(() => {
    return serializeListingFormState(form) !== initialFormSnapshotRef.current;
  }, [form]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (serializeListingFormState(form) !== initialFormSnapshotRef.current) {
        writeListingDraftBackup(editingId, form);
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [form, editingId]);

  useEffect(() => {
    const persist = () => {
      if (serializeListingFormState(form) === initialFormSnapshotRef.current) return;
      writeListingDraftBackup(editingId, form);
      if (enableDraftOnClose && onSaveDraft) {
        const listing = buildListingFromForm({ ...form, status: 'draft' }, editingId ?? undefined);
        void onSaveDraft(listing);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [form, editingId, enableDraftOnClose, onSaveDraft]);

  const publishBlockersPreview = useMemo(() => {
    const asPublished = buildListingFromForm({ ...form, status: 'published' }, editingId ?? undefined);
    return getListingPublishBlockers(asPublished);
  }, [form, editingId]);

  const jumpToPublishBlocker = useCallback(
    (line: string) => {
      const t = line.toLowerCase();
      const step =
        /photo|image|gallery|cover/.test(t)
          ? 3
          : /price|option|nightly|weekday|spot|guest per|meet or are picked|starting date|ending date/.test(t)
            ? 2
            : /city|country|location|destination|include|exclude|accessib|meeting/.test(t)
              ? 1
              : 0;
      setStepIdxPersisted(step);
      if (step === 0) {
        const scene = /subtitle|title|language/.test(t) ? 1 : /descri|highlight/.test(t) ? 2 : 0;
        setBasicsSceneIdxPersisted(scene, 'forward');
      }
    },
    [setStepIdxPersisted, setBasicsSceneIdxPersisted]
  );

  const publishButtonTitle = useMemo(() => {
    if (!canPostNewListing) {
      return 'Business and payout verification (IBAN + BIC) required — see Settings.';
    }
    if (publishBlockersPreview.length > 0) {
      return publishBlockersPreview[0];
    }
    return 'Publish this listing on Traverion for travelers to book.';
  }, [canPostNewListing, publishBlockersPreview]);

  const handleCloseIntent = useCallback(async () => {
    if (closeIntentRunningRef.current || submitting) return;
    setDraftCloseError(null);
    if (enableDraftOnClose && onSaveDraft && isDirty()) {
      closeIntentRunningRef.current = true;
      setDraftCloseBusy(true);
      try {
        const listing = buildListingFromForm({ ...form, status: 'draft' }, editingId ?? undefined);
        const ok = await onSaveDraft(listing);
        if (!ok) {
          setDraftCloseError('Could not save your draft. Check your connection and try again.');
          return;
        }
        clearListingDraftBackup(editingId);
        initialFormSnapshotRef.current = serializeListingFormState(form);
        setLastSavedAt(Date.now());
      } finally {
        setDraftCloseBusy(false);
        closeIntentRunningRef.current = false;
      }
    }
    clearWizardStepStorage(editingId, form.inventoryFamily === 'stay');
    onCancel();
  }, [enableDraftOnClose, onSaveDraft, isDirty, form, editingId, submitting, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (scheduleDraftRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setScheduleLeaveOpen(true);
        return;
      }
      if (optionModalOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setOptionModalOpen(false);
        setOptionModalDraft(null);
        setOptionModalEditingId(null);
        setOptionModalErrors([]);
        setOptionModalHasEndingDate(false);
        setOptionSceneIdx(0);
        setOptionSceneDirection('forward');
        setOptionLockHint(null);
        setOptionAttempted(false);
        optionSessionOpenedAsCreateRef.current = false;
        return;
      }
      e.preventDefault();
      void handleCloseIntent();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleCloseIntent]);

  const runSubmit = useCallback(
    async (targetStatus: 'draft' | 'published') => {
      if (submitInFlightRef.current) return;
      const last = steps.length - 1;
      if (stepIdx === last && !lastStepSubmitArmed) return;

      submitInFlightRef.current = true;
      try {
        const listing = buildListingFromForm({ ...form, status: targetStatus }, editingId ?? undefined);
        if (targetStatus === 'published') {
          if (!canPostNewListing) {
            setSubmitError(
              'Publishing needs Traverion to verify your business and your payout (IBAN + BIC). Finish both in Settings, then try again.'
            );
            return;
          }
          const blockers = getListingPublishBlockers(listing);
          if (blockers.length > 0) {
            setPublishBlockers(blockers);
            const photosRelated = blockers.some((b) =>
              /image|photo|gallery|hero|placeholder/i.test(b)
            );
            const photosStep = form.inventoryFamily === 'stay' ? 4 : 3;
            const go = photosRelated
              ? photosStep
              : form.inventoryFamily === 'stay'
                ? 5
                : 4;
            writeWizardStepToStorage(editingId, go, form.inventoryFamily === 'stay');
            setStepIdx(go);
            return;
          }
        }
        setPublishBlockers(null);
        setSubmitError(null);
        setSubmitting(true);
        try {
          const result = await onSave(listing);
          if (!result.success) {
            setSubmitError(userFacingError(result.error, 'Could not save your listing. Please try again.'));
            return;
          }
          if (result.listingId && result.listingId !== editingId) {
            migrateListingEditorStorage(editingId, result.listingId, form.inventoryFamily === 'stay');
          }
          initialFormSnapshotRef.current = serializeListingFormState(form);
          setLastSavedAt(Date.now());
        } finally {
          setSubmitting(false);
        }
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [form, editingId, onSave, stepIdx, lastStepSubmitArmed, steps.length, canPostNewListing]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSubmit(form.status === 'published' ? 'published' : 'draft');
  };

  const toggleTag = (id: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id],
    }));
  };

  const removeBookingOption = useCallback((optionId: string) => {
    setForm((f) => ({ ...f, bookingOptions: f.bookingOptions.filter((o) => o.id !== optionId) }));
    setOptionPendingDeleteId(null);
  }, []);

  const duplicateOption = useCallback((optionId: string) => {
    setForm((f) => {
      const source = f.bookingOptions.find((o) => o.id === optionId);
      if (!source) return f;
      return {
        ...f,
        bookingOptions: [...f.bookingOptions, duplicateBookingOption(source, newBookingOptionId())],
      };
    });
  }, []);

  const closeOptionModal = useCallback(() => {
    setOptionModalOpen(false);
    setOptionModalDraft(null);
    setOptionModalEditingId(null);
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(false);
    setOptionSceneIdx(0);
    setOptionSceneDirection('forward');
    setOptionLockHint(null);
    setOptionAttempted(false);
    setScheduleDraft(null);
    setPendingScheduleDeleteId(null);
    optionSessionOpenedAsCreateRef.current = false;
    scheduleSessionOpenedAsCreateRef.current = false;
  }, []);

  const optionEndingState = useCallback(
    (): { hasEndingDate: boolean } => ({ hasEndingDate: optionModalHasEndingDate }),
    [optionModalHasEndingDate]
  );

  const setOptionSceneIdxPersisted = useCallback(
    (index: number, direction: ListingCreationSceneDirection) => {
      const draft = optionModalDraft;
      if (!draft) return;
      const ending = optionEndingState();
      const isNewOption = optionSessionOpenedAsCreateRef.current;
      const allowed = canVisitTourOptionScene({
        targetIndex: index,
        isNewOption,
        option: draft,
        ending,
      });
      if (!allowed) {
        const reason = tourOptionLockedReason({ targetIndex: index, option: draft, ending });
        setOptionLockHint(reason);
        setOptionAttempted(true);
        focusListingField(firstBookingOptionIssueFocusId(draft, ending));
        return;
      }
      setOptionLockHint(null);
      setOptionAttempted(false);
      setOptionSceneDirection(direction);
      setOptionSceneIdx(clampTourOptionSceneIndex(index));
    },
    [optionModalDraft, optionEndingState]
  );

  const openOptionModalCreate = useCallback(() => {
    optionSessionOpenedAsCreateRef.current = true;
    setOptionModalEditingId(null);
    setOptionModalDraft(createEmptyBookingOption());
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(false);
    setOptionSceneIdx(0);
    setOptionSceneDirection('forward');
    setOptionLockHint(null);
    setOptionAttempted(false);
    setScheduleDraft(null);
    setOptionModalOpen(true);
  }, []);

  const openOptionModalEdit = useCallback((id: string) => {
    const opt = form.bookingOptions.find((o) => o.id === id);
    if (!opt) return;
    optionSessionOpenedAsCreateRef.current = false;
    setOptionModalEditingId(id);
    setOptionModalDraft(
      ensureExplicitSchedules(
        normalizeListingBookingOption({ ...(opt as unknown as Record<string, unknown>) }, opt.id)
      )
    );
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(opt.availabilityDateTo.trim().length > 0);
    setOptionSceneIdx(0);
    setOptionSceneDirection('forward');
    setOptionLockHint(null);
    setOptionAttempted(false);
    setScheduleDraft(null);
    setOptionModalOpen(true);
  }, [form.bookingOptions]);

  const patchOptionDraft = useCallback((patch: Partial<ListingBookingOption>) => {
    setOptionModalDraft((d) => {
      if (!d) return d;
      return normalizeListingBookingOption(
        { ...(d as unknown as Record<string, unknown>), ...patch } as Record<string, unknown>,
        d.id
      );
    });
  }, []);

  const persistOptionDraftToForm = useCallback(
    (draft: ListingBookingOption) => {
      const durParts = parseBookingOptionDuration(draft.duration);
      const canonicalDuration = formatBookingOptionDuration(durParts.amount, durParts.unit);
      const normalized = normalizeListingBookingOption(
        {
          ...(draft as unknown as Record<string, unknown>),
          duration: canonicalDuration,
        },
        draft.id
      );
      setForm((f) => ({ ...f, bookingOptions: upsertBookingOption(f.bookingOptions, normalized) }));
      setOptionModalEditingId(normalized.id);
      return normalized;
    },
    []
  );

  const saveOptionModal = useCallback(() => {
    if (!optionModalDraft) return;
    const ending = optionEndingState();
    const errs = optionValidationMessages(optionModalDraft, ending.hasEndingDate);
    if (errs.length) {
      setOptionAttempted(true);
      setOptionModalErrors(errs);
      setOptionLockHint(errs[0] ?? 'Finish the remaining option details before completing.');
      const firstIncomplete = [0, 1, 2].find(
        (idx) => !isTourOptionSceneSatisfied(idx, optionModalDraft, ending)
      );
      if (firstIncomplete != null) {
        setOptionSceneIdxPersisted(firstIncomplete, 'back');
      }
      focusListingField(firstBookingOptionIssueFocusId(optionModalDraft, ending));
      return;
    }
    persistOptionDraftToForm(optionModalDraft);
    closeOptionModal();
  }, [
    optionModalDraft,
    optionEndingState,
    persistOptionDraftToForm,
    closeOptionModal,
    setOptionSceneIdxPersisted,
  ]);

  const advanceOptionScene = useCallback(() => {
    if (!optionModalDraft) return;
    const ending = optionEndingState();
    const canContinue = canContinueTourOptionScene({
      sceneIndex: optionSceneIdx,
      option: optionModalDraft,
      ending,
    });
    if (!canContinue) {
      setOptionAttempted(true);
      const hint = tourOptionSceneContinueHint({
        sceneIndex: optionSceneIdx,
        option: optionModalDraft,
        ending,
        canContinue: false,
      });
      setOptionLockHint(hint);
      focusListingField(firstBookingOptionIssueFocusId(optionModalDraft, ending));
      return;
    }
    persistOptionDraftToForm(optionModalDraft);
    setOptionLockHint(null);
    setOptionAttempted(false);
    setOptionModalErrors([]);
    setOptionSceneIdxPersisted(nextTourOptionScene(optionSceneIdx), 'forward');
  }, [
    optionModalDraft,
    optionEndingState,
    optionSceneIdx,
    persistOptionDraftToForm,
    setOptionSceneIdxPersisted,
  ]);

  const scheduleIsDirty = useCallback(() => {
    if (!scheduleDraft) return false;
    return JSON.stringify(scheduleDraft) !== scheduleSnapshotRef.current;
  }, [scheduleDraft]);

  const closeScheduleWorkspace = useCallback((force = false) => {
    if (!force && scheduleIsDirty()) {
      setScheduleLeaveOpen(true);
      return;
    }
    setScheduleLeaveOpen(false);
    setScheduleDraft(null);
    setScheduleSaveError(null);
    setScheduleAttempted(false);
    setSchedulePersistLabel(null);
    scheduleSessionOpenedAsCreateRef.current = false;
  }, [scheduleIsDirty]);

  const applyScheduleToOptionDraft = useCallback(
    (schedule: ListingOptionSchedule, persist: boolean) => {
      if (!optionModalDraft) return optionModalDraft;
      const next = upsertOptionSchedule(ensureExplicitSchedules(optionModalDraft), schedule);
      setOptionModalDraft(next);
      if (persist) persistOptionDraftToForm(next);
      return next;
    },
    [optionModalDraft, persistOptionDraftToForm]
  );

  const openScheduleCreate = useCallback(() => {
    if (!optionModalDraft || addScheduleLockRef.current) return;
    addScheduleLockRef.current = true;
    window.setTimeout(() => {
      addScheduleLockRef.current = false;
    }, 400);
    // Materialize explicit schedules for overlap checks, but do not upsert the blank
    // until the first save — cancel must not leave an empty orphan schedule.
    const prepared = ensureExplicitSchedules(optionModalDraft);
    if (prepared !== optionModalDraft) setOptionModalDraft(prepared);
    const blank = blankOptionSchedule(newListingOptionScheduleId());
    scheduleSessionOpenedAsCreateRef.current = true;
    scheduleSnapshotRef.current = JSON.stringify(blank);
    setScheduleDraft(blank);
    setScheduleSceneIdx(0);
    setScheduleHasEndingDate(true);
    setScheduleAttempted(false);
    setSchedulePersistLabel(null);
    setScheduleSaveError(null);
    setScheduleLeaveOpen(false);
  }, [optionModalDraft]);

  const openScheduleEdit = useCallback(
    (scheduleId: string) => {
      if (!optionModalDraft) return;
      const prepared = ensureExplicitSchedules(optionModalDraft);
      const existing = (prepared.schedules ?? []).find((s) => s.id === scheduleId);
      if (!existing) return;
      scheduleSessionOpenedAsCreateRef.current = false;
      scheduleSnapshotRef.current = JSON.stringify(existing);
      setOptionModalDraft(prepared);
      setScheduleDraft(existing);
      setScheduleSceneIdx(0);
      setScheduleHasEndingDate(existing.availabilityDateTo.trim().length > 0);
      setScheduleAttempted(false);
      setSchedulePersistLabel(null);
      setScheduleSaveError(null);
      setScheduleLeaveOpen(false);
    },
    [optionModalDraft]
  );

  const duplicateSchedule = useCallback(
    (scheduleId: string) => {
      if (!optionModalDraft || addScheduleLockRef.current) return;
      addScheduleLockRef.current = true;
      window.setTimeout(() => {
        addScheduleLockRef.current = false;
      }, 400);
      const prepared = ensureExplicitSchedules(optionModalDraft);
      const source = (prepared.schedules ?? []).find((s) => s.id === scheduleId);
      if (!source) return;
      const copy = duplicateOptionSchedule(source, newListingOptionScheduleId());
      scheduleSessionOpenedAsCreateRef.current = true;
      scheduleSnapshotRef.current = JSON.stringify(copy);
      const next = upsertOptionSchedule(prepared, copy);
      setOptionModalDraft(next);
      persistOptionDraftToForm(next);
      setScheduleDraft(copy);
      setScheduleSceneIdx(0);
      setScheduleHasEndingDate(copy.availabilityDateTo.trim().length > 0);
      setScheduleAttempted(false);
      setSchedulePersistLabel('Draft saved');
      setScheduleSaveError(null);
    },
    [optionModalDraft, persistOptionDraftToForm]
  );

  const deleteSchedule = useCallback(
    (scheduleId: string) => {
      if (!optionModalDraft) return;
      if (pendingScheduleDeleteId !== scheduleId) {
        setPendingScheduleDeleteId(scheduleId);
        return;
      }
      const next = removeOptionSchedule(ensureExplicitSchedules(optionModalDraft), scheduleId);
      setOptionModalDraft(next);
      persistOptionDraftToForm(next);
      setPendingScheduleDeleteId(null);
    },
    [optionModalDraft, pendingScheduleDeleteId, persistOptionDraftToForm]
  );

  const persistScheduleDraft = useCallback(
    (schedule: ListingOptionSchedule) => {
      try {
        applyScheduleToOptionDraft(schedule, true);
        scheduleSnapshotRef.current = JSON.stringify(schedule);
        setSchedulePersistLabel('Draft saved');
        setScheduleSaveError(null);
        return true;
      } catch (err) {
        setSchedulePersistLabel('Save failed');
        setScheduleSaveError(userFacingError(err, 'Couldn’t save this schedule. Your changes are still here.'));
        return false;
      }
    },
    [applyScheduleToOptionDraft]
  );

  const patchScheduleDraft = useCallback((patch: Partial<ListingOptionSchedule>) => {
    setScheduleDraft((d) => (d ? { ...d, ...patch } : d));
    setSchedulePersistLabel(null);
  }, []);

  const setScheduleSceneIdxPersisted = useCallback(
    (index: number) => {
      if (!scheduleDraft) return;
      const allowed = canVisitTourScheduleScene({
        targetIndex: index,
        isNewSchedule: scheduleSessionOpenedAsCreateRef.current,
        schedule: scheduleDraft,
      });
      if (!allowed) {
        setScheduleAttempted(true);
        focusListingField(firstScheduleIssueFocusId(scheduleDraft));
        return;
      }
      setScheduleSceneIdx(clampTourScheduleSceneIndex(index));
      setScheduleAttempted(false);
    },
    [scheduleDraft]
  );

  const saveScheduleAsDraft = useCallback(() => {
    if (!scheduleDraft) return;
    persistScheduleDraft({ ...scheduleDraft, status: 'draft' });
  }, [scheduleDraft, persistScheduleDraft]);

  const advanceScheduleScene = useCallback(() => {
    if (!scheduleDraft || !optionModalDraft) return;
    const canContinue = canContinueTourScheduleScene({
      sceneIndex: scheduleSceneIdx,
      schedule: scheduleDraft,
      option: optionModalDraft,
    });
    if (!canContinue) {
      setScheduleAttempted(true);
      focusListingField(firstScheduleIssueFocusId(scheduleDraft));
      return;
    }
    persistScheduleDraft({ ...scheduleDraft, status: 'draft' });
    setScheduleSceneIdx(nextTourScheduleScene(scheduleSceneIdx));
  }, [scheduleDraft, optionModalDraft, scheduleSceneIdx, persistScheduleDraft]);

  const saveScheduleReady = useCallback(() => {
    if (!scheduleDraft || !optionModalDraft) return;
    const ready = { ...scheduleDraft, status: 'ready' as const };
    const gate = scheduleCanSaveReady(ready, optionModalDraft);
    if (!gate.ok) {
      setScheduleAttempted(true);
      setScheduleSaveError(gate.error);
      focusListingField(firstScheduleIssueFocusId(ready));
      return;
    }
    if (editingId) {
      const occupying = occupyingGuestsForOptionDeparture({
        bookings: listingOccupancyBookings,
        listingId: editingId,
        optionId: optionModalDraft.id,
        startTimeHm: ready.startTime,
      });
      const underSold = scheduleSpotsBelowSoldWarning({
        newMaxSpots: ready.maxSpotsPerSlot,
        occupyingGuests: occupying,
        startTimeHm: ready.startTime,
      });
      if (underSold && typeof window !== 'undefined' && !window.confirm(`${underSold}\n\nSave this capacity anyway?`)) {
        return;
      }
    }
    if (!persistScheduleDraft(ready)) return;
    setScheduleDraft(null);
    setScheduleLeaveOpen(false);
    scheduleSessionOpenedAsCreateRef.current = false;
  }, [scheduleDraft, optionModalDraft, persistScheduleDraft, editingId, listingOccupancyBookings]);

  const occupancyNoticeForSchedule = useCallback(
    (schedule: ListingOptionSchedule) => {
      if (!editingId || !optionModalDraft) return null;
      const occupying = occupyingGuestsForOptionDeparture({
        bookings: listingOccupancyBookings,
        listingId: editingId,
        optionId: optionModalDraft.id,
        startTimeHm: schedule.startTime,
      });
      return removeScheduleOccupancyNotice(occupying, schedule.startTime);
    },
    [editingId, optionModalDraft, listingOccupancyBookings]
  );

  const scheduleContinueHint =
    scheduleDraft && optionModalDraft
      ? tourScheduleSceneContinueHint({
          sceneIndex: scheduleSceneIdx,
          schedule: scheduleDraft,
          option: optionModalDraft,
          canContinue: canContinueTourScheduleScene({
            sceneIndex: scheduleSceneIdx,
            schedule: scheduleDraft,
            option: optionModalDraft,
          }),
        })
      : null;

  const saveOptionAsDraft = useCallback(() => {
    if (!optionModalDraft) return;
    if (!isListingBookingOptionEffectivelyEmpty(optionModalDraft)) {
      persistOptionDraftToForm(optionModalDraft);
    }
    closeOptionModal();
  }, [optionModalDraft, persistOptionDraftToForm, closeOptionModal]);

  const tourOptionGuided = Boolean(optionModalOpen && optionModalDraft && !isStayForm);
  const optionEnding = { hasEndingDate: optionModalHasEndingDate };
  const optionCanFinish = Boolean(
    optionModalDraft && optionValidationMessages(optionModalDraft, optionModalHasEndingDate).length === 0
  );
  const optionContinueHint = tourOptionGuided && optionModalDraft
    ? optionSceneIdx < TOUR_OPTION_SCENE_COUNT - 1
      ? tourOptionSceneContinueHint({
          sceneIndex: optionSceneIdx,
          option: optionModalDraft,
          ending: optionEnding,
          canContinue: canContinueTourOptionScene({
            sceneIndex: optionSceneIdx,
            option: optionModalDraft,
            ending: optionEnding,
          }),
        })
      : optionCanFinish
        ? null
        : tourOptionSceneContinueHint({
            sceneIndex: optionSceneIdx,
            option: optionModalDraft,
            ending: optionEnding,
            canContinue: false,
          })
    : null;

  const persistLabel = scheduleDraft
    ? scheduleIsDirty()
      ? 'Unsaved changes'
      : schedulePersistLabel
    : listingWizardPersistLabel({
    saving: draftCloseBusy || submitting,
    failed: Boolean(draftCloseError || submitError),
    dirty: isDirty(),
    serverSaved: lastSavedAt != null || Boolean(editingId),
    published: form.status === 'published',
  });

  const canContinueStep = () => canContinueListingStep(stepIdx, form, sessionOpenedAsCreateRef.current === true);
  const tourBasicsGuided = !isStayForm && stepIdx === 0;
  const canContinueBasicsScene = canAdvanceTourBasicsScene(basicsSceneIdx, form);
  const tourBasicsContinueHint = !canContinueBasicsScene
    ? basicsSceneIdx === 0 && !isTourProductTypeSatisfied(form)
      ? 'Choose a product type to continue.'
      : basicsSceneIdx === 1 && !isTourIdentitySatisfied(form)
        ? 'Add a title, language and subtitle to continue.'
        : basicsSceneIdx === 2 && !isTourStorySatisfied(form)
          ? 'Add a description of at least 100 characters to continue.'
          : listingCreationContinueHint({
              stepIndex: 0,
              isStay: false,
              canContinue: false,
            })
    : null;

  const creationTitle = editingId
    ? form.title.trim() || (form.inventoryFamily === 'stay' ? 'Stay' : 'Tour')
    : createFamily === 'stay'
      ? 'Create a stay'
      : 'Create a tour';
  const creationNavLabel = editingId
    ? form.inventoryFamily === 'stay'
      ? 'Stay sections'
      : 'Tour sections'
    : createFamily === 'stay'
      ? 'Create stay steps'
      : 'Create tour steps';
  const creationNavItems = listingCreationNavItems(steps, stepIdx, (idx) => isStepSatisfied(idx, form), {
    isNewCreation: sessionOpenedAsCreateRef.current === true,
  });
  const creationProgressCopy = listingCreationProgressCopy(
    steps.filter((_, idx) => isStepSatisfied(idx, form)).length,
    steps.length
  );

  const shell = (
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-listing-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-[80] bg-slate-900/35 backdrop-blur-md motion-safe:animate-fade-in supports-[backdrop-filter]:bg-slate-900/25 cursor-pointer border-0 p-0"
        aria-label={form.inventoryFamily === 'stay' || createFamily === 'stay' ? 'Close stay editor' : 'Close tour editor'}
        onClick={() => void handleCloseIntent()}
      />
      <div className="relative z-[81] flex h-full min-h-0 w-full flex-1 flex-col justify-stretch px-0 py-0 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const el = e.target as HTMLElement;
            if (el.tagName === 'TEXTAREA') return;
            if (el.tagName === 'BUTTON') return;
            e.preventDefault();
          }}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto relative motion-safe:animate-fade-in motion-reduce:animate-none flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-paper shadow-none h-full rounded-none"
        >
        <ListingCreationWorkspace
          title={creationTitle}
          titleId="supplier-listing-editor-title"
          persistLabel={persistLabel}
          progressCopy={creationProgressCopy}
          items={creationNavItems}
          navLabel={creationNavLabel}
          currentLabel={tourOptionGuided ? (TOUR_OPTION_SCENES[optionSceneIdx]?.label ?? 'Option') : steps[stepIdx].label}
          onSelectIndex={(idx) => {
            if (tourOptionGuided) closeOptionModal();
            setStepIdxPersisted(idx);
          }}
          onExit={() => void handleCloseIntent()}
          exitDisabled={draftCloseBusy || submitting}
          exitBusy={draftCloseBusy}
          contextNav={
            tourOptionGuided && optionModalDraft
              ? {
                  title: optionSessionOpenedAsCreateRef.current
                    ? 'New option'
                    : optionModalEditingId
                      ? 'Edit option'
                      : 'New option',
                  items: tourOptionContextNavItems(optionSceneIdx, {
                    isNewOption: optionSessionOpenedAsCreateRef.current,
                    option: optionModalDraft,
                    ending: { hasEndingDate: optionModalHasEndingDate },
                  }),
                  onSelect: (id) => {
                    const next = TOUR_OPTION_SCENES.findIndex((scene) => scene.id === id);
                    if (next < 0) return;
                    setOptionSceneIdxPersisted(next, next >= optionSceneIdx ? 'forward' : 'back');
                  },
                }
              : null
          }
          overlay={null}
          scrollRef={stepContainerRef}
          banners={
            <>
              {optionLockHint ? (
                <div className="listing-creation-hint shrink-0 px-4 pt-3 sm:px-8 lg:px-12" role="status">
                  <p className="text-sm text-ink-muted">{optionLockHint}</p>
                </div>
              ) : null}
              {stepLockHint ? (
                <div className="listing-creation-hint shrink-0 px-4 pt-3 sm:px-8 lg:px-12" role="status">
                  <p className="text-sm text-ink-muted">{stepLockHint}</p>
                </div>
              ) : null}
              {draftCloseError ? (
                <div className="shrink-0 px-4 pt-3 sm:px-8 lg:px-12">
                  <NoticeCallout title="Could not save draft" tone="danger">
                    {draftCloseError}
                  </NoticeCallout>
                </div>
              ) : null}
              {submitError ? (
                <div className="shrink-0 px-4 pt-3 sm:px-8 lg:px-12">
                  <NoticeCallout title="Could not save listing" tone="danger">
                    {submitError}
                  </NoticeCallout>
                </div>
              ) : null}
              {publishBlockers && publishBlockers.length > 0 ? (
                <div className="mx-4 mt-3 shrink-0 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-950 ring-1 ring-amber-200/80 sm:mx-8 sm:p-4 lg:mx-12">
                  <p className="font-semibold text-amber-900">Finish these before publishing</p>
                  <ul className="mt-2.5 space-y-1.5">
                    {publishBlockers.map((line) => (
                      <li key={line}>
                        <button
                          type="button"
                          className="lux-flat text-left text-sm text-amber-950/90 underline-offset-2 hover:text-ink hover:underline"
                          onClick={() => jumpToPublishBlocker(line)}
                        >
                          {line}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setPublishBlockers(null)}
                    className="mt-3 text-xs font-medium text-finland hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </>
          }
          footer={
            <div className="flex flex-col gap-2">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  if (tourOptionGuided) {
                    if (optionSceneIdx > 0) {
                      setOptionSceneIdxPersisted(previousTourOptionScene(optionSceneIdx), 'back');
                      return;
                    }
                    closeOptionModal();
                    return;
                  }
                  if (tourBasicsGuided && basicsSceneIdx > 0) {
                    setBasicsSceneIdxPersisted(previousTourBasicsScene(basicsSceneIdx), 'back');
                    return;
                  }
                  setStepIdxPersisted((s) => Math.max(0, s - 1));
                }}
                disabled={
                  tourOptionGuided
                    ? draftCloseBusy || submitting
                    : (tourBasicsGuided ? basicsSceneIdx === 0 : stepIdx === 0) || draftCloseBusy || submitting
                }
                className="touch-manipulation tv-btn-ghost !min-h-11 w-full sm:w-auto disabled:opacity-50"
              >
                {tourOptionGuided && optionSceneIdx === 0 ? 'Options' : 'Back'}
              </button>
              <div className="flex w-full min-w-0 flex-wrap items-stretch gap-2 sm:w-auto sm:items-center">
                {tourOptionGuided ? (
                  <>
                    <button
                      type="button"
                      onClick={saveOptionAsDraft}
                      disabled={draftCloseBusy || submitting}
                      className="touch-manipulation tv-btn-secondary !min-h-11 sm:flex-none disabled:opacity-50"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (optionSceneIdx < TOUR_OPTION_SCENE_COUNT - 1) {
                          advanceOptionScene();
                          return;
                        }
                        saveOptionModal();
                      }}
                      disabled={
                        draftCloseBusy ||
                        submitting ||
                        (optionSceneIdx === TOUR_OPTION_SCENE_COUNT - 1 && !optionCanFinish)
                      }
                      className="touch-manipulation tv-btn-primary !min-h-11 flex-1 sm:flex-none disabled:opacity-50"
                    >
                      {optionSceneIdx < TOUR_OPTION_SCENE_COUNT - 1 ? 'Continue' : 'Finish option'}
                    </button>
                  </>
                ) : stepIdx < steps.length - 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void runSubmit('draft')}
                      disabled={submitting || draftCloseBusy || form.status === 'published'}
                      className="touch-manipulation tv-btn-secondary !min-h-11 sm:flex-none disabled:opacity-50"
                    >
                      {submitting ? 'Saving…' : 'Save draft'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (tourBasicsGuided && basicsSceneIdx < TOUR_BASICS_SCENE_COUNT - 1) {
                          setBasicsSceneIdxPersisted(nextTourBasicsScene(basicsSceneIdx), 'forward');
                          return;
                        }
                        setStepIdxPersisted((s) => Math.min(steps.length - 1, s + 1));
                      }}
                      disabled={
                        (tourBasicsGuided ? !canContinueBasicsScene : !canContinueStep()) ||
                        draftCloseBusy ||
                        submitting
                      }
                      className="touch-manipulation tv-btn-primary !min-h-11 flex-1 sm:flex-none disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </>
                ) : (
                  <div className="flex min-w-0 w-full flex-col gap-2 sm:w-auto sm:flex-auto sm:flex-row">
                    {form.status === 'published' ? (
                      <button
                        type="button"
                        onClick={() => void runSubmit('published')}
                        disabled={
                          submitting ||
                          draftCloseBusy ||
                          !isStepSatisfied(steps.length - 1, form) ||
                          !lastStepSubmitArmed ||
                          publishBlockersPreview.length > 0
                        }
                        title={
                          publishBlockersPreview.length > 0
                            ? publishBlockersPreview[0]
                            : 'Save updates to your live listing'
                        }
                        className="touch-manipulation tv-btn-primary !min-h-11 flex-1 sm:flex-none disabled:opacity-50"
                      >
                        {submitting ? 'Saving…' : 'Save changes'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void runSubmit('draft')}
                          disabled={
                            submitting ||
                            draftCloseBusy ||
                            !lastStepSubmitArmed
                          }
                          className="touch-manipulation tv-btn-secondary !min-h-11 sm:flex-none disabled:opacity-50"
                        >
                          {submitting ? 'Saving…' : 'Save as draft'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSubmit('published')}
                          disabled={
                            submitting ||
                            draftCloseBusy ||
                            !lastStepSubmitArmed ||
                            !canPostNewListing ||
                            publishBlockersPreview.length > 0
                          }
                          title={publishButtonTitle}
                          className="touch-manipulation tv-btn-primary !min-h-11 flex-1 sm:flex-none disabled:opacity-50"
                        >
                          {submitting ? 'Saving…' : 'Publish'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {tourOptionGuided && optionContinueHint ? (
              <p className="listing-creation-hint text-xs leading-relaxed text-ink-muted sm:text-right" role="status">
                {optionContinueHint}
              </p>
            ) : null}
            {!tourOptionGuided && stepIdx < steps.length - 1
              ? (() => {
                  const hint = tourBasicsGuided
                    ? tourBasicsContinueHint
                    : listingCreationContinueHint({
                        stepIndex: stepIdx,
                        isStay: isStayForm,
                        canContinue: canContinueStep(),
                      });
                  return hint ? (
                    <p
                      className="listing-creation-hint text-xs leading-relaxed text-ink-muted sm:text-right"
                      role="status"
                    >
                      {hint}
                    </p>
                  ) : null;
                })()
              : null}
            </div>
          }
        >
          {tourOptionGuided && optionModalDraft ? (
            <div className="listing-creation-option-workspace listing-creation-option-workspace--enter w-full max-w-xl">
              {optionModalErrors.length > 0 ? (
                <div className="mb-6" role="alert">
                  <p className="text-sm font-semibold text-ink">This option is not ready yet</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                    {optionModalErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <TourOptionGuidedScenes
                option={optionModalDraft}
                sceneIndex={optionSceneIdx}
                direction={optionSceneDirection}
                currencyLabel={listingCurrency}
                hasEndingDate={optionModalHasEndingDate}
                onHasEndingDateChange={setOptionModalHasEndingDate}
                onSelectScene={(index) => {
                  setOptionSceneIdxPersisted(index, index >= optionSceneIdx ? 'forward' : 'back');
                }}
                canSelectScene={(index) =>
                  canVisitTourOptionScene({
                    targetIndex: index,
                    isNewOption: optionSessionOpenedAsCreateRef.current,
                    option: optionModalDraft,
                    ending: optionEnding,
                  })
                }
                onChange={patchOptionDraft}
                formatAmount={(n) => formatMoney(n, listingCurrency)}
                priceSummary={summarizeOptionPricing(optionModalDraft, (n) => formatMoney(n, listingCurrency))}
                validationMessages={optionValidationMessages(optionModalDraft, optionModalHasEndingDate)}
                attempted={optionAttempted}
                onAddSchedule={openScheduleCreate}
                onEditSchedule={openScheduleEdit}
                onDuplicateSchedule={duplicateSchedule}
                onDeleteSchedule={deleteSchedule}
                pendingScheduleDeleteId={pendingScheduleDeleteId}
                onCancelScheduleDelete={() => setPendingScheduleDeleteId(null)}
                occupancyNoticeForSchedule={occupancyNoticeForSchedule}
              />
            </div>
          ) : (
          <div
            key={stepIdx}
            className={`w-full ${
              stepIdx === 0 && !isStayForm
                ? ''
                : `motion-safe:animate-fade-in ${
                    stepIdx === (isStayForm ? 4 : 3) ? 'max-w-5xl' : 'max-w-xl'
                  }`
            }`}
          >
          {!(
            (stepIdx === 0 && !isStayForm) ||
            (stepIdx === 2 && !isStayForm) ||
            stepIdx === (isStayForm ? 4 : 3) ||
            stepIdx === (isStayForm ? 5 : 4) ||
            (isStayForm && (stepIdx === 2 || stepIdx === 3))
          ) ? (
            <header className="mb-8">
              <h3 className="font-display text-[1.85rem] font-bold tracking-tight text-ink">{steps[stepIdx].label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{stepGuidance[stepIdx]}</p>
            </header>
          ) : null}
          {stepIdx === 0 && isStayForm && (
            <div className="space-y-7">
                <div id="supplier-listing-field-stay-type">
                  <label className="block text-sm font-semibold text-ink mb-1">Property type *</label>
                  <p className="text-xs text-ink-muted mb-3">What travelers are booking — not a tour option.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {(['Apartment', 'House', 'Cabin', 'Room', 'Cottage', 'Other'] as const).map((type) => {
                      const selected = (form.stayPropertyType || 'Apartment') === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, stayPropertyType: type }))}
                          className={`lc-choice rounded-xl px-3 py-3 text-left text-sm font-bold ${
                            selected ? 'lc-choice--selected text-ink' : 'text-ink-muted'
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              <div id="supplier-listing-field-title">
                <label htmlFor="supplier-listing-title" className="block text-sm font-semibold text-ink mb-1">
                  Title *
                </label>
                <p className="text-xs text-ink-muted mb-2">A clear, specific name travelers will see in search and on the listing page.</p>
                <input
                  id="supplier-listing-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="tv-input"
                  placeholder="e.g. Harbour apartment · two bedrooms"
                  required
                />
              </div>
              <div id="supplier-listing-field-subtitle">
                <label htmlFor="supplier-listing-subtitle" className="block text-sm font-semibold text-ink mb-1">
                  Subtitle *
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  A short line under the title on the listing page (max {MAX_SUBTITLE_LENGTH} characters).
                </p>
                <input
                  id="supplier-listing-subtitle"
                  type="text"
                  value={form.subtitle}
                  maxLength={MAX_SUBTITLE_LENGTH}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value.slice(0, MAX_SUBTITLE_LENGTH) }))}
                  className="tv-input"
                  placeholder="e.g. Quiet apartment near the harbour"
                />
                <p className="text-xs text-ink-muted mt-1 tabular-nums">
                  {form.subtitle.length}/{MAX_SUBTITLE_LENGTH}
                </p>
              </div>
              <div id="supplier-listing-field-description">
                <label htmlFor="supplier-listing-description" className="block text-sm font-semibold text-ink mb-1">
                  About this stay *
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  Main description for guests (at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue, max{' '}
                  {MAX_DESCRIPTION_LENGTH}).
                </p>
                <textarea
                  id="supplier-listing-description"
                  value={form.description}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value.slice(0, MAX_DESCRIPTION_LENGTH) }))
                  }
                  rows={8}
                  className={`tv-input min-h-[10rem] ${
                    form.description.trim().length > 0 &&
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                      ? 'border-amber-300 focus:ring-amber-200 focus:border-amber-400'
                      : ''
                  }`}
                  placeholder="What guests do, what makes it special, practical notes…"
                  aria-invalid={
                    form.description.trim().length > 0 &&
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                  }
                  aria-describedby={
                    form.description.trim().length > 0 &&
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                      ? 'supplier-listing-description-hint supplier-listing-description-error'
                      : 'supplier-listing-description-hint'
                  }
                />
                <p id="supplier-listing-description-hint" className="text-xs text-ink-muted mt-1 tabular-nums">
                  {form.description.length}/{MAX_DESCRIPTION_LENGTH}
                </p>
                {form.description.trim().length > 0 &&
                form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH ? (
                  <p
                    id="supplier-listing-description-error"
                    className="text-sm text-red-600 mt-1.5"
                    role="alert"
                  >
                    Add at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue — describe the stay, what guests
                    should expect, and any practical details.
                  </p>
                ) : null}
              </div>
              <ProgressiveLinesEditor
                fieldId="supplier-listing-field-highlights"
                label="Highlights (optional)"
                hint={`Short selling points. You can add up to ${STAY_HIGHLIGHT_MAX}.`}
                values={form.highlights}
                minVisible={STAY_HIGHLIGHT_MIN_VISIBLE}
                max={STAY_HIGHLIGHT_MAX}
                placeholder={(index) => (index === 0 ? 'e.g. River view' : `Optional highlight ${index + 1}`)}
                onChange={(highlights) => setForm((f) => ({ ...f, highlights }))}
              />
            </div>
          )}
          {stepIdx === 0 && !isStayForm && (
            <TourBasicsGuidedScenes
              form={{
                experienceKind: form.experienceKind,
                experienceLanguage: form.experienceLanguage,
                title: form.title,
                subtitle: form.subtitle,
                description: form.description,
                highlights: form.highlights,
              }}
              sceneIndex={basicsSceneIdx}
              direction={basicsSceneDirection}
              languageOptions={LANGUAGE_OPTIONS}
              languageLabel={
                LANGUAGE_OPTIONS.find((o) => o.code === form.experienceLanguage)?.label ?? null
              }
              allowDirectSceneAccess={Boolean(editingId)}
              onSelectScene={(index) => {
                if (
                  !canSelectTourBasicsScene(index, basicsSceneIdx, form, Boolean(editingId))
                ) {
                  return;
                }
                setBasicsSceneIdxPersisted(index, index >= basicsSceneIdx ? 'forward' : 'back');
              }}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          )}

          {stepIdx === 1 && form.inventoryFamily !== 'stay' && (
            <div className="space-y-8">
              <section className="space-y-5" aria-labelledby="tour-details-guests">
                <h4 id="tour-details-guests" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  What guests get
                </h4>
                <ProgressiveLinesEditor
                  fieldId="supplier-listing-field-includes"
                  label="What's included *"
                  hint={`At least two clear items. You can add up to ${TOUR_INCLUDE_MAX}.`}
                  values={form.includes}
                  minVisible={TOUR_INCLUDE_MIN_VISIBLE}
                  max={TOUR_INCLUDE_MAX}
                  placeholder={(index) => (index === 0 ? 'e.g. Guide and transfers' : `Included item ${index + 1}`)}
                  onChange={(includes) => setForm((f) => ({ ...f, includes }))}
                />
                <ProgressiveLinesEditor
                  fieldId="supplier-listing-field-excludes"
                  label="Not included *"
                  hint={`At least one line so guests know what to budget for. You can add up to ${TOUR_EXCLUDE_MAX}.`}
                  values={form.excludes}
                  minVisible={TOUR_EXCLUDE_MIN_VISIBLE}
                  max={TOUR_EXCLUDE_MAX}
                  placeholder={(index) => (index === 0 ? 'e.g. Meals' : `Not included ${index + 1}`)}
                  onChange={(excludes) => setForm((f) => ({ ...f, excludes }))}
                />
              </section>

              <section className="space-y-4" aria-labelledby="listing-details-place">
                <h4 id="listing-details-place" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Where it happens
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">City *</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className="tv-input"
                      placeholder="e.g. Lisbon — neighbourhood or street"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">Country *</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                      className="tv-input"
                      placeholder="Primary country for this tour"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-ink-muted">
                  Use the main base or usual starting city. Exact meeting and pickup belong on each bookable option.
                </p>
              </section>

              <section className="space-y-4" aria-labelledby="tour-details-expect">
                <h4 id="tour-details-expect" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  How it starts
                </h4>
                <div id="supplier-listing-field-start">
                  <label className="block text-sm font-semibold text-ink mb-1">How this tour generally starts *</label>
                  <select
                    value={form.experienceStartStyle}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        experienceStartStyle: e.target.value as ListingFormState['experienceStartStyle'],
                      }))
                    }
                    className="tv-input"
                  >
                    {EXPERIENCE_START_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-ink-muted mt-1">
                    Product-level: meeting, pickup, or both. Each option still has its own exact place and start time.
                  </p>
                </div>
              </section>

              <details id="supplier-listing-field-schedule" className="group rounded-xl border border-black/[0.08] px-4 py-3">
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Optional: shared itinerary</span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      Common flow and difficulty — not option clock times
                    </span>
                  </span>
                  <span className="text-xs text-finland font-medium mt-0.5 shrink-0">
                    {form.typicalTimelineNotes.trim() ||
                    (form.scheduleStyle && form.scheduleStyle !== 'flexible') ||
                    form.difficulty !== 'Easy'
                      ? 'Saved'
                      : 'Add'}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <div id="supplier-listing-field-difficulty">
                    <label className="block text-sm font-semibold text-ink mb-1">Overall difficulty</label>
                    <select
                      value={form.difficulty}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          difficulty: e.target.value as 'Easy' | 'Moderate' | 'Challenging',
                        }))
                      }
                      className="tv-input"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Challenging">Challenging</option>
                    </select>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Describe the shared flow in relative order. Each option has its own start time.
                  </p>
                  <div className="space-y-2">
                    {SCHEDULE_STYLE_OPTIONS.map((o) => (
                      <label
                        key={o.value}
                        className={`lc-choice flex cursor-pointer gap-3 rounded-xl p-3 ${
                          form.scheduleStyle === o.value ? 'lc-choice--selected' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="scheduleStyle"
                          value={o.value}
                          checked={form.scheduleStyle === o.value}
                          onChange={() => setForm((f) => ({ ...f, scheduleStyle: o.value }))}
                          className="mt-1 border-black/[0.12] text-finland focus:ring-finland"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-ink">{o.label}</span>
                          <span className="block text-xs text-ink-muted mt-0.5">{o.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">Typical flow (optional)</label>
                    <textarea
                      value={form.typicalTimelineNotes}
                      maxLength={MAX_TIMELINE_LENGTH}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          typicalTimelineNotes: e.target.value.slice(0, MAX_TIMELINE_LENGTH),
                        }))
                      }
                      rows={4}
                      className="tv-input"
                      placeholder="e.g. Meet and brief → transfer to viewing area → time to watch and photograph → return"
                    />
                    <p className="text-xs text-ink-muted mt-1 tabular-nums">
                      {form.typicalTimelineNotes.length}/{MAX_TIMELINE_LENGTH}
                    </p>
                  </div>
                </div>
              </details>

              <details id="supplier-listing-field-accessibility" className="group rounded-xl border border-black/[0.08] px-4 py-3">
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Optional: good to know</span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      Place label, accessibility, age, setting, languages
                    </span>
                  </span>
                  <span className="text-xs text-finland font-medium mt-0.5 shrink-0">
                    {form.destination.trim() ||
                    form.accessibilitySummary.trim() ||
                    form.minGuestAge.trim() ||
                    (form.venueSetting && form.venueSetting !== 'unspecified') ||
                    form.additionalLanguages.length > 0
                      ? 'Saved'
                      : 'Add'}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <div id="supplier-listing-field-destination" className="space-y-2">
                    <label className="block text-sm font-semibold text-ink">How it shows as a place</label>
                    <input
                      type="text"
                      value={form.destination}
                      onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                      className="tv-input"
                      placeholder="e.g. coastal route · several towns — or leave blank"
                    />
                    <p className="text-xs text-ink-muted">
                      If blank, cards use city and country. Fill this only for a route-style label.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">Accessibility &amp; mobility</label>
                    <textarea
                      value={form.accessibilitySummary}
                      maxLength={MAX_ACCESSIBILITY_LENGTH}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          accessibilitySummary: e.target.value.slice(0, MAX_ACCESSIBILITY_LENGTH),
                        }))
                      }
                      rows={3}
                      className="tv-input"
                      placeholder="Steps, uneven ground, wheelchair access, hearing loops, etc."
                    />
                    <p className="text-xs text-ink-muted mt-1 tabular-nums">
                      {form.accessibilitySummary.length}/{MAX_ACCESSIBILITY_LENGTH}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-ink mb-1">Minimum guest age</label>
                      <input
                        type="text"
                        value={form.minGuestAge}
                        onChange={(e) => setForm((f) => ({ ...f, minGuestAge: e.target.value }))}
                        className="tv-input"
                        placeholder="e.g. 8+ or none"
                      />
                    </div>
                    <div id="supplier-listing-field-venue">
                      <label className="block text-sm font-semibold text-ink mb-1">Setting</label>
                      <select
                        value={form.venueSetting}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, venueSetting: e.target.value as VenueSetting }))
                        }
                        className="tv-input"
                      >
                        {VENUE_SETTING_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div id="supplier-listing-field-languages">
                    <label className="block text-sm font-semibold text-ink mb-2">Additional languages offered</label>
                    <p className="text-xs text-ink-muted mb-2">Besides the primary language you set earlier.</p>
                    <div className="flex flex-wrap gap-2">
                      {LANGUAGE_OPTIONS.filter((o) => o.code !== 'other').map((o) => {
                        const disabled = o.code === form.experienceLanguage;
                        return (
                          <label
                            key={o.code}
                            className={`inline-flex items-center gap-1.5 ${disabled ? 'opacity-40' : ''}`}
                          >
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={form.additionalLanguages.includes(o.code)}
                              onChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  additionalLanguages: f.additionalLanguages.includes(o.code)
                                    ? f.additionalLanguages.filter((c) => c !== o.code)
                                    : [...f.additionalLanguages, o.code],
                                }))
                              }
                              className="rounded border-black/[0.12] text-finland focus:ring-finland"
                            />
                            <span className="text-sm text-ink">{o.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}

          {stepIdx === 1 && form.inventoryFamily === 'stay' && (
            <div className="space-y-10">
              <section className="space-y-4" aria-labelledby="listing-details-place">
                <h4 id="listing-details-place" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Where it is
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">City *</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className="tv-input"
                      placeholder="e.g. Lisbon — neighbourhood or street"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-1">Country *</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                      className="tv-input"
                      placeholder="Country of the property"
                      required
                    />
                  </div>
                </div>
                <div id="supplier-listing-field-destination" className="space-y-2">
                  <label className="block text-sm font-semibold text-ink">How it shows as a place (optional)</label>
                  <input
                    type="text"
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    className="tv-input"
                    placeholder="e.g. riverside neighbourhood — or leave blank"
                  />
                  <p className="text-xs text-ink-muted">
                    If you skip this, we use city and country from above.
                  </p>
                </div>
              </section>
            </div>
          )}

          {stepIdx === 2 && form.inventoryFamily === 'stay' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-[1.85rem] font-bold tracking-tight text-ink">Space</h3>
                <p className="mt-1 text-sm text-ink-muted leading-snug max-w-xl">
                  How many guests can stay, and what rooms they get.
                </p>
              </div>
              <div className="lc-section space-y-4 rounded-xl px-4 py-4 sm:px-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    Max guests *
                    <input
                      type="number"
                      min={1}
                      value={form.stayMaxGuests}
                      onChange={(e) => setForm((f) => ({ ...f, stayMaxGuests: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    Bedrooms
                    <input
                      type="number"
                      min={0}
                      value={form.stayBedrooms}
                      onChange={(e) => setForm((f) => ({ ...f, stayBedrooms: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    Beds
                    <input
                      type="number"
                      min={0}
                      value={form.stayBeds}
                      onChange={(e) => setForm((f) => ({ ...f, stayBeds: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    Bathrooms
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.stayBathrooms}
                      onChange={(e) => setForm((f) => ({ ...f, stayBathrooms: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                </div>
              </div>
              <div id="supplier-listing-field-stay-amenities" className="lc-section space-y-3 rounded-xl px-4 py-4 sm:px-5">
                <p className="text-sm font-semibold text-ink">Amenities</p>
                <p className="text-xs text-ink-muted">Travelers see these on the stay page. Tick what is actually there.</p>
                <div className="flex flex-wrap gap-2">
                  {STAY_AMENITY_PRESETS.map((label) => {
                    const on = stayAmenityHas(form.stayAmenities, label);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setForm((f) => ({ ...f, stayAmenities: toggleStayAmenity(f.stayAmenities, label) }))}
                        className={`lux-flat rounded-full px-3 py-1.5 text-sm transition-colors ${
                          on
                            ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                            : 'text-ink-muted ring-1 ring-black/[0.08] hover:bg-finland/10 hover:text-finland'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <label className="block text-sm mt-1">
                  Other (comma separated)
                  <input
                    value={stayAmenityTokens(form.stayAmenities)
                      .filter((a) => !STAY_AMENITY_PRESETS.some((p) => p.toLowerCase() === a.toLowerCase()))
                      .join(', ')}
                    onChange={(e) => {
                      const extras = stayAmenityTokens(e.target.value);
                      const presets = stayAmenityTokens(form.stayAmenities).filter((a) =>
                        STAY_AMENITY_PRESETS.some((p) => p.toLowerCase() === a.toLowerCase())
                      );
                      setForm((f) => ({ ...f, stayAmenities: [...presets, ...extras].join(', ') }));
                    }}
                    className="tv-input mt-1 w-full"
                    placeholder="Sauna, river view"
                  />
                </label>
              </div>
            </div>
          )}
          {stepIdx === 3 && form.inventoryFamily === 'stay' && (
            <div className="space-y-5">
              <div>
                <h3 id="supplier-listing-field-stay-price" className="font-display text-[1.85rem] font-bold tracking-tight text-ink">
                  Price
                </h3>
                <p className="mt-1 text-sm text-ink-muted leading-snug max-w-xl">
                  Nightly rate for the whole place, not per guest. Block unavailable nights on Calendar after you publish —
                  this price does not close dates.
                </p>
              </div>
              <div className="lc-section space-y-4 rounded-xl px-4 py-4 sm:px-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    Nightly price ({listingCurrency}) *
                    <input
                      type="number"
                      min={1}
                      value={form.stayNightly}
                      onChange={(e) => setForm((f) => ({ ...f, stayNightly: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    Minimum nights
                    <input
                      type="number"
                      min={1}
                      value={form.stayMinNights}
                      onChange={(e) => setForm((f) => ({ ...f, stayMinNights: e.target.value }))}
                      className="tv-input mt-1 w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    Check-in *
                    <input
                      type="time"
                      value={form.stayCheckIn}
                      onChange={(e) => setForm((f) => ({ ...f, stayCheckIn: e.target.value }))}
                      className="tv-input mt-1 w-full"
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    Check-out *
                    <input
                      type="time"
                      value={form.stayCheckOut}
                      onChange={(e) => setForm((f) => ({ ...f, stayCheckOut: e.target.value }))}
                      className="tv-input mt-1 w-full"
                      required
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  Cleaning fee ({listingCurrency}, optional)
                  <input
                    type="number"
                    min={0}
                    value={form.stayCleaningFee}
                    onChange={(e) => setForm((f) => ({ ...f, stayCleaningFee: e.target.value }))}
                    className="tv-input mt-1 w-full"
                  />
                </label>
                {Number.parseFloat(form.stayNightly) > 0 ? (
                  <div className="rounded-xl bg-finland/[0.05] px-3.5 py-3.5 ring-1 ring-finland/15 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">
                      Traveler price preview
                    </p>
                    <p className="text-sm text-ink leading-relaxed">
                      Example {Number.parseInt(form.stayMinNights, 10) > 1 ? `${form.stayMinNights}-night` : '1-night'}{' '}
                      stay:{' '}
                      {formatMoney(Number.parseFloat(form.stayNightly), listingCurrency)} ×{' '}
                      {Math.max(1, Number.parseInt(form.stayMinNights, 10) || 1)} nights
                      {Number.parseFloat(form.stayCleaningFee) > 0
                        ? ` + ${formatMoney(Number.parseFloat(form.stayCleaningFee), listingCurrency)} cleaning`
                        : ''}
                      {' = '}
                      <span className="font-semibold">
                        {formatMoney(
                          Number.parseFloat(form.stayNightly) *
                            Math.max(1, Number.parseInt(form.stayMinNights, 10) || 1) +
                            (Number.parseFloat(form.stayCleaningFee) > 0
                              ? Number.parseFloat(form.stayCleaningFee)
                              : 0),
                          listingCurrency
                        )}
                      </span>
                      .
                    </p>
                  </div>
                ) : null}
              </div>
              <label id="supplier-listing-field-stay-rules" className="lc-section block rounded-xl px-4 py-4 text-sm sm:px-5">
                House rules
                <textarea
                  value={form.stayHouseRules}
                  onChange={(e) => setForm((f) => ({ ...f, stayHouseRules: e.target.value }))}
                  className="tv-input mt-2 w-full min-h-[5rem]"
                  placeholder="Quiet hours, smoking, pets…"
                />
              </label>
            </div>
          )}
          {stepIdx === 2 && form.inventoryFamily !== 'stay' && (
            <div id="supplier-listing-field-options" className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div>
                <h3 className="font-display text-[1.85rem] font-bold tracking-tight text-ink">Options</h3>
                <p className="mt-1 text-sm text-ink-muted leading-relaxed max-w-2xl">
                  Each option is a bookable version of this tour. Availability and seasonal prices live in schedules
                  inside the option.
                </p>
              </div>
              <div className="space-y-3">
                {materializedBookingOptions(form.bookingOptions).map((opt) => {
                  const messages = optionValidationMessages(opt);
                  const status = tourOptionReadiness(opt, messages);
                  const pendingDelete = optionPendingDeleteId === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className="lc-tile flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink truncate">
                            {opt.name.trim() || 'Untitled option'}
                          </p>
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                              status === 'ready' ? 'text-finland' : 'text-ink-muted'
                            }`}
                          >
                            {tourOptionReadinessLabel(status)}
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted">
                          {[
                            opt.duration.trim() || null,
                            optionScheduleCountLabel(opt),
                            (() => {
                              const ready = listingOptionReadySchedules(opt);
                              if (ready.length === 0) return null;
                              const froms = ready.map((s) => s.availabilityDateFrom).filter(Boolean).sort();
                              const tos = ready.map((s) => s.availabilityDateTo).filter(Boolean).sort();
                              return formatScheduleRange(froms[0] ?? '', tos[tos.length - 1] ?? '');
                            })(),
                            (() => {
                              const ready = listingOptionReadySchedules(opt);
                              if (ready.length === 0) {
                                return summarizeOptionPricing(opt, (n) => formatMoney(n, listingCurrency));
                              }
                              if (ready.length === 1) {
                                return summarizeOptionPricing(ready[0], (n) => formatMoney(n, listingCurrency));
                              }
                              const prices = ready
                                .map((s) => optionHeadlineUnitPrice(s))
                                .filter((n) => n > 0);
                              if (prices.length === 0) return 'Set schedule prices';
                              return `From ${formatMoney(Math.min(...prices), listingCurrency)}`;
                            })(),
                            (() => {
                              const ready = listingOptionReadySchedules(opt);
                              if (ready.length > 0) {
                                const max = Math.max(...ready.map((s) => s.maxSpotsPerSlot));
                                return max >= 1 ? `Max ${max}` : null;
                              }
                              return opt.maxSpotsPerSlot >= 1 ? `Max ${opt.maxSpotsPerSlot}` : null;
                            })(),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {opt.pickupPlace.trim() ? (
                          <p className="text-xs text-ink-faint line-clamp-1">
                            {opt.fulfillment === 'pickup' ? 'Pickup · ' : opt.fulfillment === 'meeting_point' ? 'Meet · ' : ''}
                            {opt.pickupPlace.trim()}
                          </p>
                        ) : null}
                        {status !== 'ready' && messages[0] ? (
                          <p className="text-xs text-ink-muted">{messages[0]}</p>
                        ) : null}
                        {pendingDelete && editingId
                          ? (() => {
                              const notice = removeBookingOptionOccupancyNotice(
                                occupyingGuestsForBookingOption({
                                  bookings: listingOccupancyBookings,
                                  listingId: editingId,
                                  optionId: opt.id,
                                })
                              );
                              return notice ? (
                                <p className="text-sm leading-relaxed text-ink" role="status">
                                  {notice}
                                </p>
                              ) : null;
                            })()
                          : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {pendingDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setOptionPendingDeleteId(null)}
                              className="tv-btn-ghost"
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBookingOption(opt.id)}
                              className="lc-btn-danger inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-medium"
                            >
                              Delete option
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openOptionModalEdit(opt.id)}
                              className="tv-btn-ghost"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateOption(opt.id)}
                              className="tv-btn-ghost"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => setOptionPendingDeleteId(opt.id)}
                              className="lc-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                {...(!optionModalOpen ? { id: 'supplier-listing-field-price' } : {})}
                className="pt-2"
              >
                <button
                  type="button"
                  onClick={openOptionModalCreate}
                  className="lc-upload inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-semibold text-finland"
                >
                  <Plus className="w-5 h-5 shrink-0" aria-hidden />
                  Add option
                </button>
              </div>
              {materializedBookingOptions(form.bookingOptions).length === 0 && (
                <p className="text-sm leading-relaxed text-ink-muted">
                  Add a bookable variant — for example hotel pickup or a private group. Adult and Child prices belong
                  inside one option, not as separate options.
                </p>
              )}
              <details
                id="supplier-listing-field-tags"
                className="group"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Optional: tags</span>
                    <span className="block text-xs text-ink-muted mt-0.5">Help travelers filter (pickup, small group, etc.)</span>
                  </span>
                  <span className="text-xs text-finland font-medium mt-0.5">{form.tags.length > 0 ? 'Saved' : 'Add'}</span>
                </summary>
                <div className="mt-3 px-1">
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {TAG_OPTIONS.map((tag) => (
                    <label
                      key={tag.id}
                      className="inline-flex items-center gap-3 min-h-[44px] pr-1 touch-manipulation cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.tags.includes(tag.id)}
                        onChange={() => toggleTag(tag.id)}
                        className="h-5 w-5 rounded border-black/[0.12] text-finland focus:ring-2 focus:ring-finland focus:ring-offset-0 shrink-0"
                      />
                      <span className="text-base text-ink font-medium leading-snug">{tag.label}</span>
                    </label>
                  ))}
                </div>
                </div>
              </details>
            </div>
          )}

          {stepIdx === (isStayForm ? 4 : 3) && (() => {
            const photoCount = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length;
            const photosPublishReady = listingPhotosReadyToPublish(form);
            return (
            <div id="supplier-listing-field-photos" className="space-y-6">
                <div>
                  <h3 className="font-display text-[1.85rem] font-bold tracking-tight text-ink">Photos</h3>
                  <p className="mt-1 text-sm text-ink-muted leading-relaxed">
                    {form.inventoryFamily === 'stay' || createFamily === 'stay'
                      ? 'Lead with the strongest room or exterior. The first photo is the cover guests see in search.'
                      : 'Show travelers what the experience feels like. The first photo is the cover on search and the product page.'}{' '}
                    Drag another photo onto the cover to make it the cover.
                  </p>
                </div>
                <ListingImageFields
                  photoSlots={form.photoSlots}
                  photoSlotLabels={form.photoSlotLabels}
                  onPhotosChange={({ slots, labels }) =>
                    setForm((f) => ({ ...f, photoSlots: slots, photoSlotLabels: labels }))
                  }
                  userId={user?.id}
                  uploadsEnabled={isSupabaseConfigured() && !!user?.id}
                />
                {!photosPublishReady && photoCount >= 1 ? (
                  <p className="text-sm text-amber-900">
                    {photoCount < LISTING_PHOTO_MIN
                      ? sessionOpenedAsCreateRef.current
                        ? `Add ${LISTING_PHOTO_MIN - photoCount} more photos to continue (${LISTING_PHOTO_MIN}–${LISTING_PHOTO_MAX} required).`
                        : `You can continue with this cover. Add ${LISTING_PHOTO_MIN - photoCount} more before publish (${LISTING_PHOTO_MIN}–${LISTING_PHOTO_MAX} photos required).`
                      : 'Replace the placeholder cover photo before publishing.'}
                  </p>
                ) : null}
              {form.status === 'published' && editingId && !publishChecklistDismissed && publishChecklistKey && (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">After publishing — quick checks</p>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-finland hover:underline"
                      onClick={() => {
                        sessionStorage.setItem(publishChecklistKey, '1');
                        setPublishChecklistDismissed(true);
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-ink-muted">
                    <li>Open this listing on your phone and scroll the photos and description.</li>
                    <li>Confirm meeting or pickup details match what you tell guests in messages.</li>
                    <li>If you use per-date capacity, keep future dates updated so bookings stay accurate.</li>
                  </ul>
                </div>
              )}
              {(form.inventoryFamily === 'stay' || createFamily === 'stay') && (
              <div>
                <p className="font-medium text-ink">
                  {form.status === 'published' ? 'Update your live listing' : PARTNER_LISTING_PUBLISH_STEP_TITLE}
                </p>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                  {PARTNER_LISTING_PUBLISH_STEP_NOTE}
                </p>
              </div>
              )}
            </div>
            );
          })()}

          {stepIdx === (isStayForm ? 5 : 4) && (() => {
            const listingReady = publishBlockersPreview.length === 0;
            const truth = listingPublishTruth({
              listingReady,
              accountEligible: canPostNewListing,
              listingMissing: publishBlockersPreview[0] ?? null,
              accountReason: publishAccountBlockedReason,
            });
            return (
            <div id="supplier-listing-field-review" className="space-y-10">
              <div>
                <h3 className="font-display text-[2rem] font-bold leading-[1.12] tracking-tight text-ink sm:text-[2.4rem]">
                  Review & publish
                </h3>
                {form.title.trim() ? (
                  <p className="mt-3 max-w-xl font-display text-xl font-bold leading-snug tracking-tight text-ink [overflow-wrap:anywhere]">
                    {form.title.trim()}
                  </p>
                ) : null}
                <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">
                  {[form.city.trim(), form.country.trim()].filter(Boolean).join(', ') ||
                    (isStayForm ? 'A last look before this stay can go live.' : 'A last look before this tour can go live.')}
                </p>
              </div>
              {truth.bannerTitle ? (
                <div className="border-y border-black/[0.08] py-6" role="status">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Publish status</p>
                  <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{truth.bannerTitle}</p>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{truth.bannerBody}</p>
                  <a
                    href={`${PARTNER_APP_BASE}/business-profile`}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-finland hover:underline"
                  >
                    Go to Settings
                  </a>
                </div>
              ) : null}
              <ul className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
                {reviewRows.map((row) => (
                  <li key={row.label} className="flex flex-wrap items-start justify-between gap-3 py-5">
                    <div className="min-w-0 max-w-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{row.label}</p>
                      <p className="mt-1 text-base font-medium leading-relaxed text-ink [overflow-wrap:anywhere]">{row.summary}</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {row.ready ? 'Complete' : row.missing || 'Needs attention'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStepIdxPersisted(row.step)}
                      className="tv-btn-ghost shrink-0"
                    >
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Publish status</p>
                <p className="text-base leading-relaxed text-ink">{truth.listingLine}</p>
                {truth.accountLine ? (
                  <p className="text-sm leading-relaxed text-ink-muted">{truth.accountLine}</p>
                ) : listingReady ? (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {form.status === 'published'
                      ? 'This listing is live. Save changes from the footer when you are done.'
                      : 'Your account can publish when you choose Publish in the footer.'}
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-ink-muted">You can keep this as a draft until it is ready.</p>
                )}
                {!canPostNewListing ? (
                  <p className="text-sm text-ink-muted">
                    Publish stays unavailable until verification is complete. Draft save still works.
                  </p>
                ) : null}
                {form.status === 'published' && editingId ? (
                  <a
                    href={
                      isStayForm ? publicStayListingUrl(editingId) : publicTourListingUrl(editingId)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-finland hover:underline"
                  >
                    View live listing
                  </a>
                ) : null}
              </div>
            </div>
            );
          })()}
          </div>
          )}
        </ListingCreationWorkspace>
        {scheduleDraft && optionModalDraft ? (
          <>
            <TourScheduleWorkspace
              option={optionModalDraft}
              schedule={scheduleDraft}
              sceneIndex={scheduleSceneIdx}
              isNewSchedule={scheduleSessionOpenedAsCreateRef.current}
              persistLabel={scheduleIsDirty() ? 'Unsaved changes' : schedulePersistLabel}
              currencyLabel={listingCurrency}
              formatAmount={(n) => formatMoney(n, listingCurrency)}
              hasEndingDate={scheduleHasEndingDate}
              saveError={scheduleSaveError}
              attempted={scheduleAttempted}
              continueHint={scheduleContinueHint}
              onHasEndingDateChange={setScheduleHasEndingDate}
              onChange={patchScheduleDraft}
              onSelectScene={setScheduleSceneIdxPersisted}
              onBack={() => {
                if (scheduleSceneIdx > 0) {
                  setScheduleSceneIdx(previousTourScheduleScene(scheduleSceneIdx));
                  return;
                }
                closeScheduleWorkspace();
              }}
              onCancel={() => closeScheduleWorkspace()}
              onSaveDraft={saveScheduleAsDraft}
              onContinue={advanceScheduleScene}
              onSaveReady={saveScheduleReady}
            />
            {scheduleLeaveOpen ? (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                <div className="lc-section w-full max-w-sm rounded-xl px-5 py-5" role="alertdialog" aria-labelledby="schedule-leave-title">
                  <p id="schedule-leave-title" className="font-display text-lg font-bold text-ink">
                    Leave without saving changes?
                  </p>
                  <p className="mt-2 text-sm text-ink-muted">
                    This schedule still has edits that have not been saved.
                  </p>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="tv-btn-ghost !min-h-11" onClick={() => setScheduleLeaveOpen(false)}>
                      Keep editing
                    </button>
                    <button type="button" className="tv-btn-primary !min-h-11" onClick={() => closeScheduleWorkspace(true)}>
                      Leave
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </form>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
