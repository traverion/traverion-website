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
  Users,
  X,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../contexts/AuthContext';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import { trackListingTraffic } from '../lib/listing-traffic';
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
import PublicReviewCard from '../components/PublicReviewCard';
import StarRatingDisplay from '../components/StarRatingDisplay';
import ListingPdpReviewMeta from '../components/ListingPdpReviewMeta';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import { setPageMetaWithOg, setTourJsonLd, clearTourJsonLd } from '../lib/seo';
import { Skeleton } from '../components/ui/Skeleton';
import { dateNotInPast } from '../lib/validation';
import { checkAvailability, fetchAvailabilityByListingId, fetchPublishedTourConfirmedDepartureKeys, fetchPublishedTourPaidGuests, fetchPublishedTourPaidGuestsBySlot, tourPaidSlotKey } from '../data/supabase-availability';
import { confirmedDepartureKey, evaluateDepartureBookingWindow } from '../lib/last-minute-booking';
import { optionRunsOnDate, experienceTodayIsoForListing, listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { isListingVisibleToTravelers, listingDetailVisibleToTraveler } from '../lib/product-workflows';
import { listingIsOnTravelerCatalog } from '../lib/inventory';
import { reviewOnlyPackageFromListingOps } from '../lib/trip-views';
import { fetchListingOpsByIds } from '../data/supabase-listings';
import { listingShowsFreeCancellation, publicReviewLabel } from '../lib/listingTruth';
import { listingHeroImageSrc, orderedPhotoUrls, photoSlotsFromTourPackage } from '../lib/listingPhotoGrid';
import ListingPdpPhotoGallery from '../components/ListingPdpPhotoGallery';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { listingTourCapacityFromOptions, remainingCapacity, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import { departureSlotSpotsLeft, maxSpotsLeftAcrossDepartures, partyMaxCappedByRemainingSpots } from '../lib/departure-slot-remaining';
import { tourSoldOutDates } from '../lib/tour-calendar';
import BookingPage from './BookingPage';
import {
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
  remapMixToOption,
  formatMixSummaryCompact,
  optionUsesAgePricing,
  optionUsesPrivateFlatPrice,
  totalGuestsFromMix,
  participantCategoryQuantityMax,
  validateParticipantMix,
  type ParticipantMixSelection,
} from '../lib/participant-mix';
import { activePriceCategories } from '../lib/price-categories';
import { quoteBooking, type BookingQuoteOk } from '../lib/booking-quote';
import {
  allScheduleDepartureTimes,
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  departureTimesOnDate,
  resolveScheduleForDate,
  applyScheduleToOption,
  optionCapacityForDepartureTime,
} from '../lib/listing-option-schedules';
import { tourBookableSellingDeparturesOnDate } from '../lib/booking-quote';
import { normalizeBookingCutoffHours, resolveDepartureTimezone } from '../lib/tour-departure-cutoff';
import { formatTourAvailabilityHeading, optionsOnDate } from '../lib/tour-available-options';
import { tourSlotMaxSpotsFromOption } from '../lib/tour-slot-capacity';
import { tourDepartureSlotCapacity } from '../../supabase/functions/_shared/booking-quote.ts';
import { tourStickyBookCtaLabel } from '../lib/tour-sticky-cta';
import { tourQuoteFailureFocusTarget } from '../lib/tour-quote-failure-focus';
import { saveTravelerCart } from '../lib/travelerCart';
import { rememberAccountCart } from '../data/supabase-cart';
import { scrubListingBookingSelectionFromLocation } from '../lib/listing-booking-fresh';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { formatMoney, normalizeCurrency } from '../lib/money';
import NoticeCallout from '../components/NoticeCallout';
import TourQuickFacts from '../components/tour-detail/TourQuickFacts';
import TourOverview from '../components/tour-detail/TourOverview';
import TourAvailableOptions from '../components/tour-detail/TourAvailableOptions';
import TourListingSections, { TourOperatorBlock } from '../components/tour-detail/TourListingSections';
import { ListingReviewsModal } from '../components/ListingReviewsModal';

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
  /** Label for the back control — reflects where the traveler came from. */
  backLabel?: string;
  /** True while the checkout sheet is on screen, so the marketplace header can step aside. */
  onCheckoutActive?: (active: boolean) => void;
}

function quotedOfferPrice(quote: BookingQuoteOk) {
  const show =
    Boolean(quote.discountLabel) &&
    quote.originalTotalAmount != null &&
    quote.originalTotalAmount > quote.totalAmount + 0.004;
  if (!show || quote.originalTotalAmount == null) {
    return formatMoney(quote.totalAmount, quote.currency);
  }
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-sm font-medium text-ink-muted line-through tabular-nums">
        {formatMoney(quote.originalTotalAmount, quote.currency)}
      </span>
      <span className="font-bold tabular-nums text-[#111827]">{formatMoney(quote.totalAmount, quote.currency)}</span>
      <span className="rounded-md bg-[#F8EFEA] px-1.5 py-0.5 text-xs font-semibold text-[#9A3412]">
        {quote.discountLabel}
      </span>
    </span>
  );
}

export default function TourDetails({ tourId, onBack, backLabel = 'Tours', onCheckoutActive }: TourDetailsProps) {
  const { user, loading: authLoading, requestAuth } = useAuth();
  const [tour, setTour] = useState<TourPackage | null>(null);
  const [tourLoadError, setTourLoadError] = useState<string | null>(null);
  /** Phase 1731: loaded for Leave a review when draft/season-ended (not a live bookable PDP). */
  const [reviewOnlyAccess, setReviewOnlyAccess] = useState(false);
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
  const [bookingDate, setBookingDate] = useState('');
  const [guests, setGuests] = useState(1);
  const [discountsByListing, setDiscountsByListing] = useState<Map<
    string,
    import('../data/supabase-discounts').ListingDiscount[]
  > | null>(null);
  const [supplierLegal, setSupplierLegal] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    public_description: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  } | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const legalSheetRef = useRef<HTMLDivElement>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participantsRef = useRef<HTMLDivElement>(null);
  const closeLegalModal = useCallback(() => setLegalModal(null), []);
  useDialogFocus(legalModal !== null, legalSheetRef, closeLegalModal);
  useEffect(() => {
    if (!participantsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!participantsRef.current?.contains(event.target as Node)) setParticipantsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setParticipantsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    const first = participantsRef.current?.querySelector<HTMLElement>('[role="dialog"] button');
    first?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [participantsOpen]);
  const [bookingCardError, setBookingCardError] = useState<string | null>(null);
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const [bookingVariantsOpen, setBookingVariantsOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState(
    () => (typeof window === 'undefined' ? '' : window.location.search)
  );
  const openedCheckoutViaPushRef = useRef(false);
  const [selectedBookingVariant, setSelectedBookingVariant] = useState<TourBookingVariant | null>(null);
  const [selectedDepartureTime, setSelectedDepartureTime] = useState('');
  const [participantMix, setParticipantMix] = useState<ParticipantMixSelection>({});
  const [variantChecking, setVariantChecking] = useState(false);
  const checkoutContinueRef = useRef(false);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const [wishlistHeartKnown, setWishlistHeartKnown] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [soldOutDates, setSoldOutDates] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmedDepartureKeys, setConfirmedDepartureKeys] = useState<ReadonlySet<string>>(() => new Set());
  /** Soft tick so departure chips drop as cutoffs pass without a full remount. */
  const [bookingClockMs, setBookingClockMs] = useState(() => Date.now());
  const [departureClosedNote, setDepartureClosedNote] = useState('');
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
  // Phase 1708: effect sync only — per-render wipe broke Save→sign-in wishlist resume (1704 parity).
  const userRef = useRef(user);
  const bookingDateRef = useRef(bookingDate);
  bookingDateRef.current = bookingDate;
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const partyBounds = useMemo(() => (tour ? getPartySizeBounds(tour) : { min: 1, max: 0 }), [tour]);
  // Phase 1709: season-ended review loads must not show book UI.
  const canBook = Boolean(
    tour && isListingVisibleToTravelers(tour.status) && listingHasUpcomingBookableSeason(tour)
  );
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
            return listingOptionReadySchedules(o).flatMap((s) =>
              allScheduleDepartureTimes(s, o.startMode).filter((t) => t && t !== '00:00')
            );
          }
          const t = String(o.startTime ?? '').trim();
          return t ? [t] : [];
        })
      ),
    ];
    // Start times and spoken languages already appear in options / facts — skip duplicates here.
    if (x?.scheduleStyle === 'on_request' && optionStartTimes.length === 0) {
      // Phase 1118: checkout is still fixed date/slot — do not claim post-book arrangement.
      lines.push('Host notes flexible timing — still choose an available date when you book.');
    }
    if (x?.venueSetting === 'indoor') lines.push('Mostly indoor.');
    else if (x?.venueSetting === 'outdoor') lines.push('Mostly outdoor.');
    else if (x?.venueSetting === 'mixed') lines.push('Indoor and outdoor.');
    if (x?.accessibilitySummary?.trim()) lines.push(x.accessibilitySummary.trim());
    return lines;
  }, [tour]);

  const selectedOption = selectedBookingVariant?.listingOption ?? null;
  const listingCutoffHours = normalizeBookingCutoffHours(
    tour?.listingExtras?.bookingCutoffHoursBeforeStart
  );
  const optionCutoffHours = normalizeBookingCutoffHours(
    selectedOption?.bookingCutoffHoursBeforeStart
  );
  const bookingCutoffHours = optionCutoffHours > 0 ? optionCutoffHours : listingCutoffHours;
  const departureTimezone = resolveDepartureTimezone(tour?.listingExtras?.departureTimezone);
  const experienceTodayIso = experienceTodayIsoForListing(departureTimezone);
  useEffect(() => {
    if (!bookingDate.trim()) return;
    const id = window.setInterval(() => setBookingClockMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [bookingDate]);

  const departureTimes = useMemo(() => {
    if (!selectedOption || !bookingDate.trim()) return [] as string[];
    const times = departureTimesOnDate(selectedOption, bookingDate.trim());
    const day = bookingDate.trim();
    const slotOverrides = tour?.listingExtras?.slotOverrides ?? [];
    return times.filter((time) => {
      const ov = slotOverrides.find(
        (o) => o.date === day && (o.startTimeHm === time || o.startTimeHm === time.slice(0, 5))
      );
      const cutoff =
        ov?.cutoffHours != null
          ? normalizeBookingCutoffHours(ov.cutoffHours)
          : bookingCutoffHours;
      return evaluateDepartureBookingWindow({
        bookingDate: day,
        startTimeHm: time,
        cutoffHoursBeforeStart: cutoff,
        nowMs: bookingClockMs,
        timeZone: departureTimezone,
        lastMinuteEnabled: selectedOption.lastMinuteBookings === true,
        lastMinuteUntil: selectedOption.lastMinuteUntil,
        confirmedPaidOnDeparture: confirmedDepartureKeys.has(
          confirmedDepartureKey(day, time, selectedOption.id)
        ),
      }).ok;
    });
  }, [
    selectedOption,
    bookingDate,
    bookingCutoffHours,
    departureTimezone,
    confirmedDepartureKeys,
    tour?.listingExtras?.slotOverrides,
    bookingClockMs,
  ]);

  const selectedDepartureRef = useRef(selectedDepartureTime);
  selectedDepartureRef.current = selectedDepartureTime;
  useEffect(() => {
    const prev = selectedDepartureRef.current;
    const next =
      departureTimes.length === 1 ? departureTimes[0] : departureTimes.includes(prev) ? prev : '';
    if (prev && next !== prev) {
      setDepartureClosedNote('This departure is no longer available for online booking. Choose another time.');
    } else if (next) {
      setDepartureClosedNote('');
    }
    if (next !== prev) setSelectedDepartureTime(next);
  }, [departureTimes]);

  const selectedOptionApplied = useMemo(() => {
    if (!selectedOption) return null;
    if (!listingOptionHasSchedules(selectedOption)) return selectedOption;
    const resolved = resolveScheduleForDate(
      selectedOption,
      bookingDate.trim(),
      selectedDepartureTime || undefined
    );
    return resolved
      ? applyScheduleToOption(selectedOption, resolved, selectedDepartureTime || undefined)
      : selectedOption;
  }, [selectedOption, bookingDate, selectedDepartureTime]);

  const usesAgePricing = optionUsesAgePricing(selectedOptionApplied);
  const usesPrivateFlat = optionUsesPrivateFlatPrice(selectedOptionApplied);
  const sharedParticipantOption = useMemo(() => {
    const aged = tourVariants
      .map((variant) => variant.listingOption)
      .filter((option): option is NonNullable<typeof option> => Boolean(option && optionUsesAgePricing(option)));
    if (aged.length === 0) return null;
    const signature = (option: (typeof aged)[number]) =>
      activePriceCategories(option)
        .map((category) => `${category.kind}:${category.ageMin ?? ''}:${category.ageMax ?? ''}:${category.label}`)
        .join('|');
    const first = signature(aged[0]);
    return aged.every((option) => signature(option) === first) ? aged[0] : null;
  }, [tourVariants]);
  const participantFieldOption =
    selectedOptionApplied && optionUsesAgePricing(selectedOptionApplied)
      ? selectedOptionApplied
      : sharedParticipantOption;
  useEffect(() => {
    if (selectedOptionApplied || !sharedParticipantOption) return;
    const known = new Set(activePriceCategories(sharedParticipantOption).map((category) => category.id));
    setParticipantMix((prev) => {
      const foreign = Object.keys(prev).some((id) => !known.has(id));
      if (!foreign) return prev;
      const owner = tourVariants
        .map((variant) => variant.listingOption)
        .find(
          (option) =>
            option &&
            Object.keys(prev).every((id) => activePriceCategories(option).some((category) => category.id === id))
        );
      if (!owner) return prev;
      return remapMixToOption(sharedParticipantOption, owner, prev);
    });
  }, [selectedOptionApplied, sharedParticipantOption, tourVariants]);
  const participantPricesAgree = useMemo(() => {
    if (selectedOptionApplied && optionUsesAgePricing(selectedOptionApplied)) return true;
    const aged = tourVariants
      .map((variant) => variant.listingOption)
      .filter((option): option is NonNullable<typeof option> => Boolean(option && optionUsesAgePricing(option)));
    if (aged.length === 0) return false;
    const priceSignature = (option: (typeof aged)[number]) =>
      activePriceCategories(option)
        .map((category) => `${category.kind}:${category.priceUsd}`)
        .join('|');
    const first = priceSignature(aged[0]);
    return aged.every((option) => priceSignature(option) === first);
  }, [selectedOptionApplied, tourVariants]);

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
      confirmedPaidOnDeparture: Boolean(
        selectedDepartureTime &&
          optionId &&
          confirmedDepartureKeys.has(
            confirmedDepartureKey(bookingDate.trim(), selectedDepartureTime, optionId)
          )
      ),
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
    confirmedDepartureKeys,
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
    setConfirmedDepartureKeys(new Set());
    setDepartureClosedNote('');
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
      fetchPublishedTourConfirmedDepartureKeys(tour.id),
    ])
      .then(([caps, paidByDay, paidBySlot, confirmedKeys]) => {
        if (cancelled || reloadGen !== dayCapacityReloadGenRef.current) return;
        setConfirmedDepartureKeys(confirmedKeys);
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
              // Listing-level cutoff only — each option/slot applies its own override inside.
              tourBookableSellingDeparturesOnDate(optionsSnapshot, day, {
                cutoffHoursBeforeStart: listingCutoffHours,
                timeZone: departureTimezone,
                confirmedDepartureKeys: confirmedKeys,
                slotOverrides: tour?.listingExtras?.slotOverrides ?? null,
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
  }, [
    tour?.id,
    tourId,
    listingCutoffHours,
    departureTimezone,
    experienceTodayIso,
    calendarOptionsCapacityKey,
    tour?.listingExtras?.slotOverrides,
  ]);

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

  const departureClosedReloadRef = useRef('');
  useEffect(() => {
    const err = panelQuote && !panelQuote.ok ? panelQuote.error : '';
    if (!/no longer available|Online booking closes/i.test(err)) return;
    if (departureClosedReloadRef.current === err) return;
    departureClosedReloadRef.current = err;
    reloadTourDayCapacity();
  }, [panelQuote, reloadTourDayCapacity]);

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
    // Option selected but every departure already past cutoff → do not fall through to day-cap spots.
    if (selectedOptionApplied && bookingDate.trim()) {
      return null;
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
    // Phase 1708: gate on userRef + hydrate session before resume (1704 checkout parity).
    if (!userRef.current) {
      requestAuth({
        onSuccess: () => {
          void (async () => {
            if (supabase) {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) {
                userRef.current = sessionData.session.user;
              }
            }
            void run();
          })();
        },
      });
      return;
    }
    void run();
  }, [tour?.id, requestAuth, savedToWishlist]);

  // Phase 1852: blank tour only when the listing id changes. Clearing on user?.id
  // unmounted BookingPage mid-checkout and restored stale URL step=review.
  useEffect(() => {
    setTourLoadError(null);
    setTour(null);
    setReviewOnlyAccess(false);
  }, [tourId]);

  useEffect(() => {
    setTourLoadError(null);
    setReviewOnlyAccess(false);
    if (isSupabaseConfigured()) {
      let cancelled = false;
      getListingByIdAsync(tourId)
        .then(async (found) => {
          if (cancelled) return;
          const tryReviewOnlyLoad = async (): Promise<boolean> => {
            const uid = userRef.current?.id;
            const email = userRef.current?.email ?? '';
            if (!uid) return false;
            try {
              const { canReview } = await userHasCompletedBookingForListing(uid, email, tourId);
              if (cancelled || !canReview) return false;
              if (found) {
                setReviewOnlyAccess(true);
                setTour(found);
                return true;
              }
              const opsMap = await fetchListingOpsByIds([tourId]);
              if (cancelled) return false;
              const ops = opsMap[tourId];
              if (!ops) return false;
              setReviewOnlyAccess(true);
              setTour(reviewOnlyPackageFromListingOps(tourId, ops));
              return true;
            } catch {
              return false;
            }
          };

          if (
            !found ||
            !listingDetailVisibleToTraveler({
              familyMatches: listingIsOnTravelerCatalog(found),
              status: found.status,
            })
          ) {
            // Phase 1731: draft/unpublished — hydrate review-only PDP via party ops.
            if (await tryReviewOnlyLoad()) return;
            setTour(null);
            if (found) setTourLoadError(USER_ERROR.tourMissing);
            return;
          }
          // Phase 1266: season-ended tours are not a live browse/book PDP.
          // Phase 1709/1731: still load when signed-in traveler can leave a review.
          if (!listingHasUpcomingBookableSeason(found)) {
            if (await tryReviewOnlyLoad()) return;
            setTour(null);
            setTourLoadError(USER_ERROR.tourMissing);
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
  }, [tourId, user?.id]);

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
        row.display_name?.trim() || row.company_legal_name?.trim() || 'Operator';
      setSupplierLegal({
        operatorName,
        business_logo_url: row.business_logo_url?.trim() || null,
        public_description: row.public_description?.trim() || null,
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

  const checkoutAuthPromptedRef = useRef(false);
  const closeBookingModal = useCallback(() => {
    if (!tour) return;
    // Clean listing URL — selection stays in React state for Edit/Back; refresh starts fresh.
    const listing = tourListingPath(tour.id);
    if (openedCheckoutViaPushRef.current) {
      openedCheckoutViaPushRef.current = false;
      const pathBefore = `${window.location.pathname}${window.location.search}`;
      window.history.back();
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` === pathBefore) {
          commitLocation(listing, 'replace');
          return;
        }
        scrubListingBookingSelectionFromLocation();
        setLocationSearch(window.location.search);
      }, 50);
      return;
    }
    commitLocation(listing, 'replace');
  }, [tour, commitLocation]);

  useEffect(() => {
    const onPop = () => {
      openedCheckoutViaPushRef.current = false;
      setLocationSearch(window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const checkoutUnlocked =
    Boolean(checkoutFromUrl && checkoutVariant && canBook) &&
    (!isSupabaseConfigured() || Boolean(user));

  useEffect(() => {
    onCheckoutActive?.(checkoutUnlocked);
    return () => onCheckoutActive?.(false);
  }, [checkoutUnlocked, onCheckoutActive]);

  useEffect(() => {
    if (!checkoutFromUrl || !checkoutVariant || !canBook || !isSupabaseConfigured() || authLoading || user) {
      if (!checkoutFromUrl) checkoutAuthPromptedRef.current = false;
      return;
    }
    if (checkoutAuthPromptedRef.current) return;
    checkoutAuthPromptedRef.current = true;
    requestAuth({
      intent: 'checkout',
      onDismiss: () => {
        checkoutAuthPromptedRef.current = false;
        closeBookingModal();
      },
    });
  }, [checkoutFromUrl, checkoutVariant, canBook, authLoading, user, requestAuth, closeBookingModal]);

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
    // Invalid / unavailable checkout option — exit checkout, keep selection in React only.
    if (!checkoutVariant) {
      setBookingCardError('That tour option is no longer available. Pick another option.');
    }
    setBookingDate(checkoutFromUrl.date);
    setGuests(checkoutFromUrl.guests);
    if (checkoutFromUrl.mix) setParticipantMix(checkoutFromUrl.mix);
    if (checkoutFromUrl.startTime) setSelectedDepartureTime(checkoutFromUrl.startTime);
    setBookingVariantsOpen(true);
    commitLocation(tourListingPath(tour.id), 'replace');
  }, [checkoutFromUrl, checkoutVariant, tour, commitLocation]);

  const hydratedTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tour || checkoutFromUrl) return;
    scrubListingBookingSelectionFromLocation();
    setLocationSearch(window.location.search);
    if (hydratedTourIdRef.current === tour.id) return;
    hydratedTourIdRef.current = tour.id;
    setBookingDate('');
    setBookingVariantsOpen(false);
    setSelectedBookingVariant(null);
    setSelectedDepartureTime('');
    setParticipantMix({});
    setGuests(1);
    setBookingCardError(null);
  }, [tour, checkoutFromUrl]);

  useEffect(() => {
    if (!tour || checkoutFromUrl) return;
    const href = tourListingPath(tour.id);
    commitLocation(href, 'replace');
  }, [tour?.id, checkoutFromUrl, commitLocation]);

  useEffect(() => {
    if (!bookingDate.trim() || !bookingVariantsOpen) return;
    const { available, kind } = optionsForSelectedDate;
    if (kind === 'one' && available[0] && selectedBookingVariant?.id !== available[0].id) {
      setSelectedBookingVariant(available[0]);
      if (optionUsesAgePricing(available[0].listingOption)) {
        const option = available[0].listingOption!;
        setParticipantMix((prev) => remapMixToOption(option, participantFieldOption, prev));
      }
    }
  }, [bookingDate, bookingVariantsOpen, optionsForSelectedDate, selectedBookingVariant?.id, participantFieldOption]);

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
        if (patch.step !== checkoutFromUrl.step) window.history.pushState({}, '', href);
        else window.history.replaceState({}, '', href);
      }
      // Phase 1852: keep React locationSearch in sync (commitLocation parity) so a
      // remount cannot revive a stale step=review while the traveler is on Contact/Pay.
      setLocationSearch(window.location.search);
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

  const handleSelectTourVariant = (variant: TourBookingVariant, departureTime?: string) => {
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
    setSelectedDepartureTime(departureTime ?? '');
    setBookingVariantsOpen(true);
    if (optionUsesAgePricing(variant.listingOption)) {
      const option = variant.listingOption!;
      setParticipantMix((prev) => {
        const next = remapMixToOption(option, participantFieldOption, prev);
        const party = totalGuestsFromMix(buildParticipantMixLines(option, next));
        setGuests(Math.max(1, party));
        return next;
      });
    } else {
      const bounds = getPartySizeBoundsForVariant(tour, variant, bookingDate);
      setGuests((g) => Math.min(bounds.max, Math.max(bounds.min, g)));
    }
  };

  useEffect(() => {
    if (tour?.id && !reviewOnlyAccess) trackListingTraffic(tour.id, 'view');
  }, [tour?.id, reviewOnlyAccess]);

  const handleContinueToCheckout = async () => {
    if (!tour || !selectedBookingVariant) return;
    trackListingTraffic(tour.id, 'book_start');
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
    if (checkoutContinueRef.current) return;
    checkoutContinueRef.current = true;
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
      if (isSupabaseConfigured() && !userRef.current && supabase) {
        try {
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), 8_000);
            }),
          ]);
          const sessionUser =
            sessionResult && 'data' in sessionResult ? sessionResult.data.session?.user : null;
          if (sessionUser) userRef.current = sessionUser;
        } catch {
          /* AuthContext already has no user; the sign-in modal opens below. */
        }
      }
      if (isSupabaseConfigured() && !userRef.current) {
        requestAuth({
          intent: 'checkout',
          onSuccess: () => {
            void (async () => {
              if (supabase) {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData.session?.user) {
                  userRef.current = sessionData.session.user;
                }
              }
              if (userRef.current) void handleContinueToCheckout();
            })();
          },
        });
        return;
      }
      saveTravelerCart({
        tourId: tour.id,
        optionId: selectedBookingVariant.id,
        date: bookingDate.trim(),
        guests: partySize,
        mix: optionUsesAgePricing(selectedOptionApplied) ? participantMix : null,
        startTime: selectedDepartureTime.trim() || undefined,
        currency: tour.price?.currency,
      });
      if (userRef.current?.id) {
        void rememberAccountCart(userRef.current.id, {
          listingId: tour.id,
          bookingDate: bookingDate.trim(),
          guests: partySize,
          optionId: selectedBookingVariant.id,
          startTime: selectedDepartureTime.trim() || null,
          participantMix: optionUsesAgePricing(selectedOptionApplied) ? participantMix : null,
          currency: tour.price?.currency,
        });
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
      checkoutContinueRef.current = false;
      setVariantChecking(false);
    }
  };

  if (
    !tour ||
    (!reviewOnlyAccess &&
      !listingDetailVisibleToTraveler({
        familyMatches: listingIsOnTravelerCatalog(tour),
        status: tour.status,
      })) ||
    (!reviewOnlyAccess && !listingHasUpcomingBookableSeason(tour))
  ) {
    const isLoading = isSupabaseConfigured() && !tourLoadError && !tour;
    if (isLoading) {
      return (
        <div className="min-h-screen bg-paper tv-page animate-fade-in">
          <div className="tv-shell px-4 sm:px-6 lg:px-8 py-4">
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
            back={{
              onClick: onBack,
              label: backLabel.toLowerCase() === 'back' ? 'Go back' : `Back to ${backLabel}`,
            }}
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

  const images = orderedPhotoUrls(photoSlotsFromTourPackage(tour));
  const review = publicReviewLabel(reviewAggregate);

  if (checkoutUnlocked && checkoutFromUrl && checkoutVariant) {
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
    <div className="min-h-screen bg-paper tv-page tv-tour-pdp pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="tv-shell mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="tv-icon-btn lux-flat inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{backLabel}</span>
          </button>
          <div className="flex items-center gap-1.5">
            {isSupabaseListingId(tour.id) && isSupabaseConfigured() ? (
              <button
                type="button"
                className="tv-icon-btn lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink disabled:opacity-60"
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
                  size={17}
                  className={`${wishlistHeartKnown && savedToWishlist ? 'fill-finland text-finland' : ''} ${savePop ? 'tv-pop' : ''}`}
                />
              </button>
            ) : null}
            <button
              type="button"
              className="tv-icon-btn lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink"
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
              {shareCopied ? <CheckCircle size={17} className="tv-pop text-finland" /> : <Share2 size={17} />}
            </button>
          </div>
        </div>

        <header className="mb-3 sm:mb-3.5">
          <h1 className="tv-tour-title font-sans font-bold tracking-tight text-[#111827] break-words [overflow-wrap:anywhere]">
            {tour.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <ListingPdpReviewMeta
              score={review.score}
              count={review.count}
              reviewsSectionId="tour-reviews"
            />
            {tour.destination?.trim() ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-ink">
                <MapPin size={14} className="shrink-0 text-[#0B397E]" aria-hidden />
                <span className="font-bold tracking-tight break-words [overflow-wrap:anywhere]">
                  {tour.destination.trim()}
                </span>
              </span>
            ) : null}
          </div>
        </header>

        <div className="tv-pdp-layout">
          <div className="tv-pdp-main">
        <ListingPdpPhotoGallery
          photos={images}
          title={tour.title}
          emptyLabel="No photos yet for this experience"
        />

        {tour.subtitle?.trim() ? (
          <p className="tv-tour-subtitle mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
            {tour.subtitle.trim()}
          </p>
        ) : null}

        <div className="mt-5">
          <TourQuickFacts tour={tour} option={selectedOptionApplied} />
        </div>
              {canBook && bookingVariantsOpen && bookingDate.trim() ? (
                <div ref={optionsSectionRef} className="tv-availability-reveal mt-6 border-t border-[#E8EBF0] pt-6">
                  <TourAvailableOptions
                    tour={tour}
                    date={bookingDate.trim()}
                    kind={optionsForSelectedDate.kind}
                    available={optionsForSelectedDate.available}
                    selectedId={selectedBookingVariant?.id ?? null}
                    selectedDepartureTime={selectedDepartureTime}
                    guestsLabel={
                      participantFieldOption
                        ? formatMixSummaryCompact(
                            buildParticipantMixLines(
                              participantFieldOption,
                              Object.keys(participantMix).length
                                ? participantMix
                                : emptyMixSelection(participantFieldOption)
                            )
                          ) || `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                        : `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                    }
                    guests={guests}
                    participantMix={participantMix}
                    mixSourceOption={selectedOptionApplied ?? participantFieldOption ?? null}
                    todayIso={experienceTodayIso}
                    currency={normalizeCurrency(tour.price?.currency)}
                    discounts={discountsByListing?.get(tour.id) ?? []}
                    hideSelectedCatalogPrice={Boolean(
                      selectedBookingVariant && panelQuote && !panelQuote.ok
                    )}
                    onChoose={handleSelectTourVariant}
                    onChooseTime={(variant, time) => handleSelectTourVariant(variant, time)}
                    onChangeDate={() => {
                      scrollElementIntoView('tour-booking-date-input', { behavior: 'smooth', block: 'center' });
                      window.requestAnimationFrame(() => {
                        const root = document.getElementById('tour-booking-date-input');
                        const firstOpen = root?.querySelector('button:not([disabled])') as HTMLButtonElement | null;
                        (firstOpen ?? root)?.focus();
                      });
                    }}
                    onChangeGuests={() => {
                      scrollElementIntoView('tour-participant-field', { behavior: 'smooth', block: 'center' });
                    }}
                  />
                </div>
              ) : canBook ? (
                <p className="mt-6 border-t border-[#E8EBF0] pt-6 text-sm text-ink-muted">
                  {bookingDate.trim()
                    ? 'Check availability to see times and options for this date.'
                    : 'Pick a date to see times and options for this tour.'}
                </p>
              ) : null}

              <TourOverview
                description={tour.description}
                extras={overviewExtras}
              />

              <TourListingSections
                tour={tour}
                selectedOption={selectedOptionApplied}
                supplierLegal={supplierLegal}
                onOpenLegal={setLegalModal}
                showOperator={false}
              />
            </div>

            <div className="tv-pdp-aside min-w-0">
              <div
                id="tour-booking-panel"
                className="tv-booking-sticky tv-booking-sticky--fit lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))] h-fit scroll-mt-28"
              >
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
                        return (
                          <p className="mb-3 text-lg font-semibold text-ink">Price unavailable</p>
                        );
                      }
                      // Phase 1561: successful quote is the hero total (sticky parity — not catalog From).
                      if (selectedBookingVariant && panelQuote?.ok) {
                        const lines = (panelQuote.lineItems ?? []).filter((line) => line.quantity > 0);
                        const several = panelQuote.guests > 1 || lines.length > 1;
                        return (
                          <div className="mb-3">
                            <p className="text-[1.65rem] font-bold leading-none tracking-tight text-[#111827]">{quotedOfferPrice(panelQuote)}</p>
                            <p className="mt-1.5 text-sm text-ink-muted">
                              {several ? 'Total for this booking' : lines[0]?.label ? `Per ${lines[0].label.toLowerCase()}` : 'Per person'}
                            </p>
                            {several && lines.length > 0 ? (
                              <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
                                {lines.map((line) => (
                                  <li key={`${line.label}-${line.quantity}`}>
                                    {line.quantity} × {line.label} · {formatMoney(line.amount, panelQuote.currency)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      }
                      // Phase 1561: catalog From only before a live quote (ok/fail already returned above).
                      if (discountsByListing == null) {
                        return (
                          <p className="mb-4 text-sm font-medium text-ink-faint">Checking offers…</p>
                        );
                      }
                      const { price, originalPrice, label, qualifier } = getDisplayPriceForTour(
                        tour,
                        discountsByListing
                      );
                      const hasDiscount = label && price < originalPrice;
                      const currency = normalizeCurrency(tour.price?.currency);
                      const unit = qualifier ? `From / ${qualifier}` : 'From / person';
                      return (
                        <div className="mb-3">
                          {hasDiscount ? (
                            <p className="text-sm font-medium text-ink-muted line-through tabular-nums">
                              {formatMoney(originalPrice, currency)}
                            </p>
                          ) : null}
                          <p className="text-[1.65rem] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                            {formatMoney(Number(price), currency)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <p className="text-sm text-ink-muted">{unit}</p>
                            {hasDiscount && label ? (
                              <span className="rounded-md bg-[#F8EFEA] px-1.5 py-0.5 text-xs font-semibold text-[#9A3412]">{label}</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="space-y-3">
                      <TourDatePicker
                        id="tour-booking-date-input"
                        presentation="field"
                        value={bookingDate}
                        onChange={(next) => {
                          setBookingDate(next);
                          setBookingCardError(null);
                          setSelectedBookingVariant(null);
                          setSelectedDepartureTime('');
                          const dateCheck = dateNotInPast(next.trim(), experienceTodayIso);
                          if (!(dateCheck.valid && isListingVisibleToTravelers(tour.status))) {
                            setBookingVariantsOpen(false);
                          }
                        }}
                        options={calendarOptions}
                        soldOutDates={soldOutDates}
                        todayIso={experienceTodayIso}
                      />
                      <div id="tour-participant-field" ref={participantsRef} className="relative">
                        <p className="mb-1.5 text-sm font-semibold tracking-tight text-[#111827]">Participants</p>
                        <button
                          type="button"
                          className="relative flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border border-[#E8EBF0] bg-white px-3.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#0758CB]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0758CB]/25"
                          aria-expanded={participantsOpen}
                          aria-haspopup="dialog"
                          onClick={() => setParticipantsOpen((open) => !open)}
                        >
                          <span className="font-medium text-ink">
                            {participantFieldOption
                              ? formatMixSummaryCompact(
                                  buildParticipantMixLines(
                                    participantFieldOption,
                                    Object.keys(participantMix).length
                                      ? participantMix
                                      : emptyMixSelection(participantFieldOption)
                                  )
                                ) || 'Add participants'
                              : `${guests} ${guests === 1 ? 'guest' : 'guests'}`}
                          </span>
                          <Users className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                        </button>
                        {participantsOpen ? (
                          <div
                            role="dialog"
                            aria-label="Participants"
                            className="absolute z-30 mt-2 w-full rounded-xl border border-black/10 bg-white p-3 shadow-lg"
                          >
                            {participantFieldOption ? (
                              <div className="space-y-2">
                                {activePriceCategories(participantFieldOption).map((cat) => (
                                  <ParticipantCategoryStepper
                                    key={cat.id}
                                    category={cat}
                                    quantity={
                                      participantMix[cat.id] ??
                                      (emptyMixSelection(participantFieldOption)[cat.id] ?? 0)
                                    }
                                    currency={normalizeCurrency(tour.price?.currency)}
                                    max={participantCategoryQuantityMax({
                                      option: participantFieldOption,
                                      categoryId: cat.id,
                                      selection:
                                        Object.keys(participantMix).length > 0
                                          ? participantMix
                                          : emptyMixSelection(participantFieldOption),
                                      partyMax: partyMaxForSelectedDay,
                                    })}
                                    onChange={(qty) => {
                                      setParticipantMix((prev) => {
                                        const base =
                                          Object.keys(prev).length > 0
                                            ? prev
                                            : emptyMixSelection(participantFieldOption);
                                        const next = { ...base, [cat.id]: qty };
                                        const party = totalGuestsFromMix(
                                          buildParticipantMixLines(participantFieldOption, next)
                                        );
                                        setGuests(Math.max(1, party));
                                        return next;
                                      });
                                      setBookingCardError(null);
                                    }}
                                    onBoundaryAttempt={(message) => setBookingCardError(message)}
                                    showUnitPrice={participantPricesAgree}
                                  />
                                ))}
                              </div>
                            ) : (
                              <GuestStepper
                                id="tour-booking-guests"
                                value={guests}
                                min={
                                  selectedBookingVariant
                                    ? getPartySizeBoundsForVariant(
                                        tour,
                                        selectedBookingVariant,
                                        bookingDate,
                                        selectedDepartureTime
                                      ).min
                                    : 1
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
                          </div>
                        ) : null}
                      </div>
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
                        <div className="space-y-2.5 border-t border-[#E8EBF0] pt-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug tracking-tight text-[#111827] break-words [overflow-wrap:anywhere]">
                                {selectedBookingVariant.label}
                              </p>
                              <p className="mt-0.5 text-xs text-ink-muted">
                                {[
                                  selectedDepartureTime || (departureTimes.length === 1 ? departureTimes[0] : null),
                                  selectedOptionApplied?.fulfillment === 'pickup'
                                    ? 'Pickup included'
                                    : selectedOptionApplied?.fulfillment === 'meeting_point'
                                      ? 'Meeting point'
                                      : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'Selected option'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-sm font-semibold text-[#0758CB]"
                              onClick={scrollToOptionsSection}
                            >
                              Change
                            </button>
                          </div>
                          {departureTimes.length > 1 && !selectedDepartureTime ? (
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
                                            const applied = applyScheduleToOption(
                                              selectedOption,
                                              resolved,
                                              time
                                            );
                                            if (optionUsesAgePricing(applied)) {
                                              setParticipantMix((prev) =>
                                                remapMixToOption(applied, selectedOption, prev)
                                              );
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
                          ) : null}
                          {departureClosedNote ? (
                            <p className="text-sm text-ink">{departureClosedNote}</p>
                          ) : null}
                          {panelQuote && !panelQuote.ok ? (
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
                            className="tv-btn-primary tv-tour-book w-full disabled:opacity-60"
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
                        <div className="space-y-3">
                          <p className="text-sm text-ink-muted">
                            {!bookingDate.trim()
                              ? 'Choose a date to see available options.'
                              : bookingVariantsOpen
                                ? 'Choose an available option below.'
                                : 'Check availability to see times and options for this date.'}
                          </p>
                          <button
                            type="button"
                            onClick={handleStickyBookCta}
                            className="tv-btn-primary tv-tour-book w-full"
                          >
                            {tourStickyBookCtaLabel({
                              hasDate: Boolean(bookingDate.trim()),
                              hasOption: false,
                              needsDeparture: false,
                              variantsOpen: bookingVariantsOpen,
                            })}
                          </button>
                        </div>
                      )}
                      <div id="tour-booking-card-error">
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
                      <div className="space-y-1 text-xs leading-relaxed text-ink-muted">
                        {listingShowsFreeCancellation(tour) ? (
                          <p className="flex items-start gap-2">
                            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" aria-hidden />
                            Free cancellation up to 24 hours before start
                          </p>
                        ) : null}
                        <p className={listingShowsFreeCancellation(tour) ? 'pl-[1.375rem]' : 'flex items-start gap-2'}>
                          {listingShowsFreeCancellation(tour) ? null : (
                            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" aria-hidden />
                          )}
                          Secure checkout · {STRIPE_TEST_UNTIL_LIVE}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      <section id="tour-reviews" className="scroll-mt-28 border-t border-[#E8EBF0] bg-paper pt-8 pb-2">
        <div className="tv-shell mx-auto px-4 sm:px-6 lg:px-8">
          <div className="tv-pdp-below mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="tv-section-heading">Reviews</h2>
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
            <div className="mb-5 max-w-xl rounded-xl border border-[#E8EBF0] px-4 py-3">
              <p className="text-sm text-ink-muted leading-relaxed">{reviewsLoadError}</p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-[#0758CB] hover:underline"
                onClick={() => loadReviews()}
              >
                Try again
              </button>
            </div>
          ) : reviews.length === 0 && !showReviewForm ? (
            <div className="tv-pdp-below mb-6 flex items-start gap-3 py-1">
              <Star size={20} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
              <div>
                <p className="text-sm font-bold tracking-tight text-[#111827]">No reviews yet</p>
                <p className="mt-0.5 max-w-md text-sm leading-relaxed text-ink-muted">
                  {LISTING_REVIEWS_EMPTY_COPY}
                </p>
              </div>
            </div>
          ) : review.score ? (
            <div className="mb-4 flex items-center gap-3">
              <p className="text-4xl font-bold tabular-nums leading-none tracking-tight text-[#111827]">{review.score}</p>
              <div>
                <StarRatingDisplay rating={Number(review.score) || 0} size={16} />
                <p className="mt-1 text-sm text-ink-muted">
                  {review.count} {review.count === 1 ? 'review' : 'reviews'}
                </p>
              </div>
            </div>
          ) : null}
          {/* Two columns + items-start: comfortable reading width; independent heights */}
          <div className="mb-5 grid items-start gap-4 sm:grid-cols-2">
            {reviews.slice(0, 4).map((r) => (
              <PublicReviewCard
                key={r.id}
                review={r}
                reply={reviewReplies[r.id]}
                replyFromLabel="operator"
              />
            ))}
          </div>

          {canLeaveReview && !hasReviewed && !showReviewForm && (
            <div className="space-y-2">
              {/* Phase 1655: eligibility microcopy before opening the form. */}
              <p className="text-sm text-ink-muted max-w-xl">
                Reviews are for guests who completed this paid tour.
              </p>
              <button
                type="button"
                onClick={() => setShowReviewForm(true)}
                className="tv-btn-secondary"
              >
                Leave a review
              </button>
            </div>
          )}

          {showReviewForm && user && (
            <div className="tv-review-compose max-w-xl">
              <h3 className="mb-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Write a review</h3>
              <p className="text-sm text-ink-muted mb-4 leading-relaxed">
                Share what stood out — rating and a short note help other travelers.
              </p>
              <div className="space-y-4">
                <div>
                  <label id="tour-review-rating-label" className="block text-sm font-medium text-ink mb-1">
                    Rating
                  </label>
                  <p className="text-xs text-ink-muted mb-1.5">Tap to rate</p>
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
                          size={28}
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
                    onChange={(e) => setReviewComment(e.target.value.slice(0, 2000))}
                    rows={3}
                    maxLength={2000}
                    className="tv-input"
                    placeholder="Tell others what you liked…"
                    required
                    aria-describedby="tour-review-comment-hint"
                  />
                  {/* Phase 1696: live length honesty on review compose. */}
                  <p id="tour-review-comment-hint" className="mt-1.5 text-xs text-ink-faint">
                    Up to 2000 characters
                    {reviewComment.length > 0 ? ` · ${reviewComment.length} used` : ''}.
                  </p>
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

      {supplierLegal ? (
        <section className="border-t border-[#E8EBF0] bg-paper pb-12 pt-2">
          <div className="tv-shell mx-auto px-4 sm:px-6 lg:px-8">
            <div className="tv-pdp-below">
              <TourOperatorBlock supplierLegal={supplierLegal} onOpenLegal={setLegalModal} />
            </div>
          </div>
        </section>
      ) : null}

      {canBook && !checkoutFromUrl
        ? createPortal(
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] tv-booking-mobile-bar">
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
                      ? quotedOfferPrice(panelQuote)
                      : quoteFailed
                        ? 'Price unavailable'
                        : `From ${formatMoney(Number(price), currency)}`;
                  const subLine =
                    quoteFailed
                      ? ((panelQuote && !panelQuote.ok ? panelQuote.error : '').trim().slice(0, 72) ||
                          'Adjust date, guests, or option')
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
                      <p className="truncate text-base font-semibold tabular-nums tracking-tight text-ink">
                        {priceLine}
                      </p>
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
                  className="tv-btn-primary tv-tour-book min-h-11 shrink-0 disabled:opacity-60"
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
              <h3 id="tour-legal-title" className="text-2xl font-semibold text-ink">
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



