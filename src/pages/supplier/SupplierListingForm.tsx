import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Plus } from 'lucide-react';
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
import ListingInformationStage from '../../components/supplier/listing-creation/ListingInformationStage';
import { ListingPreviewPublishStage } from '../../components/supplier/listing-creation/ListingPreviewPublishStage';
import {
  normalizeAccessibilityFeatureIds,
  normalizeNotSuitableForIds,
  normalizeSpokenLanguageIds,
  normalizeWhatToBringIds,
} from '../../lib/listing-information-catalogs';
import { useAuth } from '../../contexts/AuthContext';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { scheduleSpotsBelowSoldWarning, scheduleDepartureTimeMoveBlockReason } from '../../lib/capacity-reduction-warn';
import {
  occupyingGuestsForBookingOption,
  occupyingGuestsForOptionDeparture,
  removeBookingOptionOccupancyNotice,
  removeScheduleOccupancyNotice,
  schedulePersistAbandonsOccupiedSlot,
} from '../../lib/schedule-edit-impact';
import { summarizeOptionPricing } from '../../lib/price-categories';
import { headlineStartingAmountFromBookingOptions } from '../../lib/headline-price';
import { listingDurationForPersist } from '../../lib/listing-option-ownership';
import { itineraryForListingPersist } from '../../lib/tour-itinerary';
import {
  TOUR_OPTION_SCENE_COUNT,
  clampTourOptionSceneIndex,
  duplicateBookingOption,
  nextTourOptionScene,
  previousTourOptionScene,
  readyBookingOptions,
  tourOptionReadiness,
  upsertBookingOption,
} from '../../lib/listing-option-scenes';
import {
  canContinueTourOptionScene,
  canVisitTourOptionScene,
  isTourOptionSceneSatisfied,
  tourOptionContextNavItems,
  tourOptionLockedReason,
  tourOptionSceneContinueHint,
  TOUR_OPTION_SCENES,
} from '../../lib/listing-option-progression';
import {
  OPTION_EDITOR_NEW_ID,
  optionEditorUrlId,
  readOptionEditorUrl,
  writeOptionEditorUrl,
} from '../../lib/listing-option-editor-url';
import {
  bookingOptionSchedulePrereqIssues,
  firstBookingOptionIssueFocusId,
  getBookingOptionValidationMessages,
} from '../../lib/listing-option-validation';
import {
  blankOptionSchedule,
  duplicateOptionSchedule,
  ensureExplicitSchedules,
  isImplicitScheduleId,
  listingOptionHasSchedules,
  newListingOptionScheduleId,
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
  normalizePhotoOriginalUrls,
  normalizePhotoCropSettings,
  orderedPhotoUrls,
  photoSlotsFromTourPackage,
  isPlaceholderListingImageUrl,
  LISTING_PHOTO_GRID_SLOTS,
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  type ListingPhotoCropSettings,
} from '../../lib/listingPhotoGrid';
import { getListingPublishBlockers, publishBlockerListingWizardStep } from '../../lib/listingPublishGate';
import { stayFormCheckInOutFromExtras } from '../../lib/stay-form-check-times';
import { resolveDepartureTimezone, TRAVERION_DEPARTURE_TIMEZONE } from '../../lib/tour-departure-cutoff';
import {
  detectListingDepartureTimezone,
  listingTimezoneMatchesAuto,
} from '../../lib/listing-location-timezone';
import {
  listingPublishTruth,
  reviewBasicsSummary,
  reviewDetailsSummary,
  reviewInformationSummary,
  reviewOptionsSummary,
  reviewPhotosSummary,
  reviewStayLocationSummary,
  reviewStayPricingSummary,
} from '../../lib/listing-creation-review';
import { listingWizardPersistLabel } from '../../lib/listing-wizard-persist';
import { normalizeScheduleToOptionChargeModel } from '../../lib/listing-option-charge-model';
import { canAddOptionSchedule } from '../../lib/listing-schedule-list';
import { deriveListingTags } from '../../lib/listing-derived-tags';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  listingCreationNavItems,
  listingCreationProgressCopy,
} from '../../lib/listing-creation-workspace';
import {
  canContinueFromPhotos,
  canVisitListingCreationStep,
  listingCreationContinueHint,
  listingCreationLockedReason,
  listingCreationMissingHint,
  photosMissingItems,
  tourDetailsMissingItems,
} from '../../lib/listing-creation-progression';
import {
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SUBTITLE_MAX,
  TOUR_HIGHLIGHT_MAX,
  TOUR_HIGHLIGHT_MIN_VISIBLE,
  canAdvanceTourBasicsScene,
  canSelectTourBasicsScene,
  canAddTourHighlight,
  addTourHighlight,
  removeTourHighlight,
  isTourIdentitySatisfied,
  isTourLocationSatisfied,
  isTourProductTypeSatisfied,
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
  TOUR_INFORMATION_SCENE_COUNT,
  bumpInformationFarthest,
  canAdvanceTourInformationScene,
  clampTourInformationSceneIndex,
  initialTourInformationSceneIndex,
  nextTourInformationScene,
  previousTourInformationScene,
  tourInformationSceneForFocusSection,
} from '../../lib/listing-information-scenes';
import {
  STAY_HIGHLIGHT_MAX,
  STAY_HIGHLIGHT_MIN_VISIBLE,
  TOUR_EXCLUDE_MAX,
  TOUR_EXCLUDE_MIN_REQUIRED,
  TOUR_EXCLUDE_MIN_VISIBLE,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_REQUIRED,
  TOUR_INCLUDE_MIN_VISIBLE,
  TOUR_LINE_ITEM_MAX_LENGTH,
  TOUR_LINE_ITEM_MIN_LENGTH,
  TOUR_LINE_ITEM_NEAR_LIMIT_LENGTH,
  addProgressiveSlot,
  areFilledListingLineItemsValid,
  canAddProgressiveSlot,
  clampListingLineItemInput,
  normalizeProgressiveSlots,
  persistableProgressiveSlots,
  removeProgressiveSlot,
} from '../../lib/listing-creation-lines';import { ListingCreationWorkspace } from '../../components/supplier/listing-creation/ListingCreationWorkspace';
import { ListingCreationIdentityPreview } from '../../components/supplier/listing-creation/ListingCreationIdentityPreview';
import { TourBasicsGuidedScenes } from '../../components/supplier/listing-creation/TourBasicsGuidedScenes';
import { TourOptionGuidedScenes } from '../../components/supplier/listing-creation/TourOptionGuidedScenes';
import { TourOptionWorkspace } from '../../components/supplier/listing-creation/TourOptionWorkspace';
import { TourOptionCard } from '../../components/supplier/listing-creation/TourOptionCard';
import { tourOptionCardModel, scheduleBlockedExplanation } from '../../lib/listing-option-card';
import {
  deriveExperienceStartStyleFromOptions,
  optionsWithFulfillment,
} from '../../lib/listing-option-start-style';
import { TourScheduleWorkspace } from '../../components/supplier/listing-creation/TourScheduleWorkspace';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  shouldHydrateExistingListing,
  shouldResetWizardOnEditingIdChange,
} from '../../lib/listing-creation-persist';
import { userFacingError } from '../../lib/userFacingError';
import { normalizeListingForDraftSave } from '../../lib/listingDraftUtils';
import {
  LISTING_DESCRIPTION_NEAR_LIMIT_LENGTH,
  LISTING_TITLE_NEAR_LIMIT_LENGTH,
  MAX_LISTING_DESCRIPTION_LENGTH,
  MAX_LISTING_TITLE_LENGTH,
  MIN_LISTING_DESCRIPTION_LENGTH,
  MIN_LISTING_TITLE_LENGTH,
  clampListingDescriptionInput,
  clampListingTitleInput,
  isListingDescriptionLengthValid,
  isListingTitleLengthValid,
} from '../../lib/listingQualityScore';
import {
  PARTNER_LISTING_PUBLISH_STEP_NOTE,
  PARTNER_LISTING_PUBLISH_STEP_TITLE,
} from '../../lib/booking-confirmation-copy';
import { DEFAULT_CURRENCY, formatMoney, normalizeCurrency } from '../../lib/money';
import { STAY_AMENITY_PRESETS } from '../../lib/stay-amenities';
import { publicStayListingUrl, publicTourListingUrl } from '../../lib/publicSiteUrl';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import NoticeCallout from '../../components/NoticeCallout';

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

const MAX_SUBTITLE_LENGTH = TOUR_BASICS_SUBTITLE_MAX;
const MAX_DESCRIPTION_LENGTH = MAX_LISTING_DESCRIPTION_LENGTH;

const MAX_ACCESSIBILITY_LENGTH = 500;
const MAX_TIMELINE_LENGTH = 800;
const MAX_KNOW_BEFORE_LENGTH = 800;
const MAX_WHAT_TO_BRING_LENGTH = 500;
const MAX_REQUIREMENTS_LENGTH = 500;
const MAX_ADDITIONAL_INFO_LENGTH = 800;

/** Tour: 6 steps. Stay: 6 (Property → Location → Space → Price → Photos → Review). */
function wizardStepCount(): number {
  return 6;
}

function wizardStepStorageKey(editingId: string | null, isStay: boolean) {
  return `traverion-listing-wizard-step-v5-${isStay ? 'stay' : 'tour'}-${editingId ?? 'create'}`;
}

function readWizardStepFromStorage(editingId: string | null, isStay: boolean): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(wizardStepStorageKey(editingId, isStay));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    const max = wizardStepCount();
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

function infoSceneStorageKey(editingId: string | null) {
  return `traverion-listing-wizard-info-scene-v1-tour-${editingId ?? 'create'}`;
}

function infoFarthestStorageKey(editingId: string | null) {
  return `traverion-listing-wizard-info-farthest-v1-tour-${editingId ?? 'create'}`;
}

function readInfoSceneFromStorage(editingId: string | null): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(infoSceneStorageKey(editingId));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    return clampTourInformationSceneIndex(n);
  } catch {
    return null;
  }
}

function writeInfoSceneToStorage(editingId: string | null, scene: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(infoSceneStorageKey(editingId), String(clampTourInformationSceneIndex(scene)));
  } catch {
    // ignore quota / private mode
  }
}

function readInfoFarthestFromStorage(editingId: string | null): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = sessionStorage.getItem(infoFarthestStorageKey(editingId));
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return 0;
    return clampTourInformationSceneIndex(n);
  } catch {
    return 0;
  }
}

function writeInfoFarthestToStorage(editingId: string | null, farthest: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      infoFarthestStorageKey(editingId),
      String(clampTourInformationSceneIndex(farthest))
    );
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
    copy(infoSceneStorageKey(fromId), infoSceneStorageKey(toId));
    copy(infoFarthestStorageKey(fromId), infoFarthestStorageKey(toId));
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
    return coerceListingFormState(parsed.form);
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
        optionInfo: 'Standard',
        travelerStartInstructions: tour.pickupInstructions ?? '',
        weekdays: [true, true, true, true, true, true, true],
        availabilityDateFrom: '',
        availabilityDateTo: '',
      },
      newBookingOptionId()
    ),
  ];
}

type OpenOptionEditOptions = {
  /** Start on this option scene (0 setup, 1 meeting, 2 pricing, 3 availability). */
  sceneIndex?: number;
  /** After the option sheet opens, immediately open a schedule editor. */
  action?: { kind: 'add_schedule' } | { kind: 'edit_schedule'; scheduleId: string };
};

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
  variant = 'plain',
  minRequired = 0,
  fieldError = null,
  addLabel = '+ Add another',
  emptyHint = null,
  enforceItemLength = false,
}: {
  fieldId: string;
  label: string;
  hint: string;
  values: string[];
  minVisible: number;
  max: number;
  placeholder: (index: number) => string;
  onChange: (next: string[]) => void;
  /** `include` / `exclude` render a sectioned card with a status badge and per-line markers. */
  variant?: 'plain' | 'include' | 'exclude';
  /** How many filled lines are needed (drives the badge). 0 = optional. */
  minRequired?: number;
  /** Inline guidance when the step cannot continue (required lists only). */
  fieldError?: string | null;
  addLabel?: string;
  emptyHint?: string | null;
  /** Inclusion/exclusion lines: 3–60 chars, live counter, legacy-safe clamp. */
  enforceItemLength?: boolean;
}) {
  const sectioned = variant !== 'plain';
  const filled = values.filter((line) => line.trim().length > 0).length;
  const lengthsOk = !enforceItemLength || areFilledListingLineItemsValid(values);
  const satisfied = (minRequired <= 0 || filled >= minRequired) && lengthsOk;
  const labelId = `${fieldId}-label`;
  const errorId = `${fieldId}-error`;
  const cleanLabel = label.replace(/\s*\*$/, '').replace(/\s*\(optional\)\s*$/i, '').trim();
  const canAdd = canAddProgressiveSlot(values, max);
  const atMax = values.length >= max && filled >= max;
  const lengthHint =
    enforceItemLength && !lengthsOk
      ? `Each item needs ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters.`
      : null;

  const list = (
    <>
      {values.length === 0 && emptyHint ? (
        <p className="text-[12px] leading-relaxed text-ink-muted">{emptyHint}</p>
      ) : null}
      <div className={values.length > 0 ? 'space-y-2' : ''}>
        {values.map((line, index) => {
          const trimmedLen = line.trim().length;
          const tooShort = enforceItemLength && trimmedLen > 0 && trimmedLen < TOUR_LINE_ITEM_MIN_LENGTH;
          const overMax = enforceItemLength && line.length > TOUR_LINE_ITEM_MAX_LENGTH;
          const nearLimit = enforceItemLength && line.length >= TOUR_LINE_ITEM_NEAR_LIMIT_LENGTH;
          const counterId = `${fieldId}-count-${index}`;
          return (
            <div
              key={`${fieldId}-${index}`}
              className={
                sectioned
                  ? 'grid grid-cols-[1.25rem_minmax(0,1fr)_4.25rem] items-start gap-x-2'
                  : 'flex items-start gap-2'
              }
            >
              {sectioned ? (
                <span
                  className={`mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    variant === 'include' ? 'bg-finland/10 text-finland' : 'bg-red-50 text-red-700'
                  }`}
                  aria-hidden
                >
                  {variant === 'include' ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Minus className="h-3 w-3" strokeWidth={3} />
                  )}
                </span>
              ) : null}
              <div className="min-w-0">
                <input
                  type="text"
                  value={line}
                  onChange={(e) => {
                    const nextValue = enforceItemLength
                      ? clampListingLineItemInput(e.target.value, line)
                      : e.target.value;
                    onChange(values.map((s, i) => (i === index ? nextValue : s)));
                  }}
                  className="tv-input w-full min-w-0"
                  placeholder={placeholder(index)}
                  aria-label={`${cleanLabel} ${index + 1}`}
                  aria-invalid={tooShort || overMax || (Boolean(fieldError) && !satisfied) ? true : undefined}
                  aria-describedby={
                    enforceItemLength || (fieldError && !satisfied)
                      ? [enforceItemLength ? counterId : null, fieldError && !satisfied ? errorId : null]
                          .filter(Boolean)
                          .join(' ') || undefined
                      : undefined
                  }
                  maxLength={
                    enforceItemLength && line.length <= TOUR_LINE_ITEM_MAX_LENGTH
                      ? TOUR_LINE_ITEM_MAX_LENGTH
                      : undefined
                  }
                  minLength={enforceItemLength && trimmedLen > 0 ? TOUR_LINE_ITEM_MIN_LENGTH : undefined}
                />
                {enforceItemLength ? (
                  <p
                    id={counterId}
                    className={`mt-0.5 text-[11px] tabular-nums ${
                      tooShort || overMax
                        ? 'text-ink-muted'
                        : nearLimit
                          ? 'text-amber-800'
                          : 'text-ink-faint'
                    }`}
                  >
                    {line.length} / {TOUR_LINE_ITEM_MAX_LENGTH}
                    {tooShort
                      ? ` · at least ${TOUR_LINE_ITEM_MIN_LENGTH}`
                      : overMax
                        ? ` · shorten to ${TOUR_LINE_ITEM_MAX_LENGTH}`
                        : nearLimit
                          ? ' · approaching limit'
                          : null}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onChange(removeProgressiveSlot(values, index, minVisible))}
                className={`lux-flat mt-1.5 w-full shrink-0 px-1 py-1.5 text-center text-[12px] font-medium text-ink-muted hover:text-ink ${
                  sectioned ? '' : 'w-auto px-2'
                }`}
              >
                {index < minVisible && !line.trim() ? 'Clear' : 'Remove'}
              </button>
            </div>
          );
        })}
      </div>
      {canAdd ? (
        <button
          type="button"
          onClick={() => onChange(addProgressiveSlot(values, max))}
          className="mt-2 inline-flex min-h-10 items-center text-[13px] font-semibold text-finland"
        >
          {addLabel}
        </button>
      ) : atMax ? (
        <p className="mt-2 text-[12px] text-ink-muted">Maximum of {max} items.</p>
      ) : values.some((s) => !s.trim()) ? (
        <p className="mt-2 text-[12px] text-ink-muted">Fill the empty row before adding another.</p>
      ) : enforceItemLength && !lengthsOk ? (
        <p className="mt-2 text-[12px] text-ink-muted">{lengthHint}</p>
      ) : null}
      {(fieldError && !satisfied) || (enforceItemLength && !lengthsOk && filled >= minRequired) ? (
        <p id={errorId} className="mt-2 text-[12px] text-ink-muted" role="status">
          {fieldError && !satisfied ? fieldError : lengthHint}
        </p>
      ) : null}
    </>
  );
  if (!sectioned) {
    return (
      <div id={fieldId}>
        <label className="mb-1 block text-sm font-semibold text-ink">{label}</label>
        <p className="mb-2 text-xs text-ink-muted">{hint}</p>
        {list}
      </div>
    );
  }

  const counter =
    minRequired > 0
      ? satisfied
        ? `${filled} / ${max}`
        : `${filled} of ${minRequired} needed`
      : `${filled} / ${max}`;

  return (
    <section
      id={fieldId}
      aria-labelledby={labelId}
      className={`lc-section rounded-2xl border-l-4 px-4 py-3.5 sm:px-5 ${
        variant === 'include' ? 'border-l-finland' : 'border-l-red-300'
      }`}
    >
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 id={labelId} className="text-[14px] font-semibold tracking-tight text-ink">
            {label}
          </h5>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{hint}</p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
            minRequired > 0 && !satisfied
              ? 'bg-paper text-ink-muted ring-1 ring-line'
              : 'bg-finland/10 text-finland'
          }`}
          role="status"
        >
          {counter}
          {minRequired <= 0 ? ' · optional' : null}
        </span>
      </div>
      {list}
    </section>
  );
}

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
  /** Master URLs for recrop; parallel to photoSlots. */
  photoOriginalUrls: string[];
  /** Crop/zoom state parallel to photoSlots (lossless re-edit). */
  photoCropSettings: ListingPhotoCropSettings[];
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
  /** Hours before departure when online booking closes; empty = until start. */
  bookingCutoffHoursBeforeStart: string;
  /** IANA zone for departure wall clock; empty = Europe/Helsinki. */
  departureTimezone: string;
  /** When true, location changes must not overwrite departureTimezone. */
  departureTimezoneManual: boolean;
  accessibilitySummary: string;
  accessibilityFeatureIds: string[];
  minGuestAge: string;
  knowBeforeYouGo: string;
  whatToBring: string;
  whatToBringIds: string[];
  requirementsNotes: string;
  notSuitableForIds: string[];
  additionalInfo: string;
  bookingContactPhoneE164: string;
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
  stayCheckInAddress: string;
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
  // Do not silently truncate over-max legacy descriptions on save; publish gate blocks until shortened.
  const desc = form.description.trim();
  const highlightList =
    form.inventoryFamily === 'stay'
      ? persistableProgressiveSlots(form.highlights, STAY_HIGHLIGHT_MAX)
      : persistableTourHighlights(form.highlights);
  const includeList = persistableProgressiveSlots(form.includes, TOUR_INCLUDE_MAX);
  const excludeList = persistableProgressiveSlots(form.excludes, TOUR_EXCLUDE_MAX);
  const orderedPhotos = orderedPhotoUrls(form.photoSlots);
  const mainImage = orderedPhotos[0] ?? '';
  const galleryList = orderedPhotos.slice(1);
  const spokenLangs = normalizeSpokenLanguageIds(form.additionalLanguages);
  const bringIds = normalizeWhatToBringIds(form.whatToBringIds);
  const notSuitableIds = normalizeNotSuitableForIds(form.notSuitableForIds);
  const a11yIds = normalizeAccessibilityFeatureIds(form.accessibilityFeatureIds);
  const labelsNorm = normalizePhotoSlotLabels(form.photoSlotLabels);
  const originalsNorm = normalizePhotoOriginalUrls(form.photoOriginalUrls);
  const cropsNorm = normalizePhotoCropSettings(form.photoCropSettings);
  const extras: ListingExtras = {
    ...(spokenLangs.length ? { additionalLanguages: spokenLangs } : {}),
    ...(form.venueSetting !== 'unspecified' ? { venueSetting: form.venueSetting } : {}),
    ...((form.accessibilitySummary ?? '').trim()
      ? {
          accessibilitySummary: (form.accessibilitySummary ?? '')
            .trim()
            .slice(0, MAX_ACCESSIBILITY_LENGTH),
        }
      : {}),
    ...(a11yIds.length ? { accessibilityFeatureIds: a11yIds } : {}),
    ...((form.minGuestAge ?? '').trim() ? { minGuestAge: (form.minGuestAge ?? '').trim() } : {}),
    ...((form.knowBeforeYouGo ?? '').trim()
      ? { knowBeforeYouGo: (form.knowBeforeYouGo ?? '').trim().slice(0, MAX_KNOW_BEFORE_LENGTH) }
      : {}),
    ...((form.whatToBring ?? '').trim()
      ? { whatToBring: (form.whatToBring ?? '').trim().slice(0, MAX_WHAT_TO_BRING_LENGTH) }
      : {}),
    ...(bringIds.length ? { whatToBringIds: bringIds } : {}),
    ...((form.requirementsNotes ?? '').trim()
      ? {
          requirementsNotes: (form.requirementsNotes ?? '')
            .trim()
            .slice(0, MAX_REQUIREMENTS_LENGTH),
        }
      : {}),
    ...(notSuitableIds.length ? { notSuitableForIds: notSuitableIds } : {}),
    ...((form.additionalInfo ?? '').trim()
      ? { additionalInfo: (form.additionalInfo ?? '').trim().slice(0, MAX_ADDITIONAL_INFO_LENGTH) }
      : {}),
    // Private table field — always present so save can upsert/clear listing_booking_contact.
    bookingContactPhoneE164: (form.bookingContactPhoneE164 ?? '').trim(),
    ...(form.scheduleStyle ? { scheduleStyle: form.scheduleStyle } : {}),
    ...((form.typicalTimelineNotes ?? '').trim()
      ? {
          typicalTimelineNotes: (form.typicalTimelineNotes ?? '')
            .trim()
            .slice(0, MAX_TIMELINE_LENGTH),
        }
      : {}),
    ...(Number(form.bookingCutoffHoursBeforeStart) > 0
      ? {
          bookingCutoffHoursBeforeStart: Math.min(
            168,
            Math.floor(Number(form.bookingCutoffHoursBeforeStart))
          ),
        }
      : {}),
    ...(form.departureTimezone.trim()
      ? { departureTimezone: resolveDepartureTimezone(form.departureTimezone) }
      : {}),
    ...(form.departureTimezoneManual ? { departureTimezoneManual: true } : {}),
    ...(galleryList.length > 0 ? { galleryImageUrls: galleryList } : {}),
    ...(labelsNorm.some((l) => l.trim()) ? { photoSlotLabels: labelsNorm } : {}),
    ...(originalsNorm.some((u) => u.trim()) ? { photoOriginalUrls: originalsNorm } : {}),
    ...(cropsNorm.some(
      (c) => c.zoom !== 1 || c.crop.x !== 0 || c.crop.y !== 0 || c.areaPixels != null
    )
      ? { photoCropSettings: cropsNorm }
      : {}),
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
            checkInAddress: form.stayCheckInAddress.trim() || undefined,
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
    itinerary: itineraryForListingPersist({
      title: form.title,
      description: desc,
      city: form.city,
      destination: resolvedDestination,
      typicalTimelineNotes: form.typicalTimelineNotes,
    }),
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
    tags: (() => {
      const derived = deriveListingTags({
        bookingOptions: activeOpts,
        // Platform standard policy is free cancel until 24h before start.
        cancellationPreset: 'free_24h',
      });
      return derived.length ? derived : undefined;
    })(),
    supplierId: 'current',
    status: form.status,
    cancellationPolicy: TRAVERION_STANDARD_CANCELLATION_POLICY,
    listingExtras: Object.keys(extras).length > 0 ? extras : undefined,
    meetingPoint: first?.pickupPlace.trim() || undefined,
    pickupInstructions:
      (first?.travelerStartInstructions ?? '').trim() || first?.optionInfo.trim() || undefined,
    defaultStartTime: first?.startTime.trim() || undefined,
    // Derived from option fulfillments so Options overview no longer asks for listing start style.
    experienceStartStyle: deriveExperienceStartStyleFromOptions(activeOpts),
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
    const kindOk =
      isStay ||
      form.experienceKind === 'tour' ||
      form.experienceKind === 'ticket' ||
      form.experienceKind === 'transportation';
    if (isStay) {
      return (
        isListingTitleLengthValid(form.title) &&
        sub.length > 0 &&
        sub.length <= MAX_SUBTITLE_LENGTH &&
        isListingDescriptionLengthValid(form.description)
      );
    }
    return (
      kindOk &&
      form.experienceLanguage.trim().length > 0 &&
      form.city.trim().length > 0 &&
      form.country.trim().length > 0 &&
      isListingTitleLengthValid(form.title) &&
      sub.length > 0 &&
      sub.length <= MAX_SUBTITLE_LENGTH
    );
  }
  if (idx === 1) {
    if (isStay) {
      return (
        form.city.trim().length > 0 &&
        form.country.trim().length > 0 &&
        form.stayCheckInAddress.trim().length > 0
      );
    }
    const incLines = form.includes.map((s) => s.trim()).filter(Boolean);
    const excLines = form.excludes.map((s) => s.trim()).filter(Boolean);
    return (
      isListingDescriptionLengthValid(form.description) &&
      incLines.length >= TOUR_INCLUDE_MIN_REQUIRED &&
      incLines.length <= TOUR_INCLUDE_MAX &&
      excLines.length <= TOUR_EXCLUDE_MAX &&
      areFilledListingLineItemsValid(incLines) &&
      areFilledListingLineItemsValid(excLines)
    );
  }
  if (idx === 2) {
    if (form.inventoryFamily === 'stay') {
      const maxG = Number.parseInt(form.stayMaxGuests, 10);
      return Number.isFinite(maxG) && maxG >= 1;
    }
    // Information — optional for tours; never blocks Continue.
    return true;
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
    const active = materializedBookingOptions(form.bookingOptions);
    const ready = readyBookingOptions(active, optionValidationMessages);
    return optionsWithFulfillment(ready).length >= 1;
  }
  if (idx === 4) {
    return listingPhotosReadyToPublish(form);
  }
  if (idx === 5) {
    // Preview & Publish is complete only after the listing is published — not merely ready.
    return form.status === 'published';
  }
  return true;
}

/** Soft gate so existing drafts can move past Photos with a single cover. New creation requires publish-ready photos. */
function canContinueListingStep(idx: number, form: ListingFormState, isNewCreation: boolean): boolean {
  const photosIdx = 4;
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
  photoOriginalUrls: Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => ''),
  photoCropSettings: normalizePhotoCropSettings([]),
  description: '',
  city: '',
  country: '',
  tags: [] as string[],
  difficulty: 'Easy',
  status: 'draft',
  bookingOptions: [],
  experienceStartStyle: 'unspecified',
  includes: Array.from({ length: TOUR_INCLUDE_MIN_VISIBLE }, () => ''),
  excludes: [],
  scheduleStyle: 'flexible',
  typicalTimelineNotes: '',
  bookingCutoffHoursBeforeStart: '',
  departureTimezone: '',
  departureTimezoneManual: false,
  accessibilitySummary: '',
  accessibilityFeatureIds: [] as string[],
  minGuestAge: '',
  knowBeforeYouGo: '',
  whatToBring: '',
  whatToBringIds: [] as string[],
  requirementsNotes: '',
  notSuitableForIds: [] as string[],
  additionalInfo: '',
  bookingContactPhoneE164: '',
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
  stayCheckInAddress: '',
  stayCleaningFee: '',
};

/**
 * Session backups from older wizard builds may omit newer Information fields.
 * Merge onto emptyForm so .trim() / .length never run on undefined.
 */
function coerceListingFormState(raw: Partial<ListingFormState> | null | undefined): ListingFormState {
  const merged: ListingFormState = { ...emptyForm, ...(raw ?? {}) };
  merged.accessibilityFeatureIds = normalizeAccessibilityFeatureIds(merged.accessibilityFeatureIds);
  merged.whatToBringIds = normalizeWhatToBringIds(merged.whatToBringIds);
  merged.notSuitableForIds = normalizeNotSuitableForIds(merged.notSuitableForIds);
  merged.additionalLanguages = normalizeSpokenLanguageIds(merged.additionalLanguages);
  merged.accessibilitySummary =
    typeof merged.accessibilitySummary === 'string' ? merged.accessibilitySummary : '';
  merged.minGuestAge = typeof merged.minGuestAge === 'string' ? merged.minGuestAge : '';
  merged.knowBeforeYouGo = typeof merged.knowBeforeYouGo === 'string' ? merged.knowBeforeYouGo : '';
  merged.whatToBring = typeof merged.whatToBring === 'string' ? merged.whatToBring : '';
  merged.requirementsNotes =
    typeof merged.requirementsNotes === 'string' ? merged.requirementsNotes : '';
  merged.additionalInfo = typeof merged.additionalInfo === 'string' ? merged.additionalInfo : '';
  merged.bookingContactPhoneE164 =
    typeof merged.bookingContactPhoneE164 === 'string' ? merged.bookingContactPhoneE164 : '';
  merged.includes = Array.isArray(merged.includes)
    ? merged.includes.map((x) => String(x ?? ''))
    : emptyForm.includes;
  merged.excludes = Array.isArray(merged.excludes)
    ? merged.excludes.map((x) => String(x ?? ''))
    : [];
  merged.highlights = Array.isArray(merged.highlights)
    ? merged.highlights.map((x) => String(x ?? ''))
    : emptyForm.highlights;
  merged.photoSlots = normalizePhotoSlots(merged.photoSlots);
  merged.photoSlotLabels = normalizePhotoSlotLabels(merged.photoSlotLabels);
  merged.photoOriginalUrls = normalizePhotoOriginalUrls(merged.photoOriginalUrls);
  merged.photoCropSettings = normalizePhotoCropSettings(merged.photoCropSettings);
  return merged;
}

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

type StepId =
  | 'the_experience'
  | 'practical'
  | 'information'
  | 'cost_options'
  | 'stay_price'
  | 'photos'
  | 'review';

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
  const infoEnterFromOptionsBackRef = useRef(false);
  const infoPendingSceneRef = useRef<number | null>(null);

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
  const [infoSceneIdx, setInfoSceneIdx] = useState(() =>
    initialTourInformationSceneIndex({
      stored: readInfoSceneFromStorage(editingId),
      farthest: readInfoFarthestFromStorage(editingId),
      focusSection,
    })
  );
  const [infoSceneDirection, setInfoSceneDirection] =
    useState<ListingCreationSceneDirection>('forward');
  const [infoFarthest, setInfoFarthest] = useState(() =>
    Math.max(readInfoFarthestFromStorage(editingId), readInfoSceneFromStorage(editingId) ?? 0)
  );
  const setInfoSceneIdxPersisted = useCallback(
    (next: number | ((prev: number) => number), direction: ListingCreationSceneDirection = 'forward') => {
      setInfoSceneIdx((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        const clamped = clampTourInformationSceneIndex(resolved);
        writeInfoSceneToStorage(editingId, clamped);
        setInfoFarthest((far) => {
          const bumped = bumpInformationFarthest(far, clamped);
          writeInfoFarthestToStorage(editingId, bumped);
          return bumped;
        });
        return clamped;
      });
      setInfoSceneDirection(direction);
    },
    [editingId]
  );
  const [draftCloseBusy, setDraftCloseBusy] = useState(false);
  /** Smooth slide-out before returning to listings home after Save draft. */
  const [shellExiting, setShellExiting] = useState(false);
  const shellExitTimerRef = useRef<number | null>(null);
  const [draftCloseError, setDraftCloseError] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Confirmed server result — never set before onSave resolves. */
  const [saveFlash, setSaveFlash] = useState<'draft' | 'published' | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const leaveDialogRef = useRef<HTMLDivElement | null>(null);
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
  /** Escape/backdrop must persist the option draft — keep a stable callback for the capture-phase listener. */
  const saveOptionAsDraftRef = useRef<() => void>(() => {});
  const [scheduleDraft, setScheduleDraft] = useState<ListingOptionSchedule | null>(null);
  const [scheduleSceneIdx, setScheduleSceneIdx] = useState(0);
  const [scheduleHasEndingDate, setScheduleHasEndingDate] = useState(true);
  const [scheduleAttempted, setScheduleAttempted] = useState(false);
  const [schedulePersistLabel, setSchedulePersistLabel] = useState<string | null>(null);
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null);
  const [scheduleLeaveOpen, setScheduleLeaveOpen] = useState(false);
  const [pendingScheduleDeleteId, setPendingScheduleDeleteId] = useState<string | null>(null);
  const [listingOccupancyBookings, setListingOccupancyBookings] = useState<BookingRow[]>([]);
  const [listingOccupancyLoadError, setListingOccupancyLoadError] = useState<string | null>(null);
  /** Phase 1108: [] before first successful fetch must not mean “no sold seats”. */
  const [listingOccupancyReady, setListingOccupancyReady] = useState(false);
  const scheduleSessionOpenedAsCreateRef = useRef(false);
  const pendingScheduleActionRef = useRef<OpenOptionEditOptions['action'] | null>(null);
  const scheduleSnapshotRef = useRef<string>('');
  /** Start time when the schedule editor was opened — sold seats stay on this purchased slot. */
  const scheduleOpenedStartTimeRef = useRef('');
  /**
   * Phase 1109: first-seen startTime for this schedule id in the edit session.
   * Survives draft-save + reopen so partners cannot bypass the sold-seat move block.
   */
  const scheduleSoldSeatAnchorRef = useRef<{ id: string; startTimeHm: string } | null>(null);
  const scheduleDraftRef = useRef<ListingOptionSchedule | null>(null);
  const addScheduleLockRef = useRef(false);
  /** Prevent double-click duplicate ready saves on Save schedule. */
  const scheduleSaveLockRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !editingId) {
      setListingOccupancyBookings([]);
      setListingOccupancyLoadError(null);
      setListingOccupancyReady(false);
      return;
    }
    let cancelled = false;
    setListingOccupancyReady(false);
    void fetchBookingsForSupplier(user.id)
      .then((rows) => {
        if (cancelled) return;
        setListingOccupancyBookings(rows.filter((b) => b.listing_id === editingId));
        setListingOccupancyLoadError(null);
        setListingOccupancyReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        // Keep prior occupancy; never pretend sold seats are zero.
        setListingOccupancyReady(false);
        setListingOccupancyLoadError(
          userFacingError(e, 'Could not verify sold seats for this listing. Reload before changing schedules.')
        );
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
      { id: 'practical' as StepId, label: 'Experience' },
      { id: 'information' as StepId, label: 'Information' },
      { id: 'cost_options' as StepId, label: 'Options' },
      { id: 'photos' as StepId, label: 'Photos' },
      { id: 'review' as StepId, label: 'Preview & Publish' },
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
      'Product type, place, listing language, then title and subtitle.',
      'Description, highlights, inclusions, and exclusions.',
      // Information: scene question + support already explain the task — no redundant stage blurb.
      '',
      'Create the different ways travelers can book your experience.',
      'Cover photo first, then supporting shots travelers swipe through.',
      'Review readiness, then save as draft or publish when Traverion verification allows.',
    ] as const;
  }, [form.inventoryFamily, createFamily]);

  const reviewRows = useMemo(() => {
    const photoCount = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length;
    const coverUrl = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots))[0] ?? '';
    const coverSelected = Boolean(coverUrl && !isPlaceholderListingImageUrl(coverUrl));
    const photosStepIdx = 4;
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
          missing:
            !form.city.trim() || !form.country.trim()
              ? 'Add city and country.'
              : !form.stayCheckInAddress.trim()
                ? 'Add the check-in address for booked guests.'
                : null,
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
    const placeLabel = [form.city.trim(), form.country.trim()].filter(Boolean).join(', ');
    const descReady = form.description.trim().length >= MIN_LISTING_DESCRIPTION_LENGTH;
    return [
      {
        step: 0,
        label: 'Basics',
        summary: reviewBasicsSummary(form.title, form.experienceKind, languageLabel, placeLabel),
        ready: isStepSatisfied(0, form),
        missing: !isStepSatisfied(0, form)
          ? 'Finish product type, place, listing language, title, and subtitle.'
          : null,
      },
      {
        step: 1,
        label: 'Experience',
        summary: reviewDetailsSummary(
          form.includes.map((s) => s.trim()).filter(Boolean).length,
          form.excludes.map((s) => s.trim()).filter(Boolean).length,
          descReady
        ),
        ready: isStepSatisfied(1, form),
        missing: !isStepSatisfied(1, form)
          ? 'Add description and at least two inclusions.'
          : null,
      },
      {
        step: 2,
        label: 'Information',
        summary: reviewInformationSummary(
          [
            form.knowBeforeYouGo,
            form.whatToBring,
            form.requirementsNotes,
            form.accessibilitySummary,
            form.additionalInfo,
            form.bookingContactPhoneE164,
          ].filter((s) => typeof s === 'string' && s.trim()).length +
            (form.whatToBringIds?.length ?? 0) +
            (form.notSuitableForIds?.length ?? 0) +
            (form.accessibilityFeatureIds?.length ?? 0) +
            (form.additionalLanguages?.length ?? 0)
        ),
        ready: true,
        missing: null,
      },
      {
        step: 3,
        label: 'Options',
        summary: reviewOptionsSummary(readyCount, options.length, priceSummary),
        ready: isStepSatisfied(3, form),
        missing: !isStepSatisfied(3, form)
          ? 'Add at least one complete bookable option with meeting point or pickup.'
          : null,
      },
      {
        step: 4,
        label: 'Photos',
        summary: reviewPhotosSummary(photoCount, Boolean(coverSelected && photoCount > 0)),
        ready: isStepSatisfied(4, form),
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
      // Entering Information: restore sub-scene (Options Back → last; publish focus → pending).
      if (currentForm.inventoryFamily !== 'stay' && resolved === 2 && prev !== 2) {
        const pending = infoPendingSceneRef.current;
        infoPendingSceneRef.current = null;
        const fromOptionsBack = infoEnterFromOptionsBackRef.current;
        infoEnterFromOptionsBackRef.current = false;
        const scene =
          pending != null
            ? clampTourInformationSceneIndex(pending)
            : initialTourInformationSceneIndex({
                stored: readInfoSceneFromStorage(editingId),
                farthest: readInfoFarthestFromStorage(editingId),
                enterFromOptionsBack: fromOptionsBack,
              });
        setInfoSceneIdx(scene);
        writeInfoSceneToStorage(editingId, scene);
        setInfoFarthest((far) => {
          const bumped = bumpInformationFarthest(far, scene);
          writeInfoFarthestToStorage(editingId, bumped);
          return bumped;
        });
        setInfoSceneDirection(fromOptionsBack || prev > 2 ? 'back' : 'forward');
      }
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
    const photos = 4;
    const options = stay ? 2 : 3;
    const information = 2;
    return {
      language: 0,
      title: 0,
      category: 0,
      kind: 0,
      subtitle: 0,
      city: stay ? 1 : 0,
      country: stay ? 1 : 0,
      location: stay ? 1 : 0,
      highlights: 1,
      description: 1,
      includes: 1,
      excludes: 1,
      accessibility: information,
      venue: information,
      languages: information,
      destination: 0,
      know_before: information,
      what_to_bring: information,
      requirements: information,
      additional_info: information,
      booking_contact: information,
      duration: options,
      schedule: options,
      start: options,
      price: options,
      group: options,
      tags: options,
      meeting: options,
      pickup: options,
      pickup_timing: options,
      dropoff: options,
      image: photos,
      gallery: photos,
      hero: photos,
      photos: photos,
      review: 5,
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
          normalizePhotoSlotLabels(extras.photoSlotLabels),
          normalizePhotoOriginalUrls(extras.photoOriginalUrls),
          normalizePhotoCropSettings(extras.photoCropSettings)
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
          photoOriginalUrls: packed.originals,
          photoCropSettings: packed.crops,
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
          bookingCutoffHoursBeforeStart:
            extras.bookingCutoffHoursBeforeStart && extras.bookingCutoffHoursBeforeStart > 0
              ? String(extras.bookingCutoffHoursBeforeStart)
              : '',
          departureTimezone: extras.departureTimezone?.trim() || '',
          departureTimezoneManual:
            extras.departureTimezoneManual === true ||
            Boolean(
              extras.departureTimezone?.trim() &&
                !listingTimezoneMatchesAuto(
                  existing.country ?? '',
                  existing.city ?? '',
                  extras.departureTimezone
                )
            ),
          accessibilitySummary: extras.accessibilitySummary ?? '',
          accessibilityFeatureIds: normalizeAccessibilityFeatureIds(extras.accessibilityFeatureIds),
          minGuestAge: extras.minGuestAge ?? '',
          knowBeforeYouGo: extras.knowBeforeYouGo ?? '',
          whatToBring: extras.whatToBring ?? '',
          whatToBringIds: normalizeWhatToBringIds(extras.whatToBringIds),
          requirementsNotes: extras.requirementsNotes ?? '',
          notSuitableForIds: normalizeNotSuitableForIds(extras.notSuitableForIds),
          additionalInfo: extras.additionalInfo ?? '',
          bookingContactPhoneE164: extras.bookingContactPhoneE164 ?? '',
          venueSetting: extras.venueSetting ?? 'unspecified',
          additionalLanguages: normalizeSpokenLanguageIds(extras.additionalLanguages),
          inventoryFamily: extras.inventoryFamily === 'stay' ? 'stay' : 'tour',
          stayPropertyType: extras.stay?.propertyType ?? 'Apartment',
          stayBedrooms: extras.stay?.bedrooms != null ? String(extras.stay.bedrooms) : '1',
          stayBeds: extras.stay?.beds != null ? String(extras.stay.beds) : '1',
          stayBathrooms: extras.stay?.bathrooms != null ? String(extras.stay.bathrooms) : '1',
          stayMaxGuests: extras.stay?.maxGuests != null ? String(extras.stay.maxGuests) : '4',
          stayNightly: extras.stay?.nightlyPriceUsd != null ? String(extras.stay.nightlyPriceUsd) : '',
          stayMinNights: extras.stay?.minNights != null ? String(extras.stay.minNights) : '1',
          stayCheckIn: stayFormCheckInOutFromExtras(extras.stay).stayCheckIn,
          stayCheckOut: stayFormCheckInOutFromExtras(extras.stay).stayCheckOut,
          stayAmenities: (extras.stay?.amenities ?? []).join(', '),
          stayHouseRules: extras.stay?.houseRules ?? '',
          stayCheckInAddress: extras.stay?.checkInAddress ?? '',
          stayCleaningFee: extras.stay?.cleaningFeeUsd != null ? String(extras.stay.cleaningFeeUsd) : '',
        };
        const coercedNext = coerceListingFormState(next);
        initialFormSnapshotRef.current = serializeListingFormState(coercedNext);
        const backup = readListingDraftBackup(editingId);
        const applied =
          backup && serializeListingFormState(backup) !== serializeListingFormState(coercedNext)
            ? backup
            : coercedNext;
        setForm(applied);
        setLastSavedAt(Date.now());
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

  // Auto-detect listing departure timezone from Basics location unless manually overridden.
  useEffect(() => {
    if (isStayForm || form.departureTimezoneManual) return;
    const detected = detectListingDepartureTimezone(form.country, form.city);
    if (!detected.detected) return;
    const current = resolveDepartureTimezone(form.departureTimezone || TRAVERION_DEPARTURE_TIMEZONE);
    if (current === detected.timezone) return;
    setForm((f) => {
      if (f.departureTimezoneManual) return f;
      const next = detectListingDepartureTimezone(f.country, f.city);
      if (!next.detected) return f;
      if (resolveDepartureTimezone(f.departureTimezone || TRAVERION_DEPARTURE_TIMEZONE) === next.timezone) {
        return f;
      }
      return { ...f, departureTimezone: next.timezone };
    });
  }, [form.country, form.city, form.departureTimezoneManual, form.departureTimezone, isStayForm]);

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
    const infoScene = tourInformationSceneForFocusSection(focusSection);
    if (infoScene !== null) {
      writeInfoSceneToStorage(editingId, infoScene);
      setInfoSceneIdx(infoScene);
      setInfoFarthest((far) => {
        const bumped = bumpInformationFarthest(far, infoScene);
        writeInfoFarthestToStorage(editingId, bumped);
        return bumped;
      });
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
  }, [stepIdx, basicsSceneIdx, infoSceneIdx]);

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
        setSaveFlash(null);
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [form, editingId]);

  useDialogFocus(leaveConfirmOpen, leaveDialogRef, () => {
    if (draftCloseBusy || submitting) return;
    setDraftCloseError(null);
    setLeaveConfirmOpen(false);
  });

  useEffect(() => {
    /**
     * Background flush: local backup always; server persist only when dirty.
     * Never force `draft` onto a published listing (would unpublish on tab hide).
     */
    const persist = () => {
      if (serializeListingFormState(form) === initialFormSnapshotRef.current) return;
      writeListingDraftBackup(editingId, form);
      if (!enableDraftOnClose) return;
      if (form.status === 'published') {
        const listing = buildListingFromForm({ ...form, status: 'published' }, editingId ?? undefined);
        void Promise.resolve(onSave(listing)).then((result) => {
          if (!result.success) return;
          initialFormSnapshotRef.current = serializeListingFormState(formRef.current);
          setLastSavedAt(Date.now());
        });
        return;
      }
      if (!onSaveDraft) return;
      const listing = normalizeListingForDraftSave(
        buildListingFromForm({ ...form, status: 'draft' }, editingId ?? undefined)
      );
      void onSaveDraft(listing).then((ok) => {
        if (!ok) return;
        initialFormSnapshotRef.current = serializeListingFormState(formRef.current);
        setLastSavedAt(Date.now());
      });
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
  }, [form, editingId, enableDraftOnClose, onSaveDraft, onSave]);

  const publishBlockersPreview = useMemo(() => {
    const asPublished = buildListingFromForm({ ...form, status: 'published' }, editingId ?? undefined);
    return getListingPublishBlockers(asPublished);
  }, [form, editingId]);

  const jumpToPublishBlocker = useCallback(
    (line: string) => {
      const t = line.toLowerCase();
      const step = publishBlockerListingWizardStep(line, isStayForm);
      setStepIdxPersisted(step);
      if (step === 0 && !isStayForm) {
        const scene = /subtitle|title|language/.test(t) ? 1 : /descri|highlight/.test(t) ? 2 : 0;
        setBasicsSceneIdxPersisted(scene, 'forward');
      }
      if (step === 2 && !isStayForm) {
        let infoScene = 2;
        if (/know before|what to bring/.test(t)) infoScene = 0;
        else if (/accessib|not suitable|conflicts with/.test(t) && !/additional information/.test(t)) {
          infoScene = 1;
        } else if (/booking contact|phone number|additional information|spoken language/.test(t)) {
          infoScene = 2;
        }
        infoPendingSceneRef.current = infoScene;
        setInfoSceneIdxPersisted(infoScene, 'forward');
        window.setTimeout(() => {
          const el = document.getElementById(
            /booking contact|phone number/.test(t)
              ? 'supplier-listing-field-booking-contact'
              : /know before/.test(t)
                ? 'supplier-listing-field-know-before'
                : /what to bring/.test(t)
                  ? 'supplier-listing-field-what-to-bring'
                  : /additional information/.test(t)
                    ? 'supplier-listing-field-additional-info'
                    : /accessib|conflicts/.test(t)
                      ? 'supplier-listing-field-accessibility'
                      : 'supplier-listing-field-requirements'
          );
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = el?.querySelector<HTMLElement>('input,textarea,button');
          focusable?.focus();
        }, 80);
      }
    },
    [isStayForm, setStepIdxPersisted, setBasicsSceneIdxPersisted, setInfoSceneIdxPersisted]
  );

  const bookingContactPhoneError = useMemo(() => {
    if (!publishBlockers?.length) return null;
    const hit = publishBlockers.find((b) => /booking contact|phone number|international phone/i.test(b));
    return hit ?? null;
  }, [publishBlockers]);

  const publishButtonTitle = useMemo(() => {
    if (!canPostNewListing) {
      return 'Business and payout verification (IBAN + BIC) required — see Settings.';
    }
    if (publishBlockersPreview.length > 0) {
      return publishBlockersPreview[0];
    }
    return 'Publish this listing on Traverion for travelers to book.';
  }, [canPostNewListing, publishBlockersPreview]);

  const finishCloseEditor = useCallback(
    (opts?: { animated?: boolean }) => {
      if (shellExiting) return;
      setLeaveConfirmOpen(false);
      clearWizardStepStorage(editingId, form.inventoryFamily === 'stay');
      const preferMotion =
        typeof window !== 'undefined' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const animated = opts?.animated !== false && preferMotion;
      if (!animated) {
        if (shellExitTimerRef.current != null) {
          window.clearTimeout(shellExitTimerRef.current);
          shellExitTimerRef.current = null;
        }
        onCancel();
        return;
      }
      setShellExiting(true);
      if (shellExitTimerRef.current != null) window.clearTimeout(shellExitTimerRef.current);
      shellExitTimerRef.current = window.setTimeout(() => {
        shellExitTimerRef.current = null;
        onCancel();
      }, 380);
    },
    [editingId, form.inventoryFamily, onCancel, shellExiting]
  );

  useEffect(() => {
    return () => {
      if (shellExitTimerRef.current != null) {
        window.clearTimeout(shellExitTimerRef.current);
        shellExitTimerRef.current = null;
      }
    };
  }, []);

  const handleCloseIntent = useCallback(() => {
    if (closeIntentRunningRef.current || submitting || draftCloseBusy || shellExiting) return;
    setDraftCloseError(null);
    if (isDirty()) {
      setLeaveConfirmOpen(true);
      return;
    }
    finishCloseEditor({ animated: true });
  }, [submitting, draftCloseBusy, shellExiting, isDirty, finishCloseEditor]);

  const leaveWithoutSaving = useCallback(() => {
    if (closeIntentRunningRef.current || submitting || draftCloseBusy || shellExiting) return;
    finishCloseEditor({ animated: true });
  }, [submitting, draftCloseBusy, shellExiting, finishCloseEditor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (leaveConfirmOpen) {
        e.preventDefault();
        e.stopPropagation();
        setLeaveConfirmOpen(false);
        return;
      }
      if (scheduleDraftRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setScheduleLeaveOpen(true);
        return;
      }
      if (optionModalOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        // Match backdrop / Back to options — never discard unsaved option work on Escape.
        saveOptionAsDraftRef.current();
        return;
      }
      e.preventDefault();
      handleCloseIntent();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleCloseIntent, leaveConfirmOpen]);

  const runSubmit = useCallback(
    async (
      targetStatus: 'draft' | 'published',
      opts?: { bypassLastStepArm?: boolean; closeOnSuccess?: boolean }
    ): Promise<boolean> => {
      if (submitInFlightRef.current) return false;
      const last = steps.length - 1;
      // Draft saves are always armed — only Publish/Save-changes needs the last-step click guard.
      if (
        targetStatus === 'published' &&
        stepIdx === last &&
        !lastStepSubmitArmed &&
        !opts?.bypassLastStepArm
      ) {
        return false;
      }

      submitInFlightRef.current = true;
      try {
        const listing = buildListingFromForm({ ...form, status: targetStatus }, editingId ?? undefined);
        if (targetStatus === 'published') {
          if (!canPostNewListing) {
            const msg =
              'Publishing needs Traverion to verify your business and your payout (IBAN + BIC). Finish both in Settings, then try again.';
            setPublishBlockers(null);
            if (opts?.closeOnSuccess) {
              setDraftCloseError(msg);
              setLeaveConfirmOpen(true);
            } else {
              setSubmitError(msg);
              setSaveFlash(null);
            }
            return false;
          }
          const blockers = getListingPublishBlockers(listing);
          if (blockers.length > 0) {
            setPublishBlockers(blockers);
            setSaveFlash(null);
            const first = blockers[0];
            if (first) jumpToPublishBlocker(first);
            if (opts?.closeOnSuccess) {
              setDraftCloseError(first ?? 'Finish the remaining listing details before saving.');
              setLeaveConfirmOpen(true);
            } else {
              setSubmitError(null);
            }
            return false;
          }
        }
        setPublishBlockers(null);
        setSubmitError(null);
        setDraftCloseError(null);
        setSaveFlash(null);
        setSubmitting(true);
        try {
          const result = await onSave(listing);
          if (!result.success) {
            const msg = userFacingError(result.error, 'Could not save your listing. Please try again.');
            if (opts?.closeOnSuccess) {
              setDraftCloseError(msg);
              setLeaveConfirmOpen(true);
            } else {
              setSubmitError(msg);
            }
            return false;
          }
          if (result.listingId && result.listingId !== editingId) {
            migrateListingEditorStorage(editingId, result.listingId, form.inventoryFamily === 'stay');
          }
          // Sync local status to what the server just accepted (publish must not leave UI as draft).
          const synced: ListingFormState = { ...form, status: targetStatus };
          setForm(synced);
          initialFormSnapshotRef.current = serializeListingFormState(synced);
          setLastSavedAt(Date.now());
          setSaveFlash(targetStatus === 'published' ? 'published' : 'draft');
          if (opts?.closeOnSuccess) {
            clearListingDraftBackup(editingId);
            finishCloseEditor({ animated: true });
          }
          return true;
        } finally {
          setSubmitting(false);
        }
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [
      form,
      editingId,
      onSave,
      stepIdx,
      lastStepSubmitArmed,
      steps.length,
      canPostNewListing,
      jumpToPublishBlocker,
      finishCloseEditor,
    ]
  );

  /**
   * Published listings have no draft path — leave dialog must still persist edits.
   * Reuses runSubmit('published') so leave-save cannot invent a different status contract.
   * Draft leave uses leaveAndSaveDraft (status stays draft).
   */
  const leaveAndSavePublished = useCallback(async () => {
    if (closeIntentRunningRef.current || submitting || draftCloseBusy) return;
    if (form.status !== 'published') return;
    closeIntentRunningRef.current = true;
    setDraftCloseBusy(true);
    setDraftCloseError(null);
    try {
      const ok = await runSubmit('published', { bypassLastStepArm: true, closeOnSuccess: true });
      if (!ok) setLeaveConfirmOpen(true);
    } catch (e) {
      setDraftCloseError(userFacingError(e, 'Could not save your listing. Please try again.'));
      setLeaveConfirmOpen(true);
    } finally {
      setDraftCloseBusy(false);
      closeIntentRunningRef.current = false;
    }
  }, [submitting, draftCloseBusy, form.status, runSubmit]);

  const leaveAndSaveDraft = useCallback(async () => {
    if (closeIntentRunningRef.current || submitting || draftCloseBusy) return;
    if (form.status === 'published') return;
    setDraftCloseError(null);
    closeIntentRunningRef.current = true;
    setDraftCloseBusy(true);
    try {
      const listing = normalizeListingForDraftSave(
        buildListingFromForm({ ...form, status: 'draft' }, editingId ?? undefined)
      );
      // Prefer onSaveDraft (same contract as background flush). Fall back to onSave.
      if (onSaveDraft) {
        const ok = await onSaveDraft(listing);
        if (!ok) {
          setDraftCloseError('Could not save your draft. Check your connection and try again.');
          setLeaveConfirmOpen(true);
          return;
        }
      } else {
        const result = await Promise.resolve(onSave(listing));
        if (!result.success) {
          setDraftCloseError(
            userFacingError(result.error, 'Could not save your draft. Please try again.')
          );
          setLeaveConfirmOpen(true);
          return;
        }
        if (result.listingId && result.listingId !== editingId) {
          migrateListingEditorStorage(editingId, result.listingId, form.inventoryFamily === 'stay');
        }
      }
      clearListingDraftBackup(editingId);
      initialFormSnapshotRef.current = serializeListingFormState(formRef.current);
      setLastSavedAt(Date.now());
      finishCloseEditor({ animated: true });
    } catch (e) {
      setDraftCloseError(userFacingError(e, 'Could not save your draft. Please try again.'));
      setLeaveConfirmOpen(true);
    } finally {
      setDraftCloseBusy(false);
      closeIntentRunningRef.current = false;
    }
  }, [
    submitting,
    draftCloseBusy,
    onSaveDraft,
    onSave,
    form,
    editingId,
    finishCloseEditor,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSubmit(form.status === 'published' ? 'published' : 'draft');
  };

  const removeBookingOption = useCallback(
    (optionId: string) => {
      if (editingId && (!listingOccupancyReady || listingOccupancyLoadError)) {
        return;
      }
      if (editingId && listingOccupancyReady) {
        const sold = occupyingGuestsForBookingOption({
          bookings: listingOccupancyBookings,
          listingId: editingId,
          optionId,
        });
        // Phase 1110: refuse option delete while purchased seats remain on any slot.
        if (sold >= 1) {
          return;
        }
      }
      setForm((f) => ({ ...f, bookingOptions: f.bookingOptions.filter((o) => o.id !== optionId) }));
      setOptionPendingDeleteId(null);
    },
    [editingId, listingOccupancyReady, listingOccupancyLoadError, listingOccupancyBookings]
  );

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
    pendingScheduleActionRef.current = null;
    writeOptionEditorUrl(null, 'replace');
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
      const next = clampTourOptionSceneIndex(index);
      setOptionSceneIdx(next);
      writeOptionEditorUrl(
        {
          optionId: optionEditorUrlId(draft.id, optionSessionOpenedAsCreateRef.current),
          sceneIndex: next,
        },
        'replace'
      );
    },
    [optionModalDraft, optionEndingState]
  );

  const openOptionModalCreate = useCallback((historyMode: 'push' | 'replace' | 'none' = 'push') => {
    optionSessionOpenedAsCreateRef.current = true;
    pendingScheduleActionRef.current = null;
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
    if (historyMode !== 'none') {
      writeOptionEditorUrl({ optionId: OPTION_EDITOR_NEW_ID, sceneIndex: 0 }, historyMode);
    }
  }, []);

  const openOptionModalEdit = useCallback(
    (id: string, opts?: OpenOptionEditOptions, historyMode: 'push' | 'replace' | 'none' = 'push') => {
      const opt = form.bookingOptions.find((o) => o.id === id);
      if (!opt) return;
      optionSessionOpenedAsCreateRef.current = false;
      pendingScheduleActionRef.current = opts?.action ?? null;
      const sceneIndex = clampTourOptionSceneIndex(opts?.sceneIndex ?? 0);
      setOptionModalEditingId(id);
      setOptionModalDraft(
        ensureExplicitSchedules(
          normalizeListingBookingOption({ ...(opt as unknown as Record<string, unknown>) }, opt.id)
        )
      );
      setOptionModalErrors([]);
      setOptionModalHasEndingDate(opt.availabilityDateTo.trim().length > 0);
      setOptionSceneIdx(sceneIndex);
      setOptionSceneDirection('forward');
      setOptionLockHint(null);
      setOptionAttempted(false);
      setScheduleDraft(null);
      setOptionModalOpen(true);
      if (historyMode !== 'none') {
        writeOptionEditorUrl({ optionId: id, sceneIndex }, historyMode);
      }
    },
    [form.bookingOptions]
  );

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
      const prepared = ensureExplicitSchedules(optionModalDraft);
      const aligned = normalizeScheduleToOptionChargeModel(schedule, optionModalDraft);
      const existed = (prepared.schedules ?? []).some((s) => s.id === aligned.id);
      if (!existed) {
        const addGate = canAddOptionSchedule(prepared);
        if (!addGate.ok) {
          setScheduleSaveError(addGate.reason);
          setOptionLockHint(addGate.reason);
          return optionModalDraft;
        }
      }
      const next = upsertOptionSchedule(prepared, aligned);
      if (!existed && !(next.schedules ?? []).some((s) => s.id === aligned.id)) {
        const msg = canAddOptionSchedule(prepared).reason ?? 'Couldn’t add another schedule.';
        setScheduleSaveError(msg);
        setOptionLockHint(msg);
        return optionModalDraft;
      }
      setOptionModalDraft(next);
      if (persist) persistOptionDraftToForm(next);
      return next;
    },
    [optionModalDraft, persistOptionDraftToForm]
  );

  const openScheduleCreate = useCallback(() => {
    if (!optionModalDraft || addScheduleLockRef.current) return;
    const prereq = bookingOptionSchedulePrereqIssues(optionModalDraft);
    if (prereq.length > 0) {
      // Go to Setup and keep the reason visible (setOptionSceneIdxPersisted would clear the hint).
      setOptionSceneDirection('back');
      setOptionSceneIdx(0);
      setOptionLockHint(scheduleBlockedExplanation(prereq));
      setOptionAttempted(true);
      window.setTimeout(() => {
        focusListingField(
          optionModalDraft.chargeModel !== 'per_person' && optionModalDraft.chargeModel !== 'flat_group'
            ? 'supplier-listing-field-option-charge-model'
            : 'supplier-listing-field-option-start-mode'
        );
      }, 80);
      return;
    }
    const addGate = canAddOptionSchedule(ensureExplicitSchedules(optionModalDraft));
    if (!addGate.ok) {
      setOptionLockHint(addGate.reason);
      return;
    }
    addScheduleLockRef.current = true;
    window.setTimeout(() => {
      addScheduleLockRef.current = false;
    }, 400);
    // Materialize explicit schedules for overlap checks, but do not upsert the blank
    // until the first save — cancel must not leave an empty orphan schedule.
    const prepared = ensureExplicitSchedules(optionModalDraft);
    if (prepared !== optionModalDraft) setOptionModalDraft(prepared);
    const blank = blankOptionSchedule(newListingOptionScheduleId());
    // Slot inventory comes from the option; booking min/max are set on the schedule.
    blank.minPersons = 1;
    blank.maxPersons = 0;
    if (optionModalDraft.maxSpotsPerSlot >= 1) {
      blank.maxSpotsPerSlot = optionModalDraft.maxSpotsPerSlot;
    }
    const wholeGroup =
      optionModalDraft.chargeModel === 'flat_group' ||
      Boolean(optionModalDraft.isPrivate && optionModalDraft.privatePricing === 'flat_group');
    if (wholeGroup) blank.maxGroupsPerSlot = 1;
    scheduleSessionOpenedAsCreateRef.current = true;
    scheduleOpenedStartTimeRef.current = '';
    scheduleSoldSeatAnchorRef.current = null;
    scheduleSnapshotRef.current = JSON.stringify(blank);
    setScheduleDraft(blank);
    setScheduleSceneIdx(0);
    setScheduleHasEndingDate(false);
    setScheduleAttempted(false);
    setSchedulePersistLabel(null);
    setScheduleSaveError(null);
    setScheduleLeaveOpen(false);
  }, [optionModalDraft]);

  const openScheduleEdit = useCallback(
    (scheduleId: string) => {
      if (!optionModalDraft) return;
      const prepared = ensureExplicitSchedules(optionModalDraft);
      const rows = prepared.schedules ?? [];
      // Implicit schedule ids (`${optionId}-implicit`) are remapped to new UUIDs by
      // ensureExplicitSchedules — resolve the remapped row so Finish schedule still opens.
      let existing = rows.find((s) => s.id === scheduleId);
      if (!existing && isImplicitScheduleId(scheduleId) && rows.length === 1) {
        existing = rows[0];
      }
      if (!existing && isImplicitScheduleId(scheduleId) && rows.length > 0) {
        existing = rows.find((s) => s.status === 'draft') ?? rows[0];
      }
      if (!existing) return;
      scheduleSessionOpenedAsCreateRef.current = false;
      // Phase 1109: lock sold-seat anchor to the first open of this schedule id.
      if (scheduleSoldSeatAnchorRef.current?.id !== existing.id) {
        scheduleSoldSeatAnchorRef.current = {
          id: existing.id,
          startTimeHm: existing.startTime ?? '',
        };
      }
      scheduleOpenedStartTimeRef.current = scheduleSoldSeatAnchorRef.current.startTimeHm;
      const synced =
        prepared.maxSpotsPerSlot >= 1 && existing.maxSpotsPerSlot !== prepared.maxSpotsPerSlot
          ? { ...existing, maxSpotsPerSlot: prepared.maxSpotsPerSlot }
          : existing;
      scheduleSnapshotRef.current = JSON.stringify(synced);
      setOptionModalDraft(prepared);
      setScheduleDraft(synced);
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
      const prepared = ensureExplicitSchedules(optionModalDraft);
      const addGate = canAddOptionSchedule(prepared);
      if (!addGate.ok) {
        setOptionLockHint(addGate.reason);
        return;
      }
      addScheduleLockRef.current = true;
      window.setTimeout(() => {
        addScheduleLockRef.current = false;
      }, 400);
      const rows = prepared.schedules ?? [];
      let source = rows.find((s) => s.id === scheduleId);
      if (!source && isImplicitScheduleId(scheduleId) && rows.length === 1) {
        source = rows[0];
      }
      if (!source && isImplicitScheduleId(scheduleId) && rows.length > 0) {
        source = rows.find((s) => s.status === 'draft') ?? rows[0];
      }
      if (!source) return;
      // Editable draft copy — not upserted until Save draft / Finish (cancel leaves no orphan).
      const copy = normalizeScheduleToOptionChargeModel(
        duplicateOptionSchedule(source, newListingOptionScheduleId()),
        prepared
      );
      if (prepared.maxSpotsPerSlot >= 1) {
        copy.maxSpotsPerSlot = prepared.maxSpotsPerSlot;
      }
      copy.status = 'draft';
      scheduleSessionOpenedAsCreateRef.current = true;
      scheduleOpenedStartTimeRef.current = '';
      scheduleSoldSeatAnchorRef.current = null;
      scheduleSnapshotRef.current = JSON.stringify(copy);
      if (prepared !== optionModalDraft) setOptionModalDraft(prepared);
      setScheduleDraft(copy);
      setScheduleSceneIdx(0);
      setScheduleHasEndingDate(copy.availabilityDateTo.trim().length > 0);
      setScheduleAttempted(false);
      setSchedulePersistLabel(null);
      setScheduleSaveError(null);
      setScheduleLeaveOpen(false);
      setOptionLockHint(null);
    },
    [optionModalDraft]
  );

  const deleteSchedule = useCallback(
    (scheduleId: string) => {
      if (!optionModalDraft) return;
      if (editingId && (!listingOccupancyReady || listingOccupancyLoadError)) {
        setScheduleSaveError(
          listingOccupancyLoadError ??
            'Sold seats are still loading. Wait a moment, then try again.'
        );
        return;
      }
      if (editingId && listingOccupancyReady) {
        const prepared = ensureExplicitSchedules(optionModalDraft);
        const schedulesAfter = (prepared.schedules ?? []).filter((s) => s.id !== scheduleId);
        // Phase 1110: refuse deletes that abandon an occupied purchased wall-clock.
        const abandoned = schedulePersistAbandonsOccupiedSlot({
          bookings: listingOccupancyBookings,
          listingId: editingId,
          optionId: optionModalDraft.id,
          schedulesAfterPersist: schedulesAfter,
        });
        if (abandoned) {
          setScheduleSaveError(abandoned);
          setPendingScheduleDeleteId(null);
          return;
        }
      }
      if (pendingScheduleDeleteId !== scheduleId) {
        setPendingScheduleDeleteId(scheduleId);
        return;
      }
      const next = removeOptionSchedule(ensureExplicitSchedules(optionModalDraft), scheduleId);
      setOptionModalDraft(next);
      persistOptionDraftToForm(next);
      setPendingScheduleDeleteId(null);
      if (scheduleSoldSeatAnchorRef.current?.id === scheduleId) {
        scheduleSoldSeatAnchorRef.current = null;
        scheduleOpenedStartTimeRef.current = '';
      }
    },
    [
      optionModalDraft,
      pendingScheduleDeleteId,
      persistOptionDraftToForm,
      listingOccupancyLoadError,
      listingOccupancyReady,
      listingOccupancyBookings,
      editingId,
    ]
  );

  const persistScheduleDraft = useCallback(
    (schedule: ListingOptionSchedule) => {
      if (editingId && optionModalDraft && !scheduleSessionOpenedAsCreateRef.current) {
        if (!listingOccupancyReady || listingOccupancyLoadError) {
          setScheduleSaveError(
            listingOccupancyLoadError ??
              'Sold seats are still loading. Wait a moment, then try again.'
          );
          return false;
        }
        const prepared = ensureExplicitSchedules(optionModalDraft);
        const schedulesAfter = upsertOptionSchedule(prepared, schedule).schedules ?? [];
        // Phase 1109: refuse draft/ready persists that abandon an occupied wall-clock
        // (blocks draft-save + reopen bypass of the Phase 1100 move hard-block).
        const abandoned = schedulePersistAbandonsOccupiedSlot({
          bookings: listingOccupancyBookings,
          listingId: editingId,
          optionId: optionModalDraft.id,
          schedulesAfterPersist: schedulesAfter,
        });
        if (abandoned) {
          setScheduleSaveError(abandoned);
          return false;
        }
        const previousStart =
          scheduleSoldSeatAnchorRef.current?.id === schedule.id
            ? scheduleSoldSeatAnchorRef.current.startTimeHm
            : scheduleOpenedStartTimeRef.current;
        const occupyingPrevious = occupyingGuestsForOptionDeparture({
          bookings: listingOccupancyBookings,
          listingId: editingId,
          optionId: optionModalDraft.id,
          startTimeHm: previousStart,
        });
        const moveBlocked = scheduleDepartureTimeMoveBlockReason({
          previousStartTimeHm: previousStart,
          nextStartTimeHm: schedule.startTime,
          occupyingGuestsOnPrevious: occupyingPrevious,
        });
        if (moveBlocked) {
          setScheduleSaveError(moveBlocked);
          return false;
        }
      }
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
    [
      applyScheduleToOptionDraft,
      editingId,
      optionModalDraft,
      listingOccupancyReady,
      listingOccupancyLoadError,
      listingOccupancyBookings,
    ]
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
        option: optionModalDraft ?? undefined,
      });
      if (!allowed) {
        setScheduleAttempted(true);
        focusListingField(
          firstScheduleIssueFocusId(scheduleDraft, {
            startMode: optionModalDraft?.startMode,
            option: optionModalDraft ?? undefined,
          })
        );
        return;
      }
      setScheduleSceneIdx(clampTourScheduleSceneIndex(index));
      setScheduleAttempted(false);
    },
    [scheduleDraft, optionModalDraft]
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
      focusListingField(
        firstScheduleIssueFocusId(scheduleDraft, {
          startMode: optionModalDraft.startMode,
          option: optionModalDraft,
        })
      );
      return;
    }
    persistScheduleDraft({ ...scheduleDraft, status: 'draft' });
    setScheduleSceneIdx(nextTourScheduleScene(scheduleSceneIdx));
  }, [scheduleDraft, optionModalDraft, scheduleSceneIdx, persistScheduleDraft]);

  const saveScheduleReady = useCallback(() => {
    if (!scheduleDraft || !optionModalDraft || scheduleSaveLockRef.current) return;
    const ready = { ...scheduleDraft, status: 'ready' as const };
    const gate = scheduleCanSaveReady(ready, optionModalDraft);
    if (!gate.ok) {
      setScheduleAttempted(true);
      setScheduleSaveError(gate.error);
      focusListingField(
        firstScheduleIssueFocusId(ready, {
          startMode: optionModalDraft.startMode,
          option: optionModalDraft,
        })
      );
      return;
    }
    scheduleSaveLockRef.current = true;
    window.setTimeout(() => {
      scheduleSaveLockRef.current = false;
    }, 600);
    if (editingId) {
      if (!listingOccupancyReady || listingOccupancyLoadError) {
        setScheduleSaveError(
          listingOccupancyLoadError ??
            'Sold seats are still loading. Wait a moment, then try again.'
        );
        return;
      }
      const previousStart = scheduleOpenedStartTimeRef.current;
      const occupyingPrevious = occupyingGuestsForOptionDeparture({
        bookings: listingOccupancyBookings,
        listingId: editingId,
        optionId: optionModalDraft.id,
        startTimeHm: previousStart,
      });
      // Phase 1100: sold seats stay on the purchased wall-clock — refuse startTime
      // moves that would open a second full-capacity marketing departure.
      const moveBlocked = scheduleDepartureTimeMoveBlockReason({
        previousStartTimeHm: previousStart,
        nextStartTimeHm: ready.startTime,
        occupyingGuestsOnPrevious: occupyingPrevious,
      });
      if (moveBlocked) {
        setScheduleSaveError(moveBlocked);
        return;
      }
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
      if (
        underSold &&
        typeof window !== 'undefined' &&
        !window.confirm(`${underSold}\n\nSave this schedule anyway?`)
      ) {
        return;
      }
    }
    if (!persistScheduleDraft(ready)) return;
    setScheduleDraft(null);
    setScheduleLeaveOpen(false);
    scheduleSessionOpenedAsCreateRef.current = false;
  }, [scheduleDraft, optionModalDraft, persistScheduleDraft, editingId, listingOccupancyBookings, listingOccupancyLoadError, listingOccupancyReady]);

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

  // Option-card CTAs ("Add schedule" / "Finish schedule") open the option sheet, then the schedule editor.
  useEffect(() => {
    const action = pendingScheduleActionRef.current;
    if (!action || !optionModalOpen || !optionModalDraft || scheduleDraft) return;
    pendingScheduleActionRef.current = null;
    if (action.kind === 'add_schedule') openScheduleCreate();
    else openScheduleEdit(action.scheduleId);
  }, [optionModalOpen, optionModalDraft, scheduleDraft, openScheduleCreate, openScheduleEdit]);

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

  saveOptionAsDraftRef.current = saveOptionAsDraft;

  const optionUrlRestoredRef = useRef(false);
  const openOptionModalCreateRef = useRef(openOptionModalCreate);
  const openOptionModalEditRef = useRef(openOptionModalEdit);
  openOptionModalCreateRef.current = openOptionModalCreate;
  openOptionModalEditRef.current = openOptionModalEdit;

  // Refresh recovery: reopen the full-screen option editor from ?option=&optionScene=
  useEffect(() => {
    if (isStayForm || optionUrlRestoredRef.current) return;
    const state = readOptionEditorUrl();
    if (!state) {
      optionUrlRestoredRef.current = true;
      return;
    }
    if (state.optionId !== OPTION_EDITOR_NEW_ID) {
      const exists = form.bookingOptions.some((o) => o.id === state.optionId);
      if (!exists) {
        // Options may still be hydrating for an existing listing.
        if (editingId && form.bookingOptions.length === 0) return;
        optionUrlRestoredRef.current = true;
        writeOptionEditorUrl(null, 'replace');
        return;
      }
    }
    optionUrlRestoredRef.current = true;
    setStepIdxPersisted(3);
    if (state.optionId === OPTION_EDITOR_NEW_ID) {
      openOptionModalCreateRef.current('none');
      return;
    }
    openOptionModalEditRef.current(state.optionId, { sceneIndex: state.sceneIndex }, 'none');
  }, [isStayForm, editingId, form.bookingOptions, setStepIdxPersisted]);

  // Browser Back/Forward: keep the option editor in sync with the URL.
  useEffect(() => {
    if (isStayForm) return;
    const onPopState = () => {
      const state = readOptionEditorUrl();
      if (!state) {
        if (optionModalOpenRef.current) {
          saveOptionAsDraftRef.current();
        }
        return;
      }
      setStepIdxPersisted(3);
      if (state.optionId === OPTION_EDITOR_NEW_ID) {
        if (!optionModalOpenRef.current || !optionSessionOpenedAsCreateRef.current) {
          openOptionModalCreateRef.current('none');
        } else {
          setOptionSceneIdx(clampTourOptionSceneIndex(state.sceneIndex));
        }
        return;
      }
      openOptionModalEditRef.current(state.optionId, { sceneIndex: state.sceneIndex }, 'none');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isStayForm, setStepIdxPersisted]);

  const tourOptionGuided = Boolean(optionModalOpen && optionModalDraft && !isStayForm);
  const optionEnding = { hasEndingDate: optionModalHasEndingDate };
  // Only surface footer hints after Continue/Finish is attempted — avoid permanent "still needed" noise.
  const optionContinueHint =
    tourOptionGuided && optionModalDraft && optionAttempted
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
  const tourInformationGuided = !isStayForm && stepIdx === 2;
  const canContinueBasicsScene = canAdvanceTourBasicsScene(basicsSceneIdx, form);
  const canContinueInfoScene = canAdvanceTourInformationScene(infoSceneIdx);
  const tourBasicsContinueHint = !canContinueBasicsScene
    ? basicsSceneIdx === 0 && !isTourProductTypeSatisfied(form)
      ? 'Choose a product type to continue.'
      : basicsSceneIdx === 1 && !isTourLocationSatisfied(form)
        ? 'Add listing language, country, and city to continue.'
        : basicsSceneIdx === 2 && !isTourIdentitySatisfied(form)
          ? form.title.trim().length > 0 && form.title.trim().length < MIN_LISTING_TITLE_LENGTH
            ? `Title needs at least ${MIN_LISTING_TITLE_LENGTH} characters to continue.`
            : form.title.trim().length > MAX_LISTING_TITLE_LENGTH
              ? `Title must be ${MAX_LISTING_TITLE_LENGTH} characters or fewer to continue.`
              : 'Add a title and subtitle to continue.'
          : listingCreationContinueHint({
              stepIndex: 0,
              isStay: false,
              canContinue: false,
            })
    : null;

  // Specific "what is missing" line for tour steps after Basics (falls back to the generic requirement).
  const specificTourContinueHint = (() => {
    if (isStayForm || stepIdx === 0 || canContinueStep()) return null;
    if (stepIdx === 1) {
      return listingCreationMissingHint(
        tourDetailsMissingItems({
          includeCount: form.includes.filter((line) => line.trim()).length,
          excludeCount: form.excludes.filter((line) => line.trim()).length,
          descriptionLength: form.description.trim().length,
          minDescriptionLength: MIN_LISTING_DESCRIPTION_LENGTH,
        })
      );
    }
    if (stepIdx === 2) return null;
    if (stepIdx === 3) {
      const active = materializedBookingOptions(form.bookingOptions);
      if (active.length === 0) return 'To continue: add a bookable option and finish it.';
      const ready = readyBookingOptions(active, optionValidationMessages);
      if (optionsWithFulfillment(ready).length === 0) {
        const withoutMeet = ready.find(
          (o) => o.fulfillment !== 'pickup' && o.fulfillment !== 'meeting_point'
        );
        if (withoutMeet) {
          return `To continue: choose meeting point or pickup on “${withoutMeet.name.trim() || 'Untitled option'}”.`;
        }
        const blocked = active.find((o) => tourOptionReadiness(o, optionValidationMessages(o)) !== 'ready');
        const first = blocked ? optionValidationMessages(blocked)[0] : null;
        if (blocked && first) {
          return `To continue: finish “${blocked.name.trim() || 'Untitled option'}” — ${first.replace(/\.$/, '').replace(/^Add /, 'add ')}.`;
        }
        return 'To continue: finish a bookable option with meeting point or pickup.';
      }
      return null;
    }
    if (stepIdx === 4) {
      return listingCreationMissingHint(
        photosMissingItems({
          photoCount: orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length,
          minPhotos: LISTING_PHOTO_MIN,
          isNewCreation: sessionOpenedAsCreateRef.current === true,
          photosPublishReady: listingPhotosReadyToPublish(form),
        })
      );
    }
    return null;
  })();

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
    summaryForIndex: (idx) => {
      const row = reviewRows.find((r) => r.step === idx);
      if (!row) return null;
      if (row.ready) return row.summary;
      return row.missing;
    },
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
        className={`absolute inset-0 z-0 bg-slate-900/35 backdrop-blur-md supports-[backdrop-filter]:bg-slate-900/25 cursor-pointer border-0 p-0 ${
          shellExiting
            ? 'listing-creation-backdrop--exit'
            : 'motion-safe:animate-fade-in'
        }`}
        aria-label={form.inventoryFamily === 'stay' || createFamily === 'stay' ? 'Close stay editor' : 'Close tour editor'}
        onClick={() => handleCloseIntent()}
        disabled={shellExiting}
      />
      <div className="relative z-10 flex h-full min-h-0 w-full flex-1 flex-col justify-stretch px-0 py-0">
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
          className={`relative flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-white shadow-none h-full rounded-none motion-reduce:animate-none ${
            shellExiting
              ? 'listing-creation-shell--exit'
              : 'listing-creation-shell--enter'
          }`}
          aria-busy={shellExiting || undefined}
        >
        <ListingCreationWorkspace
          title={creationTitle}
          titleId="supplier-listing-editor-title"
          persistLabel={persistLabel}
          progressCopy={creationProgressCopy}
          items={creationNavItems}
          navLabel={creationNavLabel}
          currentLabel={steps[stepIdx].label}
          onSelectIndex={(idx) => {
            if (tourOptionGuided) saveOptionAsDraft();
            setStepIdxPersisted(idx);
          }}
          onExit={() => handleCloseIntent()}
          exitDisabled={draftCloseBusy || submitting || shellExiting}
          exitBusy={draftCloseBusy || shellExiting}
          contextNav={null}
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
              {saveFlash === 'draft' ? (
                <div className="shrink-0 px-4 pt-3 sm:px-8 lg:px-12" role="status">
                  <NoticeCallout title="Draft saved" tone="success">
                    Your progress is on the server. You can leave and reopen this listing anytime.
                  </NoticeCallout>
                </div>
              ) : null}
              {saveFlash === 'published' ? (
                <div className="shrink-0 px-4 pt-3 sm:px-8 lg:px-12" role="status">
                  <NoticeCallout title="Published" tone="success">
                    This listing is live for travelers. Availability and pricing match what you saved.
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
            <div className="listing-creation-footer-actions flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="order-2 flex gap-2 sm:order-1 sm:contents">
                <button
                  type="button"
                  onClick={() => {
                    if (tourBasicsGuided && basicsSceneIdx > 0) {
                      setBasicsSceneIdxPersisted(previousTourBasicsScene(basicsSceneIdx), 'back');
                      return;
                    }
                    if (tourInformationGuided && infoSceneIdx > 0) {
                      setInfoSceneIdxPersisted(previousTourInformationScene(infoSceneIdx), 'back');
                      return;
                    }
                    if (stepIdx === 3 && !isStayForm) {
                      infoEnterFromOptionsBackRef.current = true;
                    }
                    setStepIdxPersisted((s) => Math.max(0, s - 1));
                  }}
                  disabled={
                    (tourBasicsGuided
                      ? basicsSceneIdx === 0
                      : tourInformationGuided
                        ? false
                        : stepIdx === 0) ||
                    draftCloseBusy ||
                    submitting
                  }
                  className="touch-manipulation tv-btn-ghost !min-h-12 flex-1 sm:!min-h-11 sm:w-auto sm:flex-none disabled:opacity-50"
                >
                  Back
                </button>
                {stepIdx < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      void runSubmit(form.status === 'published' ? 'published' : 'draft', {
                        bypassLastStepArm: true,
                        // Save draft / Save changes → persist & glide back to listings.
                        closeOnSuccess: true,
                      })
                    }
                    disabled={submitting || draftCloseBusy || shellExiting}
                    className="touch-manipulation tv-btn-secondary !min-h-12 flex-1 sm:!min-h-11 sm:w-auto sm:flex-none disabled:opacity-50"
                  >
                    {submitting || shellExiting
                      ? 'Saving…'
                      : form.status === 'published'
                        ? 'Save changes'
                        : 'Save draft'}
                  </button>
                ) : form.status !== 'published' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void runSubmit('draft', {
                        bypassLastStepArm: true,
                        closeOnSuccess: true,
                      })
                    }
                    disabled={submitting || draftCloseBusy || shellExiting}
                    className="touch-manipulation tv-btn-secondary !min-h-12 flex-1 sm:!min-h-11 sm:w-auto sm:flex-none disabled:opacity-50"
                  >
                    {submitting || shellExiting ? 'Saving…' : 'Save as draft'}
                  </button>
                ) : null}
              </div>
              <div className="order-1 flex w-full min-w-0 sm:order-2 sm:w-auto">
                {stepIdx < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (tourBasicsGuided && basicsSceneIdx < TOUR_BASICS_SCENE_COUNT - 1) {
                        setBasicsSceneIdxPersisted(nextTourBasicsScene(basicsSceneIdx), 'forward');
                        return;
                      }
                      if (
                        tourInformationGuided &&
                        infoSceneIdx < TOUR_INFORMATION_SCENE_COUNT - 1
                      ) {
                        setInfoSceneIdxPersisted(nextTourInformationScene(infoSceneIdx), 'forward');
                        return;
                      }
                      setStepIdxPersisted((s) => Math.min(steps.length - 1, s + 1));
                    }}
                    disabled={
                      (tourBasicsGuided
                        ? !canContinueBasicsScene
                        : tourInformationGuided
                          ? !canContinueInfoScene || !canContinueStep()
                          : !canContinueStep()) ||
                      draftCloseBusy ||
                      submitting ||
                      shellExiting
                    }
                    className="touch-manipulation tv-btn-primary !min-h-12 w-full sm:!min-h-11 sm:w-auto disabled:opacity-50"
                  >
                    Continue
                  </button>
                ) : form.status === 'published' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void runSubmit('published', {
                        bypassLastStepArm: true,
                        closeOnSuccess: true,
                      })
                    }
                    disabled={submitting || draftCloseBusy || shellExiting}
                    title={
                      publishBlockersPreview.length > 0
                        ? publishBlockersPreview[0]
                        : 'Save updates to your live listing'
                    }
                    className="touch-manipulation tv-btn-primary !min-h-12 w-full sm:!min-h-11 sm:w-auto disabled:opacity-50"
                  >
                    {submitting || shellExiting ? 'Saving…' : 'Save changes'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runSubmit('published', { closeOnSuccess: true })}
                    disabled={submitting || draftCloseBusy || shellExiting || !lastStepSubmitArmed}
                    title={publishButtonTitle}
                    className="touch-manipulation tv-btn-primary !min-h-12 w-full sm:!min-h-11 sm:w-auto disabled:opacity-50"
                  >
                    {submitting || shellExiting ? 'Publishing…' : 'Publish experience'}
                  </button>
                )}
              </div>
            </div>
            {stepIdx < steps.length - 1
              ? (() => {
                  const hint = tourBasicsGuided
                    ? tourBasicsContinueHint
                    : specificTourContinueHint ??
                      listingCreationContinueHint({
                        stepIndex: stepIdx,
                        isStay: isStayForm,
                        canContinue: canContinueStep(),
                      });
                  return hint ? (
                    <p
                      id="listing-creation-continue-hint"
                      className="listing-creation-hint px-0.5 text-[12px] leading-relaxed text-ink-muted sm:text-right"
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
          <div
            key={stepIdx}
            className={`w-full ${
              stepIdx === 0 && !isStayForm
                ? ''
                : `motion-safe:animate-fade-in ${
                    stepIdx === 5
                      ? 'max-w-[72rem]'
                      : stepIdx === 4
                        ? 'max-w-5xl'
                        : stepIdx === 2 && !isStayForm
                          ? 'max-w-[48rem]'
                          : 'max-w-xl'
                  }`
            }`}
          >
          {!(
            (stepIdx === 0 && !isStayForm) ||
            (stepIdx === 3 && !isStayForm) ||
            stepIdx === 4 ||
            stepIdx === 5 ||
            (isStayForm && (stepIdx === 2 || stepIdx === 3))
          ) ? (
            <header className="mb-6 sm:mb-7">
              <h3 className="font-display text-[1.65rem] font-bold tracking-tight text-ink sm:text-[1.85rem]">
                {steps[stepIdx].label}
              </h3>
              {stepGuidance[stepIdx]?.trim() ? (
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  {stepGuidance[stepIdx]}
                </p>
              ) : null}
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
                <p className="text-xs text-ink-muted mb-2">
                  A clear, specific name travelers will see in search and on the listing page (
                  {MIN_LISTING_TITLE_LENGTH}–{MAX_LISTING_TITLE_LENGTH} characters).
                </p>
                <input
                  id="supplier-listing-title"
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: clampListingTitleInput(e.target.value, f.title) }))
                  }
                  className="tv-input"
                  placeholder="e.g. Harbour apartment · two bedrooms"
                  minLength={MIN_LISTING_TITLE_LENGTH}
                  maxLength={
                    form.title.length > MAX_LISTING_TITLE_LENGTH ? undefined : MAX_LISTING_TITLE_LENGTH
                  }
                  required
                />
                <p
                  className={`mt-1 text-xs tabular-nums ${
                    form.title.length >= LISTING_TITLE_NEAR_LIMIT_LENGTH
                      ? 'text-amber-800'
                      : 'text-ink-muted'
                  }`}
                >
                  {form.title.length} / {MAX_LISTING_TITLE_LENGTH}
                  {form.title.length > MAX_LISTING_TITLE_LENGTH
                    ? ` · shorten to ${MAX_LISTING_TITLE_LENGTH} to publish`
                    : form.title.length >= LISTING_TITLE_NEAR_LIMIT_LENGTH
                      ? ' · approaching the limit'
                      : null}
                </p>
              </div>
              <div id="supplier-listing-field-subtitle">
                <label htmlFor="supplier-listing-subtitle" className="block text-sm font-semibold text-ink mb-1">
                  Subtitle *
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  A short line under the title on the listing page (max {MAX_SUBTITLE_LENGTH} characters).
                </p>
                <textarea
                  id="supplier-listing-subtitle"
                  value={form.subtitle}
                  maxLength={MAX_SUBTITLE_LENGTH}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value.slice(0, MAX_SUBTITLE_LENGTH) }))}
                  rows={3}
                  className="tv-input min-h-[5.5rem] resize-y"
                  placeholder="e.g. Quiet apartment near the harbour"
                />
                <p className="text-xs text-ink-muted mt-1 tabular-nums">
                  {form.subtitle.length}/{MAX_SUBTITLE_LENGTH}
                </p>
              </div>
              {/* Phase 1687: tour identity preview parity for stay title/subtitle. */}
              <div className="xl:sticky xl:top-2 min-w-0">
                <ListingCreationIdentityPreview
                  title={form.title}
                  subtitle={form.subtitle}
                  languageLabel={null}
                />
              </div>
              <div id="supplier-listing-field-description">
                <label htmlFor="supplier-listing-description" className="block text-sm font-semibold text-ink mb-1">
                  About this stay *
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  Main description for guests ({MIN_LISTING_DESCRIPTION_LENGTH.toLocaleString('en-US')}–
                  {MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters).
                </p>
                <textarea
                  id="supplier-listing-description"
                  value={form.description}
                  maxLength={
                    form.description.length > MAX_DESCRIPTION_LENGTH ? undefined : MAX_DESCRIPTION_LENGTH
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      description: clampListingDescriptionInput(e.target.value, f.description),
                    }))
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
                <p
                  id="supplier-listing-description-hint"
                  className={`text-xs mt-1 tabular-nums ${
                    form.description.length >= LISTING_DESCRIPTION_NEAR_LIMIT_LENGTH
                      ? 'text-amber-800'
                      : 'text-ink-muted'
                  }`}
                >
                  {form.description.length.toLocaleString('en-US')} /{' '}
                  {MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')}
                  {form.description.length > MAX_DESCRIPTION_LENGTH
                    ? ` · shorten to ${MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')} to publish`
                    : form.description.length >= LISTING_DESCRIPTION_NEAR_LIMIT_LENGTH
                      ? ' · approaching the limit'
                      : null}
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
                city: form.city,
                country: form.country,
                title: form.title,
                subtitle: form.subtitle,
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
            <div className="max-w-2xl space-y-7">
              <section className="space-y-3" aria-labelledby="tour-details-story">
                <h4 id="tour-details-story" className="text-[13px] font-semibold text-ink">
                  Description
                </h4>
                <div id="supplier-listing-field-description">
                  <label htmlFor="supplier-listing-description" className="mb-1 block text-[13px] font-semibold text-ink">
                    About this product *
                  </label>
                  <p className="mb-1.5 text-[12px] text-ink-muted">
                    Full description · {MIN_LISTING_DESCRIPTION_LENGTH.toLocaleString('en-US')}–
                    {MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters
                  </p>
                  <textarea
                    id="supplier-listing-description"
                    value={form.description}
                    maxLength={
                      form.description.length > MAX_DESCRIPTION_LENGTH ? undefined : MAX_DESCRIPTION_LENGTH
                    }
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        description: clampListingDescriptionInput(e.target.value, f.description),
                      }))
                    }
                    rows={6}
                    className={`tv-input min-h-[8rem] break-words text-[15px] leading-relaxed [overflow-wrap:anywhere] ${
                      form.description.trim().length > 0 &&
                      form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                        ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
                        : ''
                    }`}
                    placeholder={
                      form.experienceKind === 'ticket'
                        ? 'What guests get access to, opening hours notes, and what to bring…'
                        : form.experienceKind === 'transportation'
                          ? 'Route, vehicle type, luggage notes, and how pickup works…'
                          : 'What guests do, what makes it special, practical notes…'
                    }
                  />
                  <p
                    className={`mt-1 text-[12px] tabular-nums ${
                      form.description.length >= LISTING_DESCRIPTION_NEAR_LIMIT_LENGTH
                        ? 'text-amber-800'
                        : 'text-ink-muted'
                    }`}
                  >
                    {form.description.length.toLocaleString('en-US')} /{' '}
                    {MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')}
                    {form.description.length > MAX_DESCRIPTION_LENGTH
                      ? ` · shorten to ${MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')} to publish`
                      : form.description.length >= LISTING_DESCRIPTION_NEAR_LIMIT_LENGTH
                        ? ' · approaching the limit'
                        : null}
                  </p>
                  {!canContinueStep() &&
                  form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH ? (
                    <p className="mt-1.5 text-[12px] text-ink-muted" role="status">
                      Add at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue.
                    </p>
                  ) : null}
                </div>
                <div id="supplier-listing-field-highlights" className="space-y-2">
                  <label className="block text-[13px] font-semibold text-ink">Highlights</label>
                  <p className="text-[12px] text-ink-muted">Up to {TOUR_HIGHLIGHT_MAX} short selling points</p>
                  {form.highlights.map((line, index) => (
                    <div key={`highlight-${index}`}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <label
                          className="block text-[12px] font-medium text-ink-muted"
                          htmlFor={`supplier-listing-highlight-${index}`}
                        >
                          Highlight {index + 1}
                        </label>
                        {index >= 2 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                highlights: removeTourHighlight(f.highlights, index),
                              }))
                            }
                            className="lux-flat min-h-9 text-[12px] font-medium text-ink-muted hover:text-ink"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <input
                        id={`supplier-listing-highlight-${index}`}
                        type="text"
                        value={line}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            highlights: f.highlights.map((h, i) => (i === index ? e.target.value : h)),
                          }))
                        }
                        className="tv-input"
                        placeholder={index === 0 ? 'e.g. Small groups of 8' : `Highlight ${index + 1}`}
                      />
                    </div>
                  ))}
                  {canAddTourHighlight(form.highlights) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, highlights: addTourHighlight(f.highlights) }))
                      }
                      className="lux-flat min-h-10 text-[13px] font-semibold text-finland"
                    >
                      + Add highlight
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3" aria-labelledby="tour-details-guests">
                <h4 id="tour-details-guests" className="text-[13px] font-semibold text-ink">
                  What guests get
                </h4>
                <ProgressiveLinesEditor
                  fieldId="supplier-listing-field-includes"
                  label="What's included *"
                  variant="include"
                  minRequired={TOUR_INCLUDE_MIN_REQUIRED}
                  hint={`At least ${TOUR_INCLUDE_MIN_REQUIRED} items · up to ${TOUR_INCLUDE_MAX} · ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters each`}
                  values={form.includes}
                  minVisible={TOUR_INCLUDE_MIN_VISIBLE}
                  max={TOUR_INCLUDE_MAX}
                  placeholder={(index) => (index === 0 ? 'e.g. Guide and transfers' : `Included item ${index + 1}`)}
                  onChange={(includes) => setForm((f) => ({ ...f, includes }))}
                  enforceItemLength
                  fieldError={
                    !canContinueStep() &&
                    form.includes.map((s) => s.trim()).filter(Boolean).length < TOUR_INCLUDE_MIN_REQUIRED
                      ? `Add at least ${TOUR_INCLUDE_MIN_REQUIRED} inclusions to continue.`
                      : !canContinueStep() &&
                          !areFilledListingLineItemsValid(form.includes)
                        ? `Each inclusion must be ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters.`
                        : null
                  }
                  addLabel="+ Add inclusion"
                />
                <ProgressiveLinesEditor
                  fieldId="supplier-listing-field-excludes"
                  label="Not included (optional)"
                  variant="exclude"
                  minRequired={TOUR_EXCLUDE_MIN_REQUIRED}
                  hint={`Optional · up to ${TOUR_EXCLUDE_MAX} · ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters each`}
                  values={form.excludes}
                  minVisible={TOUR_EXCLUDE_MIN_VISIBLE}
                  max={TOUR_EXCLUDE_MAX}
                  placeholder={(index) => (index === 0 ? 'e.g. Meals' : `Not included ${index + 1}`)}
                  onChange={(excludes) => setForm((f) => ({ ...f, excludes }))}
                  enforceItemLength
                  addLabel="+ Add exclusion"
                  emptyHint="No exclusions yet — add items guests should not expect, or skip this section."
                  fieldError={
                    !canContinueStep() &&
                    form.excludes.some((s) => s.trim()) &&
                    !areFilledListingLineItemsValid(form.excludes)
                      ? `Each exclusion must be ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters.`
                      : null
                  }
                />
              </section>

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
                      placeholder="e.g. Rovaniemi"
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
                <div id="supplier-listing-field-stay-check-in-address" className="space-y-2">
                  <label className="block text-sm font-semibold text-ink" htmlFor="stay-check-in-address">
                    Check-in address *
                  </label>
                  <textarea
                    id="stay-check-in-address"
                    value={form.stayCheckInAddress}
                    onChange={(e) => setForm((f) => ({ ...f, stayCheckInAddress: e.target.value }))}
                    className="tv-input min-h-[4.5rem] resize-y"
                    placeholder="Street, building, apartment, entry code — for booked guests only"
                    maxLength={400}
                    required
                  />
                  <p className="text-xs text-ink-muted">
                    City and country stay on the public listing. This exact address is saved on the booking and shown
                    in Trips after purchase — not on the public stay page.
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
            <ListingInformationStage
              form={{
                experienceKind: form.experienceKind,
                knowBeforeYouGo: form.knowBeforeYouGo,
                whatToBring: form.whatToBring,
                whatToBringIds: form.whatToBringIds,
                requirementsNotes: form.requirementsNotes,
                notSuitableForIds: form.notSuitableForIds,
                accessibilitySummary: form.accessibilitySummary,
                accessibilityFeatureIds: form.accessibilityFeatureIds,
                additionalInfo: form.additionalInfo,
                additionalLanguages: form.additionalLanguages,
                bookingContactPhoneE164: form.bookingContactPhoneE164,
              }}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              sceneIndex={infoSceneIdx}
              direction={infoSceneDirection}
              farthestReached={infoFarthest}
              allowDirectSceneAccess={Boolean(editingId)}
              onSelectScene={(index) =>
                setInfoSceneIdxPersisted(index, index >= infoSceneIdx ? 'forward' : 'back')
              }
              phoneError={bookingContactPhoneError}
              businessCountry={form.country}
              showPhoneRequired
            />
          )}

          {stepIdx === 3 && form.inventoryFamily !== 'stay' && (
            <div id="supplier-listing-field-options" className="space-y-3 transition-all duration-300 ease-out opacity-100 translate-y-0">
              <div>
                <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">Options</h3>
                <p className="mt-0.5 text-[13px] text-ink-muted">Ways travelers can book this experience.</p>
              </div>

              <div className="space-y-2">
                {materializedBookingOptions(form.bookingOptions).map((opt) => {
                  const messages = optionValidationMessages(opt);
                  const status = tourOptionReadiness(opt, messages);
                  const pendingDelete = optionPendingDeleteId === opt.id;
                  const card = tourOptionCardModel(opt, (n) => formatMoney(n, listingCurrency));
                  const notice =
                    pendingDelete && editingId
                      ? removeBookingOptionOccupancyNotice(
                          occupyingGuestsForBookingOption({
                            bookings: listingOccupancyBookings,
                            listingId: editingId,
                            optionId: opt.id,
                          })
                        )
                      : null;
                  return (
                    <TourOptionCard
                      key={opt.id}
                      name={opt.name.trim()}
                      readiness={status}
                      model={card}
                      pendingDelete={pendingDelete}
                      deleteNotice={
                        notice ? (
                          <p className="text-[12.5px] leading-snug text-ink" role="status">
                            {notice}
                          </p>
                        ) : null
                      }
                      onPrimary={() => {
                        if (card.cta.kind === 'add_schedule') {
                          openOptionModalEdit(opt.id, { sceneIndex: card.cta.sceneIndex, action: { kind: 'add_schedule' } });
                        } else if (card.cta.kind === 'finish_schedule') {
                          openOptionModalEdit(opt.id, {
                            sceneIndex: card.cta.sceneIndex,
                            action: { kind: 'edit_schedule', scheduleId: card.cta.scheduleId },
                          });
                        } else if (card.cta.kind === 'manage_schedules') {
                          openOptionModalEdit(opt.id, { sceneIndex: card.cta.sceneIndex });
                        } else if (card.cta.kind === 'continue_setup') {
                          openOptionModalEdit(opt.id, { sceneIndex: card.cta.sceneIndex });
                        }
                      }}
                      onEdit={() => openOptionModalEdit(opt.id)}
                      onDuplicate={() => duplicateOption(opt.id)}
                      onRequestDelete={() => setOptionPendingDeleteId(opt.id)}
                      onCancelDelete={() => setOptionPendingDeleteId(null)}
                      onConfirmDelete={() => {
                        if (editingId && listingOccupancyReady) {
                          const sold = occupyingGuestsForBookingOption({
                            bookings: listingOccupancyBookings,
                            listingId: editingId,
                            optionId: opt.id,
                          });
                          if (sold >= 1) {
                            // Phase 1110: hard-refuse option delete with sold seats.
                            window.alert(
                              removeBookingOptionOccupancyNotice(sold) ??
                                'This option still has booked guests and cannot be deleted.'
                            );
                            setOptionPendingDeleteId(null);
                            return;
                          }
                        }
                        removeBookingOption(opt.id);
                      }}
                    />
                  );
                })}
              </div>
              <div
                {...(!optionModalOpen ? { id: 'supplier-listing-field-price' } : {})}
                className="pt-0.5"
              >
                <button
                  type="button"
                  onClick={() => openOptionModalCreate()}
                  className="lux-flat inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-finland hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Add option
                </button>
              </div>
            </div>
          )}

          {stepIdx === 4 && (() => {
            const photoCount = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots)).length;
            const photosPublishReady = listingPhotosReadyToPublish(form);
            return (
                <div id="supplier-listing-field-photos" className="space-y-2.5">
                <div>
                  <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">Photos</h3>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    First photo is the cover travelers see in search.
                  </p>
                </div>
                <ListingImageFields
                  photoSlots={form.photoSlots}
                  photoSlotLabels={form.photoSlotLabels}
                  photoOriginalUrls={form.photoOriginalUrls}
                  photoCropSettings={form.photoCropSettings}
                  onPhotosChange={({ slots, labels, originals, crops }) =>
                    setForm((f) => ({
                      ...f,
                      photoSlots: slots,
                      photoSlotLabels: labels,
                      photoOriginalUrls: originals,
                      photoCropSettings: crops,
                    }))
                  }
                  userId={user?.id}
                  uploadsEnabled={isSupabaseConfigured() && !!user?.id}
                />
                {!photosPublishReady && photoCount >= 1 ? (
                  <p className="text-[12.5px] text-amber-900">
                    {photoCount < LISTING_PHOTO_MIN
                      ? sessionOpenedAsCreateRef.current
                        ? `Add ${LISTING_PHOTO_MIN - photoCount} more to continue (${LISTING_PHOTO_MIN}–${LISTING_PHOTO_MAX} for publish).`
                        : `Drafts can save with fewer photos. Add ${LISTING_PHOTO_MIN - photoCount} more before publish.`
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

          {stepIdx === 5 && (() => {
            const listingReady = publishBlockersPreview.length === 0;
            const truth = listingPublishTruth({
              listingReady,
              accountEligible: canPostNewListing,
              listingMissing: publishBlockersPreview[0] ?? null,
              accountReason: publishAccountBlockedReason,
            });
            const previewPhotos = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots));
            const previewOpts = materializedBookingOptions(form.bookingOptions);
            const previewFrom = isStayForm
              ? Number.parseFloat(form.stayNightly)
              : headlineStartingAmountFromBookingOptions(previewOpts);
            const previewPlace = [form.city.trim(), form.country.trim()].filter(Boolean).join(', ');
            const languageLabel =
              LANGUAGE_OPTIONS.find((row) => row.code === form.experienceLanguage)?.label ??
              (form.experienceLanguage.trim().length === 2
                ? form.experienceLanguage.toUpperCase()
                : form.experienceLanguage);
            const chargeConfigured = previewOpts.filter(
              (o) => o.chargeModel === 'per_person' || o.chargeModel === 'flat_group'
            );
            const allGroup =
              chargeConfigured.length > 0 &&
              chargeConfigured.every(
                (o) =>
                  o.chargeModel === 'flat_group' ||
                  (o.isPrivate === true && o.privatePricing === 'flat_group')
              );
            const priceUnit = allGroup ? '/ group' : chargeConfigured.length > 0 ? '/ person' : '';
            const startingPriceLabel =
              typeof previewFrom === 'number' && Number.isFinite(previewFrom) && previewFrom > 0
                ? isStayForm
                  ? `${formatMoney(previewFrom, listingCurrency)} / night`
                  : `From ${formatMoney(previewFrom, listingCurrency)}${priceUnit ? ` ${priceUnit}` : ''}`
                : null;
            return (
              <ListingPreviewPublishStage
                isStay={isStayForm}
                title={form.title}
                subtitle={form.subtitle}
                description={form.description}
                place={previewPlace}
                experienceKind={form.experienceKind}
                languageLabel={languageLabel}
                photos={previewPhotos}
                startingPriceLabel={startingPriceLabel}
                highlights={(form.highlights ?? []).map((h) => h.trim()).filter(Boolean)}
                includes={(form.includes ?? []).map((h) => h.trim()).filter(Boolean)}
                excludes={(form.excludes ?? []).map((h) => h.trim()).filter(Boolean)}
                options={previewOpts.map((opt) => ({
                  option: opt,
                  readiness: tourOptionReadiness(opt, optionValidationMessages(opt)),
                }))}
                formatAmount={(n) => formatMoney(n, listingCurrency)}
                knowBeforeYouGo={form.knowBeforeYouGo ?? ''}
                whatToBring={form.whatToBring ?? ''}
                additionalLanguages={form.additionalLanguages ?? []}
                reviewRows={reviewRows}
                truth={truth}
                settingsHref={`${PARTNER_APP_BASE}/business-profile`}
                liveListingHref={
                  form.status === 'published' && editingId
                    ? isStayForm
                      ? publicStayListingUrl(editingId)
                      : publicTourListingUrl(editingId)
                    : null
                }
                isPublished={form.status === 'published'}
                onEditStep={(step) => setStepIdxPersisted(step)}
              />
            );
          })()}
          </div>
        </ListingCreationWorkspace>
        {tourOptionGuided && optionModalDraft ? (
          <TourOptionWorkspace
            modeTitle={
              optionSessionOpenedAsCreateRef.current || !optionModalEditingId
                ? 'Create option'
                : 'Edit option'
            }
            optionName={optionModalDraft.name}
            listingTitle={form.title}
            persistLabel={persistLabel}
            continueHint={optionContinueHint}
            continueLabel={
              optionSceneIdx < TOUR_OPTION_SCENE_COUNT - 1 ? 'Continue' : 'Finish option'
            }
            continueDisabled={draftCloseBusy || submitting}
            saveDraftDisabled={draftCloseBusy || submitting}
            navItems={tourOptionContextNavItems(optionSceneIdx, {
              isNewOption: optionSessionOpenedAsCreateRef.current,
              option: optionModalDraft,
              ending: optionEnding,
            })}
            onSelectNavId={(id) => {
              const index = TOUR_OPTION_SCENES.findIndex((s) => s.id === id);
              if (index < 0) return;
              setOptionSceneIdxPersisted(index, index >= optionSceneIdx ? 'forward' : 'back');
            }}
            onBackToOptions={saveOptionAsDraft}
            onPreviousScene={
              optionSceneIdx > 0
                ? () => setOptionSceneIdxPersisted(previousTourOptionScene(optionSceneIdx), 'back')
                : null
            }
            onClose={saveOptionAsDraft}
            onSaveDraft={saveOptionAsDraft}
            onContinue={() => {
              if (optionSceneIdx < TOUR_OPTION_SCENE_COUNT - 1) {
                advanceOptionScene();
                return;
              }
              saveOptionModal();
            }}
          >
            {optionLockHint ? (
              <p className="mb-2 text-[12px] leading-snug text-ink-muted" role="status">
                {optionLockHint}
              </p>
            ) : null}
            {optionModalErrors.length > 0 ? (
              <p className="mb-2 text-[12px] leading-snug text-amber-900" role="alert">
                {optionModalErrors[0]}
                {optionModalErrors.length > 1
                  ? ` (+${optionModalErrors.length - 1} more)`
                  : ''}
              </p>
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
              priceSummary={summarizeOptionPricing(optionModalDraft, (n) =>
                formatMoney(n, listingCurrency)
              )}
              validationMessages={optionValidationMessages(
                optionModalDraft,
                optionModalHasEndingDate
              )}
              attempted={optionAttempted}
              onAddSchedule={openScheduleCreate}
              onEditSchedule={openScheduleEdit}
              onDuplicateSchedule={duplicateSchedule}
              onDeleteSchedule={deleteSchedule}
              pendingScheduleDeleteId={pendingScheduleDeleteId}
              onCancelScheduleDelete={() => setPendingScheduleDeleteId(null)}
              occupancyNoticeForSchedule={occupancyNoticeForSchedule}
              listingDepartureTimezone={form.departureTimezone || TRAVERION_DEPARTURE_TIMEZONE}
              listingCutoffHours={
                Number(form.bookingCutoffHoursBeforeStart) > 0
                  ? Math.min(168, Math.floor(Number(form.bookingCutoffHoursBeforeStart)))
                  : 0
              }
              timezoneAutoDetected={!form.departureTimezoneManual}
              timezoneDetectedLabel={
                form.country.trim() || form.city.trim()
                  ? [form.city.trim(), form.country.trim()].filter(Boolean).join(', ')
                  : null
              }
              onListingDepartureTimezoneChange={(departureTimezone) => {
                const next = resolveDepartureTimezone(departureTimezone);
                const current = resolveDepartureTimezone(
                  form.departureTimezone || TRAVERION_DEPARTURE_TIMEZONE
                );
                if (next === current) return;
                const hasSchedules = form.bookingOptions.some(
                  (o) => (o.schedules?.length ?? 0) > 0 || listingOptionHasSchedules(o)
                );
                if (hasSchedules) {
                  const ok = window.confirm(
                    'This timezone is shared by all options and schedules on this listing. Changing it can affect how departure times are interpreted. Continue?'
                  );
                  if (!ok) return;
                }
                setForm((f) => ({
                  ...f,
                  departureTimezone: next,
                  departureTimezoneManual: true,
                }));
              }}
            />
          </TourOptionWorkspace>
        ) : null}
        {scheduleDraft && optionModalDraft ? (
          <>
            <TourScheduleWorkspace
              option={optionModalDraft}
              schedule={scheduleDraft}
              sceneIndex={scheduleSceneIdx}
              isNewSchedule={scheduleSessionOpenedAsCreateRef.current}
              listingTitle={form.title}
              leaveOpen={scheduleLeaveOpen}
              onKeepEditing={() => setScheduleLeaveOpen(false)}
              onLeave={() => closeScheduleWorkspace(true)}
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
          </>
        ) : null}
        {leaveConfirmOpen ? (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
            <div
              ref={leaveDialogRef}
              className="w-full max-w-sm rounded-[var(--partner-radius,0.5rem)] bg-white px-4 py-4 shadow-xl ring-1 ring-black/[0.1]"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="listing-leave-title"
              aria-describedby="listing-leave-desc"
            >
              <p id="listing-leave-title" className="text-[15px] font-semibold tracking-tight text-ink">
                Save changes before leaving?
              </p>
              <p id="listing-leave-desc" className="mt-1.5 text-[13px] text-ink-muted leading-snug">
                You have unsaved changes to this experience.
              </p>
              {draftCloseError ? (
                <p className="mt-3 text-sm text-red-800" role="alert">
                  {draftCloseError}
                </p>
              ) : null}
              <div className="mt-5 flex flex-col gap-2">
                {form.status === 'published' ? (
                  <button
                    type="button"
                    className="tv-btn-primary !min-h-11 w-full"
                    disabled={draftCloseBusy || submitting}
                    onClick={() => void leaveAndSavePublished()}
                  >
                    {draftCloseBusy ? 'Saving…' : 'Save & exit'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tv-btn-primary !min-h-11 w-full"
                    disabled={draftCloseBusy || submitting}
                    onClick={() => void leaveAndSaveDraft()}
                  >
                    {draftCloseBusy ? 'Saving…' : 'Save & exit'}
                  </button>
                )}
                <button
                  type="button"
                  className="tv-btn-secondary !min-h-11 w-full"
                  disabled={draftCloseBusy || submitting}
                  onClick={leaveWithoutSaving}
                >
                  Leave without saving
                </button>
                <button
                  type="button"
                  className="tv-btn-ghost !min-h-11 w-full"
                  disabled={draftCloseBusy || submitting}
                  onClick={() => {
                    setDraftCloseError(null);
                    setLeaveConfirmOpen(false);
                  }}
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
