import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import type { ListingBookingOption, ListingExtras, ScheduleStyle, VenueSetting } from '../../types/listingExtras';
import {
  materializedBookingOptions,
  normalizeListingBookingOption,
  parseListingExtras,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
} from '../../types/listingExtras';
import ListingImageFields from '../../components/supplier/ListingImageFields';
import { useAuth } from '../../contexts/AuthContext';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  computeListingQualityPartnerFocus,
  listingQualityPercent,
  LISTING_PLACEHOLDER_IMAGE,
  MIN_LISTING_DESCRIPTION_LENGTH,
} from '../../lib/listingQualityScore';

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
const GALLERY_SLOT_COUNT = 3;
const MAX_ACCESSIBILITY_LENGTH = 500;
const MAX_TIMELINE_LENGTH = 800;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  if (!o.name.trim() || o.priceUsd <= 0 || o.duration.trim().length < 2) return false;
  if (o.pickupPlace.trim().length < 8) return false;
  if (o.minPersons < 1 || o.maxPersons < o.minPersons) return false;
  if (o.maxSpotsPerSlot < 1) return false;
  if (o.optionInfo.trim().length < 3) return false;
  if (!o.weekdays.some(Boolean)) return false;
  const df = o.availabilityDateFrom.trim();
  const dt = o.availabilityDateTo.trim();
  if ((df && !dt) || (!df && dt)) return false;
  if (df && dt && df > dt) return false;
  return true;
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
  image: string;
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
  galleryUrls: string[];
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
  const galleryList = normalizeLineSlots(GALLERY_SLOT_COUNT, form.galleryUrls)
    .map((s) => s.trim())
    .filter(Boolean);
  const primaryLang = form.experienceLanguage.trim();
  const addLangs = form.additionalLanguages.filter((c) => c && c !== primaryLang);
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
    ...(galleryList.length ? { galleryImageUrls: galleryList } : {}),
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
    image: form.image || 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
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

/** Matches publish gate: real hero (not default stock) + ≥1 gallery URL. */
function listingPhotosStepComplete(form: ListingFormState): boolean {
  const img = form.image.trim();
  if (!img || img === LISTING_PLACEHOLDER_IMAGE || img.includes('pexels.com/photos/346885')) {
    return false;
  }
  const galleryCount = form.galleryUrls.map((s) => s.trim()).filter(Boolean).length;
  return galleryCount >= 1;
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
    return listingPhotosStepComplete(form);
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
  image: '',
  description: '',
  city: '',
  country: '',
  tags: [] as string[],
  difficulty: 'Easy',
  status: 'draft',
  bookingOptions: [createEmptyBookingOption()],
  experienceStartStyle: 'unspecified',
  includes: Array.from({ length: INCLUDE_SLOT_COUNT }, () => ''),
  excludes: Array.from({ length: EXCLUDE_SLOT_COUNT }, () => ''),
  scheduleStyle: 'flexible',
  typicalTimelineNotes: '',
  galleryUrls: Array.from({ length: GALLERY_SLOT_COUNT }, () => ''),
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
}: SupplierListingFormProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [draftCloseBusy, setDraftCloseBusy] = useState(false);
  const [draftCloseError, setDraftCloseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const publishChecklistKey = editingId ? `traverion-publish-checklist-${editingId}` : null;
  const [publishChecklistDismissed, setPublishChecklistDismissed] = useState(false);
  const lastFocused = useRef<string | null>(null);
  const stepContainerRef = useRef<HTMLDivElement | null>(null);
  const initialFormSnapshotRef = useRef<string>(serializeListingFormState(emptyForm));
  const closeIntentRunningRef = useRef(false);

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
      const existing = existingListings.find(t => t.id === editingId);
      if (existing) {
        const extras = parseListingExtras(existing.listingExtras as unknown);
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
          image: existing.image,
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
          galleryUrls: normalizeLineSlots(GALLERY_SLOT_COUNT, extras.galleryImageUrls),
          accessibilitySummary: extras.accessibilitySummary ?? '',
          minGuestAge: extras.minGuestAge ?? '',
          venueSetting: extras.venueSetting ?? 'unspecified',
          additionalLanguages: extras.additionalLanguages ?? [],
        };
        initialFormSnapshotRef.current = serializeListingFormState(next);
        setForm(next);
      }
    } else {
      initialFormSnapshotRef.current = serializeListingFormState(emptyForm);
      setForm(emptyForm);
    }
  }, [editingId, existingListings]);

  useEffect(() => {
    if (!publishChecklistKey) {
      setPublishChecklistDismissed(false);
      return;
    }
    setPublishChecklistDismissed(sessionStorage.getItem(publishChecklistKey) === '1');
  }, [publishChecklistKey]);

  useEffect(() => {
    lastFocused.current = null;
    setStepIdx(0);
  }, [editingId]);

  useEffect(() => {
    if (form.status === 'draft') setPublishBlockers(null);
  }, [form.status]);

  useEffect(() => {
    if (!focusSection || !editingId) return;
    const targetStep = focusToStep[focusSection];
    if (typeof targetStep === 'number') {
      setStepIdx(targetStep);
    }
    if (lastFocused.current === `${editingId}:${focusSection}`) return;
    const el = document.getElementById(`supplier-listing-field-${focusSection}`);
    if (!el) return;
    lastFocused.current = `${editingId}:${focusSection}`;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector<HTMLElement>('input, textarea, select, button');
      focusable?.focus?.();
    });
    onFocusConsumed?.();
  }, [focusSection, editingId, onFocusConsumed, focusToStep]);

  useEffect(() => {
    if (!stepContainerRef.current) return;
    stepContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
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

  const draftListingPreview = useMemo(() => {
    return buildListingFromForm(form, editingId ?? undefined);
  }, [form, editingId]);

  const listingQualityPct = useMemo(() => {
    const { score, maxScore } = computeListingQualityPartnerFocus(draftListingPreview);
    return listingQualityPercent(score, maxScore);
  }, [draftListingPreview]);

  const publishBlockersPreview = useMemo(
    () => getListingPublishBlockers(draftListingPreview),
    [draftListingPreview]
  );

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
    onCancel();
  }, [enableDraftOnClose, onSaveDraft, isDirty, form, editingId, submitting, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      void handleCloseIntent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCloseIntent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const listing = buildListingFromForm(form, editingId ?? undefined);
    if (form.status === 'published') {
      const blockers = getListingPublishBlockers(listing);
      if (blockers.length > 0) {
        setPublishBlockers(blockers);
        setStepIdx(0);
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
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (id: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id],
    }));
  };

  const patchBookingOption = useCallback((optionId: string, patch: Partial<ListingBookingOption>) => {
    setForm((f) => ({
      ...f,
      bookingOptions: f.bookingOptions.map((o) =>
        o.id === optionId ? normalizeListingBookingOption({ ...(o as unknown as Record<string, unknown>), ...patch }, o.id) : o
      ),
    }));
  }, []);

  const addBookingOption = useCallback(() => {
    setForm((f) => ({ ...f, bookingOptions: [...f.bookingOptions, createEmptyBookingOption()] }));
  }, []);

  const removeBookingOption = useCallback((optionId: string) => {
    setForm((f) =>
      f.bookingOptions.length <= 1
        ? f
        : { ...f, bookingOptions: f.bookingOptions.filter((o) => o.id !== optionId) }
    );
  }, []);

  const canContinueStep = () => {
    if (stepIdx >= steps.length - 1) return true;
    return isStepSatisfied(stepIdx, form);
  };

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
                This is what travelers will see once a listing is live. Close anytime — unfinished work is kept as a draft.
                Use <span className="font-medium text-gray-700">Publish</span> or <span className="font-medium text-gray-700">Draft</span>{' '}
                on your listings list to show or hide it on Traverion.
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
                      onClick={() => setStepIdx(idx)}
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-gray-700">
                Listing strength <span className="tabular-nums text-finland">{listingQualityPct}%</span>
              </p>
              <p className="text-xs text-gray-500">
                {publishBlockersPreview.length === 0
                  ? 'Meets basic publish checks — choose Published when you are ready.'
                  : `${publishBlockersPreview.length} item${publishBlockersPreview.length === 1 ? '' : 's'} left before publish`}
              </p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-finland/80 transition-all duration-500 ease-out"
                style={{ width: `${listingQualityPct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Step {stepIdx + 1} of {steps.length} · strength ignores optional highlights/tags and “live” status — publish from My
              listings when you are ready
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
                  One product can include several options (for example a small-group departure and a bus tour). Each option has
                  its own price, usual start time, duration, meeting or pickup place, capacity, and when it is offered.
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Drafts save from the listings list. The lowest option price is used as the “from” price on cards. Travelers still
                book the product first; you can refine per-option checkout later.
              </p>
              {form.bookingOptions.map((opt, optIndex) => (
                <div
                  key={opt.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Option {optIndex + 1}
                      {opt.name.trim() ? ` — ${opt.name.trim()}` : ''}
                    </h4>
                    {form.bookingOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBookingOption(opt.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Option name *</label>
                      <input
                        type="text"
                        value={opt.name}
                        onChange={(e) => patchBookingOption(opt.id, { name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                        placeholder="e.g. Small group tour · max 8"
                      />
                    </div>
                    <div {...(optIndex === 0 ? { id: 'supplier-listing-field-price' } : {})}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD) *</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={opt.priceUsd || ''}
                        onChange={(e) =>
                          patchBookingOption(opt.id, { priceUsd: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                    </div>
                    <div {...(optIndex === 0 ? { id: 'supplier-listing-field-pickup_timing' } : {})}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Usual start time</label>
                      <input
                        type="time"
                        value={opt.startTime}
                        onChange={(e) => patchBookingOption(opt.id, { startTime: e.target.value })}
                        className="w-full max-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Shown to guests; you can adjust on the booking.</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration for this option *</label>
                      <input
                        type="text"
                        value={opt.duration}
                        onChange={(e) => patchBookingOption(opt.id, { duration: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                        placeholder="e.g. 3 hours · half day"
                      />
                    </div>
                    <div className="sm:col-span-2" {...(optIndex === 0 ? { id: 'supplier-listing-field-meeting' } : {})}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Meeting or pickup place *</label>
                      <textarea
                        value={opt.pickupPlace}
                        onChange={(e) => patchBookingOption(opt.id, { pickupPlace: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                        placeholder="Address, hotel zone, landmark, or how pickup is arranged for this option"
                      />
                    </div>
                    <div {...(optIndex === 0 ? { id: 'supplier-listing-field-group' } : {})}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Min guests per booking *</label>
                      <input
                        type="number"
                        min={1}
                        value={opt.minPersons || ''}
                        onChange={(e) => {
                          const nextMin = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          patchBookingOption(opt.id, {
                            minPersons: nextMin,
                            maxPersons: Math.max(nextMin, opt.maxPersons),
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
                        value={opt.maxPersons || ''}
                        onChange={(e) =>
                          patchBookingOption(opt.id, {
                            maxPersons: Math.max(opt.minPersons, Math.floor(Number(e.target.value) || opt.minPersons)),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max spots per start time *</label>
                      <input
                        type="number"
                        min={1}
                        value={opt.maxSpotsPerSlot || ''}
                        onChange={(e) =>
                          patchBookingOption(opt.id, {
                            maxSpotsPerSlot: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Capacity for one departure or time slot.</p>
                    </div>
                    <div className="sm:col-span-2" {...(optIndex === 0 ? { id: 'supplier-listing-field-pickup' } : {})}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">About this option *</label>
                      <textarea
                        value={opt.optionInfo}
                        onChange={(e) => patchBookingOption(opt.id, { optionInfo: e.target.value })}
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
                              const next = [...opt.weekdays];
                              next[di] = !next[di];
                              patchBookingOption(opt.id, { weekdays: next });
                            }}
                            className={`min-h-[40px] min-w-[2.75rem] rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                              opt.weekdays[di]
                                ? 'border-finland bg-finland text-white'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Season start (optional)</label>
                      <input
                        type="date"
                        value={opt.availabilityDateFrom}
                        onChange={(e) => patchBookingOption(opt.id, { availabilityDateFrom: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Season end (optional)</label>
                      <input
                        type="date"
                        value={opt.availabilityDateTo}
                        onChange={(e) => patchBookingOption(opt.id, { availabilityDateTo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      />
                    </div>
                    <p className="sm:col-span-2 text-xs text-gray-500">
                      Leave both dates empty if this option is not limited to a fixed season. If you set one date, set both.
                    </p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addBookingOption}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-dashed border-finland/40 bg-finland/5 px-4 py-3 text-sm font-semibold text-finland hover:bg-finland/10 min-h-[48px]"
              >
                <Plus className="w-5 h-5 shrink-0" aria-hidden />
                Add another option
              </button>
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
              {!isStepSatisfied(5, form) && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 leading-relaxed">
                  <span className="font-semibold">Continue is disabled</span> until every{' '}
                  <strong>started</strong> option passes all checks. Extra blank rows from &quot;Add another option&quot; are
                  skipped automatically — or tap <strong>Remove</strong> on a row you don&apos;t need. Each active option needs:
                  name, price, duration, meeting or pickup (8+ characters), about this option (3+ characters), at least one
                  weekday, and either both season dates or neither.
                </p>
              )}
            </div>
          )}

          {stepIdx === 6 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Tour photos</h3>
                  <p className="mt-1 text-xs text-gray-600">
                    These images are what travelers see on your tour page — main photo at the top and gallery shots below. Add a
                    real main image and at least one extra gallery photo before publishing.
                  </p>
                </div>
                <ListingImageFields
                  heroUrl={form.image}
                  galleryUrls={form.galleryUrls}
                  onHeroUrl={(url) => setForm((f) => ({ ...f, image: url }))}
                  onGalleryUrls={(urls) => setForm((f) => ({ ...f, galleryUrls: urls }))}
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
                <p className="font-medium text-gray-900">{editingId ? 'Save your changes' : 'Save your listing'}</p>
                <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                  Promotional discounts are managed under <span className="font-medium text-gray-800">Discounts &amp; offers</span>{' '}
                  in the sidebar. To go live, close the editor and click <span className="font-medium text-gray-800">Publish</span>{' '}
                  on My listings; we load the latest saved data and re-check requirements at that moment.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0 || draftCloseBusy || submitting}
            className="touch-manipulation w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
          >
            Back
          </button>
          <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((s) => Math.min(steps.length - 1, s + 1))}
                disabled={!canContinueStep() || draftCloseBusy || submitting}
                className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || draftCloseBusy || !canContinueStep()}
                className="touch-manipulation flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
              >
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add listing'}
              </button>
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

  return createPortal(shell, document.body);
}
