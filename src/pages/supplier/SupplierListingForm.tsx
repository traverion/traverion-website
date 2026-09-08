import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import type { ListingBookingOption, ListingExtras, ScheduleStyle, VenueSetting } from '../../types/listingExtras';
import {
  type BookingOptionDurationUnit,
  formatBookingOptionDuration,
  getListingBookingOptionDurationIssue,
  materializedBookingOptions,
  normalizeListingBookingOption,
  parseBookingOptionDuration,
  parseListingExtras,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
} from '../../types/listingExtras';
import ListingImageFields from '../../components/supplier/ListingImageFields';
import { useAuth } from '../../contexts/AuthContext';
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
import { isSupabaseConfigured } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { MIN_LISTING_DESCRIPTION_LENGTH } from '../../lib/listingQualityScore';
import { headlineStartingAmount } from '../../lib/headline-price';
import { DEFAULT_CURRENCY, formatMoney, normalizeCurrency } from '../../lib/money';

const TAG_OPTIONS = [
  { id: 'free-cancellation', label: 'Free cancellation' },
  { id: 'small-group', label: 'Small group' },
  { id: 'pickup-available', label: 'Pickup available' },
  { id: 'mobile-ticket', label: 'Mobile ticket' },
  { id: 'bestseller', label: 'Bestseller' },
];

const EXPERIENCE_START_OPTIONS: {
  value: 'unspecified' | 'fixed_meeting_place' | 'operator_pickup' | 'either_available';
  label: string;
}[] = [
  { value: 'unspecified', label: 'Not sure yet — describe per option under Cost & options' },
  { value: 'fixed_meeting_place', label: 'Guests meet us at a fixed meeting point' },
  { value: 'operator_pickup', label: 'We pick guests up (for example from their accommodation area)' },
  { value: 'either_available', label: 'Both meeting at a set place and pickup are available' },
];

const MAX_SUBTITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;
const HIGHLIGHT_SLOT_COUNT = 5;
const INCLUDE_SLOT_COUNT = 6;
const EXCLUDE_SLOT_COUNT = 6;
const MAX_ACCESSIBILITY_LENGTH = 500;
const MAX_TIMELINE_LENGTH = 800;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const WIZARD_STEP_COUNT = 4;

function wizardStepStorageKey(editingId: string | null) {
  return `traverion-listing-wizard-step-v2-${editingId ?? 'create'}`;
}

function readWizardStepFromStorage(editingId: string | null): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(wizardStepStorageKey(editingId));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0 || n >= WIZARD_STEP_COUNT) return null;
    return n;
  } catch {
    return null;
  }
}

function writeWizardStepToStorage(editingId: string | null, step: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(wizardStepStorageKey(editingId), String(step));
  } catch {
    // ignore quota / private mode
  }
}

function clearWizardStepStorage(editingId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(wizardStepStorageKey(editingId));
  } catch {
    // ignore
  }
}

function listingDraftBackupKey(editingId: string | null) {
  return `traverion_listing_form_v1_${editingId ?? 'new'}`;
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
  return normalizeListingBookingOption(
    {
      id: newBookingOptionId(),
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
    },
    newBookingOptionId()
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

function isBookingOptionOkForStep(o: ListingBookingOption): boolean {
  return getBookingOptionValidationMessages(o).length === 0;
}

/** Plain-language issues for the option editor (Continue uses isBookingOptionOkForStep). */
function getBookingOptionValidationMessages(o: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (!o.name.trim()) msg.push('Add an option name (e.g. Small group tour).');
    if (o.priceUsd <= 0) msg.push('Set a price greater than zero.');
  const durIssue = getListingBookingOptionDurationIssue(o.duration);
  if (durIssue) msg.push(durIssue);
  if (o.pickupPlace.trim().length < 8) {
    msg.push('Describe where guests meet or where you pick them up (at least 8 characters).');
  }
  if (o.minPersons < 1 || o.maxPersons < o.minPersons) {
    msg.push('Set minimum and maximum guests so max is not below min.');
  }
  if (o.maxSpotsPerSlot < 1) msg.push('Set max spots per departure or start time.');
  if (o.optionInfo.trim().length < 3) {
    msg.push('Add a short note about this option (e.g. private, language, group size) — 3+ characters.');
  }
  if (!o.weekdays.some(Boolean)) msg.push('Choose at least one weekday when this option runs.');
  const df = o.availabilityDateFrom.trim();
  const dt = o.availabilityDateTo.trim();
  if (dt) {
    if (!df) {
      msg.push('Add a starting date when you set an ending date, or clear the ending date.');
    } else if (df > dt) {
      msg.push('Ending date must be on or after the starting date.');
    }
  }
  return msg;
}

function normalizeHighlightSlots(fromDb: string[] | undefined): string[] {
  const base = Array.isArray(fromDb) ? fromDb.map((s) => String(s ?? '').trim()) : [];
  const out = base.slice(0, HIGHLIGHT_SLOT_COUNT);
  while (out.length < HIGHLIGHT_SLOT_COUNT) out.push('');
  return out;
}

function normalizeLineSlots(count: number, fromDb: string[] | undefined): string[] {
  const base = Array.isArray(fromDb) ? fromDb.map((s) => String(s ?? '')) : [];
  const out = base.slice(0, count);
  while (out.length < count) out.push('');
  return out;
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

const EXPERIENCE_KIND_OPTIONS: {
  id: 'tour' | 'ticket' | 'transportation';
  title: string;
  description: string;
}[] = [
  {
    id: 'tour',
    title: 'Tour or activity',
    description: 'Guided walks, day trips, experiences with a host, boat trips, food tours, and similar.',
  },
  {
    id: 'ticket',
    title: 'Ticket or entry',
    description: 'Museum passes, attraction entry, shows, skip-the-line access — mainly admission, not a guided route.',
  },
  {
    id: 'transportation',
    title: 'Transportation',
    description: 'Transfers, shuttles, private rides, or getting guests from A to B as the main product.',
  },
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
      : headlineStartingAmount(activeOpts, 0);
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
  const highlightList = normalizeHighlightSlots(form.highlights)
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, HIGHLIGHT_SLOT_COUNT);
  const includeList = normalizeLineSlots(INCLUDE_SLOT_COUNT, form.includes)
    .map((s) => s.trim())
    .filter(Boolean);
  const excludeList = normalizeLineSlots(EXCLUDE_SLOT_COUNT, form.excludes)
    .map((s) => s.trim())
    .filter(Boolean);
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
    duration: form.duration,
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
      form.country.trim().length > 0 &&
      form.duration.trim().length > 0
    );
  }
  if (idx === 2) {
    if (form.inventoryFamily === 'stay') {
      const nightly = Number.parseFloat(form.stayNightly);
      const maxG = Number.parseInt(form.stayMaxGuests, 10);
      return Number.isFinite(nightly) && nightly > 0 && Number.isFinite(maxG) && maxG >= 1;
    }
    const active = materializedBookingOptions(form.bookingOptions);
    return active.length >= 1 && active.every(isBookingOptionOkForStep);
  }
  if (idx === 3) {
    if (form.status === 'draft') {
      return orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length >= 1;
    }
    return listingPhotosReadyToPublish(form);
  }
  return true;
}

const emptyForm: ListingFormState = {
  experienceLanguage: '',
  experienceKind: '',
  title: '',
  subtitle: '',
  highlights: Array.from({ length: HIGHLIGHT_SLOT_COUNT }, () => ''),
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
  includes: Array.from({ length: INCLUDE_SLOT_COUNT }, () => ''),
  excludes: Array.from({ length: EXCLUDE_SLOT_COUNT }, () => ''),
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

export type ListingEditorSaveResult = { success: boolean; error?: string };

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
  createFamily?: 'tour' | 'stay';
}

type StepId = 'the_experience' | 'practical' | 'cost_options' | 'photos';

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
  createFamily = 'tour',
}: SupplierListingFormProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[] | null>(null);
  const [stepIdx, setStepIdx] = useState(() => readWizardStepFromStorage(editingId) ?? 0);
  const [draftCloseBusy, setDraftCloseBusy] = useState(false);
  const [draftCloseError, setDraftCloseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const publishChecklistKey = editingId ? `traverion-publish-checklist-${editingId}` : null;
  const [publishChecklistDismissed, setPublishChecklistDismissed] = useState(false);
  /**
   * After moving to the last step, the footer swaps Continue for Save in the same screen area.
   * A second pointer/activation (common on touch) can immediately submit → insert + close editor,
   * which feels like “wizard jumped back to the start” when you reopen create.
   */
  const [lastStepSubmitArmed, setLastStepSubmitArmed] = useState(true);
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
  const optionModalRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(
    () => [
      { id: 'the_experience' as StepId, label: 'Basics' },
      { id: 'practical' as StepId, label: 'Place' },
      { id: 'cost_options' as StepId, label: 'Price' },
      { id: 'photos' as StepId, label: 'Photos' },
    ],
    []
  );

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
      setStepIdx((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: number) => number)(prev) : next;
        writeWizardStepToStorage(editingId, resolved);
        return resolved;
      });
    },
    [editingId]
  );

  const focusToStep: Record<string, number> = useMemo(
    () => ({
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
      duration: 1,
      schedule: 1,
      start: 1,
      price: 2,
      group: 2,
      tags: 2,
      meeting: 2,
      pickup: 2,
      pickup_timing: 2,
      dropoff: 2,
      image: 3,
      gallery: 3,
      hero: 3,
      photos: 3,
    }),
    []
  );

  useEffect(() => {
    if (editingId) {
      createModeEmptySeededRef.current = false;
      const existing = existingListings.find(t => t.id === editingId);
      if (existing) {
        if (editModeHydratedIdRef.current === editingId) return;
        editModeHydratedIdRef.current = editingId;
        const extras = parseListingExtras(existing.listingExtras as unknown);
        const packed = compactPhotoSlotsAndLabels(
          photoSlotsFromTourPackage(existing),
          normalizePhotoSlotLabels(extras.photoSlotLabels)
        );
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
          highlights: normalizeHighlightSlots(existing.highlights),
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
          includes: normalizeLineSlots(INCLUDE_SLOT_COUNT, existing.includes),
          excludes: normalizeLineSlots(EXCLUDE_SLOT_COUNT, existing.excludes),
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
      prevEditingIdForWizardRef.current = editingId;
      lastFocused.current = null;
      const stored = readWizardStepFromStorage(editingId);
      const next = stored !== null ? stored : 0;
      writeWizardStepToStorage(editingId, next);
      setStepIdx(next);
    }
  }, [editingId]);

  /** Backup: keep storage aligned if step changes without going through setStepIdxPersisted (e.g. focus effect). */
  useLayoutEffect(() => {
    writeWizardStepToStorage(editingId, stepIdx);
  }, [stepIdx, editingId]);

  useEffect(() => {
    if (form.status === 'draft') setPublishBlockers(null);
  }, [form.status]);

  useEffect(() => {
    if (!focusSection || !editingId) return;
    const targetStep = focusToStep[focusSection];
    if (typeof targetStep !== 'number') return;

    const focusKey = `${editingId}:${focusSection}`;
    if (lastFocused.current === focusKey) return;

    writeWizardStepToStorage(editingId, targetStep);
    setStepIdx(targetStep);

    const el = document.getElementById(`supplier-listing-field-${focusSection}`);
    if (el) {
      lastFocused.current = focusKey;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = el.querySelector<HTMLElement>('input, textarea, select, button');
        focusable?.focus?.();
      });
      onFocusConsumed?.();
      return;
    }
    const optionFieldSections = new Set(['price', 'meeting', 'pickup', 'group', 'pickup_timing']);
    if (targetStep === 5 && optionFieldSections.has(focusSection)) {
      setOptionModalOpen(true);
      setOptionModalEditingId(null);
      setOptionModalDraft(createEmptyBookingOption());
      setOptionModalHasEndingDate(false);
      setOptionModalErrors([]);
      const t = window.setTimeout(() => {
        const inner = document.getElementById(`supplier-listing-field-${focusSection}`);
        if (!inner) return;
        lastFocused.current = focusKey;
        inner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = inner.querySelector<HTMLElement>('input, textarea, select, button');
        focusable?.focus?.();
        onFocusConsumed?.();
      }, 80);
      return () => window.clearTimeout(t);
    }
  }, [focusSection, editingId, onFocusConsumed, focusToStep]);

  useEffect(() => {
    if (!stepContainerRef.current) return;
    stepContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
  }, [stepIdx]);

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
            : /city|country|location|destination|duration|include|exclude|accessib|meeting/.test(t)
              ? 1
              : 0;
      setStepIdxPersisted(step);
    },
    [setStepIdxPersisted]
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
      } finally {
        setDraftCloseBusy(false);
        closeIntentRunningRef.current = false;
      }
    }
    clearWizardStepStorage(editingId);
    onCancel();
  }, [enableDraftOnClose, onSaveDraft, isDirty, form, editingId, submitting, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (optionModalOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setOptionModalOpen(false);
        setOptionModalDraft(null);
        setOptionModalEditingId(null);
        setOptionModalErrors([]);
        setOptionModalHasEndingDate(false);
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
            const go = photosRelated ? 6 : 0;
            writeWizardStepToStorage(editingId, go);
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
          clearListingDraftBackup(editingId);
          clearWizardStepStorage(editingId);
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
  }, []);

  const closeOptionModal = useCallback(() => {
    setOptionModalOpen(false);
    setOptionModalDraft(null);
    setOptionModalEditingId(null);
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(false);
  }, []);
  useDialogFocus(optionModalOpen, optionModalRef, closeOptionModal);

  const openOptionModalCreate = useCallback(() => {
    setOptionModalEditingId(null);
    setOptionModalDraft(createEmptyBookingOption());
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(false);
    setOptionModalOpen(true);
  }, []);

  const openOptionModalEdit = useCallback((id: string) => {
    const opt = form.bookingOptions.find((o) => o.id === id);
    if (!opt) return;
    setOptionModalEditingId(id);
    setOptionModalDraft(
      normalizeListingBookingOption({ ...(opt as unknown as Record<string, unknown>) }, opt.id)
    );
    setOptionModalErrors([]);
    setOptionModalHasEndingDate(opt.availabilityDateTo.trim().length > 0);
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

  const saveOptionModal = useCallback(() => {
    if (!optionModalDraft) return;
    let errs = getBookingOptionValidationMessages(optionModalDraft);
    if (optionModalHasEndingDate && !optionModalDraft.availabilityDateTo.trim()) {
      errs = [
        ...errs,
        'Choose an ending date, or turn off "This activity has an ending date".',
      ];
    }
    if (errs.length) {
      setOptionModalErrors(errs);
      const durErr = getListingBookingOptionDurationIssue(optionModalDraft.duration);
      if (durErr && errs.includes(durErr)) {
        requestAnimationFrame(() => {
          document.getElementById('supplier-listing-field-option-duration')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          document.getElementById('booking-option-duration-amount')?.focus();
        });
      }
      return;
    }
    const durParts = parseBookingOptionDuration(optionModalDraft.duration);
    const canonicalDuration = formatBookingOptionDuration(durParts.amount, durParts.unit);
    const normalized = normalizeListingBookingOption(
      {
        ...(optionModalDraft as unknown as Record<string, unknown>),
        duration: canonicalDuration,
      },
      optionModalDraft.id
    );
    const editingId = optionModalEditingId;
    setForm((f) => {
      if (editingId) {
        return {
          ...f,
          bookingOptions: f.bookingOptions.map((o) => (o.id === editingId ? normalized : o)),
        };
      }
      return { ...f, bookingOptions: [...f.bookingOptions, normalized] };
    });
    closeOptionModal();
  }, [optionModalDraft, optionModalEditingId, optionModalHasEndingDate, closeOptionModal]);

  const optionDraft = optionModalOpen ? optionModalDraft : null;

  const optionModalLayer = optionDraft ? (
    <div
      ref={optionModalRef}
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-option-modal-title"
    >
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-ink/40 motion-safe:animate-fade-in" aria-label="Close option" onClick={closeOptionModal} />
      <div className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-paper-raised shadow-xl ring-1 ring-black/[0.08] motion-safe:animate-slide-up sm:rounded-2xl sm:motion-safe:animate-none lg:max-w-7xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
          <h2 id="supplier-option-modal-title" className="font-display text-2xl text-ink tracking-tight pr-8">
            {optionModalEditingId ? 'Edit option' : 'New option'}
          </h2>
          <button
            type="button"
            onClick={closeOptionModal}
            className="lux-flat rounded-full p-2 text-ink-muted hover:text-ink min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8">
            <div className="space-y-4 min-w-0">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1">Option name *</label>
                <input
                  type="text"
                  value={optionDraft.name}
                  onChange={(e) => patchOptionDraft({ name: e.target.value })}
                  className="tv-input"
                  placeholder="e.g. Small group tour · max 8"
                />
              </div>
              <div id="supplier-listing-field-price">
                <label className="block text-sm font-medium text-ink mb-1">Price ({listingCurrency}) *</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={optionDraft.priceUsd || ''}
                  onChange={(e) =>
                    patchOptionDraft({ priceUsd: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="tv-input"
                />
              </div>
              <div id="supplier-listing-field-pickup_timing">
                <label className="block text-sm font-medium text-ink mb-1">Usual start time</label>
                <input
                  type="time"
                  value={optionDraft.startTime}
                  onChange={(e) => patchOptionDraft({ startTime: e.target.value })}
                  className="tv-input w-full max-w-[12rem]"
                />
                <p className="text-xs text-ink-muted mt-1">Shown to guests; you can adjust on the booking.</p>
              </div>
              <div className="sm:col-span-2" id="supplier-listing-field-option-duration">
                <label className="block text-sm font-medium text-ink mb-1">Duration for this option *</label>
                {(() => {
                  const durParts = parseBookingOptionDuration(optionDraft.duration);
                  return (
                    <>
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
                              const next = e.target.value;
                              patchOptionDraft({
                                duration: formatBookingOptionDuration(next, durParts.unit),
                              });
                            }}
                            className="tv-input"
                            placeholder="e.g. 3"
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
                              patchOptionDraft({
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
                      <p className="text-xs text-ink-muted mt-2">
                        Type a number, then choose minutes, hours, or days. Both are required — they are stored as text like{' '}
                        <span className="font-medium text-ink">3 hours</span> or{' '}
                        <span className="font-medium text-ink">90 minutes</span>.
                      </p>
                      {optionDraft.duration.trim() ? (
                        <p className="text-xs text-ink-muted mt-1">
                          Saved as:{' '}
                          <span className="font-medium text-ink tabular-nums">{optionDraft.duration.trim()}</span>
                          {durParts.amount === '' && optionDraft.duration.trim().length >= 2 && (
                            <span className="block mt-1 text-amber-800">
                              This text is kept as-is. Enter a number above to use minutes, hours, or days.
                            </span>
                          )}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <div className="sm:col-span-2" id="supplier-listing-field-meeting">
                <label className="block text-sm font-medium text-ink mb-1">Meeting or pickup place *</label>
                <textarea
                  value={optionDraft.pickupPlace}
                  onChange={(e) => patchOptionDraft({ pickupPlace: e.target.value })}
                  rows={3}
                  className="tv-input"
                  placeholder="Address, hotel zone, landmark, or how pickup is arranged for this option"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="supplier-listing-field-group">
                  <label className="block text-sm font-medium text-ink mb-1">Min guests per booking *</label>
                  <input
                    type="number"
                    min={1}
                    value={optionDraft.minPersons || ''}
                    onChange={(e) => {
                      const nextMin = Math.max(1, Math.floor(Number(e.target.value) || 1));
                      patchOptionDraft({
                        minPersons: nextMin,
                        maxPersons: Math.max(nextMin, optionDraft.maxPersons),
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
                    value={optionDraft.maxPersons || ''}
                    onChange={(e) =>
                      patchOptionDraft({
                        maxPersons: Math.max(
                          optionDraft.minPersons,
                          Math.floor(Number(e.target.value) || optionDraft.minPersons)
                        ),
                      })
                    }
                    className="tv-input"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1">Max spots per start time *</label>
                <input
                  type="number"
                  min={1}
                  value={optionDraft.maxSpotsPerSlot || ''}
                  onChange={(e) =>
                    patchOptionDraft({
                      maxSpotsPerSlot: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                    })
                  }
                  className="tv-input w-full max-w-xs"
                />
                <p className="text-xs text-ink-muted mt-1">Capacity for one departure or time slot.</p>
              </div>
              <div className="sm:col-span-2" id="supplier-listing-field-pickup">
                <label className="block text-sm font-medium text-ink mb-1">About this option *</label>
                <textarea
                  value={optionDraft.optionInfo}
                  onChange={(e) => patchOptionDraft({ optionInfo: e.target.value })}
                  rows={3}
                  className="tv-input"
                  placeholder="e.g. Private vehicle · English-speaking guide · shared bus · family-friendly"
                />
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm font-medium text-ink mb-2">Runs on these weekdays *</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, di) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const next = [...optionDraft.weekdays];
                        next[di] = !next[di];
                        patchOptionDraft({ weekdays: next });
                      }}
                      className={`lux-flat min-h-[40px] min-w-[2.75rem] rounded-full px-2.5 text-xs font-semibold ${
                        optionDraft.weekdays[di]
                          ? 'bg-ink text-paper'
                          : 'bg-black/[0.04] text-ink-muted hover:bg-black/[0.07]'
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
                    Starting date of the activity <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={optionDraft.availabilityDateFrom}
                    onChange={(e) => patchOptionDraft({ availabilityDateFrom: e.target.value })}
                    className="tv-input w-full max-w-xs"
                  />
                  <p className="text-xs text-ink-muted mt-1">
                    When this option first becomes bookable. Leave empty if there is no fixed start.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 py-1 touch-manipulation">
                  <input
                    type="checkbox"
                    checked={optionModalHasEndingDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setOptionModalHasEndingDate(on);
                      if (!on) patchOptionDraft({ availabilityDateTo: '' });
                    }}
                    className="mt-0.5 h-5 w-5 rounded border-black/20 text-finland focus:ring-finland shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">This activity has an ending date</span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      Use this for a fixed season or last day the option runs. Leave it off if the activity continues with no end
                      date.
                    </span>
                  </span>
                </label>
                {optionModalHasEndingDate && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Ending date *</label>
                    <input
                      type="date"
                      value={optionDraft.availabilityDateTo}
                      onChange={(e) => patchOptionDraft({ availabilityDateTo: e.target.value })}
                      className="tv-input w-full max-w-xs"
                    />
                    <p className="text-xs text-ink-muted mt-1">Last day this option is offered (inclusive).</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 text-xs text-ink-muted leading-relaxed lg:sticky lg:top-4 lg:self-start">
              <p className="text-sm font-medium text-ink">Tips</p>
              <ul className="list-disc space-y-2 pl-4">
                <li>The lowest option price is shown as the &quot;from&quot; price on cards.</li>
                <li>Meeting or pickup should be specific enough that guests know where to go.</li>
                <li>
                  Start date is optional; add an ending date only when the offer has a last day (e.g. season). Otherwise it runs
                  with no fixed end.
                </li>
              </ul>
            </div>
          </div>
        </div>
        {optionModalErrors.length > 0 && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-3 sm:px-5">
            <ul className="list-disc space-y-1 pl-4 text-xs text-red-900">
              {optionModalErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-black/[0.06] px-4 py-3 sm:px-5 sm:justify-end">
          <button
            type="button"
            onClick={closeOptionModal}
            className="tv-btn-ghost min-h-[44px] flex-1 sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveOptionModal}
            className="tv-btn-primary min-h-[44px] flex-1 sm:flex-none"
          >
            Save option
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const canContinueStep = () => isStepSatisfied(stepIdx, form);

  const shell = (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden overscroll-none"
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
      <div className="relative z-[81] flex min-h-0 w-full flex-1 flex-col justify-stretch px-0 py-0 pointer-events-none">
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
          className="pointer-events-auto motion-safe:animate-fade-in motion-reduce:animate-none flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-paper shadow-none h-full rounded-none"
        >
        <div className="shrink-0 border-b border-black/[0.06] bg-paper px-5 py-4 sm:px-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={draftCloseBusy || submitting}
              onClick={() => void handleCloseIntent()}
              className="lux-flat text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50"
            >
              {draftCloseBusy ? 'Saving…' : '← Exit'}
            </button>
            <p
              key={draftCloseBusy ? 'saving' : 'saved'}
              className="text-[11px] uppercase tracking-[0.16em] text-ink-faint inline-flex items-center gap-1"
            >
              {draftCloseBusy ? (
                'Saving'
              ) : (
                <>
                  <Check className="h-3 w-3 text-finland tv-pop" aria-hidden />
                  Saved
                </>
              )}
            </p>
          </div>
          <div className="mb-5 min-w-0">
            <h2 id="supplier-listing-editor-title" className="font-display text-2xl sm:text-3xl text-ink">
              {editingId
                ? form.title.trim() || (form.inventoryFamily === 'stay' ? 'Stay' : 'Tour')
                : createFamily === 'stay'
                  ? 'Create stay'
                  : 'Create tour'}
            </h2>
            <p className="text-sm text-ink-muted mt-1 max-w-xl">
              {editingId
                ? 'You are editing what travelers will see.'
                : 'Close anytime — unfinished work is saved as a draft.'}
            </p>
          </div>
          {draftCloseError && (
            <p className="mb-3 text-sm text-red-800" role="alert">{draftCloseError}</p>
          )}
          {submitError && (
            <p className="mb-3 text-sm text-red-800" role="alert">
              {submitError}
            </p>
          )}
          <nav
            aria-label={
              editingId
                ? form.inventoryFamily === 'stay'
                  ? 'Stay sections'
                  : 'Tour sections'
                : createFamily === 'stay'
                  ? 'Create stay steps'
                  : 'Create tour steps'
            }
            className="flex gap-1 overflow-x-auto pb-0.5"
          >
            {steps.map((step, idx) => {
              const current = idx === stepIdx;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStepIdxPersisted(idx)}
                  aria-current={current ? 'step' : undefined}
                  className={`lux-flat shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    current ? 'bg-ink text-paper-raised' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {step.label}
                </button>
              );
            })}
          </nav>
          <p className="mt-3 text-xs text-ink-muted">
            {publishBlockersPreview.length === 0
              ? 'Ready to publish — finish Photos, then publish from this last step.'
              : `${publishBlockersPreview.length} item${publishBlockersPreview.length === 1 ? '' : 's'} left before publish`}
          </p>
          {publishBlockersPreview.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {publishBlockersPreview.slice(0, 5).map((line) => (
                <li key={line}>
                  <button
                    type="button"
                    className="lux-flat text-left text-xs text-ink-muted hover:text-ink"
                    onClick={() => jumpToPublishBlocker(line)}
                  >
                    {line}
                  </button>
                </li>
              ))}
              {publishBlockersPreview.length > 5 ? (
                <li className="text-xs text-ink-faint">And {publishBlockersPreview.length - 5} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {publishBlockers && publishBlockers.length > 0 && (
          <div className="mx-4 shrink-0 sm:mx-6 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium text-amber-900">Finish these before publishing</p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {publishBlockers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPublishBlockers(null)}
              className="mt-2 text-xs font-medium text-finland hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          ref={stepContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          <div key={stepIdx} className="motion-safe:animate-fade-in">
          {stepIdx === 0 && form.inventoryFamily !== 'stay' && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-language">
                <label className="block text-sm font-medium text-ink mb-1">Primary language of the tour *</label>
                <p className="text-xs text-ink-muted mb-2">The main language guests hear during the tour.</p>
                <select
                  value={form.experienceLanguage}
                  onChange={(e) => setForm((f) => ({ ...f, experienceLanguage: e.target.value }))}
                  className="tv-input max-w-md"
                >
                  <option value="">Select language…</option>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {stepIdx === 0 && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-title">
                <label className="block text-sm font-medium text-ink mb-1">Title *</label>
                <p className="text-xs text-ink-muted mb-2">A clear, specific name travelers will see in search and on the listing page.</p>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="tv-input"
                  placeholder={
                    form.inventoryFamily === 'stay'
                      ? 'e.g. Harbour apartment · two bedrooms'
                      : 'e.g. Old town walking tour · small groups'
                  }
                  required
                />
              </div>
            </div>
          )}

          {stepIdx === 0 && form.inventoryFamily !== 'stay' && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-category">
                <label className="block text-sm font-medium text-ink mb-1">Category *</label>
                <p className="text-xs text-ink-muted mb-3">Choose the option that best describes what you sell. You can add more detail in later steps.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {EXPERIENCE_KIND_OPTIONS.map((opt) => {
                    const selected = form.experienceKind === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, experienceKind: opt.id }))}
                        className={`text-left rounded-xl border-2 p-4 transition-colors min-h-[120px] ${
                          selected
                            ? 'border-finland bg-finland/5 ring-1 ring-finland/20'
                            : 'border-black/[0.08] bg-paper-raised hover:border-black/[0.12] hover:bg-paper'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-ink">{opt.title}</span>
                        <span className="mt-2 block text-xs text-ink-muted leading-relaxed">{opt.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {stepIdx === 0 && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-subtitle">
                <label className="block text-sm font-medium text-ink mb-1">Subtitle *</label>
                <p className="text-xs text-ink-muted mb-2">
                  A short line under the title on the listing page (max {MAX_SUBTITLE_LENGTH} characters).
                </p>
                <input
                  type="text"
                  value={form.subtitle}
                  maxLength={MAX_SUBTITLE_LENGTH}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value.slice(0, MAX_SUBTITLE_LENGTH) }))}
                  className="tv-input"
                  placeholder="e.g. Small-group food walk with local hosts"
                />
                <p className="text-xs text-ink-muted mt-1 tabular-nums">
                  {form.subtitle.length}/{MAX_SUBTITLE_LENGTH}
                </p>
              </div>
              <div id="supplier-listing-field-description">
                <label className="block text-sm font-medium text-ink mb-1">
                  About this {form.inventoryFamily === 'stay' ? 'stay' : 'tour'} *
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  Main description for guests (at least {MIN_LISTING_DESCRIPTION_LENGTH} characters for publishing, max{' '}
                  {MAX_DESCRIPTION_LENGTH}).
                </p>
                <textarea
                  value={form.description}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value.slice(0, MAX_DESCRIPTION_LENGTH) }))
                  }
                  rows={10}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                      ? 'border-amber-300 focus:ring-amber-200 focus:border-amber-400'
                      : 'border-black/[0.12] focus:ring-finland'
                  }`}
                  placeholder="What guests do, what makes it special, practical notes…"
                  aria-invalid={form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH}
                  aria-describedby={
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                      ? 'supplier-listing-description-hint supplier-listing-description-error'
                      : 'supplier-listing-description-hint'
                  }
                />
                <p id="supplier-listing-description-hint" className="text-xs text-ink-muted mt-1 tabular-nums">
                  {form.description.length}/{MAX_DESCRIPTION_LENGTH}
                </p>
                {form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH && (
                  <p
                    id="supplier-listing-description-error"
                    className="text-sm text-red-600 mt-1.5"
                    role="alert"
                  >
                    Add at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue — describe the{' '}
                    {form.inventoryFamily === 'stay' ? 'stay' : 'tour'}, what guests should expect, and any practical
                    details.
                  </p>
                )}
              </div>
              <div id="supplier-listing-field-highlights" className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-ink">Highlights (optional)</label>
                  <p className="text-xs text-ink-muted mt-1">
                    Up to five short selling points — each on its own line below.
                  </p>
                </div>
                {form.highlights.map((line, index) => (
                  <div key={index}>
                    <label className="block text-xs font-medium text-ink-muted mb-1">Highlight {index + 1}</label>
                    <input
                      type="text"
                      value={line}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          highlights: f.highlights.map((h, i) => (i === index ? e.target.value : h)),
                        }))
                      }
                      className="tv-input"
                      placeholder={index === 0 ? 'e.g. Skip-the-line entry' : `Optional highlight ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {stepIdx === 1 && form.inventoryFamily !== 'stay' && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-includes">
                <label className="block text-sm font-medium text-ink mb-1">What&apos;s included *</label>
                <p className="text-xs text-ink-muted mb-2">At least two clear items (tickets, guide, transport, tastings, etc.).</p>
                <div className="space-y-2">
                  {form.includes.map((line, index) => (
                    <input
                      key={index}
                      type="text"
                      value={line}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          includes: f.includes.map((s, i) => (i === index ? e.target.value : s)),
                        }))
                      }
                      className="tv-input"
                      placeholder={`Included item ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div id="supplier-listing-field-excludes">
                <label className="block text-sm font-medium text-ink mb-1">Not included *</label>
                <p className="text-xs text-ink-muted mb-2">At least one line so guests know what to budget for.</p>
                <div className="space-y-2">
                  {form.excludes.map((line, index) => (
                    <input
                      key={index}
                      type="text"
                      value={line}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          excludes: f.excludes.map((s, i) => (i === index ? e.target.value : s)),
                        }))
                      }
                      className="tv-input"
                      placeholder={`Not included ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <details
                id="supplier-listing-field-accessibility"
                className="group py-2"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Optional: good to know</span>
                    <span className="block text-xs text-ink-muted mt-0.5">Accessibility, age, setting, extra languages</span>
                  </span>
                  <span className="text-xs text-finland font-medium mt-0.5">
                    {form.accessibilitySummary.trim() ||
                    form.minGuestAge.trim() ||
                    (form.venueSetting && form.venueSetting !== 'unspecified') ||
                    form.additionalLanguages.length > 0
                      ? 'Saved'
                      : 'Add'}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Accessibility &amp; mobility (optional)</label>
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
                    <label className="block text-sm font-medium text-ink mb-1">Minimum guest age (optional)</label>
                    <input
                      type="text"
                      value={form.minGuestAge}
                      onChange={(e) => setForm((f) => ({ ...f, minGuestAge: e.target.value }))}
                      className="tv-input"
                      placeholder="e.g. 8+ or none"
                    />
                  </div>
                  <div id="supplier-listing-field-venue">
                    <label className="block text-sm font-medium text-ink mb-1">Setting</label>
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
                  <label className="block text-sm font-medium text-ink mb-2">Additional languages offered (optional)</label>
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

          {stepIdx === 1 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">City *</label>
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
                  <label className="block text-sm font-medium text-ink mb-1">Country *</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="tv-input"
                    placeholder={form.inventoryFamily === 'stay' ? 'Country of the property' : 'Primary country for this tour'}
                    required
                  />
                </div>
              </div>
              <div id="supplier-listing-field-destination" className="space-y-2">
                <label className="block text-sm font-medium text-ink">How it shows as a place (optional)</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="tv-input"
                  placeholder="e.g. coastal route · several towns — or leave blank"
                />
                <p className="text-xs text-ink-muted">
                  If you skip this, we use city and country from above; if you fill this instead, cards can show this route label.
                </p>
              </div>
              {form.inventoryFamily !== 'stay' ? (
              <p className="text-xs text-ink-muted -mt-2">
                Use the main base or usual starting city. Per-option meeting and pickup are set under{' '}
                <span className="font-medium text-ink">Cost &amp; options</span>.
              </p>
              ) : null}
              {form.inventoryFamily !== 'stay' ? (
              <>
              <div id="supplier-listing-field-duration">
                <label className="block text-sm font-medium text-ink mb-1">Duration *</label>
                <input
                  type="text"
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  className="tv-input"
                  placeholder="e.g. 3 hours or 1 day"
                  required
                />
              </div>
              <div id="supplier-listing-field-start">
                <label className="block text-sm font-medium text-ink mb-1">How does the tour start? *</label>
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
                  You will set the exact meeting or pickup place for each bookable option under Cost &amp; options.
                </p>
              </div>
              <details
                id="supplier-listing-field-schedule"
                className="group py-2"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Optional: how timing works</span>
                    <span className="block text-xs text-ink-muted mt-0.5">Fixed slot, flexible window, or arrange with guests</span>
                  </span>
                  <span className="text-xs text-finland font-medium mt-0.5">
                    {form.typicalTimelineNotes.trim() || (form.scheduleStyle && form.scheduleStyle !== 'flexible')
                      ? 'Saved'
                      : 'Add'}
                  </span>
                </summary>
                <div className="mt-4 space-y-3">
                <p className="text-xs text-ink-muted">
                  Helps travelers understand whether they are booking a fixed slot, flexible window, or arranging time with you.
                </p>
                <div className="space-y-2">
                  {SCHEDULE_STYLE_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                        form.scheduleStyle === o.value
                          ? 'border-finland bg-finland/5'
                          : 'border-black/[0.08] bg-white hover:border-black/[0.12]'
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
                        <span className="block text-sm font-medium text-ink">{o.label}</span>
                        <span className="block text-xs text-ink-muted mt-0.5">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Typical flow (optional)</label>
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
                    placeholder="e.g. 09:00 meet at the square · 09:15 start walking · short break at 10:30 · end around 12:00"
                  />
                  <p className="text-xs text-ink-muted mt-1 tabular-nums">
                    {form.typicalTimelineNotes.length}/{MAX_TIMELINE_LENGTH}
                  </p>
                </div>
                </div>
              </details>
              </>
              ) : null}
            </div>
          )}

          {stepIdx === 2 && form.inventoryFamily === 'stay' && (
            <div className="space-y-4">
              <h3 className="font-display text-xl text-ink">Stay price and rooms</h3>
              <p className="text-sm text-ink-muted">Nightly rate for the property, not per person.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  Nightly price ({listingCurrency})
                  <input
                    type="number"
                    min={1}
                    value={form.stayNightly}
                    onChange={(e) => setForm((f) => ({ ...f, stayNightly: e.target.value }))}
                    className="tv-input mt-1 w-full"
                  />
                </label>
                <label className="block text-sm">
                  Max guests
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
                  Check-in
                  <input
                    type="time"
                    value={form.stayCheckIn}
                    onChange={(e) => setForm((f) => ({ ...f, stayCheckIn: e.target.value }))}
                    className="tv-input mt-1 w-full"
                  />
                </label>
                <label className="block text-sm">
                  Check-out
                  <input
                    type="time"
                    value={form.stayCheckOut}
                    onChange={(e) => setForm((f) => ({ ...f, stayCheckOut: e.target.value }))}
                    className="tv-input mt-1 w-full"
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
              <label className="block text-sm">
                Amenities (comma separated)
                <input
                  value={form.stayAmenities}
                  onChange={(e) => setForm((f) => ({ ...f, stayAmenities: e.target.value }))}
                  className="tv-input mt-1 w-full"
                  placeholder="Wifi, kitchen, parking"
                />
              </label>
              <label className="block text-sm">
                House rules
                <textarea
                  value={form.stayHouseRules}
                  onChange={(e) => setForm((f) => ({ ...f, stayHouseRules: e.target.value }))}
                  className="tv-input mt-1 w-full min-h-[5rem]"
                />
              </label>
            </div>
          )}
          {stepIdx === 2 && form.inventoryFamily !== 'stay' && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div>
                <h3 className="font-display text-xl text-ink">Cost &amp; bookable options</h3>
                <p className="mt-1 text-sm text-ink-muted leading-relaxed">
                  Add each price and schedule as its own option. Meeting, pickup, and capacity are filled in when you create or
                  edit an option.
                </p>
              </div>
              <div className="divide-y divide-black/[0.06]">
                {materializedBookingOptions(form.bookingOptions).map((opt) => (
                  <div
                    key={opt.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {opt.name.trim() || 'Untitled option'}
                      </p>
                      <p className="text-xs text-ink-muted tabular-nums">
                        {formatMoney(opt.priceUsd, listingCurrency)} · {opt.duration.trim() || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                        onClick={() => removeBookingOption(opt.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 min-h-[44px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div
                {...(!optionModalOpen ? { id: 'supplier-listing-field-price' } : {})}
                className="pt-2"
              >
                <button
                  type="button"
                  onClick={openOptionModalCreate}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-sm font-semibold text-finland hover:bg-finland/10 min-h-[48px]"
                >
                  <Plus className="w-5 h-5 shrink-0" aria-hidden />
                  Create new option
                </button>
              </div>
              {materializedBookingOptions(form.bookingOptions).length === 0 && (
                <p className="text-xs text-ink-muted">
                  Add at least one complete option to continue. The lowest price appears as &quot;from&quot; on listing cards.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Overall difficulty</label>
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
              </div>
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

          {stepIdx === 3 && (
            <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl text-ink">
                    {form.inventoryFamily === 'stay' || createFamily === 'stay' ? 'Stay photos' : 'Tour photos'} ({LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} required to publish)
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Add photos in traveler order. The first photo is the main image. Use + Add photo or Replace to upload from
                    your device; pasted links stay as URLs. Reorder with the arrows after selecting a thumbnail.
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
              <div>
                <p className="font-medium text-ink">
                  {form.status === 'published' ? 'Update your live listing' : 'Go live or keep a draft'}
                </p>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                  <span className="font-medium text-ink">Publish</span> runs a final check and lists this{' '}
                  {form.inventoryFamily === 'stay' || createFamily === 'stay' ? 'stay' : 'tour'} on Traverion for
                  travelers. <span className="font-medium text-ink">Save as draft</span> stores progress without going live.
                  Promotional discounts are under <span className="font-medium text-ink">Offers</span> in Account.
                </p>
              </div>
            </div>
          )}
          </div>
        </div>

        <div className="relative z-10 px-4 sm:px-6 py-3 sm:py-4 border-t border-black/[0.08] bg-paper flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setStepIdxPersisted((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0 || draftCloseBusy || submitting}
            className="touch-manipulation tv-btn-ghost w-full sm:w-auto disabled:opacity-50"
          >
            Back
          </button>
          <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdxPersisted((s) => Math.min(steps.length - 1, s + 1))}
                disabled={!canContinueStep() || draftCloseBusy || submitting}
                className="touch-manipulation tv-btn-primary flex-1 sm:flex-none disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row flex-1 sm:flex-auto gap-2 w-full sm:w-auto min-w-0">
                {form.status === 'published' ? (
                  <button
                    type="button"
                    onClick={() => void runSubmit('published')}
                    disabled={
                      submitting ||
                      draftCloseBusy ||
                      !isStepSatisfied(3, form) ||
                      !lastStepSubmitArmed ||
                      publishBlockersPreview.length > 0
                    }
                    title={
                      publishBlockersPreview.length > 0 ? publishBlockersPreview[0] : 'Save updates to your live listing'
                    }
                    className="touch-manipulation tv-btn-primary flex-1 sm:flex-none disabled:opacity-50"
                  >
                    {submitting ? 'Saving…' : 'Save changes'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void runSubmit('draft')}
                      disabled={
                        submitting || draftCloseBusy || !isStepSatisfied(3, form) || !lastStepSubmitArmed
                      }
                      className="touch-manipulation tv-btn-secondary flex-1 sm:flex-none disabled:opacity-50"
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
                      className="touch-manipulation tv-btn-primary flex-1 sm:flex-none disabled:opacity-50"
                    >
                      {submitting ? 'Saving…' : 'Publish'}
                    </button>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              disabled={draftCloseBusy || submitting}
              onClick={() => void handleCloseIntent()}
              className="touch-manipulation tv-btn-ghost flex-1 sm:flex-none disabled:opacity-50"
            >
              {draftCloseBusy ? 'Saving draft…' : 'Cancel'}
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );

  return createPortal(
    <>
      {shell}
      {optionModalLayer}
    </>,
    document.body
  );
}
