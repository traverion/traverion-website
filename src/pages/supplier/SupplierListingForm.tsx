import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TourPackage } from '../../types/tour';
import type { ListingExtras, ScheduleStyle, VenueSetting } from '../../types/listingExtras';
import { parseListingExtras, TRAVERION_STANDARD_CANCELLATION_POLICY } from '../../types/listingExtras';
import ListingDiscounts from '../../components/supplier/ListingDiscounts';
import ListingImageFields from '../../components/supplier/ListingImageFields';
import { useAuth } from '../../contexts/AuthContext';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  computeListingQuality,
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
  { value: 'unspecified', label: 'Not sure yet — I will describe it under Meeting & pickup' },
  { value: 'fixed_meeting_place', label: 'Guests meet us at a fixed meeting point' },
  { value: 'operator_pickup', label: 'We pick guests up (for example from their accommodation area)' },
  { value: 'either_available', label: 'Both meeting at a set place and pickup are available' },
];

const DROPOFF_OPTIONS: { value: 'same_as_pickup' | 'different_place'; label: string }[] = [
  { value: 'same_as_pickup', label: 'Same as pickup / meeting point (typical round trip)' },
  { value: 'different_place', label: 'Different drop-off place' },
];

const MAX_SUBTITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;
const HIGHLIGHT_SLOT_COUNT = 5;
const INCLUDE_SLOT_COUNT = 6;
const EXCLUDE_SLOT_COUNT = 6;
const GALLERY_SLOT_COUNT = 3;
const MAX_ACCESSIBILITY_LENGTH = 500;
const MAX_TIMELINE_LENGTH = 800;

/** Upper bound (minutes before start); lower bound is always 0 — saved as listing pickup window. */
type PickupWindowPresetMax = 15 | 30 | 45 | 60 | 120;

const PICKUP_WINDOW_PRESET_OPTIONS: { value: PickupWindowPresetMax; label: string }[] = [
  { value: 15, label: '0–15 min' },
  { value: 30, label: '0–30 min' },
  { value: 45, label: '0–45 min' },
  { value: 60, label: '0–60 min' },
  { value: 120, label: '0–120 min' },
];

function normalizePickupWindowPresetMax(min: number, max: number): PickupWindowPresetMax {
  const hi = Math.max(min, max);
  if (hi <= 0) return 30;
  if (hi <= 15) return 15;
  if (hi <= 30) return 30;
  if (hi <= 45) return 45;
  if (hi <= 60) return 60;
  return 120;
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
  { value: 'fixed_slots', label: 'Fixed daily start', hint: 'You usually run at set times (set default start time under Meeting & pickup).' },
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
  price: number;
  image: string;
  description: string;
  city: string;
  country: string;
  tags: string[];
  groupSize: string;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  status: 'draft' | 'published';
  meetingPoint: string;
  pickupInstructions: string;
  defaultStartTime: string;
  pickupWindowMinutesBeforeMax: PickupWindowPresetMax;
  experienceStartStyle: 'unspecified' | 'fixed_meeting_place' | 'operator_pickup' | 'either_available';
  dropoffMode: 'same_as_pickup' | 'different_place';
  dropoffLocation: string;
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

function meetingAndPickupFieldCopy(style: ListingFormState['experienceStartStyle']): {
  meetingLabel: string;
  meetingPlaceholder: string;
  meetingHint: string;
} {
  switch (style) {
    case 'fixed_meeting_place':
      return {
        meetingLabel: 'Meeting point',
        meetingPlaceholder: 'Address, landmark, or how to find you',
        meetingHint: 'Guests come here to begin the experience.',
      };
    case 'operator_pickup':
      return {
        meetingLabel: 'Pickup area or coverage',
        meetingPlaceholder: 'e.g. central hotels, cruise terminal zone, within X km',
        meetingHint: 'Describe where you collect guests or how you confirm their pickup address.',
      };
    case 'either_available':
      return {
        meetingLabel: 'Meeting point (if guests meet you here)',
        meetingPlaceholder: 'Address or landmark for the fixed meeting option',
        meetingHint: 'If they choose pickup instead, use Pickup instructions below.',
      };
    default:
      return {
        meetingLabel: 'Meeting point / pickup location',
        meetingPlaceholder: 'Address, landmark, or area — add timing in Daily timing below',
        meetingHint: 'Choose how the experience starts under Location & start when you can — this stays flexible until then.',
      };
  }
}

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
  const endLoc =
    form.dropoffMode === 'different_place' && form.dropoffLocation.trim()
      ? form.dropoffLocation.trim()
      : startLoc;
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
      startingFrom: form.price,
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
    groupSize: form.groupSize.trim() || '2-12 People',
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
    meetingPoint: form.meetingPoint.trim() || undefined,
    pickupInstructions: form.pickupInstructions.trim() || undefined,
    defaultStartTime: form.defaultStartTime.trim() || undefined,
    pickupWindowMinutesBeforeMin: 0,
    pickupWindowMinutesBeforeMax: form.pickupWindowMinutesBeforeMax,
    experienceStartStyle: form.experienceStartStyle,
    dropoffMode: form.dropoffMode,
    dropoffLocation:
      form.dropoffMode === 'different_place' && form.dropoffLocation.trim()
        ? form.dropoffLocation.trim()
        : undefined,
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

/** Matches publish gate for where guests go (combined length). */
function meetingPickupStepComplete(form: ListingFormState): boolean {
  return form.meetingPoint.trim().length + form.pickupInstructions.trim().length >= 12;
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
    const g = form.groupSize.trim();
    return form.price > 0 && g.length >= 3;
  }
  if (idx === 6) {
    return meetingPickupStepComplete(form);
  }
  if (idx === 7) {
    return listingPhotosStepComplete(form);
  }
  if (idx === 8) {
    return true;
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
  price: 0,
  image: '',
  description: '',
  city: '',
  country: '',
  tags: [] as string[],
  groupSize: '2-12 People',
  difficulty: 'Easy',
  status: 'draft',
  meetingPoint: '',
  pickupInstructions: '',
  defaultStartTime: '',
  pickupWindowMinutesBeforeMax: 30,
  experienceStartStyle: 'unspecified',
  dropoffMode: 'same_as_pickup',
  dropoffLocation: '',
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
  | 'pricing'
  | 'logistics'
  | 'photos'
  | 'content';

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
      { id: 'pricing' as StepId, label: 'Pricing' },
      { id: 'logistics' as StepId, label: 'Meeting & pickup' },
      { id: 'photos' as StepId, label: 'Tour photos' },
      { id: 'content' as StepId, label: 'Discounts & save' },
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
      destination: 6,
      duration: 4,
      schedule: 4,
      price: 5,
      group: 5,
      tags: 5,
      meeting: 6,
      pickup: 6,
      start: 4,
      dropoff: 6,
      pickup_timing: 6,
      image: 7,
      gallery: 7,
      hero: 7,
      photos: 7,
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
          price: existing.price.startingFrom,
          image: existing.image,
          description: existing.description,
          city: existing.city ?? '',
          country: existing.country ?? '',
          tags: existing.tags ?? [],
          groupSize: existing.groupSize,
          difficulty: existing.difficulty,
          status: existing.status === 'draft' || existing.status === 'published' ? existing.status : 'draft',
          meetingPoint: existing.meetingPoint ?? '',
          pickupInstructions: existing.pickupInstructions ?? '',
          defaultStartTime: existing.defaultStartTime ?? '',
          pickupWindowMinutesBeforeMax: normalizePickupWindowPresetMax(
            existing.pickupWindowMinutesBeforeMin ?? 0,
            existing.pickupWindowMinutesBeforeMax ?? 30
          ),
          experienceStartStyle: existing.experienceStartStyle ?? 'unspecified',
          dropoffMode: existing.dropoffMode ?? 'same_as_pickup',
          dropoffLocation: existing.dropoffLocation ?? '',
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
    const { score, maxScore } = computeListingQuality(draftListingPreview);
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
      <div className="relative z-[81] flex min-h-0 w-full flex-1 flex-col justify-end sm:justify-center px-0 py-0 sm:py-4 sm:px-5 md:px-8 lg:px-10 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto motion-safe:animate-slide-up motion-reduce:animate-none flex min-h-0 w-full max-w-none flex-col overflow-hidden border-0 border-gray-200 bg-white shadow-2xl rounded-t-3xl sm:rounded-2xl sm:mx-auto h-[min(96dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] sm:h-[min(100dvh-2rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] sm:max-h-[min(100dvh-2rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] sm:max-w-5xl md:max-w-6xl xl:max-w-7xl sm:border sm:border-gray-200"
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
            <ol className="flex w-full min-w-[800px] list-none m-0 p-0 sm:min-w-0">
              {steps.map((step, idx) => {
                const done = isStepSatisfied(idx, form);
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
                              isStepSatisfied(idx - 1, form) ? 'bg-finland/50' : 'bg-gray-200'
                            }`}
                            aria-hidden
                          />
                        )}
                        {idx < n - 1 && (
                          <div
                            className={`pointer-events-none absolute right-0 top-1/2 z-0 h-0.5 w-[calc(50%-1rem)] -translate-y-1/2 rounded-full ${
                              isStepSatisfied(idx, form) ? 'bg-finland/50' : 'bg-gray-200'
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
                        className={`mt-1.5 text-center text-[10px] font-medium leading-tight sm:text-xs ${
                          current ? 'text-finland' : 'text-gray-600'
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
              Step {stepIdx + 1} of {steps.length} · progress reflects how complete your listing looks to guests
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
              <p className="text-xs text-gray-500 -mt-2">
                Use the main base or usual starting city. For wider or multi-stop routes, add a clearer route label under{' '}
                <span className="font-medium text-gray-700">Meeting &amp; pickup</span>.
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
                  Add addresses, areas, and timing under Meeting &amp; pickup. Guests use this to know whether to meet you or expect pickup.
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
              <div id="supplier-listing-field-price">
                <label className="block text-sm font-medium text-gray-700 mb-1">Price from (USD) *</label>
                <input type="number" min={0} value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland" required />
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                New listings save as drafts until you publish them from the listings list. Editing a live listing keeps it live
                unless you switch it to draft there.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="supplier-listing-field-group">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group size *</label>
                  <input
                    type="text"
                    value={form.groupSize}
                    onChange={(e) => setForm((f) => ({ ...f, groupSize: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    placeholder="e.g. 2–12 people or max 8 per departure"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as 'Easy' | 'Moderate' | 'Challenging' }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white">
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Challenging">Challenging</option>
                  </select>
                </div>
              </div>
              <div id="supplier-listing-field-tags">
                <label className="block text-sm font-medium text-gray-700 mb-3">Tags</label>
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {TAG_OPTIONS.map(tag => (
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
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div id="supplier-listing-field-destination">
                <label className="block text-sm font-medium text-gray-700 mb-1">How it shows as a place (optional)</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  placeholder="e.g. coastal route · several towns — or leave blank"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If you skip this, we use city and country from Location &amp; start; otherwise “Various locations” on cards and search.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 sm:p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Pickup &amp; drop-off</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Clarify whether guests come to you, you collect them, and where the experience ends compared to where it
                    started.
                  </p>
                </div>
                {(() => {
                  const mpc = meetingAndPickupFieldCopy(form.experienceStartStyle);
                  return (
                    <>
                      <div id="supplier-listing-field-meeting">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{mpc.meetingLabel}</label>
                        <input
                          type="text"
                          value={form.meetingPoint}
                          onChange={(e) => setForm((f) => ({ ...f, meetingPoint: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                          placeholder={mpc.meetingPlaceholder}
                        />
                        <p className="text-xs text-gray-500 mt-1">{mpc.meetingHint}</p>
                      </div>
                      <div id="supplier-listing-field-pickup">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pickup instructions</label>
                        <textarea
                          value={form.pickupInstructions}
                          onChange={(e) => setForm((f) => ({ ...f, pickupInstructions: e.target.value }))}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                          placeholder="What guests should do if you pick them up: how you contact them, what to wait for, luggage, accessibility, etc."
                        />
                      </div>
                      <div id="supplier-listing-field-dropoff">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Drop-off</label>
                        <select
                          value={form.dropoffMode}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dropoffMode: e.target.value as ListingFormState['dropoffMode'],
                              dropoffLocation: e.target.value === 'same_as_pickup' ? '' : f.dropoffLocation,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                        >
                          {DROPOFF_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Choose “Different drop-off place” if the route ends somewhere other than the pickup or meeting point.
                        </p>
                      </div>
                      {form.dropoffMode === 'different_place' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Drop-off details</label>
                          <textarea
                            value={form.dropoffLocation}
                            onChange={(e) => setForm((f) => ({ ...f, dropoffLocation: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                            placeholder="Address, landmark, or area where guests are dropped off at the end"
                          />
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div id="supplier-listing-field-pickup_timing" className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 space-y-4">
                <p className="text-sm font-medium text-gray-900">Daily timing (optional)</p>
                <p className="text-xs text-gray-600">
                  Set the usual start time for this experience. After a customer books, you assign the exact pickup time within the window you choose below (minutes before start).
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default start time</label>
                  <input
                    type="time"
                    value={form.defaultStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, defaultStartTime: e.target.value }))}
                    className="w-full max-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Applied to each booked day unless you change it on the booking.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pickup window (before start)</label>
                  <select
                    value={form.pickupWindowMinutesBeforeMax}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pickupWindowMinutesBeforeMax: Number(e.target.value) as PickupWindowPresetMax,
                      }))
                    }
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                  >
                    {PICKUP_WINDOW_PRESET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Guests can be picked up from this many minutes before the scheduled start through to start time (0 min before).
                  </p>
                </div>
              </div>
            </div>
          )}

          {stepIdx === 7 && (
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
            </div>
          )}

          {stepIdx === 8 && (
            <div className="space-y-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
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
              {editingId ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Discounts</p>
                  <p className="text-xs text-gray-600 mb-4">
                    Optional pricing rules for this listing. Meeting details and tour photos are in their own steps above.
                  </p>
                  <ListingDiscounts listingId={editingId} />
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">Almost done</p>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                    Save your listing to create it. You can add discounts and change tour photos anytime from your listings list.
                  </p>
                </div>
              )}
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
