import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
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
import { MIN_LISTING_DESCRIPTION_LENGTH } from '../../lib/listingQualityScore';

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

const WIZARD_STEP_COUNT = 7;

function wizardStepStorageKey(editingId: string | null) {
  return `traverion-listing-wizard-step-${editingId ?? 'create'}`;
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
  if (o.priceUsd <= 0) msg.push('Set a price greater than zero (USD).');
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
  const resolvedDestination = resolveListingDestinationLabel(form);
  const startLoc = form.city.trim() || resolvedDestination;
  const endLoc = startLoc;
  const opts = form.bookingOptions;
  const activeOpts = materializedBookingOptions(opts);
  const first = activeOpts[0];
  const positivePrices = activeOpts.map((o) => o.priceUsd).filter((p) => p > 0);
  const derivedStarting =
    positivePrices.length > 0 ? Math.min(...positivePrices) : 0;
  const groupSizeStr =
    activeOpts.length === 0
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
    ...(activeOpts.length > 0 ? { bookingOptions: activeOpts } : {}),
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
      currency: 'USD',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: mainImage || 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
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
    rating: 4.5,
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
  if (idx === 0) {
    return form.experienceLanguage.trim().length > 0 && form.title.trim().length > 0;
  }
  if (idx === 1) {
    return form.experienceKind === 'tour' || form.experienceKind === 'ticket' || form.experienceKind === 'transportation';
  }
  if (idx === 2) {
    const sub = form.subtitle.trim();
    const desc = form.description.trim();
    return (
      sub.length > 0 &&
      sub.length <= MAX_SUBTITLE_LENGTH &&
      desc.length >= MIN_LISTING_DESCRIPTION_LENGTH &&
      desc.length <= MAX_DESCRIPTION_LENGTH
    );
  }
  if (idx === 3) {
    const inc = form.includes.map((s) => s.trim()).filter(Boolean).length;
    const exc = form.excludes.map((s) => s.trim()).filter(Boolean).length;
    return inc >= 2 && exc >= 1;
  }
  if (idx === 4) {
    return (
      form.city.trim().length > 0 &&
      form.country.trim().length > 0 &&
      form.duration.trim().length > 0
    );
  }
  if (idx === 5) {
    const active = materializedBookingOptions(form.bookingOptions);
    return active.length >= 1 && active.every(isBookingOptionOkForStep);
  }
  if (idx === 6) {
    if (form.status === 'draft') {
      return orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length >= 1;
    }
    return listingPhotosReadyToPublish(form);
  }
  return true;
}

/** Step i shows a checkmark only when this step and every earlier step are satisfied (linear flow). */
function stepsThroughIndexComplete(upToIdx: number, form: ListingFormState): boolean {
  for (let i = 0; i <= upToIdx; i++) {
    if (!isStepSatisfied(i, form)) return false;
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
}

type StepId =
  | 'language_title'
  | 'category'
  | 'subtitle_details'
  | 'inclusions_info'
  | 'location_start'
  | 'cost_options'
  | 'photos';

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
  const [optionModalHasEndingDate, setOptionModalHasEndingDate] = useState(false);
  const optionModalOpenRef = useRef(false);

  const steps = useMemo(
    () => [
      { id: 'language_title' as StepId, label: 'Language & title' },
      { id: 'category' as StepId, label: 'Category' },
      { id: 'subtitle_details' as StepId, label: 'Subtitle & details' },
      { id: 'inclusions_info' as StepId, label: 'Inclusions & Info' },
      { id: 'location_start' as StepId, label: 'Location & start' },
      { id: 'cost_options' as StepId, label: 'Cost & options' },
      { id: 'photos' as StepId, label: 'Tour photos' },
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
      category: 1,
      kind: 1,
      subtitle: 2,
      highlights: 2,
      description: 2,
      includes: 3,
      excludes: 3,
      accessibility: 3,
      venue: 3,
      languages: 3,
      location: 4,
      destination: 4,
      duration: 4,
      schedule: 4,
      price: 5,
      group: 5,
      tags: 5,
      meeting: 5,
      pickup: 5,
      pickup_timing: 5,
      start: 4,
      dropoff: 5,
      image: 6,
      gallery: 6,
      hero: 6,
      photos: 6,
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
        };
        initialFormSnapshotRef.current = serializeListingFormState(next);
        setForm(next);
      }
    } else {
      // Only clear edit hydration when we're genuinely in a create session (not a transient editingId=null during edit).
      if (sessionOpenedAsCreateRef.current) {
        editModeHydratedIdRef.current = null;
      }
      // Create flow: seed empty template once — never when this mount started as an edit (see sessionOpenedAsCreateRef).
      if (sessionOpenedAsCreateRef.current && !createModeEmptySeededRef.current) {
        createModeEmptySeededRef.current = true;
        initialFormSnapshotRef.current = serializeListingFormState(emptyForm);
        setForm(emptyForm);
      }
    }
  }, [editingId, existingListings]);

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

  const publishBlockersPreview = useMemo(() => {
    const asPublished = buildListingFromForm({ ...form, status: 'published' }, editingId ?? undefined);
    return getListingPublishBlockers(asPublished);
  }, [form, editingId]);

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
            setSubmitError(result.error ?? 'Could not save your listing. Please try again.');
            return;
          }
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
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-option-modal-title"
    >
      <div className="absolute inset-0 bg-slate-900/40 motion-safe:animate-fade-in" aria-hidden />
      <div className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl motion-safe:animate-slide-up sm:rounded-2xl sm:motion-safe:animate-none">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 id="supplier-option-modal-title" className="text-base font-semibold text-gray-900 pr-8">
            {optionModalEditingId ? 'Edit option' : 'New option'}
          </h2>
          <button
            type="button"
            onClick={closeOptionModal}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8">
            <div className="space-y-4 min-w-0">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Option name *</label>
                <input
                  type="text"
                  value={optionDraft.name}
                  onChange={(e) => patchOptionDraft({ name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  placeholder="e.g. Small group tour · max 8"
                />
              </div>
              <div id="supplier-listing-field-price">
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD) *</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={optionDraft.priceUsd || ''}
                  onChange={(e) =>
                    patchOptionDraft({ priceUsd: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                />
              </div>
              <div id="supplier-listing-field-pickup_timing">
                <label className="block text-sm font-medium text-gray-700 mb-1">Usual start time</label>
                <input
                  type="time"
                  value={optionDraft.startTime}
                  onChange={(e) => patchOptionDraft({ startTime: e.target.value })}
                  className="w-full max-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">Shown to guests; you can adjust on the booking.</p>
              </div>
              <div className="sm:col-span-2" id="supplier-listing-field-option-duration">
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration for this option *</label>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        Type a number, then choose minutes, hours, or days. Both are required — they are stored as text like{' '}
                        <span className="font-medium text-gray-800">3 hours</span> or{' '}
                        <span className="font-medium text-gray-800">90 minutes</span>.
                      </p>
                      {optionDraft.duration.trim() ? (
                        <p className="text-xs text-gray-500 mt-1">
                          Saved as:{' '}
                          <span className="font-medium text-gray-700 tabular-nums">{optionDraft.duration.trim()}</span>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting or pickup place *</label>
                <textarea
                  value={optionDraft.pickupPlace}
                  onChange={(e) => patchOptionDraft({ pickupPlace: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  placeholder="Address, hotel zone, landmark, or how pickup is arranged for this option"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="supplier-listing-field-group">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min guests per booking *</label>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max guests per booking *</label>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Max spots per start time *</label>
                <input
                  type="number"
                  min={1}
                  value={optionDraft.maxSpotsPerSlot || ''}
                  onChange={(e) =>
                    patchOptionDraft({
                      maxSpotsPerSlot: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                    })
                  }
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">Capacity for one departure or time slot.</p>
              </div>
              <div className="sm:col-span-2" id="supplier-listing-field-pickup">
                <label className="block text-sm font-medium text-gray-700 mb-1">About this option *</label>
                <textarea
                  value={optionDraft.optionInfo}
                  onChange={(e) => patchOptionDraft({ optionInfo: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  placeholder="e.g. Private vehicle · English-speaking guide · shared bus · family-friendly"
                />
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm font-medium text-gray-800 mb-2">Runs on these weekdays *</p>
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
                      className={`min-h-[40px] min-w-[2.75rem] rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                        optionDraft.weekdays[di]
                          ? 'border-finland bg-finland text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/60 p-4 sm:p-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Starting date of the activity <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={optionDraft.availabilityDateFrom}
                    onChange={(e) => patchOptionDraft({ availabilityDateFrom: e.target.value })}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    When this option first becomes bookable. Leave empty if there is no fixed start.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 touch-manipulation">
                  <input
                    type="checkbox"
                    checked={optionModalHasEndingDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setOptionModalHasEndingDate(on);
                      if (!on) patchOptionDraft({ availabilityDateTo: '' });
                    }}
                    className="mt-0.5 h-5 w-5 rounded border-gray-300 text-finland focus:ring-finland shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">This activity has an ending date</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Use this for a fixed season or last day the option runs. Leave it off if the activity continues with no end
                      date.
                    </span>
                  </span>
                </label>
                {optionModalHasEndingDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ending date *</label>
                    <input
                      type="date"
                      value={optionDraft.availabilityDateTo}
                      onChange={(e) => patchOptionDraft({ availabilityDateTo: e.target.value })}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">Last day this option is offered (inclusive).</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/90 p-4 text-xs text-gray-600 leading-relaxed lg:sticky lg:top-4 lg:self-start">
              <p className="text-sm font-semibold text-gray-900">Tips</p>
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
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-gray-200 px-4 py-3 sm:px-5 sm:justify-end">
          <button
            type="button"
            onClick={closeOptionModal}
            className="min-h-[44px] flex-1 sm:flex-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveOptionModal}
            className="min-h-[44px] flex-1 sm:flex-none rounded-lg bg-finland px-4 py-2.5 text-sm font-medium text-white hover:bg-finland-dark"
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
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden overscroll-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-listing-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-[80] bg-slate-900/35 backdrop-blur-md motion-safe:animate-fade-in supports-[backdrop-filter]:bg-slate-900/25 cursor-pointer border-0 p-0"
        aria-label="Close listing editor"
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
          className="pointer-events-auto motion-safe:animate-slide-up motion-reduce:animate-none flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-white shadow-none sm:shadow-none h-[min(100dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-h-[min(100dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] rounded-none"
        >
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <div className="shrink-0 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="supplier-listing-editor-title" className="text-xl font-semibold text-gray-900">
                {editingId ? 'Edit listing' : 'Create listing'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                This is what travelers will see once a listing is live. Close anytime — unfinished work can be saved as a draft.
                On the last step, use <span className="font-medium text-gray-700">Publish</span> to go live, or{' '}
                <span className="font-medium text-gray-700">Save as draft</span> to keep working. To take a live listing offline,
                use <span className="font-medium text-gray-700">Deactivate</span> under the gear menu on My listings.
              </p>
            </div>
            <button
              type="button"
              disabled={draftCloseBusy || submitting}
              onClick={() => void handleCloseIntent()}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {draftCloseBusy ? 'Saving…' : 'Close'}
            </button>
          </div>
          {draftCloseError && (
            <p className="mb-3 text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{draftCloseError}</p>
          )}
          {submitError && (
            <p className="mb-3 text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
              {submitError}
            </p>
          )}
          <nav aria-label="Listing setup steps" className="mb-3 -mx-1 overflow-x-auto overflow-y-hidden pb-1">
            <ol className="flex w-full min-w-[720px] list-none m-0 p-0 sm:min-w-0">
              {steps.map((step, idx) => {
                const done = stepsThroughIndexComplete(idx, form);
                const current = idx === stepIdx;
                const n = steps.length;
                return (
                  <li key={step.id} className="relative min-w-0 flex-1 list-none">
                    <button
                      type="button"
                      onClick={() => setStepIdxPersisted(idx)}
                      className="touch-manipulation group flex w-full flex-col items-center rounded-lg px-0.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
                      aria-current={current ? 'step' : undefined}
                    >
                      <div className="relative flex h-8 w-full items-center justify-center">
                        {idx > 0 && (
                          <div
                            className={`pointer-events-none absolute left-0 top-1/2 z-0 h-0.5 w-[calc(50%-1rem)] -translate-y-1/2 rounded-full ${
                              stepsThroughIndexComplete(idx - 1, form) ? 'bg-finland/50' : 'bg-gray-200'
                            }`}
                            aria-hidden
                          />
                        )}
                        {idx < n - 1 && (
                          <div
                            className={`pointer-events-none absolute right-0 top-1/2 z-0 h-0.5 w-[calc(50%-1rem)] -translate-y-1/2 rounded-full ${
                              stepsThroughIndexComplete(idx, form) ? 'bg-finland/50' : 'bg-gray-200'
                            }`}
                            aria-hidden
                          />
                        )}
                        <span
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors ${
                            done
                              ? 'bg-finland text-white border-finland'
                              : current
                                ? 'border-finland bg-finland/10 text-finland'
                                : 'border-gray-200 bg-white text-gray-400 group-hover:border-gray-300'
                          }`}
                        >
                          {done ? '✓' : idx + 1}
                        </span>
                      </div>
                      <span
                        className={`mt-1.5 inline-block max-w-[6.5rem] sm:max-w-none text-center text-[10px] font-semibold leading-tight sm:text-xs transition-shadow ${
                          current
                            ? 'rounded-md bg-finland/12 px-1.5 py-0.5 text-finland shadow-[0_0_0_1px_rgba(0,86,140,0.2),0_4px_14px_rgba(0,86,140,0.22)]'
                            : 'text-gray-600'
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="space-y-1">
            <p className="text-xs text-gray-600">
              {publishBlockersPreview.length === 0
                ? 'Meets basic publish checks — use Publish on the Tour photos step when you are ready.'
                : `${publishBlockersPreview.length} item${publishBlockersPreview.length === 1 ? '' : 's'} left before publish`}
            </p>
            <p className="text-[11px] text-gray-400">
              Step {stepIdx + 1} of {steps.length} · publish from the Tour photos step or use{' '}
              <span className="font-medium text-gray-500">→ Publish</span> on My listings for drafts
            </p>
          </div>
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
          {stepIdx === 0 && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-language">
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary language of the tour *</label>
                <p className="text-xs text-gray-500 mb-2">The main language guests can expect from your team during the experience.</p>
                <select
                  value={form.experienceLanguage}
                  onChange={(e) => setForm((f) => ({ ...f, experienceLanguage: e.target.value }))}
                  className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select language…</option>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div id="supplier-listing-field-title">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <p className="text-xs text-gray-500 mb-2">A clear, specific name travelers will see in search and on the listing page.</p>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  placeholder="e.g. Old town walking tour · small groups"
                  required
                />
              </div>
            </div>
          )}

          {stepIdx === 1 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-category">
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <p className="text-xs text-gray-500 mb-3">Choose the option that best describes what you sell. You can add more detail in later steps.</p>
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
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-gray-900">{opt.title}</span>
                        <span className="mt-2 block text-xs text-gray-600 leading-relaxed">{opt.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {stepIdx === 2 && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-subtitle">
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle *</label>
                <p className="text-xs text-gray-500 mb-2">
                  A short line under the title on the listing page (max {MAX_SUBTITLE_LENGTH} characters).
                </p>
                <input
                  type="text"
                  value={form.subtitle}
                  maxLength={MAX_SUBTITLE_LENGTH}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value.slice(0, MAX_SUBTITLE_LENGTH) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  placeholder="e.g. Small-group food walk with local hosts"
                />
                <p className="text-xs text-gray-500 mt-1 tabular-nums">
                  {form.subtitle.length}/{MAX_SUBTITLE_LENGTH}
                </p>
              </div>
              <div id="supplier-listing-field-description">
                <label className="block text-sm font-medium text-gray-700 mb-1">Information about the experience *</label>
                <p className="text-xs text-gray-500 mb-2">
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
                      : 'border-gray-300 focus:ring-finland'
                  }`}
                  placeholder="What guests do, what makes it special, practical notes…"
                  aria-invalid={form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH}
                  aria-describedby={
                    form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                      ? 'supplier-listing-description-hint supplier-listing-description-error'
                      : 'supplier-listing-description-hint'
                  }
                />
                <p id="supplier-listing-description-hint" className="text-xs text-gray-500 mt-1 tabular-nums">
                  {form.description.length}/{MAX_DESCRIPTION_LENGTH}
                </p>
                {form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH && (
                  <p
                    id="supplier-listing-description-error"
                    className="text-sm text-red-600 mt-1.5"
                    role="alert"
                  >
                    Add at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue — describe the experience, what
                    guests should expect, and any practical details.
                  </p>
                )}
              </div>
              <div id="supplier-listing-field-highlights" className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Highlights (optional)</label>
                  <p className="text-xs text-gray-500 mt-1">
                    Up to five short selling points — each on its own line below.
                  </p>
                </div>
                {form.highlights.map((line, index) => (
                  <div key={index}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Highlight {index + 1}</label>
                    <input
                      type="text"
                      value={line}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          highlights: f.highlights.map((h, i) => (i === index ? e.target.value : h)),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      placeholder={index === 0 ? 'e.g. Skip-the-line entry' : `Optional highlight ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {stepIdx === 3 && (
            <div className="space-y-5 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-includes">
                <label className="block text-sm font-medium text-gray-700 mb-1">What&apos;s included *</label>
                <p className="text-xs text-gray-500 mb-2">At least two clear items (tickets, guide, transport, tastings, etc.).</p>
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      placeholder={`Included item ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div id="supplier-listing-field-excludes">
                <label className="block text-sm font-medium text-gray-700 mb-1">Not included *</label>
                <p className="text-xs text-gray-500 mb-2">At least one line so guests know what to budget for.</p>
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      placeholder={`Not included ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div id="supplier-listing-field-accessibility" className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Good to know</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Accessibility &amp; mobility (optional)</label>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    placeholder="Steps, uneven ground, wheelchair access, hearing loops, etc."
                  />
                  <p className="text-xs text-gray-500 mt-1 tabular-nums">
                    {form.accessibilitySummary.length}/{MAX_ACCESSIBILITY_LENGTH}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum guest age (optional)</label>
                    <input
                      type="text"
                      value={form.minGuestAge}
                      onChange={(e) => setForm((f) => ({ ...f, minGuestAge: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      placeholder="e.g. 8+ or none"
                    />
                  </div>
                  <div id="supplier-listing-field-venue">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Setting</label>
                    <select
                      value={form.venueSetting}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, venueSetting: e.target.value as VenueSetting }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Additional languages offered (optional)</label>
                  <p className="text-xs text-gray-500 mb-2">Besides the primary language you set in step 1.</p>
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
                            className="rounded border-gray-300 text-finland focus:ring-finland"
                          />
                          <span className="text-sm text-gray-700">{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {stepIdx === 4 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-location">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    placeholder="e.g. Lisbon — main base or starting point"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    placeholder="Primary country for this experience"
                    required
                  />
                </div>
              </div>
              <div id="supplier-listing-field-destination" className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700">How it shows as a place (optional)</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  placeholder="e.g. coastal route · several towns — or leave blank"
                />
                <p className="text-xs text-gray-500">
                  If you skip this, we use city and country from above; if you fill this instead, cards can show this route label.
                </p>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Use the main base or usual starting city. Per-option meeting and pickup are set under{' '}
                <span className="font-medium text-gray-700">Cost &amp; options</span>.
              </p>
              <div id="supplier-listing-field-duration">
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration *</label>
                <input
                  type="text"
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  placeholder="e.g. 3 hours or 1 day"
                  required
                />
              </div>
              <div id="supplier-listing-field-start">
                <label className="block text-sm font-medium text-gray-700 mb-1">How does the experience start? *</label>
                <select
                  value={form.experienceStartStyle}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      experienceStartStyle: e.target.value as ListingFormState['experienceStartStyle'],
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  {EXPERIENCE_START_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  You will set the exact meeting or pickup place for each bookable option under Cost &amp; options.
                </p>
              </div>
              <div id="supplier-listing-field-schedule" className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">How timing works</h3>
                <p className="text-xs text-gray-600">
                  Helps travelers understand whether they are booking a fixed slot, flexible window, or arranging time with you.
                </p>
                <div className="space-y-2">
                  {SCHEDULE_STYLE_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                        form.scheduleStyle === o.value
                          ? 'border-finland bg-finland/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="scheduleStyle"
                        value={o.value}
                        checked={form.scheduleStyle === o.value}
                        onChange={() => setForm((f) => ({ ...f, scheduleStyle: o.value }))}
                        className="mt-1 border-gray-300 text-finland focus:ring-finland"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                        <span className="block text-xs text-gray-600 mt-0.5">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typical flow (optional)</label>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    placeholder="e.g. 09:00 meet at the square · 09:15 start walking · short break at 10:30 · end around 12:00"
                  />
                  <p className="text-xs text-gray-500 mt-1 tabular-nums">
                    {form.typicalTimelineNotes.length}/{MAX_TIMELINE_LENGTH}
                  </p>
                </div>
              </div>
            </div>
          )}

          {stepIdx === 5 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div className="rounded-xl border border-finland/20 bg-finland/5 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-gray-900">Cost &amp; bookable options</h3>
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                  Add each price and schedule as its own option. Meeting, pickup, and capacity are filled in when you create or
                  edit an option.
                </p>
              </div>
              <div className="space-y-2">
                {materializedBookingOptions(form.bookingOptions).map((opt) => (
                  <div
                    key={opt.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {opt.name.trim() || 'Untitled option'}
                      </p>
                      <p className="text-xs text-gray-500 tabular-nums">
                        ${opt.priceUsd} · {opt.duration.trim() || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openOptionModalEdit(opt.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 min-h-[44px]"
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
                className="rounded-xl border border-dashed border-finland/40 bg-finland/5 p-1"
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
                <p className="text-xs text-gray-500">
                  Add at least one complete option to continue. The lowest price appears as &quot;from&quot; on listing cards.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Overall difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        difficulty: e.target.value as 'Easy' | 'Moderate' | 'Challenging',
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Challenging">Challenging</option>
                  </select>
                </div>
              </div>
              <div id="supplier-listing-field-tags">
                <label className="block text-sm font-medium text-gray-700 mb-3">Tags</label>
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
                        className="h-5 w-5 rounded border-gray-300 text-finland focus:ring-2 focus:ring-finland focus:ring-offset-0 shrink-0"
                      />
                      <span className="text-base text-gray-800 font-medium leading-snug">{tag.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepIdx === 6 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Tour photos ({LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} required to publish)
                  </h3>
                  <p className="mt-1 text-xs text-gray-600">
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
              </div>
              {form.status === 'published' && editingId && !publishChecklistDismissed && publishChecklistKey && (
                <div className="rounded-xl border border-finland/30 bg-finland/5 p-4 text-sm text-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">After publishing — quick checks</p>
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
                  <ul className="mt-2 list-disc list-inside space-y-1 text-gray-700">
                    <li>Open this listing on your phone and scroll the photos and description.</li>
                    <li>Confirm meeting or pickup details match what you tell guests in messages.</li>
                    <li>If you use per-date capacity, keep future dates updated so bookings stay accurate.</li>
                  </ul>
                </div>
              )}
              <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5 text-sm text-gray-700">
                <p className="font-medium text-gray-900">
                  {form.status === 'published' ? 'Update your live listing' : 'Go live or keep a draft'}
                </p>
                <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                  <span className="font-medium text-gray-800">Publish</span> runs a final check and lists your tour on Traverion for
                  travelers. <span className="font-medium text-gray-800">Save as draft</span> stores progress without going live.
                  Promotional discounts are under <span className="font-medium text-gray-800">Discounts &amp; offers</span> in the
                  sidebar.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setStepIdxPersisted((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0 || draftCloseBusy || submitting}
            className="touch-manipulation w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
          >
            Back
          </button>
          <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdxPersisted((s) => Math.min(steps.length - 1, s + 1))}
                disabled={!canContinueStep() || draftCloseBusy || submitting}
                className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
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
                      !isStepSatisfied(6, form) ||
                      !lastStepSubmitArmed ||
                      publishBlockersPreview.length > 0
                    }
                    title={
                      publishBlockersPreview.length > 0 ? publishBlockersPreview[0] : 'Save updates to your live listing'
                    }
                    className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
                  >
                    {submitting ? 'Saving…' : 'Save changes'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void runSubmit('draft')}
                      disabled={
                        submitting || draftCloseBusy || !isStepSatisfied(6, form) || !lastStepSubmitArmed
                      }
                      className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-800 font-medium hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
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
                      className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
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
              className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px] disabled:opacity-50"
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
