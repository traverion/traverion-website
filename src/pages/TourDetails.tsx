import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  MapPin,
  Star,
  Shield,
  Share2,
  CheckCircle,
  Heart,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../contexts/AuthContext';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { isSupabaseConfigured } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getDisplayPriceForTour, isSupabaseListingId } from '../lib/discount-display';
import {
  fetchReviewsByListingId,
  getReviewAggregateForListing,
  getReviewRepliesByReviewIds,
  submitReview,
  userHasCompletedBookingForListing,
  userHasReviewedListing,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../data/supabase-reviews';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import { setPageMetaWithOg, setTourJsonLd, clearTourJsonLd } from '../lib/seo';
import { Skeleton } from '../components/ui/Skeleton';
import { dateNotInPast } from '../lib/validation';
import { checkAvailability, fetchAvailabilityByListingId, fetchPublishedTourPaidGuests, fetchPublishedTourPaidGuestsBySlot, tourPaidSlotKey } from '../data/supabase-availability';
import { optionRunsOnDate, formatOptionWeekdays, experienceTodayIsoForListing, listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { isListingVisibleToTravelers, listingDetailVisibleToTraveler } from '../lib/product-workflows';
import { listingIsOnTravelerCatalog } from '../lib/inventory';
import { listingShowsFreeCancellation, publicReviewLabel } from '../lib/listingTruth';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { listingTourCapacityFromOptions, remainingCapacity, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import { departureSlotSpotsLeft, maxSpotsLeftAcrossDepartures, partyMaxCappedByRemainingSpots } from '../lib/departure-slot-remaining';
import { tourSoldOutDates } from '../lib/tour-calendar';
import BookingPage from './BookingPage';
import {
  TOUR_LISTING_CONFIRMATION_NOTE,
  LISTING_REVIEWS_EMPTY_COPY,
  STRIPE_TEST_UNTIL_LIVE,
} from '../lib/booking-confirmation-copy';
import {
  getPartySizeBounds,
  getPartySizeBoundsForVariant,
  guestCountValidationError,
  getTourBookingVariants,
  type TourBookingVariant,
} from '../lib/booking-flow';
import {
  parseTourCheckoutSearch,
  parseTourListingSelection,
  resolveTourCheckoutVariant,
  tourCheckoutPath,
  tourListingPath,
  type TourCheckoutFlowStep,
  type TourCheckoutState,
} from '../lib/tourCheckoutUrl';
import TourDatePicker from '../components/TourDatePicker';
import GuestStepper from '../components/booking/GuestStepper';
import ParticipantCategoryStepper from '../components/booking/ParticipantCategoryStepper';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  buildParticipantMixLines,
  emptyMixSelection,
  formatMixSummaryCompact,
  optionUsesAgePricing,
  optionUsesPrivateFlatPrice,
  totalGuestsFromMix,
  participantCategoryQuantityMax,
  validateParticipantMix,
  type ParticipantMixSelection,
} from '../lib/participant-mix';
import { activePriceCategories } from '../lib/price-categories';
import { quoteBooking } from '../lib/booking-quote';
import {
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  departureTimesOnDate,
  resolveScheduleForDate,
  applyScheduleToOption,
  optionCapacityForDepartureTime,
} from '../lib/listing-option-schedules';
import { tourBookableSellingDeparturesOnDate } from '../lib/booking-quote';
import {
  isDepartureTimeStillBookable,
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
} from '../lib/tour-departure-cutoff';
import { formatTourAvailabilityHeading, optionsOnDate } from '../lib/tour-available-options';
import { tourSlotMaxSpotsFromOption } from '../lib/tour-slot-capacity';
import { tourDepartureSlotCapacity } from '../../supabase/functions/_shared/booking-quote.ts';
import { tourStickyBookCtaLabel } from '../lib/tour-sticky-cta';
import { tourQuoteFailureFocusTarget } from '../lib/tour-quote-failure-focus';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { PriceHero } from '../components/PriceBreakdown';
import NoticeCallout from '../components/NoticeCallout';
import TourQuickFacts from '../components/tour-detail/TourQuickFacts';
import { experienceLanguageLabel, tourKindLabel } from '../lib/tour-quick-facts';
import TourOverview from '../components/tour-detail/TourOverview';
import TourAvailableOptions from '../components/tour-detail/TourAvailableOptions';
import TourListingSections from '../components/tour-detail/TourListingSections';
import { ListingReviewsModal } from '../components/ListingReviewsModal';

function readSearchPrefill(): { date: string; guests: number } {
  if (typeof window === 'undefined') return { date: '', guests: 1 };
  const sel = parseTourListingSelection(window.location.search);
  return { date: sel.date, guests: sel.guests };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollElementIntoView(id: string, options: ScrollIntoViewOptions): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({
    ...options,
    behavior: prefersReducedMotion() ? 'auto' : options.behavior ?? 'smooth',
  });
}

interface TourDetailsProps {
  tourId: string;
  onBack: () => void;
}

export default function TourDetails({ tourId, onBack }: TourDetailsProps) {
  const { user, requestAuth } = useAuth();
  const [tour, setTour] = useState<TourPackage | null>(null);
  const [tourLoadError, setTourLoadError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [reviews, setReviews] = useState<ReviewDisplay[]>([]);
  const [reviewsLoadError, setReviewsLoadError] = useState<string | null>(null);
  const [reviewReplies, setReviewReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [reviewAggregate, setReviewAggregate] = useState<{ rating: number; count: number } | null>(null);
  const [canLeaveReview, setCanLeaveReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [bookingIdForReview, setBookingIdForReview] = useState<string | undefined>();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [bookingDate, setBookingDate] = useState(() => readSearchPrefill().date);
  const [guests, setGuests] = useState(() => readSearchPrefill().guests);
  const [discountsByListing, setDiscountsByListing] = useState<Map<
    string,
    import('../data/supabase-discounts').ListingDiscount[]
  > | null>(null);
  const [supplierLegal, setSupplierLegal] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  } | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const legalSheetRef = useRef<HTMLDivElement>(null);
  const gallerySheetRef = useRef<HTMLDivElement>(null);
  const [galleryLightboxOpen, setGalleryLightboxOpen] = useState(false);
  const closeLegalModal = useCallback(() => setLegalModal(null), []);
  const closeGalleryLightbox = useCallback(() => setGalleryLightboxOpen(false), []);
  useDialogFocus(legalModal !== null, legalSheetRef, closeLegalModal);
  useDialogFocus(galleryLightboxOpen, gallerySheetRef, closeGalleryLightbox);
  const [bookingCardError, setBookingCardError] = useState<string | null>(null);
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const [bookingVariantsOpen, setBookingVariantsOpen] = useState(() => Boolean(readSearchPrefill().date));
  const [locationSearch, setLocationSearch] = useState(
    () => (typeof window === 'undefined' ? '' : window.location.search)
  );
  const openedCheckoutViaPushRef = useRef(false);
  const [selectedBookingVariant, setSelectedBookingVariant] = useState<TourBookingVariant | null>(null);
  const [selectedDepartureTime, setSelectedDepartureTime] = useState('');
  const [participantMix, setParticipantMix] = useState<ParticipantMixSelection>({});
  const [variantChecking, setVariantChecking] = useState(false);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const [wishlistHeartKnown, setWishlistHeartKnown] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [soldOutDates, setSoldOutDates] = useState<ReadonlySet<string>>(() => new Set());
  const [dayCapacitySnap, setDayCapacitySnap] = useState<{
    paidByDay: Record<string, number>;
    paidBySlot: Record<string, number>;
    capByDay: Map<string, number>;
    fallback: number | null;
  } | null>(null);
  const [dayCapacityError, setDayCapacityError] = useState<string | null>(null);
  /** Overlapping capacity reloads (tab visibility, option load) must not commit stale occupancy. */
  const dayCapacityReloadGenRef = useRef(0);
  const optionsSectionRef = useRef<HTMLDivElement>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const partyBounds = useMemo(() => (tour ? getPartySizeBounds(tour) : { min: 1, max: 0 }), [tour]);
  const canBook = Boolean(tour && isListingVisibleToTravelers(tour.status));
  const tourVariants = useMemo(() => (tour ? getTourBookingVariants(tour) : []), [tour]);
  const checkoutFromUrl = useMemo(() => parseTourCheckoutSearch(locationSearch), [locationSearch]);
  const checkoutVariant = useMemo(
    () =>
      checkoutFromUrl ? resolveTourCheckoutVariant(tourVariants, checkoutFromUrl.optionId) : null,
    [checkoutFromUrl, tourVariants]
  );
  const calendarOptions = useMemo(
    () => tourVariants.map((v) => v.listingOption).filter((o): o is NonNullable<typeof o> => Boolean(o)),
    [tourVariants]
  );
  // Phase 1506: capacity reload must not cancel on calendarOptions identity churn.
  const calendarOptionsRef = useRef(calendarOptions);
  calendarOptionsRef.current = calendarOptions;
  const calendarOptionsCapacityKey = useMemo(
    () =>
      calendarOptions
        .map((o) => {
          const sched = Array.isArray(o.schedules)
            ? o.schedules.map((s) => `${s.id}:${s.maxSpotsPerSlot ?? ''}`).join(',')
            : '';
          return `${o.id}:${o.maxSpotsPerSlot ?? ''}:${sched}`;
        })
        .join('|'),
    [calendarOptions]
  );
  const weekdayHint = useMemo(() => {
    const labels = new Set<string>();
    for (const v of tourVariants) {
      const o = v.listingOption;
      if (!o) continue;
      if (listingOptionHasSchedules(o)) {
        for (const s of listingOptionReadySchedules(o)) {
          labels.add(formatOptionWeekdays(s.weekdays));
        }
      } else {
        labels.add(formatOptionWeekdays(o.weekdays));
      }
    }
    const unique = [...labels];
    if (unique.length === 1) return `Runs ${unique[0]}`;
    if (unique.length > 1) return 'Each option has its own schedule';
    return undefined;
  }, [tourVariants]);

  const optionsForSelectedDate = useMemo(
    () => optionsOnDate(tourVariants, bookingDate.trim()),
    [tourVariants, bookingDate]
  );

  const overviewExtras = useMemo(() => {
    if (!tour) return [];
    const x = tour.listingExtras;
    const lines: string[] = [];
    const optionStartTimes = [
      ...new Set(
        (x?.bookingOptions ?? []).flatMap((o) => {
          if (listingOptionHasSchedules(o)) {
            return listingOptionReadySchedules(o)
              .map((s) => s.startTime.trim())
              .filter(Boolean);
          }
          const t = String(o.startTime ?? '').trim();
          return t ? [t] : [];
        })
      ),
    ];
    if (optionStartTimes.length === 1) lines.push(`Usually starts at ${optionStartTimes[0]}.`);
    else if (optionStartTimes.length > 1) {
      lines.push(`Set start times: ${optionStartTimes.slice(0, 3).join(', ')}${optionStartTimes.length > 3 ? '…' : ''}.`);
    } else if (x?.scheduleStyle === 'on_request') {
      // Phase 1118: checkout is still fixed date/slot — do not claim post-book arrangement.
      lines.push('Host notes flexible timing — still choose an available date when you book.');
    }
    if (x?.venueSetting === 'indoor') lines.push('Mostly indoor.');
    else if (x?.venueSetting === 'outdoor') lines.push('Mostly outdoor.');
    else if (x?.venueSetting === 'mixed') lines.push('Indoor and outdoor.');
    const extraLang = (x?.additionalLanguages ?? [])
      .map((code) => experienceLanguageLabel(code))
      .filter(Boolean);
    if (extraLang.length > 0) lines.push(`Also offered in ${extraLang.join(', ')}.`);
    if (x?.accessibilitySummary?.trim()) lines.push(x.accessibilitySummary.trim());
    return lines;
  }, [tour]);

  const selectedOption = selectedBookingVariant?.listingOption ?? null;
  const bookingCutoffHours = normalizeBookingCutoffHours(
    tour?.listingExtras?.bookingCutoffHoursBeforeStart
  );
  const departureTimezone = resolveDepartureTimezone(tour?.listingExtras?.departureTimezone);
  const experienceTodayIso = experienceTodayIsoForListing(departureTimezone);
  const departureTimes = useMemo(() => {
    if (!selectedOption || !bookingDate.trim()) return [] as string[];
    const times = departureTimesOnDate(selectedOption, bookingDate.trim());
    return times.filter((time) =>
      isDepartureTimeStillBookable({
        bookingDate: bookingDate.trim(),
        startTimeHm: time,
        cutoffHoursBeforeStart: bookingCutoffHours,
        timeZone: departureTimezone,
      })
    );
  }, [selectedOption, bookingDate, bookingCutoffHours, departureTimezone]);

  useEffect(() => {
    if (departureTimes.length === 1) {
      setSelectedDepartureTime(departureTimes[0]);
      return;
    }
    if (departureTimes.length === 0) {
      setSelectedDepartureTime('');
      return;
    }
    setSelectedDepartureTime((prev) => (departureTimes.includes(prev) ? prev : ''));
  }, [departureTimes]);

  const selectedOptionApplied = useMemo(() => {
    if (!selectedOption) return null;
    if (!listingOptionHasSchedules(selectedOption)) return selectedOption;
    const resolved = resolveScheduleForDate(
      selectedOption,
      bookingDate.trim(),
      selectedDepartureTime || undefined
    );
    return resolved ? applyScheduleToOption(selectedOption, resolved) : selectedOption;
  }, [selectedOption, bookingDate, selectedDepartureTime]);

  const usesAgePricing = optionUsesAgePricing(selectedOptionApplied);
  const usesPrivateFlat = optionUsesPrivateFlatPrice(selectedOptionApplied);

  const panelQuote = useMemo(() => {
    if (!tour || !bookingDate.trim() || !selectedBookingVariant) return null;
    const optionId =
      selectedBookingVariant.id !== '__default__' ? selectedBookingVariant.id : null;
    const guestsForQuote = usesAgePricing
      ? Math.max(1, totalGuestsFromMix(buildParticipantMixLines(selectedOptionApplied!, participantMix)))
      : guests;
    return quoteBooking({
      tour,
      discounts: discountsByListing?.get(tour.id) ?? [],
      bookingDate: bookingDate.trim(),
      guests: guestsForQuote,
      bookingOptionId: optionId,
      participantMix: usesAgePricing ? participantMix : null,
      startTime: selectedDepartureTime || undefined,
      todayIso: experienceTodayIso,
    });
  }, [
    tour,
    bookingDate,
    selectedBookingVariant,
    selectedOptionApplied,
    usesAgePricing,
    participantMix,
    guests,
    discountsByListing,
    selectedDepartureTime,
    experienceTodayIso,
  ]);

  const scrollToOptionsSection = useCallback(() => {
    window.setTimeout(() => {
      const el = document.getElementById('tour-availability') ?? optionsSectionRef.current;
      if (!el) return;
      const reduce = prefersReducedMotion();
      const headerOffset = window.innerWidth >= 1024 ? 120 : 88;
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
      window.requestAnimationFrame(() => {
        const firstChoose =
          (el.querySelector(
            '[data-tour-option-cta="choose"]:not([aria-pressed="true"])'
          ) as HTMLButtonElement | null) ??
          (el.querySelector('[data-tour-option-cta="choose"]') as HTMLButtonElement | null);
        firstChoose?.focus();
      });
    }, 40);
  }, []);

  // Phase 1387: new tour route — drop prior PDP capacity (fail closed until this listing loads).
  useEffect(() => {
    setDayCapacitySnap(null);
    setSoldOutDates(new Set());
    setDayCapacityError(null);
  }, [tourId]);

  const reloadTourDayCapacity = useCallback(() => {
    if (!tour?.id || tour.id !== tourId) {
      setSoldOutDates(new Set());
      setDayCapacitySnap(null);
      setDayCapacityError(null);
      return () => {};
    }
    const reloadGen = ++dayCapacityReloadGenRef.current;
    const optionsSnapshot = calendarOptionsRef.current;
    let cancelled = false;
    setDayCapacityError(null);
    void Promise.all([
      fetchAvailabilityByListingId(tour.id, { fromDate: experienceTodayIso }),
      fetchPublishedTourPaidGuests(tour.id),
      fetchPublishedTourPaidGuestsBySlot(tour.id),
    ])
      .then(([caps, paidByDay, paidBySlot]) => {
        if (cancelled || reloadGen !== dayCapacityReloadGenRef.current) return;
        const fallbackCap = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(optionsSnapshot));
        const capByDay = new Map<string, number>();
        for (const row of caps) {
          const day = String(row.available_date ?? '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
          capByDay.set(day, row.capacity);
        }
        setDayCapacitySnap({ paidByDay, paidBySlot, capByDay, fallback: fallbackCap });
        setSoldOutDates(
          tourSoldOutDates({
            paidByDay,
            paidBySlot,
            capByDay,
            fallbackCapacity: fallbackCap,
            slotKey: tourPaidSlotKey,
            departuresForDay: (day) =>
              tourBookableSellingDeparturesOnDate(optionsSnapshot, day, {
                cutoffHoursBeforeStart: bookingCutoffHours,
                timeZone: departureTimezone,
              }).map((d) => ({
                startTimeHm: d.startTime,
                maxSpots: d.maxSpotsPerSlot,
              })),
          })
        );
      })
      .catch((e) => {
        if (cancelled || reloadGen !== dayCapacityReloadGenRef.current) return;
        // Phase 1103: keep prior sold-out marks — never invent a fully open calendar.
        setDayCapacityError(
          userFacingError(e, 'We could not check departure capacity. Check your connection and try again.')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [tour?.id, tourId, bookingCutoffHours, departureTimezone, experienceTodayIso, calendarOptionsCapacityKey]);

  useEffect(() => {
    return reloadTourDayCapacity();
  }, [reloadTourDayCapacity]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') reloadTourDayCapacity();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadTourDayCapacity]);

  const selectedDaySpotsLeft = useMemo(() => {
    const day = bookingDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !dayCapacitySnap) return null;
    const dayCap = dayCapacitySnap.capByDay.has(day)
      ? (dayCapacitySnap.capByDay.get(day) ?? dayCapacitySnap.fallback)
      : undefined;
    const effectiveStart =
      selectedDepartureTime.trim() ||
      (departureTimes.length === 1 ? departureTimes[0] : '');
    const slotSelected = Boolean(selectedOptionApplied && effectiveStart);
    if (soldOutDates.has(day) && !slotSelected) return 0;
    if (slotSelected && selectedOptionApplied && effectiveStart) {
      // Phase 1170: schedule-resolved cap (parity with departure chips / 1162) — not option headline.
      const baseOpt = selectedOption ?? selectedOptionApplied;
      const cap = optionCapacityForDepartureTime(baseOpt, day, effectiveStart);
      if (!cap) return null;
      return departureSlotSpotsLeft({
        dayIso: day,
        startTimeHm: effectiveStart,
        maxSpotsPerSlot: cap.maxSpotsPerSlot,
        maxPersonsFallback: cap.maxPersons,
        paidBySlot: dayCapacitySnap.paidBySlot,
        paidByDay: dayCapacitySnap.paidByDay,
        dayCapOverride: dayCap,
        fallbackDayCap: dayCapacitySnap.fallback,
      });
    }
    if (selectedOptionApplied && departureTimes.length >= 1 && selectedOption) {
      const day = bookingDate.trim();
      return maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: departureTimes
          .map((time) => {
            const cap = optionCapacityForDepartureTime(selectedOption, day, time);
            if (!cap) return null;
            return {
              startTimeHm: time,
              maxSpotsPerSlot: cap.maxSpotsPerSlot,
              maxPersonsFallback: cap.maxPersons,
            };
          })
          .filter((d): d is NonNullable<typeof d> => d != null),
        paidBySlot: dayCapacitySnap.paidBySlot,
        paidByDay: dayCapacitySnap.paidByDay,
        dayCapOverride: dayCap,
        fallbackDayCap: dayCapacitySnap.fallback,
      });
    }
    if (dayCap != null) {
      return remainingCapacity(dayCap, dayCapacitySnap.paidByDay[day] ?? 0);
    }
    const cap = dayCapacitySnap.fallback;
    // Phase 1163: unknown listing-wide fallback → null remaining (fail closed).
    if (cap == null) return null;
    return remainingCapacity(cap, dayCapacitySnap.paidByDay[day] ?? 0);
  }, [
    bookingDate,
    dayCapacitySnap,
    soldOutDates,
    selectedOptionApplied,
    selectedOption,
    departureTimes,
    selectedDepartureTime,
  ]);

  const spotsLeftIsDepartureCapacity = Boolean(
    (selectedDepartureTime.trim() || (departureTimes.length === 1 ? departureTimes[0] : '')) &&
      selectedOptionApplied
  );

  const allDeparturesSoldOut = useMemo(() => {
    const day = bookingDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !dayCapacitySnap || !selectedOption) return false;
    if (departureTimes.length < 1) return false;
    const dayCap = dayCapacitySnap.capByDay.has(day)
      ? (dayCapacitySnap.capByDay.get(day) ?? dayCapacitySnap.fallback)
      : undefined;
    if (dayCap != null && dayCap < 1) return true;
    return departureTimes.every((time) => {
      const cap = optionCapacityForDepartureTime(selectedOption, day, time);
      if (!cap) return true; // unresolved = not bookable
      const left = departureSlotSpotsLeft({
        dayIso: day,
        startTimeHm: time,
        maxSpotsPerSlot: cap.maxSpotsPerSlot,
        maxPersonsFallback: cap.maxPersons,
        paidBySlot: dayCapacitySnap.paidBySlot,
        paidByDay: dayCapacitySnap.paidByDay,
        dayCapOverride: dayCap,
        fallbackDayCap: dayCapacitySnap.fallback,
      });
      return left != null && left < 1;
    });
  }, [bookingDate, dayCapacitySnap, selectedOption, departureTimes]);

  // Phase 1167: mirror BookingPage 1103 — unknown remaining must not open checkout.
  // Phase 1230: unknown party bounds (1229) also block Continue.
  const capacityUnknown =
    Boolean(dayCapacityError) ||
    partyBounds.max < 1 ||
    (Boolean(bookingDate.trim()) && selectedDaySpotsLeft == null);

  useEffect(() => {
    if (!selectedDepartureTime.trim() || selectedDaySpotsLeft == null) return;
    if (selectedDaySpotsLeft < 1) {
      setSelectedDepartureTime('');
    }
  }, [selectedDepartureTime, selectedDaySpotsLeft]);

  const partyMaxForSelectedDay = useMemo(() => {
    if (!tour) return partyBounds.max;
    const base = getPartySizeBoundsForVariant(tour, selectedBookingVariant, bookingDate, selectedDepartureTime).max;
    return partyMaxCappedByRemainingSpots(base, selectedDaySpotsLeft);
  }, [tour, selectedBookingVariant, partyBounds.max, selectedDaySpotsLeft, bookingDate, selectedDepartureTime]);

  useEffect(() => {
    if (!tour?.id) return;
    setGuests((g) => Math.min(partyMaxForSelectedDay, Math.max(partyBounds.min, g)));
  }, [tour?.id, partyBounds.min, partyMaxForSelectedDay]);

  useEffect(() => {
    if (!user?.id || !tour?.id || !isSupabaseListingId(tour.id) || !isSupabaseConfigured()) {
      setSavedToWishlist(false);
      // Anonymous / unconfigured: heart state is known (not saved) — do not stay aria-busy forever.
      setWishlistHeartKnown(true);
      return;
    }
    let cancelled = false;
    setWishlistHeartKnown(false);
    fetchWishlistListingIds(user.id)
      .then((ids) => {
        if (!cancelled) {
          setSavedToWishlist(ids.includes(tour.id));
          setWishlistHeartKnown(true);
        }
      })
      .catch(() => {
        // Phase 1301/1363: do not show the prior listing’s heart — hide until a successful load.
        if (!cancelled) setWishlistHeartKnown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, tour?.id]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setProfileDisplayName('');
      return;
    }
    let cancelled = false;
    void fetchConsumerProfileRow(user.id)
      .then((row) => {
        if (!cancelled) setProfileDisplayName((row?.display_name ?? '').trim());
      })
      .catch(() => {
        /* keep auth metadata fallback for review display name */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggleWishlist = useCallback(() => {
    if (!tour?.id || !isSupabaseListingId(tour.id) || !isSupabaseConfigured()) return;
    const listingId = tour.id;
    const run = async () => {
      const uid = userRef.current?.id;
      if (!uid) return;
      const previous = savedToWishlist;
      const next = !previous;
      setSavedToWishlist(next);
      if (next) {
        setSavePop(true);
        window.setTimeout(() => setSavePop(false), 280);
      }
      setWishlistBusy(true);
      try {
        const res = await toggleWishlist(uid, listingId);
        if (res.error) {
          setSavedToWishlist(previous);
        } else {
          setSavedToWishlist(res.inWishlist);
        }
      } catch {
        setSavedToWishlist(previous);
      } finally {
        setWishlistBusy(false);
      }
    };
    if (!user) {
      requestAuth({ onSuccess: () => void run() });
      return;
    }
    void run();
  }, [tour?.id, user, requestAuth, savedToWishlist]);

  useEffect(() => {
    setTourLoadError(null);
    setTour(null);
    if (isSupabaseConfigured()) {
      let cancelled = false;
      getListingByIdAsync(tourId)
        .then((found) => {
          if (cancelled) return;
          if (
            !found ||
            !listingDetailVisibleToTraveler({
              familyMatches: listingIsOnTravelerCatalog(found),
              status: found.status,
            }) ||
            // Phase 1266: season-ended tours are not a live PDP (catalog 1260 parity).
            !listingHasUpcomingBookableSeason(found)
          ) {
            setTour(null);
            if (found) setTourLoadError(USER_ERROR.tourMissing);
            return;
          }
          setTour(found);
        })
        .catch((e) => {
          if (cancelled) return;
          setTour(null);
          setTourLoadError(userFacingError(e, USER_ERROR.tour));
        });
      return () => {
        cancelled = true;
      };
    }
    const local = getListingById(tourId) ?? null;
    if (
      local &&
      listingDetailVisibleToTraveler({
        familyMatches: listingIsOnTravelerCatalog(local),
        status: local.status,
      }) &&
      listingHasUpcomingBookableSeason(local)
    ) {
      setTour(local);
    } else {
      setTour(null);
      if (local) setTourLoadError(USER_ERROR.tourMissing);
    }
    return undefined;
  }, [tourId]);

  useEffect(() => {
    if (!tour?.id || !isSupabaseListingId(tour.id)) return;
    let cancelled = false;
    fetchDiscountsByListingIds([tour.id])
      .then((map) => {
        if (!cancelled) setDiscountsByListing(map);
      })
      .catch(() => {
        // Phase 1151: empty map → list price on PDP (not stuck loading offers).
        if (!cancelled) setDiscountsByListing(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [tour?.id]);

  useEffect(() => {
    if (!tour?.supplierId || !isSupabaseConfigured()) {
      setSupplierLegal(null);
      return;
    }
    fetchSupplierPublicLegal(tour.supplierId).then((row) => {
      if (!row) {
        setSupplierLegal(null);
        return;
      }
      const operatorName =
        row.company_legal_name?.trim() || row.display_name?.trim() || 'Operator';
      setSupplierLegal({
        operatorName,
        business_logo_url: row.business_logo_url?.trim() || null,
        privacy_policy_text: row.privacy_policy_text,
        terms_conditions_text: row.terms_conditions_text,
      });
    });
  }, [tour?.supplierId]);

  // Phase 1213: surface self-book block before Continue (StayDetails 1210 parity).
  useEffect(() => {
    if (!tour?.supplierId || !isSupabaseConfigured() || !userRef.current?.id) {
      setSelfBookBlocked(false);
      setSelfBookCheckFailed(false);
      return;
    }
    let cancelled = false;
    void viewerIsListingSupplierSide(userRef.current.id, tour.supplierId)
      .then((selfBook) => {
        if (cancelled) return;
        setSelfBookBlocked(selfBook);
        setSelfBookCheckFailed(false);
        if (selfBook) setBookingCardError(LISTING_SELF_BOOK_BLOCKED);
      })
      .catch(() => {
        // Phase 1307: eligibility failure ≠ “not supplier side” — block book.
        if (cancelled) return;
        setSelfBookBlocked(true);
        setSelfBookCheckFailed(true);
        setBookingCardError(LISTING_SELF_BOOK_CHECK_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [tour?.supplierId, user?.id]);

  useEffect(() => {
    setReviewReplies({});
  }, [tourId]);

  const loadReviews = useCallback(() => {
    if (!tourId || !isSupabaseConfigured()) return;
    setReviewsLoadError(null);
    // Phase 1194: clear prior tour reviews so the previous PDP stars do not flash.
    setReviews([]);
    setReviewAggregate(null);
    void fetchReviewsByListingId(tourId)
      .then((rows) => {
        setReviews(rows);
        // Phase 1175: reply failure must not invent empty reviews.
        void getReviewRepliesByReviewIds(rows.map((r) => r.id))
          .then(setReviewReplies)
          .catch(() => {
            /* Phase 1176: keep prior replies — failure ≠ “no host response” */
          });
      })
      .catch((e) => {
        setReviews([]);
        setReviewReplies({});
        setReviewsLoadError(userFacingError(e, USER_ERROR.reviews));
      });
    void getReviewAggregateForListing(tourId)
      .then(setReviewAggregate)
      .catch(() => {
        /* keep prior — failure ≠ zero reviews */
      });
  }, [tourId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    setCanLeaveReview(false);
    setBookingIdForReview(undefined);
    setHasReviewed(false);
    if (!user?.id || !user?.email || !tourId || !isSupabaseConfigured()) return;
    let cancelled = false;
    void userHasCompletedBookingForListing(user.id, user.email, tourId)
      .then(({ canReview, bookingId }) => {
        if (cancelled) return;
        setCanLeaveReview(canReview);
        setBookingIdForReview(bookingId);
      })
      .catch(() => {
        // Keep canLeaveReview false — failure ≠ invent eligibility.
      });
    void userHasReviewedListing(user.id, tourId)
      .then((reviewed) => {
        if (!cancelled) setHasReviewed(reviewed);
      })
      .catch(() => {
        // Phase 1303: eligibility failure ≠ “not reviewed” — hide Leave review.
        if (!cancelled) setHasReviewed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, tourId]);

  // SEO: tour-specific title, description, OG image, and JSON-LD.
  // Phase 1271: do not advertise season-ended / non-catalog tours (sitemap already excludes them).
  useEffect(() => {
    const bookable =
      !!tour &&
      listingDetailVisibleToTraveler({
        familyMatches: listingIsOnTravelerCatalog(tour),
        status: tour.status,
      }) &&
      listingHasUpcomingBookableSeason(tour);
    if (!bookable) {
      clearTourJsonLd();
      setPageMetaWithOg('Tour', 'Book this tour from an independent operator.');
      return;
    }
    const desc = (tour.description || '').slice(0, 160);
    const ogImage = listingHeroImageSrc(tour.image) ?? undefined;
    setPageMetaWithOg(tour.title, desc, {
      title: tour.title,
      description: desc,
      image: ogImage,
      type: 'article',
    });
    const review = publicReviewLabel(reviewAggregate);
    setTourJsonLd({
      id: tour.id,
      title: tour.title,
      description: tour.description ?? '',
      image: ogImage,
      destination: tour.destination,
      duration: tour.duration,
      rating: review.score != null ? Number(review.score) : undefined,
      reviews: review.count > 0 ? review.count : undefined,
      price: tour.price
        ? {
            startingFrom: getDisplayPriceForTour(tour, discountsByListing ?? new Map()).price,
            currency: tour.price.currency,
          }
        : undefined,
    });
    return () => clearTourJsonLd();
  }, [tour, reviewAggregate, discountsByListing]);

  const commitLocation = useCallback((href: string, mode: 'push' | 'replace') => {
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== href) {
      if (mode === 'push') window.history.pushState({}, '', href);
      else window.history.replaceState({}, '', href);
    }
    setLocationSearch(window.location.search);
  }, []);

  const closeBookingModal = useCallback(() => {
    if (!tour) return;
    const listing = tourListingPath(tour.id, {
      date: bookingDate.trim(),
      guests,
      optionId: selectedBookingVariant?.id ?? null,
    });
    if (openedCheckoutViaPushRef.current) {
      openedCheckoutViaPushRef.current = false;
      const pathBefore = `${window.location.pathname}${window.location.search}`;
      window.history.back();
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` === pathBefore) {
          commitLocation(listing, 'replace');
          return;
        }
        setLocationSearch(window.location.search);
      }, 50);
      return;
    }
    commitLocation(listing, 'replace');
  }, [tour, bookingDate, guests, selectedBookingVariant?.id, commitLocation]);

  useEffect(() => {
    const onPop = () => {
      openedCheckoutViaPushRef.current = false;
      setLocationSearch(window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!checkoutFromUrl || !tour) return;
    if (checkoutVariant && isListingVisibleToTravelers(tour.status)) {
      setSelectedBookingVariant(checkoutVariant);
      setBookingDate(checkoutFromUrl.date);
      setGuests(checkoutFromUrl.guests);
      if (checkoutFromUrl.mix) setParticipantMix(checkoutFromUrl.mix);
      if (checkoutFromUrl.startTime) setSelectedDepartureTime(checkoutFromUrl.startTime);
      return;
    }
    if (!checkoutVariant) {
      setBookingCardError('That tour option is no longer available. Pick another option.');
    }
    commitLocation(
      tourListingPath(tour.id, {
        date: checkoutFromUrl.date,
        guests: checkoutFromUrl.guests,
        optionId: checkoutFromUrl.optionId,
      }),
      'replace'
    );
  }, [checkoutFromUrl, checkoutVariant, tour, commitLocation]);

  const listingHydratedRef = useRef(false);
  const hydratedTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tour || checkoutFromUrl) return;
    if (hydratedTourIdRef.current !== tour.id) {
      hydratedTourIdRef.current = tour.id;
      listingHydratedRef.current = false;
      setBookingDate('');
      setBookingVariantsOpen(false);
      setSelectedBookingVariant(null);
      setSelectedDepartureTime('');
      setParticipantMix({});
      setGuests(1);
    }
    if (listingHydratedRef.current) return;
    listingHydratedRef.current = true;
    const sel = parseTourListingSelection(window.location.search);
    if (sel.date) {
      setBookingDate(sel.date);
      setBookingVariantsOpen(true);
      scrollToOptionsSection();
    }
    if (sel.guests && sel.guests > 0) setGuests(sel.guests);
    if (sel.optionId) {
      const restored = resolveTourCheckoutVariant(tourVariants, sel.optionId);
      if (restored) setSelectedBookingVariant(restored);
    }
  }, [tour, checkoutFromUrl, tourVariants, scrollToOptionsSection]);

  useEffect(() => {
    if (!tour || checkoutFromUrl) return;
    const selectedOptionId = selectedBookingVariant?.id ?? null;
    if (!bookingDate.trim() && !selectedOptionId) return;
    const href = tourListingPath(tour.id, {
      date: bookingDate.trim(),
      guests,
      optionId: selectedOptionId,
    });
    commitLocation(href, 'replace');
  }, [tour, bookingDate, guests, selectedBookingVariant?.id, checkoutFromUrl, commitLocation]);

  useEffect(() => {
    if (!bookingDate.trim() || !bookingVariantsOpen) return;
    const { available, kind } = optionsForSelectedDate;
    if (kind === 'one' && available[0] && selectedBookingVariant?.id !== available[0].id) {
      setSelectedBookingVariant(available[0]);
      if (optionUsesAgePricing(available[0].listingOption)) {
        setParticipantMix(emptyMixSelection(available[0].listingOption!));
      }
    }
  }, [bookingDate, bookingVariantsOpen, optionsForSelectedDate, selectedBookingVariant?.id]);

  const handleCheckoutUrlState = useCallback(
    (patch: {
      step: TourCheckoutFlowStep;
      date: string;
      guests: number;
      mix?: Record<string, number> | null;
      startTime?: string;
    }) => {
      if (!tour || !checkoutFromUrl) return;
      const href = tourCheckoutPath(tour.id, {
        ...checkoutFromUrl,
        date: patch.date,
        guests: patch.guests,
        step: patch.step,
        mix: patch.mix !== undefined ? patch.mix : checkoutFromUrl.mix,
        startTime: patch.startTime !== undefined ? patch.startTime : checkoutFromUrl.startTime,
      });
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== href) {
        window.history.replaceState({}, '', href);
      }
    },
    [tour, checkoutFromUrl]
  );

  const handleStickyBookCta = () => {
    if (selfBookBlocked) {
      setBookingCardError(LISTING_SELF_BOOK_BLOCKED);
      return;
    }
    if (capacityUnknown) {
      // Phase 1361: sticky stays tappable — scroll to desktop Capacity unavailable + retry.
      scrollElementIntoView('tour-booking-card-error', { behavior: 'smooth', block: 'center' });
      if (!document.getElementById('tour-booking-card-error')) {
        scrollElementIntoView('tour-booking-panel', { behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (!bookingDate.trim()) {
      scrollElementIntoView('tour-booking-panel', { behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        const root = document.getElementById('tour-booking-date-input');
        const firstOpen = root?.querySelector('button:not([disabled])') as HTMLButtonElement | null;
        (firstOpen ?? root)?.focus();
      });
      return;
    }
    if (
      selectedBookingVariant &&
      departureTimes.length > 1 &&
      !selectedDepartureTime.trim() &&
      !allDeparturesSoldOut
    ) {
      scrollElementIntoView('tour-departure-times', { behavior: 'smooth', block: 'center' });
      setBookingCardError('Choose a departure time to continue.');
      window.requestAnimationFrame(() => {
        const firstOpen = document.querySelector(
          '#tour-departure-times button:not([disabled])'
        ) as HTMLButtonElement | null;
        const fallback = document.querySelector('#tour-departure-times button') as HTMLButtonElement | null;
        (firstOpen ?? fallback)?.focus();
      });
      return;
    }
    // Phase 1529: quote failure — scroll/focus the fixable control (Stay 1521 parity).
    if (selectedBookingVariant && panelQuote != null && !panelQuote.ok) {
      const focus = tourQuoteFailureFocusTarget({
        quoteError: panelQuote.error,
        quoteCode: panelQuote.code,
      });
      scrollElementIntoView(focus.scrollId, { behavior: 'smooth', block: 'center' });
      if (focus.focusSelector) {
        window.requestAnimationFrame(() => {
          const el = document.querySelector(focus.focusSelector!) as HTMLElement | null;
          el?.focus();
        });
      }
      return;
    }
    if (selectedBookingVariant && !checkoutFromUrl) {
      void handleContinueToCheckout();
      return;
    }
    setBookingVariantsOpen(true);
    scrollToOptionsSection();
  };

  const handleSelectTourVariant = (variant: TourBookingVariant) => {
    if (!tour) return;
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      return;
    }
    if (variant.listingOption) {
      const dayErr = optionRunsOnDate(variant.listingOption, bookingDate.trim());
      if (dayErr) {
        setBookingCardError(dayErr);
        return;
      }
    }
    setBookingCardError(null);
    setSelectedBookingVariant(variant);
    setSelectedDepartureTime('');
    setBookingVariantsOpen(true);
    if (optionUsesAgePricing(variant.listingOption)) {
      setParticipantMix(emptyMixSelection(variant.listingOption!));
    } else {
      const bounds = getPartySizeBoundsForVariant(tour, variant, bookingDate);
      setGuests((g) => Math.min(bounds.max, Math.max(bounds.min, g)));
    }
  };

  const handleContinueToCheckout = async () => {
    if (!tour || !selectedBookingVariant) return;
    if (selfBookBlocked) {
      setBookingCardError(LISTING_SELF_BOOK_BLOCKED);
      return;
    }
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      return;
    }
    const dateCheck = dateNotInPast(bookingDate.trim(), experienceTodayIso);
    if (!dateCheck.valid) {
      setBookingCardError(dateCheck.message ?? 'Please select a date');
      return;
    }
    let partySize = guests;
    if (departureTimes.length > 1 && !selectedDepartureTime.trim()) {
      setBookingCardError('Choose a departure time to continue.');
      return;
    }
    if (optionUsesAgePricing(selectedOptionApplied)) {
      const mixErr = validateParticipantMix(selectedOptionApplied!, participantMix);
      if (mixErr) {
        setBookingCardError(mixErr);
        return;
      }
      partySize = totalGuestsFromMix(
        buildParticipantMixLines(selectedOptionApplied!, participantMix)
      );
    } else {
      const variantBounds = getPartySizeBoundsForVariant(
        tour,
        selectedBookingVariant,
        bookingDate,
        selectedDepartureTime
      );
      const guestErr = guestCountValidationError(guests, variantBounds);
      if (guestErr) {
        setBookingCardError(guestErr);
        return;
      }
    }
    if (selectedBookingVariant.listingOption) {
      const dayErr = optionRunsOnDate(
        selectedBookingVariant.listingOption,
        bookingDate.trim(),
        selectedDepartureTime || undefined
      );
      if (dayErr) {
        setBookingCardError(dayErr);
        return;
      }
    }
    // Phase 1167: unknown remaining must not navigate to checkout (BookingPage 1103 parity).
    if (
      Boolean(dayCapacityError) ||
      (Boolean(bookingDate.trim()) && selectedDaySpotsLeft == null)
    ) {
      setBookingCardError(
        dayCapacityError ||
          'We could not verify departure capacity. Check your connection and try again.'
      );
      return;
    }
    // Phase 1182: sold-out / undersized remaining must not navigate (BookingPage 1178 parity).
    if (selectedDaySpotsLeft != null && selectedDaySpotsLeft < partySize) {
      setBookingCardError(
        selectedDaySpotsLeft === 0
          ? 'This date is fully booked. Try another date or fewer guests.'
          : 'Not enough capacity left for your party. Adjust guests or pick another date.'
      );
      return;
    }
    // Phase 1164: mirror 1147 — block own/team listings before navigating to checkout.
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, tour.supplierId);
        if (selfBook) {
          setBookingCardError(LISTING_SELF_BOOK_BLOCKED);
          return;
        }
      } catch {
        setBookingCardError(LISTING_SELF_BOOK_CHECK_FAILED);
        return;
      }
    }
    setBookingCardError(null);
    setVariantChecking(true);
    try {
      const startHm = selectedDepartureTime.trim();
      const optionId =
        selectedBookingVariant.id !== '__default__' ? selectedBookingVariant.id : undefined;
      // Phase 1168: mirror BookingPage 1161 / edge 1122 — unresolved schedule slot cap must not navigate.
      let slotMaxSpots = tourSlotMaxSpotsFromOption(selectedOptionApplied);
      if (startHm) {
        const slotCap = tourDepartureSlotCapacity({
          listing_extras: tour.listingExtras,
          bookingDate: bookingDate.trim(),
          bookingOptionId: optionId,
          startTime: startHm,
        });
        if (slotCap == null) {
          setBookingCardError('No bookable capacity for this departure.');
          return;
        }
        slotMaxSpots = slotCap;
      }
      const avail = await checkAvailability(tour.id, bookingDate.trim(), partySize, {
        startTimeHm: startHm || null,
        slotMaxSpots,
      });
      if (!avail.available) {
        // Phase 1191: load/check errors must not look like sold-out.
        if (avail.error) {
          setBookingCardError('Could not verify availability. Check your connection and try again.');
          return;
        }
        setBookingCardError(
          avail.remaining !== undefined && avail.remaining === 0
            ? 'This date is fully booked. Try another date or fewer guests.'
            : 'Not enough capacity left for your party. Adjust guests or pick another date.'
        );
        return;
      }
      analytics.bookStart(tour.id);
      const checkoutState: TourCheckoutState = {
        date: bookingDate.trim(),
        optionId: selectedBookingVariant.id,
        guests: partySize,
        mix: optionUsesAgePricing(selectedOptionApplied) ? participantMix : null,
        step: 'review',
        paymentCancelled: false,
        startTime: selectedDepartureTime.trim() || undefined,
      };
      openedCheckoutViaPushRef.current = true;
      commitLocation(tourCheckoutPath(tour.id, checkoutState), 'push');
    } catch {
      setBookingCardError('Could not verify availability. Check your connection and try again.');
    } finally {
      setVariantChecking(false);
    }
  };

  if (
    !tour ||
    !listingDetailVisibleToTraveler({ familyMatches: listingIsOnTravelerCatalog(tour), status: tour.status }) ||
    !listingHasUpcomingBookableSeason(tour)
  ) {
    const isLoading = isSupabaseConfigured() && !tourLoadError && !tour;
    if (isLoading) {
      return (
        <div className="min-h-screen bg-paper tv-page animate-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Skeleton className="h-10 w-48 mb-8" />
            <Skeleton className="h-80 w-full rounded-3xl mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-lg mx-auto px-4 py-16">
          <ErrorState
            title={tourLoadError ? 'Tour unavailable' : 'Tour not found'}
            body={
              tourLoadError
                ? userFacingError(tourLoadError, USER_ERROR.tour)
                : USER_ERROR.tourMissing
            }
            retry={
              tourLoadError
                ? {
                    onClick: () => {
                      setTourLoadError(null);
                      getListingByIdAsync(tourId)
                        .then((found) => setTour(found ?? null))
                        .catch((e) => setTourLoadError(userFacingError(e, USER_ERROR.tour)));
                    },
                  }
                : undefined
            }
            back={{ onClick: onBack, label: 'Back to tours' }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        </div>
      </div>
    );
  }

  const galleryExtras = (tour.listingExtras?.galleryImageUrls ?? [])
    .map((u) => listingHeroImageSrc(u))
    .filter((u): u is string => Boolean(u))
    .slice(0, 3);
  const hero = listingHeroImageSrc(tour.image);
  const uniqueGallery = [hero, ...galleryExtras].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);
  const images = uniqueGallery;
  const hasGallery = images.length > 0;
  const review = publicReviewLabel(reviewAggregate);

  if (checkoutFromUrl && checkoutVariant && canBook) {
    return (
      <BookingPage
        tour={tour}
        presentation="page"
        selectedVariant={checkoutVariant}
        discountsByListing={discountsByListing ?? undefined}
        initialDate={checkoutFromUrl.date}
        initialGuests={Math.max(1, checkoutFromUrl.guests)}
        initialStartTime={checkoutFromUrl.startTime}
        initialParticipantMix={
          optionUsesAgePricing(checkoutVariant.listingOption)
            ? checkoutFromUrl.mix ?? undefined
            : undefined
        }
        initialCheckoutStep={checkoutFromUrl.step}
        stripeReturnCancelled={checkoutFromUrl.paymentCancelled}
        onCheckoutUrlState={handleCheckoutUrlState}
        onBack={closeBookingModal}
        onComplete={closeBookingModal}
        onModalClose={closeBookingModal}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
          <button
            type="button"
            onClick={onBack}
            className="lux-flat inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-2 rounded-full bg-paper-raised px-3.5 text-sm font-medium text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Tours
          </button>
          <div className="flex items-center gap-2">
            {isSupabaseListingId(tour.id) && isSupabaseConfigured() ? (
              <button
                type="button"
                className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03] disabled:opacity-60"
                aria-label={
                  !wishlistHeartKnown
                    ? 'Checking saved status'
                    : savedToWishlist
                      ? 'Remove from saved tours'
                      : 'Save this tour'
                }
                aria-pressed={wishlistHeartKnown ? savedToWishlist : undefined}
                aria-busy={!wishlistHeartKnown}
                disabled={wishlistBusy || !wishlistHeartKnown}
                onClick={handleToggleWishlist}
              >
                <Heart
                  size={18}
                  className={`${wishlistHeartKnown && savedToWishlist ? 'fill-finland text-finland' : ''} ${savePop ? 'tv-pop' : ''}`}
                />
              </button>
            ) : null}
            <button
              type="button"
              className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03]"
              aria-label={shareCopied ? 'Link copied' : 'Share'}
              onClick={() => {
                const url = window.location.href;
                const title = tour.title;
                const done = () => {
                  setShareCopied(true);
                  window.setTimeout(() => setShareCopied(false), 1400);
                };
                if (navigator.share) {
                  void navigator.share({ title, url }).then(done).catch(() => {});
                } else if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(url).then(done);
                }
              }}
            >
              {shareCopied ? <CheckCircle size={18} className="tv-pop text-finland" /> : <Share2 size={18} />}
            </button>
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          {hasGallery ? (
            <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[28rem]">
              <button
                type="button"
                onClick={() => {
                  setSelectedImage(0);
                  setGalleryLightboxOpen(true);
                }}
                className="relative overflow-hidden rounded-2xl bg-ink/10 lg:col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                aria-label={`Open gallery, photo 1 of ${images.length}`}
              >
                <img
                  src={images[0]}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:hover:scale-[1.02]"
                />
              </button>
              {images.slice(1, 5).map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => {
                    setSelectedImage(i + 1);
                    setGalleryLightboxOpen(true);
                  }}
                  className="relative hidden overflow-hidden rounded-xl bg-ink/10 aspect-[4/3] lg:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                  aria-label={`Open gallery, photo ${i + 2} of ${images.length}`}
                >
                  <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  {i === 3 && images.length > 5 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">
                      +{images.length - 5} more
                    </span>
                  ) : null}
                </button>
              ))}
              {images.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden -mx-1 px-1 snap-x snap-mandatory">
                  {images.map((img, index) => (
                    <button
                      key={`m-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedImage(index);
                        setGalleryLightboxOpen(true);
                      }}
                      className={`relative shrink-0 snap-start overflow-hidden rounded-xl ${
                        index === 0 ? 'hidden' : 'w-[42%] aspect-[4/3]'
                      }`}
                      aria-label={`Photo ${index + 1} of ${images.length}`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex aspect-[21/9] items-center justify-center rounded-2xl bg-ink/[0.06] ring-1 ring-black/[0.04]">
              <p className="px-4 text-center text-sm text-ink-muted">No photos yet for this experience</p>
            </div>
          )}
          {hasGallery ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-ink-muted tabular-nums">
                {images.length} {images.length === 1 ? 'photo' : 'photos'}
              </p>
              <button
                type="button"
                onClick={() => setGalleryLightboxOpen(true)}
                className="text-xs font-semibold text-finland hover:underline"
              >
                View all photos
              </button>
            </div>
          ) : null}
        </div>

        <header className="mb-5 sm:mb-6 max-w-3xl">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted mb-2">
            <span className="inline-flex items-center rounded-md bg-finland/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland ring-1 ring-finland/15">
              {tourKindLabel(tour.experienceKind)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} className="shrink-0 text-finland" aria-hidden />
              {tour.destination}
            </span>
            {review.score ? (
              <>
                <span className="text-ink-faint" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star size={14} className="text-finland fill-finland shrink-0" aria-hidden />
                  <strong className="text-ink tabular-nums">{review.score}</strong>
                  <span>
                    ({review.count} {review.count === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              </>
            ) : null}
            {supplierLegal?.operatorName ? (
              <>
                <span className="text-ink-faint" aria-hidden>
                  ·
                </span>
                <span>Hosted by {supplierLegal.operatorName}</span>
              </>
            ) : null}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] text-ink tracking-tight leading-[1.15] break-words [overflow-wrap:anywhere]">
            {tour.title}
          </h1>
          {tour.subtitle?.trim() ? (
            <p className="mt-2 text-base sm:text-lg text-ink-muted leading-snug break-words [overflow-wrap:anywhere]">
              {tour.subtitle.trim()}
            </p>
          ) : null}
        </header>

        <TourQuickFacts tour={tour} />
      </div>

      <section className="bg-paper pb-10">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <TourOverview
              description={tour.description}
              extras={overviewExtras}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2 space-y-10 order-2 lg:order-1">
              {canBook && bookingVariantsOpen && bookingDate.trim() ? (
                <div ref={optionsSectionRef}>
                  <TourAvailableOptions
                    date={bookingDate.trim()}
                    kind={optionsForSelectedDate.kind}
                    available={optionsForSelectedDate.available}
                    selectedId={selectedBookingVariant?.id ?? null}
                    guestsLabel={
                      usesAgePricing && selectedOptionApplied
                        ? formatMixSummaryCompact(buildParticipantMixLines(selectedOptionApplied, participantMix)) ||
                          `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                        : `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                    }
                    currency={normalizeCurrency(tour.price?.currency)}
                    hideSelectedCatalogPrice={Boolean(
                      selectedBookingVariant && panelQuote && !panelQuote.ok
                    )}
                    onChoose={handleSelectTourVariant}
                    onChangeDate={() => {
                      scrollElementIntoView('tour-booking-date-input', { behavior: 'smooth', block: 'center' });
                      window.requestAnimationFrame(() => {
                        const root = document.getElementById('tour-booking-date-input');
                        const firstOpen = root?.querySelector('button:not([disabled])') as HTMLButtonElement | null;
                        (firstOpen ?? root)?.focus();
                      });
                    }}
                    onChangeGuests={() => {
                      scrollElementIntoView('tour-booking-guests', { behavior: 'smooth', block: 'center' });
                    }}
                  />
                </div>
              ) : canBook ? (
                <p className="text-sm text-ink-muted">Pick a date to see times and options for this tour.</p>
              ) : null}

              <TourListingSections
                tour={tour}
                selectedOption={selectedOption}
                supplierLegal={supplierLegal}
                onOpenLegal={setLegalModal}
              />
            </div>

            <div className="lg:col-span-1 order-1 lg:order-2">
              <div
                id="tour-booking-panel"
                className="lg:sticky lg:top-24 h-fit scroll-mt-24 rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft-lg ring-1 ring-black/[0.06]"
              >
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Book this experience</p>
                {!canBook ? (
                  <div>
                    <p className="text-lg font-semibold text-ink">Not bookable yet</p>
                    <p className="mt-2 text-sm text-ink-muted">
                      This tour is a draft. Travelers will see a booking option once the operator publishes it.
                    </p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      // Phase 1560: failed quote beats “Checking offers…” (sticky parity).
                      if (selectedBookingVariant && panelQuote && !panelQuote.ok) {
                        return <p className="mb-4 text-lg font-semibold tabular-nums text-ink">—</p>;
                      }
                      // Phase 1561: successful quote is the hero total (sticky parity — not catalog From).
                      if (selectedBookingVariant && panelQuote?.ok) {
                        return (
                          <p className="mb-4 text-lg font-semibold tabular-nums text-ink">
                            {formatMoney(panelQuote.totalAmount, panelQuote.currency)}
                          </p>
                        );
                      }
                      // Phase 1561: catalog From only before a live quote (ok/fail already returned above).
                      if (discountsByListing == null) {
                        return (
                          <p className="mb-4 text-sm font-medium text-ink-faint">Checking offers…</p>
                        );
                      }
                      const { price, originalPrice, label, qualifier, summary } = getDisplayPriceForTour(
                        tour,
                        discountsByListing
                      );
                      const hasDiscount = label && price < originalPrice;
                      const currency = normalizeCurrency(tour.price?.currency);
                      const unit = qualifier ? `From · per ${qualifier}` : 'From · per person';
                      return (
                        <>
                          <PriceHero
                            amount={Number(price)}
                            currency={currency}
                            basis={unit}
                            originalAmount={hasDiscount ? originalPrice : null}
                            discountLabel={hasDiscount ? label : null}
                          />
                          {summary ? <p className="text-sm text-ink-muted mt-1 mb-4">{summary}</p> : <div className="mb-4" />}
                        </>
                      );
                    })()}
                    <div className="space-y-4">
                      <TourDatePicker
                        id="tour-booking-date-input"
                        value={bookingDate}
                        onChange={(next) => {
                          setBookingDate(next);
                          setBookingCardError(null);
                          setSelectedBookingVariant(null);
                          setSelectedDepartureTime('');
                          const dateCheck = dateNotInPast(next.trim(), experienceTodayIso);
                          if (dateCheck.valid && isListingVisibleToTravelers(tour.status)) {
                            setBookingVariantsOpen(true);
                            scrollToOptionsSection();
                          } else {
                            setBookingVariantsOpen(false);
                          }
                        }}
                        options={calendarOptions}
                        soldOutDates={soldOutDates}
                        todayIso={experienceTodayIso}
                        hint={weekdayHint}
                      />
                      {selectedDaySpotsLeft != null ? (
                        <p
                          className={`-mt-2 text-xs font-medium ${
                            selectedDaySpotsLeft === 0 ? 'text-ink-muted' : 'text-finland'
                          }`}
                        >
                          {(() => {
                            const departureLabel =
                              selectedDepartureTime.trim() ||
                              (departureTimes.length === 1 ? departureTimes[0] : '');
                            if (selectedDaySpotsLeft === 0) {
                              return spotsLeftIsDepartureCapacity && departureLabel
                                ? `Fully booked for the ${departureLabel} departure`
                                : 'Fully booked this day';
                            }
                            if (spotsLeftIsDepartureCapacity && departureLabel) {
                              return selectedDaySpotsLeft === 1
                                ? `1 spot left for the ${departureLabel} departure`
                                : `${selectedDaySpotsLeft} spots left for the ${departureLabel} departure`;
                            }
                            return selectedDaySpotsLeft === 1
                              ? '1 spot left this day'
                              : `${selectedDaySpotsLeft} spots left this day`;
                          })()}
                        </p>
                      ) : null}
                      {selectedBookingVariant ? (
                        <div className="space-y-3 border-t border-black/[0.06] pt-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Selected</p>
                            <p className="text-sm font-semibold text-ink">{selectedBookingVariant.label}</p>
                          </div>
                          {departureTimes.length > 1 ? (
                            <div id="tour-departure-times">
                              <p className="text-sm font-medium text-ink mb-2">Departure time</p>
                              <div className="flex flex-wrap gap-2" role="group" aria-label="Departure time">
                                {departureTimes.map((time) => {
                                  const selected = selectedDepartureTime === time;
                                  const day = bookingDate.trim();
                                  const slotSpotsLeft = (() => {
                                    if (!dayCapacitySnap || !selectedOption) return null;
                                    const dayCap = dayCapacitySnap.capByDay.has(day)
                                      ? dayCapacitySnap.capByDay.get(day)
                                      : undefined;
                                    const cap = optionCapacityForDepartureTime(selectedOption, day, time);
                                    if (!cap) return 0;
                                    return departureSlotSpotsLeft({
                                      dayIso: day,
                                      startTimeHm: time,
                                      maxSpotsPerSlot: cap.maxSpotsPerSlot,
                                      maxPersonsFallback: cap.maxPersons,
                                      paidBySlot: dayCapacitySnap.paidBySlot,
                                      paidByDay: dayCapacitySnap.paidByDay,
                                      dayCapOverride: dayCap,
                                      fallbackDayCap: dayCapacitySnap.fallback,
                                    });
                                  })();
                                  const soldOut = slotSpotsLeft != null && slotSpotsLeft < 1;
                                  return (
                                    <button
                                      key={time}
                                      type="button"
                                      disabled={soldOut}
                                      onClick={() => {
                                        if (soldOut) return;
                                        setSelectedDepartureTime(time);
                                        setBookingCardError(null);
                                        if (selectedOption) {
                                          const resolved = resolveScheduleForDate(
                                            selectedOption,
                                            bookingDate.trim(),
                                            time
                                          );
                                          if (resolved) {
                                            const applied = applyScheduleToOption(selectedOption, resolved);
                                            if (optionUsesAgePricing(applied)) {
                                              setParticipantMix(emptyMixSelection(applied));
                                            }
                                          }
                                        }
                                      }}
                                      className={`lux-flat min-h-11 rounded-xl px-3.5 py-2 text-sm font-semibold tabular-nums ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        selected
                                          ? 'bg-finland text-white ring-finland'
                                          : 'bg-paper-raised text-ink ring-black/[0.08] hover:bg-black/[0.03]'
                                      }`}
                                      aria-pressed={selected}
                                      aria-disabled={soldOut}
                                    >
                                      {soldOut ? `${time} · Sold out` : time}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : departureTimes.length === 1 ? (
                            <p className="text-sm text-ink-muted">Starts {departureTimes[0]}</p>
                          ) : null}
                          {usesAgePricing && selectedOptionApplied ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-ink">Participants</p>
                              {activePriceCategories(selectedOptionApplied).map((cat) => (
                                <ParticipantCategoryStepper
                                  key={cat.id}
                                  category={cat}
                                  quantity={participantMix[cat.id] ?? 0}
                                  currency={normalizeCurrency(tour.price?.currency)}
                                  max={participantCategoryQuantityMax({
                                    option: selectedOptionApplied,
                                    categoryId: cat.id,
                                    selection: participantMix,
                                    partyMax: partyMaxForSelectedDay,
                                  })}
                                  onChange={(qty) => {
                                    setParticipantMix((prev) => ({ ...prev, [cat.id]: qty }));
                                    setBookingCardError(null);
                                  }}
                                  onBoundaryAttempt={(message) => setBookingCardError(message)}
                                />
                              ))}
                            </div>
                          ) : (
                            <GuestStepper
                              id="tour-booking-guests"
                              value={guests}
                              min={
                                getPartySizeBoundsForVariant(
                                  tour,
                                  selectedBookingVariant,
                                  bookingDate,
                                  selectedDepartureTime
                                ).min
                              }
                              max={partyMaxForSelectedDay}
                              onChange={(next) => {
                                setGuests(next);
                                setBookingCardError(null);
                              }}
                              onBoundaryAttempt={(message) => setBookingCardError(message)}
                              label={usesPrivateFlat ? 'Group size' : 'Guests'}
                              ariaDescribedBy={bookingCardError ? 'tour-booking-card-error' : undefined}
                            />
                          )}
                          {panelQuote?.ok ? (
                            <div className="flex items-end justify-between gap-3 pt-1 border-t border-black/[0.06]">
                              <p className="text-xs text-ink-muted">Total</p>
                              <p className="text-lg font-semibold tabular-nums text-ink">
                                {formatMoney(panelQuote.totalAmount, panelQuote.currency)}
                              </p>
                            </div>
                          ) : panelQuote && !panelQuote.ok ? (
                            <p className="text-xs text-red-700">{panelQuote.error}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              // Phase 1530: match sticky — departure before quote-failure focus.
                              if (departureTimes.length > 1 && !selectedDepartureTime.trim()) {
                                setBookingCardError('Choose a departure time to continue.');
                                scrollElementIntoView('tour-departure-times', {
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                                window.requestAnimationFrame(() => {
                                  const firstOpen = document.querySelector(
                                    '#tour-departure-times button:not([disabled])'
                                  ) as HTMLButtonElement | null;
                                  const fallback = document.querySelector(
                                    '#tour-departure-times button'
                                  ) as HTMLButtonElement | null;
                                  (firstOpen ?? fallback)?.focus();
                                });
                                return;
                              }
                              if (panelQuote != null && !panelQuote.ok) {
                                const focus = tourQuoteFailureFocusTarget({
                                  quoteError: panelQuote.error,
                                  quoteCode: panelQuote.code,
                                });
                                scrollElementIntoView(focus.scrollId, {
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                                if (focus.focusSelector) {
                                  window.requestAnimationFrame(() => {
                                    const el = document.querySelector(
                                      focus.focusSelector!
                                    ) as HTMLElement | null;
                                    el?.focus();
                                  });
                                }
                                return;
                              }
                              void handleContinueToCheckout();
                            }}
                            disabled={(() => {
                              const partyForCap =
                                usesAgePricing && selectedOptionApplied
                                  ? Math.max(
                                      1,
                                      totalGuestsFromMix(
                                        buildParticipantMixLines(selectedOptionApplied, participantMix)
                                      )
                                    )
                                  : Math.max(1, guests);
                              // Phase 1529: quote failure stays tappable so CTA can focus the fix.
                              return (
                                variantChecking ||
                                selfBookBlocked ||
                                capacityUnknown ||
                                allDeparturesSoldOut ||
                                (selectedDaySpotsLeft != null && selectedDaySpotsLeft < partyForCap)
                              );
                            })()}
                            aria-describedby={
                              bookingCardError || dayCapacityError || capacityUnknown
                                ? 'tour-booking-card-error'
                                : undefined
                            }
                            className="tv-btn-primary w-full disabled:opacity-60"
                          >
                            {tourStickyBookCtaLabel({
                              hasDate: Boolean(bookingDate.trim()),
                              hasOption: Boolean(selectedBookingVariant),
                              needsDeparture:
                                departureTimes.length > 1 &&
                                !selectedDepartureTime.trim() &&
                                !allDeparturesSoldOut,
                              checking: variantChecking,
                              soldOut: (() => {
                                const partyForCap =
                                  usesAgePricing && selectedOptionApplied
                                    ? Math.max(
                                        1,
                                        totalGuestsFromMix(
                                          buildParticipantMixLines(selectedOptionApplied, participantMix)
                                        )
                                      )
                                    : Math.max(1, guests);
                                return (
                                  allDeparturesSoldOut ||
                                  (selectedDaySpotsLeft != null && selectedDaySpotsLeft < partyForCap)
                                );
                              })(),
                              quoteInvalid: Boolean(panelQuote != null && !panelQuote.ok),
                              quoteError: panelQuote && !panelQuote.ok ? panelQuote.error : null,
                              quoteCode: panelQuote && !panelQuote.ok ? panelQuote.code : null,
                              selfBookBlocked,
                              selfBookCheckFailed,
                              capacityUnknown,
                            })}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-ink-muted">
                          {bookingDate.trim()
                            ? 'Choose an option next to continue.'
                            : 'Choose a date to see available options.'}
                        </p>
                      )}
                      <div id="tour-booking-card-error" className="min-h-[1.25rem]">
                        {dayCapacityError ||
                        (capacityUnknown && !bookingCardError) ? (
                          <NoticeCallout title="Capacity unavailable" tone="danger">
                            {dayCapacityError ||
                              (bookingDate.trim() &&
                              selectedBookingVariant &&
                              departureTimes.length === 0
                                ? 'No bookable departure on this date. The season start may be missing, or the departure has already passed its cutoff.'
                                : 'We could not verify departure capacity. Check your connection and try again.')}{' '}
                            <button
                              type="button"
                              className="font-semibold text-finland hover:underline"
                              onClick={() => reloadTourDayCapacity()}
                            >
                              Try again
                            </button>
                          </NoticeCallout>
                        ) : bookingCardError ? (
                          <NoticeCallout title="Check your selection" tone="danger">
                            {bookingCardError}
                          </NoticeCallout>
                        ) : null}
                      </div>
                      <div className="space-y-1.5 text-xs text-ink-muted">
                        <p className="flex items-start gap-2">
                          <Shield className="w-3.5 h-3.5 text-finland flex-shrink-0 mt-0.5" aria-hidden />
                          Secure checkout · {STRIPE_TEST_UNTIL_LIVE}
                        </p>
                        <p className="leading-relaxed">{TOUR_LISTING_CONFIRMATION_NOTE}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 bg-paper border-t border-black/[0.06]">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-xl sm:text-2xl text-ink">Reviews</h2>
            {reviews.length > 0 ? (
              <button
                type="button"
                onClick={() => setReviewsModalOpen(true)}
                className="text-sm font-semibold text-finland hover:underline"
              >
                See all reviews
              </button>
            ) : null}
          </div>
          {reviewsLoadError ? (
            <div className="mb-6 max-w-xl">
              <p className="text-ink-muted leading-relaxed">{reviewsLoadError}</p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-finland hover:underline"
                onClick={() => loadReviews()}
              >
                Try again
              </button>
            </div>
          ) : reviews.length === 0 && !showReviewForm ? (
            <p className="text-ink-muted mb-6 max-w-xl leading-relaxed">
              {LISTING_REVIEWS_EMPTY_COPY}
            </p>
          ) : null}
          <div className="space-y-4 mb-5">
            {reviews.slice(0, 3).map((r) => (
              <div key={r.id} className="border-b border-black/[0.06] pb-6 last:border-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium text-ink">{r.guest_name}</span>
                  {r.verified && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                  )}
                  <span className="text-sm text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i <= r.rating ? 'text-finland fill-finland' : 'text-ink-faint'}
                    />
                  ))}
                </div>
                {r.title && (
                  <p className="font-medium text-ink mb-1 break-words [overflow-wrap:anywhere]">{r.title}</p>
                )}
                <p className="text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.comment}</p>
                {reviewReplies[r.id]?.reply_text ? (
                  <div className="mt-3 rounded-xl bg-finland/[0.04] px-3.5 py-3 ring-1 ring-finland/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland mb-1">
                      Response from the operator
                    </p>
                    <p className="text-sm text-ink leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{reviewReplies[r.id]!.reply_text}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {canLeaveReview && !hasReviewed && !showReviewForm && (
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              className="tv-btn-secondary"
            >
              Leave a review
            </button>
          )}

          {showReviewForm && user && (
            <div className="max-w-xl">
              <h3 className="font-display text-lg text-ink mb-3">Write a review</h3>
              <div className="space-y-3">
                <div>
                  <label id="tour-review-rating-label" className="block text-sm font-medium text-ink mb-1">
                    Rating
                  </label>
                  <div className="flex gap-1" role="group" aria-labelledby="tour-review-rating-label">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReviewRating(i)}
                        className="lux-tap-target min-h-11 min-w-11 inline-flex items-center justify-center p-0.5"
                        aria-label={`Rate ${i} out of 5 stars`}
                        aria-pressed={i <= reviewRating}
                      >
                        <Star
                          size={24}
                          className={i <= reviewRating ? 'text-finland fill-finland' : 'text-ink-faint'}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="tour-review-title" className="block text-sm font-medium text-ink mb-1">
                    Title (optional)
                  </label>
                  <input
                    id="tour-review-title"
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="tv-input"
                    placeholder="Sum up your experience"
                  />
                </div>
                <div>
                  <label htmlFor="tour-review-comment" className="block text-sm font-medium text-ink mb-1">
                    Your review *
                  </label>
                  <textarea
                    id="tour-review-comment"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={3}
                    className="tv-input"
                    placeholder="Tell others what you liked…"
                    required
                  />
                </div>
                {reviewError ? (
                  <NoticeCallout title="Could not submit review" tone="danger">
                    {reviewError}
                  </NoticeCallout>
                ) : null}
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={reviewSubmitting || !reviewComment.trim()}
                    aria-busy={reviewSubmitting || undefined}
                    onClick={async () => {
                      if (!bookingIdForReview) {
                        setReviewError('A completed booking is required to leave a review.');
                        return;
                      }
                      setReviewSubmitting(true);
                      setReviewError(null);
                      const res = await submitReview({
                        listingId: tour.id,
                        userId: user.id,
                        guestName: travelerDisplayNameFromSources({
                          profileDisplayName,
                          metadata: user.user_metadata as {
                            full_name?: string;
                            name?: string;
                            customer_first_name?: string;
                            customer_last_name?: string;
                          },
                        }),
                        rating: reviewRating,
                        title: reviewTitle.trim() || undefined,
                        comment: reviewComment.trim(),
                        bookingId: bookingIdForReview,
                      });
                      setReviewSubmitting(false);
                      if (res.success) {
                        setShowReviewForm(false);
                        setReviewTitle('');
                        setReviewComment('');
                        setHasReviewed(true);
                        loadReviews();
                      } else {
                        setReviewError(userFacingError(res.error, USER_ERROR.review));
                      }
                    }}
                    className="tv-btn-primary disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Submitting…' : 'Submit review'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                    className="tv-btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {canBook && !checkoutFromUrl
        ? createPortal(
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-black/[0.06] bg-paper-raised/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto flex w-full min-w-0 max-w-5xl items-center justify-between gap-3">
                {(() => {
                  const currency = normalizeCurrency(tour.price?.currency);
                  const dateLabel = bookingDate.trim() ? formatTourAvailabilityHeading(bookingDate.trim()) : '';
                  const guestsLine =
                    usesAgePricing && selectedOptionApplied
                      ? formatMixSummaryCompact(buildParticipantMixLines(selectedOptionApplied, participantMix)) ||
                        `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                      : `${guests} ${guests === 1 ? 'guest' : 'guests'}`;
                  // Phase 1560: once panelQuote exists (ok or fail), never stall on “Checking offers…”.
                  if (discountsByListing == null && !(selectedBookingVariant && panelQuote)) {
                    return (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-faint">Checking offers…</p>
                        <p className="truncate text-xs text-ink-muted">{guestsLine}</p>
                      </div>
                    );
                  }
                  const { price, qualifier } = getDisplayPriceForTour(
                    tour,
                    discountsByListing ?? new Map()
                  );
                  // Phase 1547: with option selected, never invent catalog From when quote failed (1545/1546 parity).
                  // Phase 1604: mobile sticky says “Price unavailable” (not em dash) + short error in subline.
                  const quoteFailed = Boolean(selectedBookingVariant && panelQuote && !panelQuote.ok);
                  const priceLine =
                    selectedBookingVariant && panelQuote?.ok
                      ? formatMoney(panelQuote.totalAmount, panelQuote.currency)
                      : quoteFailed
                        ? 'Price unavailable'
                        : `From ${formatMoney(Number(price), currency)}`;
                  const subLine =
                    quoteFailed
                      ? (panelQuote?.error?.trim().slice(0, 72) || 'Adjust date, guests, or option')
                      : selectedBookingVariant
                      ? [
                          selectedBookingVariant.label,
                          selectedDepartureTime || (departureTimes.length === 1 ? departureTimes[0] : null),
                          dateLabel,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : dateLabel
                        ? `${dateLabel} · ${guestsLine}`
                        : listingShowsFreeCancellation(tour)
                          ? `Free cancellation · ${qualifier ? `per ${qualifier}` : 'per person'}`
                          : qualifier
                            ? `From · per ${qualifier}`
                            : 'From · per person';
                  return (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tabular-nums text-ink">{priceLine}</p>
                      <p className="truncate text-xs text-ink-muted">{subLine}</p>
                    </div>
                  );
                })()}
                <button
                  type="button"
                  onClick={handleStickyBookCta}
                  disabled={(() => {
                    const partyForCap =
                      usesAgePricing && selectedOptionApplied
                        ? Math.max(
                            1,
                            totalGuestsFromMix(
                              buildParticipantMixLines(selectedOptionApplied, participantMix)
                            )
                          )
                        : Math.max(1, guests);
                    // Phase 1529: quote failure stays tappable for focus (Stay 1521 parity).
                    return (
                      variantChecking ||
                      selfBookBlocked ||
                      allDeparturesSoldOut ||
                      (Boolean(selectedBookingVariant) &&
                        selectedDaySpotsLeft != null &&
                        selectedDaySpotsLeft < partyForCap)
                    );
                  })()}
                  className="tv-btn-primary min-h-11 shrink-0 disabled:opacity-60"
                >
                  {tourStickyBookCtaLabel({
                    hasDate: Boolean(bookingDate.trim()),
                    hasOption: Boolean(selectedBookingVariant),
                    needsDeparture:
                      Boolean(selectedBookingVariant) &&
                      departureTimes.length > 1 &&
                      !selectedDepartureTime &&
                      !allDeparturesSoldOut,
                    checking: variantChecking,
                    variantsOpen: bookingVariantsOpen,
                    soldOut: (() => {
                      const partyForCap =
                        usesAgePricing && selectedOptionApplied
                          ? Math.max(
                              1,
                              totalGuestsFromMix(
                                buildParticipantMixLines(selectedOptionApplied, participantMix)
                              )
                            )
                          : Math.max(1, guests);
                      return (
                        allDeparturesSoldOut ||
                        (Boolean(selectedBookingVariant) &&
                          selectedDaySpotsLeft != null &&
                          selectedDaySpotsLeft < partyForCap)
                      );
                    })(),
                    quoteInvalid: Boolean(selectedBookingVariant && panelQuote != null && !panelQuote.ok),
                    quoteError: panelQuote && !panelQuote.ok ? panelQuote.error : null,
                    quoteCode: panelQuote && !panelQuote.ok ? panelQuote.code : null,
                    selfBookBlocked,
                    selfBookCheckFailed,
                    capacityUnknown,
                  })}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}


      {galleryLightboxOpen && hasGallery ? (
        <div
          ref={gallerySheetRef}
          className="fixed inset-0 z-[80] flex flex-col bg-ink/90"
          role="dialog"
          aria-modal="true"
          aria-label="Photo gallery"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <p className="text-sm tabular-nums">
              {Math.min(selectedImage, images.length - 1) + 1} / {images.length}
            </p>
            <button
              type="button"
              className="tv-btn-ghost text-white hover:bg-white/10"
              onClick={closeGalleryLightbox}
            >
              Close
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            <img
              src={images[Math.min(selectedImage, images.length - 1)]}
              alt=""
              className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain"
            />
          </div>
          {images.length > 1 ? (
            <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-6">
              {images.map((img, index) => (
                <button
                  key={`lb-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-label={`Photo ${index + 1}`}
                  aria-current={selectedImage === index ? 'true' : undefined}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${
                    selectedImage === index ? 'ring-white' : 'ring-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <ListingReviewsModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        reviews={reviews}
        replies={reviewReplies}
        listingTitle={tour.title}
      />

      {legalModal && supplierLegal && (
        <div
          ref={legalSheetRef}
          className="tv-sheet-overlay z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-legal-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            tabIndex={-1}
            onClick={closeLegalModal}
          />
          <div className="tv-sheet-panel relative z-[71] max-w-2xl flex flex-col motion-safe:animate-slide-up">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 id="tour-legal-title" className="font-display text-2xl text-ink">
                {legalModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h3>
              <button
                type="button"
                onClick={closeLegalModal}
                className="tv-btn-ghost shrink-0"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto text-sm text-ink leading-relaxed whitespace-pre-wrap">
              {legalModal === 'privacy'
                ? supplierLegal.privacy_policy_text
                : supplierLegal.terms_conditions_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



