/**
 * Traveler booking flow: booking details, contact, pickup or meeting point, then payment.
 */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Mail,
  MapPin,
  ChevronDown,
  X,
  Phone,
  Check,
  Lock,
} from 'lucide-react';
import { TourPackage } from '../types/tour';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createBookingCheckoutSession } from '../data/supabase-bookings';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { tourDepartureSlotCapacity } from '../../supabase/functions/_shared/booking-quote.ts';
import type { ListingDiscount } from '../data/supabase-discounts';
import { fetchDiscountsByListingId } from '../data/supabase-discounts';
import { payTimeDiscountsOrBlock } from '../lib/pay-time-discounts';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import {
  travelerLeadGuestNameFromAuth,
  travelerLeadGuestPhoneFromAuth,
  type TravelerCheckoutAuthMetadata,
} from '../lib/traveler-checkout-autofill';
import { getDisplayPriceForBookingVariant } from '../lib/discount-display';
import { quoteBooking, formatOptionWeekdays, tourBookableSellingDeparturesOnDate, experienceTodayIsoForListing, listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import {
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  resolveScheduleForDate,
  applyScheduleToOption,
  departureTimesOnDate,
  optionCapacityForDepartureTime,
} from '../lib/listing-option-schedules';
import { normalizeBookingCutoffHours, resolveDepartureTimezone, isDepartureTimeStillBookable } from '../lib/tour-departure-cutoff';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { CHECKOUT_HOLD_MINUTES } from '../lib/booking-hold';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import {
  checkAvailability,
  fetchAvailabilityByListingId,
  fetchPublishedTourPaidGuests,
  fetchPublishedTourPaidGuestsBySlot,
  tourPaidSlotKey,
  type AvailabilityCheckOption,
} from '../data/supabase-availability';
import AvailabilityOptionsModal from '../components/booking/AvailabilityOptionsModal';
import TourDatePicker from '../components/TourDatePicker';
import GuestStepper from '../components/booking/GuestStepper';
import ParticipantCategoryStepper from '../components/booking/ParticipantCategoryStepper';
import { listingTourCapacityFromOptions, remainingCapacity, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import { departureSlotSpotsLeft, maxSpotsLeftAcrossDepartures, partyMaxCappedByRemainingSpots } from '../lib/departure-slot-remaining';
import { tourSoldOutDates } from '../lib/tour-calendar';
import { tourSlotMaxSpotsFromOption } from '../lib/tour-slot-capacity';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { analytics } from '../lib/analytics';
import { setPageMetaWithOg } from '../lib/seo';
import { dateNotInPast, validateEmail, required, maxLength } from '../lib/validation';
import {
  TRAVERION_STANDARD_CANCELLATION_POLICY,
  formatTourDurationDisplay,
} from '../types/listingExtras';
import {
  getPartySizeBounds,
  getTourBookingVariants,
  guestCountValidationError,
  formatBookingDateDisplay,
  loadBookingDraft,
  saveBookingDraft,
  clearBookingDraft,
  sanitizeRestoredBookingStep,
  humanizeBookingSubmitError,
  type BookingFlowStep,
  type TourBookingVariant,
} from '../lib/booking-flow';
import {
  sanitizeTourCheckoutFlowStep,
  tourCheckoutCancelPath,
  type TourCheckoutFlowStep,
} from '../lib/tourCheckoutUrl';
import PickupLocationSearch from '../components/checkout/PickupLocationSearch';
import {
  PICKUP_AREA_MISSING_MESSAGE,
  pickupAreaFromOption,
  travelerPickupAllowed,
  type TravelerPickupPoint,
} from '../lib/pickup-area';
import {
  buildParticipantMixLines,
  formatMixSummaryCompact,
  formatParticipantQuantityLabel,
  optionUsesAgePricing,
  participantCategoryQuantityMax,
  totalGuestsFromMix,
  validateParticipantMix,
} from '../lib/participant-mix';
import { activePriceCategories } from '../lib/price-categories';
import { markBookingsUnread } from '../lib/customerBookingNotifications';
import {
  STRIPE_CHECKOUT_CANCELLED_TOUR_COPY,
} from '../lib/booking-confirmation-copy';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import NoticeCallout from '../components/NoticeCallout';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { tourStickyBookCtaLabel } from '../lib/tour-sticky-cta';
import { bookingPageQuoteFailureFocusTarget } from '../lib/tour-quote-failure-focus';
import { resolveTourPickupMeetingDisplay } from '../lib/tour-pickup-meeting';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { clearTravelerCart, saveTravelerCart } from '../lib/travelerCart';
import { rememberAccountCart } from '../data/supabase-cart';

interface BookingPageProps {
  tour: TourPackage;
  onBack: () => void;
  onComplete: () => void;
  onNavigate?: (page: string) => void;
  /** When opening booking from tour sidebar after “Check availability”. */
  initialDate?: string;
  initialGuests?: number;
  /** Departure HH:MM when multiple schedules apply on the date. */
  initialStartTime?: string;
  /** Age-category quantities when the selected option uses age-dependent pricing. */
  initialParticipantMix?: Record<string, number>;
  presentation?: 'page' | 'modal';
  /** Required when presentation is modal (after traveler picks a tour option). */
  selectedVariant?: TourBookingVariant | null;
  discountsByListing?: Map<string, ListingDiscount[]>;
  onModalClose?: () => void;
  /** Durable checkout URL step (review / contact / confirm). */
  initialCheckoutStep?: TourCheckoutFlowStep;
  stripeReturnCancelled?: boolean;
  onCheckoutUrlState?: (state: {
    step: TourCheckoutFlowStep;
    date: string;
    guests: number;
    mix: Record<string, number> | null;
    startTime?: string;
  }) => void;
}

type Step = BookingFlowStep;

function BookingProgress({
  step,
  flow,
  pickupLabel = 'Pickup',
}: {
  step: Step;
  flow: 'page' | 'modal' | 'variant';
  pickupLabel?: string;
}) {
  if (step === 'done') return null;
  const labels = ['Details', 'Contact', pickupLabel, 'Pay'];
  const order: Step[] =
    flow === 'page'
      ? ['date-guests', 'contact', 'pickup', 'confirm']
      : ['review', 'contact', 'pickup', 'confirm'];
  const idx = order.indexOf(step);
  const currentIndex = idx >= 0 ? idx : -1;
  const progressPct =
    currentIndex <= 0 ? 0 : Math.round((currentIndex / (labels.length - 1)) * 100);

  return (
    <nav className="tv-booking-progress mb-6" aria-label="Booking steps">
      <div className="tv-booking-progress__track" aria-hidden>
        <div className="tv-booking-progress__fill" style={{ width: `${progressPct}%` }} />
      </div>
      <ol className="relative z-[1] grid grid-cols-4 gap-1">
        {labels.map((label, i) => {
          const done = currentIndex >= 0 && i < currentIndex;
          const current = currentIndex >= 0 && i === currentIndex;
          return (
            <li key={label} className="flex flex-col items-center text-center">
              <span
                aria-current={current ? 'step' : undefined}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 motion-reduce:transition-none ${
                  done
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : current
                      ? 'bg-finland text-white shadow-sm ring-2 ring-finland/25'
                      : 'bg-black/[0.06] text-ink-faint'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-[11px] font-semibold tracking-wide ${
                  done ? 'text-emerald-800' : current ? 'text-finland' : 'text-ink-faint'
                }`}
              >
                <span aria-hidden>{label}</span>
                <span className="sr-only">
                  {label}
                  {current ? ', current step' : done ? ', completed' : ', upcoming'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function BookingPage({
  tour,
  onBack,
  initialDate,
  initialGuests,
  initialStartTime,
  initialParticipantMix,
  presentation = 'page',
  selectedVariant = null,
  discountsByListing,
  onModalClose,
  initialCheckoutStep,
  stripeReturnCancelled = false,
  onCheckoutUrlState,
}: BookingPageProps) {
  const { user, requestAuth } = useAuth();
  // Phase 1704: effect sync only — avoid wiping session filled in auth onSuccess before React user updates.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const flowMode = presentation === 'modal' ? 'modal' : 'page';
  const hasPreselectedVariant = Boolean(selectedVariant);
  const progressFlow: 'page' | 'modal' | 'variant' =
    presentation === 'modal' || hasPreselectedVariant ? 'variant' : 'page';
  const [step, setStep] = useState<Step>(
    presentation === 'modal' || selectedVariant ? 'review' : 'date-guests'
  );
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(1);
  const [participantMix, setParticipantMix] = useState<Record<string, number>>(
    () => initialParticipantMix ?? {}
  );
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [placeOfStay, setPlaceOfStay] = useState('');
  const [selectedPickup, setSelectedPickup] = useState<TravelerPickupPoint | null>(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const payInFlightRef = useRef(false);
  const [checkoutConsentAccepted, setCheckoutConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availabilityChecking, setAvailabilityChecking] = useState(false);
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilityCheckOption[]>([]);
  const [availabilityModalNote, setAvailabilityModalNote] = useState<string | null>(null);
  const [soldOutDates, setSoldOutDates] = useState<ReadonlySet<string>>(() => new Set());
  const [dayCapacitySnap, setDayCapacitySnap] = useState<{
    paidByDay: Record<string, number>;
    paidBySlot: Record<string, number>;
    capByDay: Map<string, number>;
    fallback: number | null;
  } | null>(null);
  const [dayCapacityError, setDayCapacityError] = useState<string | null>(null);
  /** Overlapping capacity reloads (tab visibility, variant change) must not commit stale occupancy. */
  const dayCapacityReloadGenRef = useRef(0);

  const partyBounds = useMemo(() => getPartySizeBounds(tour), [tour]);

  const hydratedRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const bookingModalRef = useRef<HTMLDivElement>(null);
  const currency = normalizeCurrency(tour.price?.currency);
  const fallbackBasePrice = tour.price?.startingFrom ?? 0;
  const departureTime = (initialStartTime ?? '').trim() || undefined;
  const departureTimezone = resolveDepartureTimezone(tour.listingExtras?.departureTimezone);
  const experienceTodayIso = experienceTodayIsoForListing(departureTimezone);
  const appliedOption = useMemo(() => {
    const opt = selectedVariant?.listingOption ?? null;
    if (!opt) return null;
    if (!listingOptionHasSchedules(opt)) return opt;
    const day = date.trim() || experienceTodayIso;
    const resolved = resolveScheduleForDate(opt, day, departureTime);
    return resolved ? applyScheduleToOption(opt, resolved, departureTime) : opt;
  }, [selectedVariant, date, departureTime, experienceTodayIso]);
  const priceInfo = useMemo(() => {
    const day = date.trim() || experienceTodayIso;
    const optionId =
      selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
    const quoted = quoteBooking({
      tour,
      discounts: discountsByListing?.get(tour.id) ?? [],
      bookingDate: day,
      guests,
      bookingOptionId: optionId,
      participantMix: Object.keys(participantMix).length > 0 ? participantMix : null,
      startTime: departureTime,
      todayIso: experienceTodayIso,
    });
    if (quoted.ok) {
      return {
        price: quoted.unitPrice,
        originalPrice: quoted.originalUnitPrice,
        label: quoted.discountLabel,
        quote: quoted,
      };
    }
    if (presentation === 'modal' && selectedVariant) {
      return {
        ...getDisplayPriceForBookingVariant(tour, selectedVariant, discountsByListing ?? new Map(), day),
        quote: quoted,
      };
    }
    return { price: fallbackBasePrice, originalPrice: fallbackBasePrice, label: undefined as string | undefined, quote: quoted };
  }, [
    presentation,
    selectedVariant,
    tour,
    date,
    guests,
    discountsByListing,
    fallbackBasePrice,
    participantMix,
    departureTime,
    experienceTodayIso,
  ]);

  const pricePerPerson = priceInfo.price;
  const quoted = priceInfo.quote && priceInfo.quote.ok ? priceInfo.quote : null;
  // Phase 1545: never invent catalog×guests totals when quoteBooking failed (TourDetails 1529 parity).
  // Phase 1622: traveler-facing Price unavailable (Tour/Stay sticky 1604/1606 parity).
  const quoteFailed = Boolean(priceInfo.quote && !priceInfo.quote.ok);
  const total = quoted ? quoted.totalAmount : quoteFailed ? null : pricePerPerson * guests;
  const totalLabel = total == null ? (quoteFailed ? 'Price unavailable' : '—') : formatMoney(total, currency);
  const cancellationText =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;
  const freeCancellation = listingShowsFreeCancellation({
    tags: tour.tags,
    cancellationPolicy: tour.cancellationPolicy,
  });
  const cancellationShort = freeCancellation
    ? 'Free cancellation up to 24 hours before departure'
    : cancellationText.split(/(?<=\.)\s/)[0]?.trim() || 'Cancellation terms apply to this booking';
  const pickupPlace = resolveTourPickupMeetingDisplay(tour, selectedVariant?.listingOption ?? null);
  const optionFulfillment = selectedVariant?.listingOption?.fulfillment;
  const pickupMode: 'pickup' | 'meet' | 'none' =
    optionFulfillment === 'pickup'
      ? 'pickup'
      : optionFulfillment === 'meeting_point' || Boolean(pickupPlace.place)
        ? 'meet'
        : 'none';
  const meetingAddress =
    optionFulfillment === 'meeting_point'
      ? (selectedVariant?.listingOption?.pickupPlace ?? '').trim()
      : (pickupPlace.place ?? '').trim();
  const meetingInstructions =
    optionFulfillment === 'meeting_point'
      ? (selectedVariant?.listingOption?.travelerStartInstructions ?? '').trim()
      : (pickupPlace.instructions ?? '').trim();
  const pickupArea = pickupAreaFromOption(selectedVariant?.listingOption ?? null);
  const meetingMapsHref =
    selectedVariant?.listingOption?.meetingLat != null && selectedVariant?.listingOption?.meetingLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${selectedVariant.listingOption.meetingLat},${selectedVariant.listingOption.meetingLng}`
      : meetingAddress
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetingAddress)}`
        : '';
  const step3Label = pickupMode === 'meet' ? 'Meeting point' : 'Pickup';
  const contactContinueLabel = pickupMode === 'meet' ? 'Continue to meeting point' : 'Continue to pickup details';

  const weekdayHint = useMemo(() => {
    const opt = selectedVariant?.listingOption;
    if (!opt) return undefined;
    if (listingOptionHasSchedules(opt)) {
      const labels = [
        ...new Set(listingOptionReadySchedules(opt).map((s) => formatOptionWeekdays(s.weekdays))),
      ];
      if (labels.length === 1) return `Runs ${labels[0]}`;
      if (labels.length > 1) return 'Each schedule has its own days';
      return undefined;
    }
    return `Runs ${formatOptionWeekdays(opt.weekdays)}`;
  }, [selectedVariant]);

  const calendarOptions = useMemo(() => {
    if (selectedVariant?.listingOption) return [selectedVariant.listingOption];
    return getTourBookingVariants(tour)
      .map((v) => v.listingOption)
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
  }, [selectedVariant, tour]);

  const listingCutoffHours = normalizeBookingCutoffHours(
    tour.listingExtras?.bookingCutoffHoursBeforeStart
  );
  const optionCutoffHours = normalizeBookingCutoffHours(
    selectedVariant?.listingOption?.bookingCutoffHoursBeforeStart
  );
  const bookingCutoffHours = optionCutoffHours > 0 ? optionCutoffHours : listingCutoffHours;

  const reloadBookingDayCapacity = useCallback(() => {
    const reloadGen = ++dayCapacityReloadGenRef.current;
    let cancelled = false;
    setDayCapacityError(null);
    void Promise.all([
      fetchAvailabilityByListingId(tour.id, { fromDate: experienceTodayIso }),
      fetchPublishedTourPaidGuests(tour.id),
      fetchPublishedTourPaidGuestsBySlot(tour.id),
    ])
      .then(([caps, paidByDay, paidBySlot]) => {
        if (cancelled || reloadGen !== dayCapacityReloadGenRef.current) return;
        const fallbackCap = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(calendarOptions));
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
              tourBookableSellingDeparturesOnDate(calendarOptions, day, {
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
  }, [tour.id, calendarOptions, bookingCutoffHours, departureTimezone, experienceTodayIso]);

  useEffect(() => {
    return reloadBookingDayCapacity();
  }, [reloadBookingDayCapacity]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') reloadBookingDayCapacity();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadBookingDayCapacity]);

  const bookableDepartureTimes = useMemo(() => {
    const day = date.trim();
    const opt = appliedOption ?? selectedVariant?.listingOption ?? null;
    if (!opt || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [] as string[];
    return departureTimesOnDate(opt, day).filter((time) =>
      isDepartureTimeStillBookable({
        bookingDate: day,
        startTimeHm: time,
        cutoffHoursBeforeStart: bookingCutoffHours,
        timeZone: departureTimezone,
      })
    );
  }, [date, appliedOption, selectedVariant, bookingCutoffHours, departureTimezone]);

  const selectedDaySpotsLeft = useMemo(() => {
    const day = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !dayCapacitySnap) return null;
    const dayCap = dayCapacitySnap.capByDay.has(day)
      ? (dayCapacitySnap.capByDay.get(day) ?? dayCapacitySnap.fallback)
      : undefined;
    const slotSelected = Boolean(departureTime && appliedOption);
    if (soldOutDates.has(day) && !slotSelected) return 0;
    if (slotSelected && departureTime && appliedOption) {
      // Phase 1170: schedule-resolved cap (parity with multi-departure path / 1162).
      const baseOpt = selectedVariant?.listingOption ?? appliedOption;
      const cap = optionCapacityForDepartureTime(baseOpt, day, departureTime);
      if (!cap) return null;
      return departureSlotSpotsLeft({
        dayIso: day,
        startTimeHm: departureTime,
        maxSpotsPerSlot: cap.maxSpotsPerSlot,
        maxPersonsFallback: cap.maxPersons,
        paidBySlot: dayCapacitySnap.paidBySlot,
        paidByDay: dayCapacitySnap.paidByDay,
        dayCapOverride: dayCap,
        fallbackDayCap: dayCapacitySnap.fallback,
      });
    }
    if (appliedOption && bookableDepartureTimes.length >= 1) {
      const baseOpt = selectedVariant?.listingOption ?? appliedOption;
      return maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: bookableDepartureTimes
          .map((time) => {
            const cap = optionCapacityForDepartureTime(baseOpt, day, time);
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
  }, [date, dayCapacitySnap, soldOutDates, departureTime, appliedOption, bookableDepartureTimes, selectedVariant]);

  const spotsLeftIsDepartureCapacity = Boolean(departureTime) && Boolean(appliedOption);

  const partyMaxForSelectedDay = useMemo(
    () => partyMaxCappedByRemainingSpots(partyBounds.max, selectedDaySpotsLeft),
    [partyBounds.max, selectedDaySpotsLeft]
  );

  const partySizeForCapacity = useMemo(() => {
    if (optionUsesAgePricing(appliedOption) && appliedOption) {
      return totalGuestsFromMix(buildParticipantMixLines(appliedOption, participantMix));
    }
    return Math.max(1, guests);
  }, [appliedOption, participantMix, guests]);

  // Phase 1103: capacity load error or unknown remaining must block Pay —
  // do not invent a payable trip while occupancy is unverified.
  // Phase 1230: unknown party bounds (1229) also block Pay.
  const capacityUnknown =
    Boolean(dayCapacityError) ||
    partyBounds.max < 1 ||
    (Boolean(date.trim()) && selectedDaySpotsLeft == null);
  const capacitySoldOut =
    selectedDaySpotsLeft != null && selectedDaySpotsLeft < partySizeForCapacity;
  const capacityBlocksPay = capacityUnknown || capacitySoldOut;

  const quoteBlockReason =
    date.trim() && priceInfo.quote && !priceInfo.quote.ok ? priceInfo.quote.error : null;

  const leadGuestName = useMemo(
    () => [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' '),
    [firstName, lastName]
  );

  const flushDraft = useCallback(() => {
    if (presentation === 'modal') return;
    saveBookingDraft(tour.id, {
      step,
      date: date.trim(),
      guests,
      name: leadGuestName,
      email: email.trim(),
      placeOfStay: placeOfStay.trim(),
      specialRequests,
      travelerPickup: selectedPickup,
    });
  }, [presentation, tour.id, step, date, guests, leadGuestName, email, placeOfStay, specialRequests, selectedPickup]);

  const checkoutScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (presentation === 'modal') return;
    checkoutScrollRef.current?.scrollTo(0, 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presentation, step]);

  useEffect(() => {
    if (presentation === 'modal' || !date.trim()) return;
    saveTravelerCart({
      tourId: tour.id,
      optionId: selectedVariant?.id && selectedVariant.id !== '__default__' ? selectedVariant.id : '',
      date: date.trim(),
      guests: Math.max(1, partySizeForCapacity),
      mix: Object.keys(participantMix).length > 0 ? participantMix : null,
      startTime: departureTime || undefined,
      currency,
    });
    if (!user?.id || !isSupabaseConfigured()) return;
    void rememberAccountCart(user.id, {
      listingId: tour.id,
      bookingDate: date.trim(),
      guests: Math.max(1, partySizeForCapacity),
      optionId: selectedVariant?.id && selectedVariant.id !== '__default__' ? selectedVariant.id : null,
      startTime: departureTime || null,
      participantMix: Object.keys(participantMix).length > 0 ? participantMix : null,
      currency,
    });
  }, [
    presentation,
    tour.id,
    date,
    guests,
    partySizeForCapacity,
    participantMix,
    selectedVariant?.id,
    departureTime,
    currency,
    user?.id,
  ]);

  // Phase 1283: do not advertise book OG for season-ended / unpublished tours.
  useEffect(() => {
    if (presentation === 'modal') return;
    if (!isListingVisibleToTravelers(tour.status) || !listingHasUpcomingBookableSeason(tour)) {
      setPageMetaWithOg('Tour', 'Book this tour from an independent operator.');
      return;
    }
    const fromLabel = optionUsesAgePricing(appliedOption) ? 'per adult' : 'per person';
    setPageMetaWithOg(
      `Book: ${tour.title}`,
      `Reserve ${tour.title}. From ${formatMoney(fallbackBasePrice, currency)} ${fromLabel}.`,
      {
        title: `Book: ${tour.title}`,
        image: tour.image,
        type: 'website',
      }
    );
  }, [
    presentation,
    tour.id,
    tour.title,
    tour.image,
    tour.status,
    tour.listingExtras,
    fallbackBasePrice,
    currency,
    selectedVariant?.listingOption,
  ]);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  useLayoutEffect(() => {
    hydratedRef.current = false;
    const bounds = getPartySizeBounds(tour);
    const startOnReview = presentation === 'modal' || Boolean(selectedVariant);
    if (startOnReview) {
      profileHydratedRef.current = false;
      const draft = loadBookingDraft(tour.id);
      const fromDraft = Boolean(draft && draft.tourId === tour.id);
      const nextDate = (initialDate?.trim() || (fromDraft ? draft!.date : '') || '').trim();
      let nextGuests = typeof initialGuests === 'number' ? initialGuests : bounds.min;
      nextGuests = Math.min(bounds.max, Math.max(bounds.min, nextGuests));
      setDate(nextDate);
      setGuests(nextGuests);
      if (initialParticipantMix && Object.keys(initialParticipantMix).length > 0) {
        setParticipantMix(initialParticipantMix);
      }
      if (fromDraft && draft) {
        const combined = (draft.name ?? '').trim();
        const parts = combined.split(/\s+/).filter(Boolean);
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
        setEmail(draft.email || user?.email || '');
        setPlaceOfStay(draft.placeOfStay || '');
        setSelectedPickup(
          draft.travelerPickup && draft.travelerPickup.formattedAddress === (draft.placeOfStay || '').trim()
            ? draft.travelerPickup
            : null
        );
        setSpecialRequests(draft.specialRequests);
      } else {
        setFirstName('');
        setLastName('');
        setPhone('');
        setEmail(user?.email ?? '');
        setPlaceOfStay('');
        setSelectedPickup(null);
        setSpecialRequests('');
      }
      if (!fromDraft) setPhone('');
      setStep(
        sanitizeTourCheckoutFlowStep(
          initialCheckoutStep ?? (fromDraft ? draft!.step : 'review'),
          Boolean(user)
        )
      );
      setError(null);
      hydratedRef.current = true;
      return;
    }
    profileHydratedRef.current = false;
    const draft = loadBookingDraft(tour.id);
    const fromDraft = Boolean(draft && draft.tourId === tour.id);
    const nextDate = (initialDate?.trim() || (fromDraft ? draft!.date : '') || '').trim();
    const rawGuests = initialGuests ?? (fromDraft ? draft!.guests : undefined);
    let nextGuests = typeof rawGuests === 'number' ? rawGuests : bounds.min;
    nextGuests = Math.min(bounds.max, Math.max(bounds.min, nextGuests));
    setDate(nextDate);
    setGuests(nextGuests);
    if (fromDraft && draft) {
      const combined = (draft.name ?? '').trim();
      const parts = combined.split(/\s+/).filter(Boolean);
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
      setPhone('');
      setEmail(draft.email || user?.email || '');
      setPlaceOfStay(draft.placeOfStay || '');
      setSelectedPickup(
        draft.travelerPickup && draft.travelerPickup.formattedAddress === (draft.placeOfStay || '').trim()
          ? draft.travelerPickup
          : null
      );
      setSpecialRequests(draft.specialRequests);
      setStep(sanitizeRestoredBookingStep(draft.step, Boolean(user), 'page'));
    } else {
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail(user?.email ?? '');
      setPlaceOfStay('');
      setSelectedPickup(null);
      setSpecialRequests('');
      setStep('date-guests');
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user is read once for initial email/draft sanitize
  }, [tour.id, initialDate, initialGuests, presentation, selectedVariant?.id]);

  // Phase 1186: URL/draft restore must not land on contact/confirm for own/team listings.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (step !== 'contact' && step !== 'pickup' && step !== 'confirm') return;
    if (!isSupabaseConfigured() || !userRef.current?.id) return;
    let cancelled = false;
    void viewerIsListingSupplierSide(userRef.current.id, tour.supplierId)
      .then((selfBook) => {
        if (cancelled || !selfBook) return;
        setError(LISTING_SELF_BOOK_BLOCKED);
        setStep(presentation === 'modal' || selectedVariant ? 'review' : 'date-guests');
      })
      .catch(() => {
        // Phase 1307: eligibility failure ≠ allow contact/confirm.
        if (cancelled) return;
        setError(LISTING_SELF_BOOK_CHECK_FAILED);
        setStep(presentation === 'modal' || selectedVariant ? 'review' : 'date-guests');
      });
    return () => {
      cancelled = true;
    };
  }, [step, tour.supplierId, presentation, selectedVariant]);

  useEffect(() => {
    const opt = appliedOption;
    if (!opt || !optionUsesAgePricing(opt)) return;
    const next = totalGuestsFromMix(buildParticipantMixLines(opt, participantMix));
    if (next > 0) setGuests(next);
  }, [participantMix, appliedOption]);

  const lastHydratedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastHydratedUserIdRef.current !== null && lastHydratedUserIdRef.current !== (user?.id ?? null)) {
      profileHydratedRef.current = false;
      setFirstName('');
      setLastName('');
      setPhone('');
    }
    lastHydratedUserIdRef.current = user?.id ?? null;
    if (!user?.id || !isSupabaseConfigured()) return;
    if (profileHydratedRef.current) return;
    const uid = user.id;
    const meta = user.user_metadata as TravelerCheckoutAuthMetadata | undefined;
    void fetchConsumerProfileRow(uid)
      .then((row) => {
        if (lastHydratedUserIdRef.current !== uid) return;
        if (profileHydratedRef.current) return;
        const name = travelerLeadGuestNameFromAuth({
          consumerDisplayName: row?.display_name,
          metadata: meta,
        });
        const parts = name.split(/\s+/).filter(Boolean);
        const fn = parts[0] ?? '';
        const ln = parts.slice(1).join(' ');
        const ph = travelerLeadGuestPhoneFromAuth({
          consumerPhone: row?.contact_phone,
          metadata: meta,
        });
        setFirstName((prev) => prev.trim() || fn);
        setLastName((prev) => prev.trim() || ln);
        setPhone((prev) => prev.trim() || ph);
        profileHydratedRef.current = true;
      })
      .catch(() => {
        /* keep auth metadata autofill on profile load failure */
      });
  }, [user?.id]);

  useEffect(() => {
    setGuests((g) => Math.min(partyMaxForSelectedDay, Math.max(partyBounds.min, g)));
  }, [partyBounds.min, partyMaxForSelectedDay]);

  useEffect(() => {
    if (!hydratedRef.current || step === 'done') return;
    const t = window.setTimeout(() => {
      flushDraft();
    }, 400);
    return () => window.clearTimeout(t);
  }, [tour.id, step, date, guests, leadGuestName, email, placeOfStay, specialRequests, flushDraft]);

  const lastAppliedCheckoutStep = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedRef.current || presentation === 'modal' || !initialCheckoutStep) return;
    if (lastAppliedCheckoutStep.current === initialCheckoutStep) return;
    lastAppliedCheckoutStep.current = initialCheckoutStep;
    const next = sanitizeTourCheckoutFlowStep(initialCheckoutStep, Boolean(userRef.current));
    const mapped: BookingFlowStep = next === 'review' && !selectedVariant ? 'date-guests' : next;
    setStep((current) => (current === mapped || current === 'done' ? current : mapped));
  }, [initialCheckoutStep, presentation, selectedVariant]);

  useEffect(() => {
    if (!hydratedRef.current || !onCheckoutUrlState || presentation === 'modal') return;
    if (!selectedVariant) return;
    const urlStep: TourCheckoutFlowStep =
      step === 'contact' || step === 'pickup' || step === 'confirm' ? step : 'review';
    onCheckoutUrlState({
      step: urlStep,
      date: date.trim(),
      guests,
      mix: Object.keys(participantMix).length > 0 ? participantMix : null,
      startTime: departureTime,
    });
  }, [step, date, guests, participantMix, onCheckoutUrlState, presentation, selectedVariant, departureTime]);

  useEffect(() => {
    if (presentation !== 'modal') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, [presentation]);

  const handleLeaveBooking = () => {
    if (presentation === 'modal') {
      onModalClose?.();
      return;
    }
    onBack();
  };

  useDialogFocus(presentation === 'modal', bookingModalRef, handleLeaveBooking);

  const mergedSpecialRequests = useCallback(() => {
    // Phase 1852: phone is passed as customerPhone; claim builder adds "Guest phone:".
    // Do not also embed it here — that duplicated the line in special_requests.
    const stayLine = placeOfStay.trim() ? `Place of stay: ${placeOfStay.trim()}` : '';
    const rest = specialRequests.trim();
    return [stayLine, rest].filter(Boolean).join('\n\n');
  }, [placeOfStay, specialRequests]);

  const proceedToContactAfterOption = async () => {
    // Phase 1178: defense in depth — never advance when remaining is unknown/sold out.
    if (capacityUnknown) {
      setError(
        dayCapacityError ||
          'We could not verify departure capacity. Check your connection and try again.'
      );
      return;
    }
    if (capacityBlocksPay) {
      setError(
        departureTime
          ? `The ${departureTime} departure no longer has enough spots for your party.`
          : 'This date no longer has enough spots for your party.'
      );
      return;
    }
    // Phase 1181: mirror 1179 — block own/team listings before contact from date-guests path.
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, tour.supplierId);
        if (selfBook) {
          setError(LISTING_SELF_BOOK_BLOCKED);
          return;
        }
      } catch {
        setError(LISTING_SELF_BOOK_CHECK_FAILED);
        return;
      }
    }
    saveBookingDraft(tour.id, {
      step: 'date-guests',
      date: date.trim(),
      guests,
      name: leadGuestName,
      email: email.trim(),
      placeOfStay: placeOfStay.trim(),
      specialRequests,
    });
    // Sign-in is required when starting Stripe — not when opening the contact step.
    setError(null);
    setStep('contact');
  };

  const handleCheckAvailability = async () => {
    const dateCheck = dateNotInPast(date.trim(), experienceTodayIso);
    if (!dateCheck.valid) {
      setError(dateCheck.message ?? 'Please select a date');
      return;
    }
    if (appliedOption && optionUsesAgePricing(appliedOption)) {
      const mixErr = validateParticipantMix(appliedOption, participantMix);
      if (mixErr) {
        setError(mixErr);
        return;
      }
    }
    const guestErr = guestCountValidationError(partySizeForCapacity, partyBounds);
    if (guestErr) {
      setError(guestErr);
      return;
    }
    if (priceInfo.quote && !priceInfo.quote.ok) {
      setError(priceInfo.quote.error);
      // Phase 1545: keep CTA tappable — scroll/focus the fixable control (TourDetails 1529).
      const focus = bookingPageQuoteFailureFocusTarget({
        quoteError: priceInfo.quote.error,
        quoteCode: priceInfo.quote.code,
      });
      const el = document.getElementById(focus.scrollId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focus.focusSelector) {
        window.requestAnimationFrame(() => {
          const target = document.querySelector(focus.focusSelector!) as HTMLElement | null;
          target?.focus();
        });
      }
      return;
    }
    // Phase 1174: mirror Pay/PDP — unknown remaining must not advance to contact.
    if (capacityUnknown) {
      setError(
        dayCapacityError ||
          'We could not verify departure capacity. Check your connection and try again.'
      );
      return;
    }
    // Phase 1185: sold-out must not open availability modal / advance (1180 parity).
    if (capacityBlocksPay) {
      setError(
        departureTime
          ? `The ${departureTime} departure no longer has enough spots for your party.`
          : 'This date no longer has enough spots for your party.'
      );
      return;
    }
    // Phase 1187: block own/team listings before availability UI (1181 upstream).
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, tour.supplierId);
        if (selfBook) {
          setError(LISTING_SELF_BOOK_BLOCKED);
          return;
        }
      } catch {
        setError(LISTING_SELF_BOOK_CHECK_FAILED);
        return;
      }
    }
    setError(null);
    setAvailabilityChecking(true);
    setAvailabilityModalNote(null);
    setAvailabilityOptions([]);
    try {
      const startHm = (departureTime ?? '').trim();
      const optionId =
        selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
      // Phase 1171: schedule-resolved slot cap for availability check (parity with 1168 / pay 1161).
      let slotMaxSpots = tourSlotMaxSpotsFromOption(appliedOption);
      if (startHm) {
        const slotCap = tourDepartureSlotCapacity({
          listing_extras: tour.listingExtras,
          bookingDate: date.trim(),
          bookingOptionId: optionId,
          startTime: startHm,
        });
        if (slotCap == null) {
          setError('No bookable capacity for this departure.');
          return;
        }
        slotMaxSpots = slotCap;
      }
      const avail = await checkAvailability(tour.id, date.trim(), partySizeForCapacity, {
        startTimeHm: startHm || null,
        slotMaxSpots,
      });
      if (avail.available && avail.options.some((o) => o.selectable)) {
        void proceedToContactAfterOption();
        return;
      }
      // Phase 1191: verify errors stay inline (Pay 1192 parity) — do not open a sold-out-style modal.
      if (avail.error && !avail.available) {
        setError('Could not verify availability. Check your connection and try again.');
        return;
      }
      setAvailabilityModalOpen(true);
      setAvailabilityOptions(avail.options);
    } catch {
      // Phase 1191: verify failures stay inline (avail.error parity) — not a sold-out modal.
      setError('Could not verify availability. Check your connection and try again.');
    } finally {
      setAvailabilityChecking(false);
    }
  };

  const closeAvailabilityModal = () => {
    setAvailabilityModalOpen(false);
    setAvailabilityChecking(false);
    setAvailabilityOptions([]);
    setAvailabilityModalNote(null);
  };

  const handleSelectAvailabilityOption = (option: AvailabilityCheckOption) => {
    if (!option.selectable) return;
    closeAvailabilityModal();
    void proceedToContactAfterOption();
  };

  const handleContinueFromContact = async () => {
    const fnCheck = required(firstName, 1);
    if (!fnCheck.valid) {
      setError(fnCheck.message ?? 'First name is required');
      return;
    }
    const lnCheck = required(lastName, 1);
    if (!lnCheck.valid) {
      setError(lnCheck.message ?? 'Last name is required');
      return;
    }
    if (!maxLength(leadGuestName, 200).valid) {
      setError('Name is too long');
      return;
    }
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      setError(emailCheck.message ?? 'Valid email is required');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      setError('Enter a valid phone number, including the country code.');
      return;
    }
    if (appliedOption && optionUsesAgePricing(appliedOption)) {
      const mixErr = validateParticipantMix(appliedOption, participantMix);
      if (mixErr) {
        setError(mixErr);
        return;
      }
    }
    const guestErr = guestCountValidationError(partySizeForCapacity, partyBounds);
    if (guestErr) {
      setError(guestErr);
      return;
    }
    // Phase 1178: capacity must still be known/enough before confirm (Pay/1174 parity).
    if (capacityUnknown) {
      setError(
        dayCapacityError ||
          'We could not verify departure capacity. Check your connection and try again.'
      );
      return;
    }
    if (capacityBlocksPay) {
      setError(
        departureTime
          ? `The ${departureTime} departure no longer has enough spots for your party.`
          : 'This date no longer has enough spots for your party.'
      );
      return;
    }
    // Phase 1186: mirror 1179 — block own/team listings before confirm/Pay.
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, tour.supplierId);
        if (selfBook) {
          setError(LISTING_SELF_BOOK_BLOCKED);
          return;
        }
      } catch {
        setError(LISTING_SELF_BOOK_CHECK_FAILED);
        return;
      }
    }
    setError(null);
    setStep('pickup');
  };

  const handleContinueFromPickup = () => {
    if (pickupMode === 'pickup') {
      const decision = travelerPickupAllowed({
        fulfillment: 'pickup',
        area: pickupArea,
        point: selectedPickup,
      });
      if (!decision.ok) {
        setError(decision.error);
        return;
      }
    }
    setError(null);
    setStep('confirm');
  };

  const stopSubmitting = () => {
    payInFlightRef.current = false;
    setSubmitting(false);
  };

  const handleConfirmBooking = async () => {
    if (submitting || payInFlightRef.current) return;
    if (checkoutPayBlockedByConsent(checkoutConsentAccepted)) {
      // Phase 1662: “Accept terms to pay” focuses the checkbox without a red error flash.
      setError(null);
      document.getElementById('booking-checkout-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.requestAnimationFrame(() => {
        document.getElementById('booking-checkout-consent')?.focus();
      });
      return;
    }
    if (capacityBlocksPay) {
      setError(
        capacityUnknown
          ? dayCapacityError ||
              'We could not verify departure capacity. Check your connection and try again.'
          : departureTime
            ? `The ${departureTime} departure no longer has enough spots for your party.`
            : 'This date no longer has enough spots for your party.'
      );
      return;
    }
    if (isSupabaseConfigured() && !userRef.current) {
      requestAuth({
        intent: 'checkout',
        onSuccess: () => {
          // Phase 1704: wait for session before resume (AuthModal can fire before React user).
          void (async () => {
            if (supabase) {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) {
                userRef.current = sessionData.session.user;
              }
            }
            void handleConfirmBooking();
          })();
        },
      });
      return;
    }
    if (!isListingVisibleToTravelers(tour.status) || !listingHasUpcomingBookableSeason(tour)) {
      setError('This tour is not available to book.');
      return;
    }
    // Phase 1147: mirror checkout edge — don't open Stripe for own/team listings.
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, tour.supplierId);
        if (selfBook) {
          setError(LISTING_SELF_BOOK_BLOCKED);
          return;
        }
      } catch {
        setError(LISTING_SELF_BOOK_CHECK_FAILED);
        return;
      }
    }
    payInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (isSupabaseConfigured()) {
        const startHm = (departureTime ?? '').trim();
        const optionIdForCap =
          selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
        // Phase 1171: schedule-resolved slot cap before occupancy check (parity with 1168).
        let slotMaxSpots = tourSlotMaxSpotsFromOption(appliedOption);
        if (startHm) {
          const slotCap = tourDepartureSlotCapacity({
            listing_extras: tour.listingExtras,
            bookingDate: date,
            bookingOptionId: optionIdForCap,
            startTime: startHm,
          });
          if (slotCap == null) {
            setError('No bookable capacity for this departure.');
            stopSubmitting();
            return;
          }
          slotMaxSpots = slotCap;
        }
        const avail = await checkAvailability(tour.id, date, partySizeForCapacity, {
          startTimeHm: startHm || null,
          slotMaxSpots,
        });
        if (!avail.available) {
          // Phase 1192: load/check errors must not look like sold-out.
          if (avail.error) {
            setError('Could not verify availability. Check your connection and try again.');
            stopSubmitting();
            return;
          }
          setError(
            avail.remaining !== undefined && avail.remaining === 0
              ? departureTime
                ? `The ${departureTime} departure is fully booked. Go back and pick another time or date.`
                : 'This date is fully booked. Go back and pick another date.'
              : departureTime
                ? `Not enough spots left for the ${departureTime} departure. Adjust guests or choose another time.`
                : 'Not enough capacity left for your party. Adjust guests or choose another date.'
          );
          stopSubmitting();
          return;
        }
      }
      if (isSupabaseConfigured()) {
        const optionId =
          selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
        // Refetch offers at pay time so a failed browse load cannot invent a full-price quote
        // while Stripe still applies discounts (or the reverse). Aligns with checkout fail-closed (1088/1090).
        let offerLoad: { ok: true; discounts: ListingDiscount[] } | { ok: false };
        try {
          offerLoad = { ok: true, discounts: await fetchDiscountsByListingId(tour.id) };
        } catch {
          offerLoad = { ok: false };
        }
        const offerGate = payTimeDiscountsOrBlock(offerLoad);
        if (!offerGate.proceed) {
          setError('Could not load offers for this tour. Try again.');
          stopSubmitting();
          return;
        }
        // Phase 1161: mirror edge 1122 — unresolved departure capacity must not open Stripe.
        // (Already gated above for checkAvailability; re-check before quote for defense in depth.)
        if (departureTime) {
          const slotCap = tourDepartureSlotCapacity({
            listing_extras: tour.listingExtras,
            bookingDate: date,
            bookingOptionId: optionId,
            startTime: departureTime,
          });
          if (slotCap == null) {
            setError('No bookable capacity for this departure.');
            stopSubmitting();
            return;
          }
        }
        const quoted = quoteBooking({
          tour,
          discounts: offerGate.discounts,
          bookingDate: date,
          guests,
          bookingOptionId: optionId,
          participantMix: Object.keys(participantMix).length > 0 ? participantMix : null,
          startTime: departureTime,
        });
        if (!quoted.ok) {
          setError(userFacingError(quoted.error, USER_ERROR.checkout));
          stopSubmitting();
          return;
        }
        const mixNote =
          quoted.guestBreakdown && quoted.guestBreakdown.length > 0
            ? `Participants: ${quoted.guestBreakdown.map((r) => formatParticipantQuantityLabel(r.quantity, r.label)).join(' · ')}`
            : '';
        if (pickupMode === 'pickup') {
          const decision = travelerPickupAllowed({
            fulfillment: 'pickup',
            area: pickupArea,
            point: selectedPickup,
          });
          if (!decision.ok) {
            setError(decision.error);
            stopSubmitting();
            setStep('pickup');
            return;
          }
        }
        const baseSpecial = mergedSpecialRequests();
        const specialWithMix = [baseSpecial, mixNote].filter(Boolean).join('\n');
        const checkout = await createBookingCheckoutSession({
          listingId: tour.id,
          listingTitle: tour.title,
          bookingDate: date,
          guests: quoted.guests,
          customerName: leadGuestName,
          customerPhone: phone.trim() || undefined,
          specialRequests: specialWithMix || undefined,
          travelerPickup: pickupMode === 'pickup' ? selectedPickup : null,
          bookingOptionId: quoted.optionId ?? undefined,
          startTime: departureTime,
          guestBreakdown: quoted.guestBreakdown,
          participantMix: Object.keys(participantMix).length > 0 ? participantMix : undefined,
          currency: quoted.currency,
          checkoutConsentAccepted: true,
          successPath: '/booking-confirmed',
          cancelPath: selectedVariant
            ? tourCheckoutCancelPath(tour.id, {
                date,
                optionId: selectedVariant.id,
                guests: quoted.guests,
                mix: Object.keys(participantMix).length > 0 ? participantMix : null,
                step: 'confirm',
                paymentCancelled: true,
                startTime: departureTime,
              })
            : '/cart?payment=cancelled',
        });
        if (!checkout.success || !checkout.checkoutUrl) {
          setError(userFacingError(checkout.error, USER_ERROR.checkout));
          stopSubmitting();
          return;
        }
        analytics.bookComplete(tour.id, quoted.guests);
        if (user?.id) markBookingsUnread(user.id);
        clearBookingDraft(tour.id);
        clearTravelerCart(tour.id);
        window.location.assign(checkout.checkoutUrl);
        // Keep submitting true until unload so Pay cannot double-fire.
        return;
      }

      setError(
        'Card checkout is not available in this environment. No booking was created, and nothing was charged.'
      );
      stopSubmitting();
      return;
    } catch (err) {
      setError(humanizeBookingSubmitError(err instanceof Error ? err.message : undefined));
      stopSubmitting();
    }
  };

  const dateDisplay = formatBookingDateDisplay(date.trim());
  const usesAgePricingOnVariant = optionUsesAgePricing(appliedOption);
  const participantsSummary = quoted?.guestBreakdown?.length
    ? quoted.guestBreakdown.map((r) => formatParticipantQuantityLabel(r.quantity, r.label)).join(' · ')
    : appliedOption && usesAgePricingOnVariant
      ? formatMixSummaryCompact(buildParticipantMixLines(appliedOption, participantMix)) ||
        `${guests} ${guests === 1 ? 'guest' : 'guests'}`
      : `${guests} ${guests === 1 ? 'guest' : 'guests'}`;
  const priceFromQualifier = usesAgePricingOnVariant ? 'per adult' : 'per person';
  const departureLabel = departureTime || null;
  const quotedOriginalTotal =
    quoted && !usesAgePricingOnVariant ? quoted.originalUnitPrice * quoted.guests : null;
  const quotedSavings =
    quoted &&
    quoted.discountLabel &&
    quotedOriginalTotal != null &&
    quotedOriginalTotal > quoted.totalAmount + 0.004
      ? quotedOriginalTotal - quoted.totalAmount
      : null;
  const summaryLineModal = [
    dateDisplay || date || '—',
    departureLabel,
    participantsSummary,
  ]
    .filter(Boolean)
    .join(' · ');

  const contactBackStep: Step =
    flowMode === 'modal' || hasPreselectedVariant ? 'review' : 'date-guests';

  const flowInner = (
    <>
        {step === 'review' && selectedVariant && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} pickupLabel={step3Label} />
            <h2 className="text-xl font-bold text-ink mb-1">Booking details</h2>
            <p className="text-sm text-ink-muted mb-5">Confirm your date and participants.</p>
            <p className="mb-5 text-sm font-semibold text-ink break-words">
              {selectedVariant.label}
              {departureLabel ? <span className="font-medium text-ink-muted"> · {departureLabel}</span> : null}
            </p>
            <div className="mb-5">
              <TourDatePicker
                id="booking-review-date-input"
                presentation="field"
                value={date}
                onChange={(next) => {
                  setDate(next);
                  setError(null);
                }}
                options={calendarOptions}
                soldOutDates={soldOutDates}
                todayIso={experienceTodayIso}
                hint={weekdayHint}
              />
            </div>
            {usesAgePricingOnVariant && appliedOption ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Participants</p>
                {activePriceCategories(appliedOption).map((cat) => (
                    <ParticipantCategoryStepper
                      key={cat.id}
                      category={cat}
                      quantity={participantMix[cat.id] ?? 0}
                      currency={currency}
                      max={participantCategoryQuantityMax({
                        option: appliedOption,
                        categoryId: cat.id,
                        selection: participantMix,
                        partyMax: partyMaxForSelectedDay,
                      })}
                      onChange={(qty) => {
                        setParticipantMix((prev) => ({ ...prev, [cat.id]: qty }));
                        setError(null);
                      }}
                      onBoundaryAttempt={setError}
                    />
                ))}
              </div>
            ) : (
              <GuestStepper
                id="booking-review-guests"
                label="Participants"
                value={guests}
                min={partyBounds.min}
                max={partyMaxForSelectedDay}
                onChange={(n) => {
                  setGuests(n);
                  setError(null);
                }}
                onBoundaryAttempt={setError}
              />
            )}
            {presentation !== 'modal' ? (
            <div className="mt-6 hidden justify-end lg:flex">
              <button
                type="button"
                onClick={() => void handleCheckAvailability()}
                disabled={quoteFailed || availabilityChecking}
                className="tv-btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {/* Phase 1631 */}
                {quoteFailed ? 'Price unavailable' : availabilityChecking ? 'Checking…' : 'Continue to contact information'}
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'date-guests' && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} pickupLabel={step3Label} />
            <h2 className="text-xl font-bold text-ink mb-1">Booking details</h2>
            <p className="text-sm text-ink-muted mb-4">Confirm your date and participants.</p>
            <div className="space-y-4">
              <TourDatePicker
                id="booking-flow-date-input"
                presentation="field"
                value={date}
                onChange={setDate}
                options={calendarOptions}
                soldOutDates={soldOutDates}
                todayIso={experienceTodayIso}
                hint={weekdayHint}
              />
              {selectedDaySpotsLeft != null ? (
                <p
                  className={`-mt-1 text-xs font-medium ${
                    selectedDaySpotsLeft === 0 ? 'text-ink-muted' : 'text-finland'
                  }`}
                >
                  {selectedDaySpotsLeft === 0
                    ? spotsLeftIsDepartureCapacity
                      ? `Fully booked for the ${departureTime} departure`
                      : 'Fully booked this day'
                    : selectedDaySpotsLeft === 1
                      ? spotsLeftIsDepartureCapacity
                        ? `1 spot left for the ${departureTime} departure`
                        : '1 spot left this day'
                      : spotsLeftIsDepartureCapacity
                        ? `${selectedDaySpotsLeft} spots left for the ${departureTime} departure`
                        : `${selectedDaySpotsLeft} spots left this day`}
                </p>
              ) : null}
              {usesAgePricingOnVariant && appliedOption ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">Participants</p>
                  {activePriceCategories(appliedOption).map((cat) => (
                    <ParticipantCategoryStepper
                      key={cat.id}
                      category={cat}
                      quantity={participantMix[cat.id] ?? 0}
                      currency={currency}
                      max={participantCategoryQuantityMax({
                        option: appliedOption,
                        categoryId: cat.id,
                        selection: participantMix,
                        partyMax: partyMaxForSelectedDay,
                      })}
                      onChange={(qty) => {
                        setParticipantMix((prev) => ({ ...prev, [cat.id]: qty }));
                        setError(null);
                      }}
                      onBoundaryAttempt={setError}
                    />
                  ))}
                </div>
              ) : (
                <GuestStepper
                  id="booking-flow-guests"
                  label="Number of guests"
                  value={guests}
                  min={partyBounds.min}
                  max={partyMaxForSelectedDay}
                  onChange={setGuests}
                  onBoundaryAttempt={setError}
                  ariaDescribedBy={
                    error || quoteBlockReason || dayCapacityError ? 'booking-flow-guests-error' : undefined
                  }
                />
              )}
            </div>
            {(error || quoteBlockReason || dayCapacityError) ? (
              <div id="booking-flow-guests-error" className="mt-3">
                <NoticeCallout
                  title={dayCapacityError ? 'Capacity unavailable' : error ? 'Could not continue' : 'Pricing unavailable'}
                  tone="danger"
                >
                  {dayCapacityError ? (
                    <>
                      {dayCapacityError}{' '}
                      <button
                        type="button"
                        className="font-semibold text-finland hover:underline"
                        onClick={() => reloadBookingDayCapacity()}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    error || quoteBlockReason
                  )}
                </NoticeCallout>
              </div>
            ) : null}
            {presentation !== 'modal' ? (
            <div className="mt-6 hidden flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center lg:flex">
              <div className="text-sm text-ink-muted">
                <p>
                  <span className="text-ink-faint">Total</span>{' '}
                  <strong className="text-ink">
                    {totalLabel}
                  </strong>
                </p>
                <p className="text-xs text-ink-faint mt-0.5">
                  {quoted
                    ? `${quoted.optionLabel} · ${participantsSummary} — no payment taken on this step.`
                    : `${participantsSummary} — no payment taken on this step.`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={availabilityChecking || availabilityModalOpen}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                {tourStickyBookCtaLabel({
                  hasDate: Boolean(date.trim()),
                  // Page deep-link may quote without a modal variant — still show Fix date/guests.
                  hasOption: Boolean(selectedVariant) || Boolean(date.trim()),
                  needsDeparture: false,
                  checking: availabilityChecking,
                  quoteInvalid: Boolean(quoteBlockReason),
                  quoteError:
                    priceInfo.quote && !priceInfo.quote.ok ? priceInfo.quote.error : null,
                  quoteCode: priceInfo.quote && !priceInfo.quote.ok ? priceInfo.quote.code : null,
                  soldOut: capacitySoldOut,
                  capacityUnknown,
                })}
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'contact' && (
          <div className="tv-card p-4 sm:p-6 lg:p-8 lg:ring-finland/15">
            <BookingProgress step={step} flow={progressFlow} pickupLabel={step3Label} />
            <h2 className="text-xl font-bold text-ink mb-1">Contact information</h2>
            <p className="text-sm text-ink-muted mb-5">
              Confirm your details so we can send your booking information.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="booking-first-name" className="block text-sm font-semibold text-ink mb-1.5">
                    First name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                    <input
                      id="booking-first-name"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="tv-checkout-input"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="booking-last-name" className="block text-sm font-semibold text-ink mb-1.5">
                    Last name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                    <input
                      id="booking-last-name"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      autoComplete="family-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="tv-checkout-input"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="booking-phone" className="block text-sm font-semibold text-ink mb-1.5">
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                  <input
                    id="booking-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+358 40 123 4567"
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    className="tv-checkout-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="booking-email" className="block text-sm font-semibold text-ink mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                  <input
                    id="booking-email"
                    type="email"
                    value={email}
                    readOnly={Boolean(user?.email)}
                    onChange={(e) => {
                      if (!user?.email) setEmail(e.target.value);
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="next"
                    aria-readonly={Boolean(user?.email)}
                    aria-describedby="booking-email-hint"
                    className="tv-checkout-input"
                  />
                </div>
                {user?.email ? (
                  <p id="booking-email-hint" className="mt-1.5 text-xs text-ink-muted">
                    Linked to your Traverion account.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="booking-special-requests" className="block text-sm font-semibold text-ink mb-1.5">
                  Special requests <span className="font-medium text-ink-muted">(optional)</span>
                </label>
                <textarea
                  id="booking-special-requests"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value.slice(0, 2000))}
                  placeholder="Anything you'd like the operator to know?"
                  rows={2}
                  maxLength={2000}
                  className="tv-checkout-input tv-checkout-input--plain min-h-[4.5rem] py-3 resize-y"
                  aria-describedby="booking-special-requests-hint"
                />
                {/* Phase 1695: calm limit hint for optional special requests. */}
                <p id="booking-special-requests-hint" className="mt-1.5 text-xs text-ink-faint">
                  Up to 2000 characters
                  {specialRequests.length > 0 ? ` · ${specialRequests.length} used` : ''}.
                </p>
              </div>
            </div>
            {error ? (
              <div className="mt-3">
                <NoticeCallout title="Could not continue" tone="danger">
                  {error}
                </NoticeCallout>
              </div>
            ) : null}
            {presentation !== 'modal' ? (
            <div className="mt-6 hidden flex-col-reverse gap-3 sm:flex-row sm:justify-end lg:flex">
              <button
                type="button"
                onClick={() => setStep(contactBackStep)}
                className="tv-btn-ghost w-full sm:w-auto"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleContinueFromContact()}
                className="tv-btn-primary w-full sm:w-auto"
              >
                {contactContinueLabel}
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'pickup' && (
          <div className="tv-card p-4 sm:p-6 lg:p-8">
            <BookingProgress step={step} flow={progressFlow} pickupLabel={step3Label} />
            {pickupMode === 'pickup' ? (
              <>
                <h2 className="text-xl font-bold text-ink mb-1">Choose your pickup location</h2>
                <p className="text-sm text-ink-muted mb-5">
                  Enter your hotel or address within the available pickup area.
                </p>
                {pickupArea ? (
                  <p className="mb-4 text-xs text-ink-muted">
                    Pickup area: {pickupArea.label || 'operator center'} · {pickupArea.radiusKm} km radius
                  </p>
                ) : (
                  <p className="mb-4 text-sm text-amber-800" role="status">
                    {PICKUP_AREA_MISSING_MESSAGE}
                  </p>
                )}
                <PickupLocationSearch
                  id="booking-pickup-location"
                  label="Pickup location"
                  bias={pickupArea ? { lat: pickupArea.lat, lng: pickupArea.lng, radiusKm: pickupArea.radiusKm } : null}
                  selected={selectedPickup}
                  onSelect={(place) => {
                    setSelectedPickup(place);
                    setPlaceOfStay(place?.formattedAddress ?? '');
                    setError(null);
                  }}
                />
              </>
            ) : pickupMode === 'meet' ? (
              <>
                <h2 className="text-xl font-bold text-ink mb-1">Your meeting point</h2>
                <p className="text-sm text-ink-muted mb-5">
                  Please arrive at the meeting point before your scheduled departure.
                </p>
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-finland" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink break-words">
                        {meetingAddress || 'Meeting point'}
                      </p>
                      {meetingInstructions ? (
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">
                          {meetingInstructions}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-ink-muted">
                          {meetingAddress
                            ? 'The operator has not added extra arrival instructions for this option.'
                            : 'The operator has not added a meeting address for this option.'}
                        </p>
                      )}
                      {meetingMapsHref ? (
                        <a
                          href={meetingMapsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-sm font-semibold text-finland hover:underline"
                        >
                          Open in Google Maps
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-ink mb-1">Pickup and meeting point</h2>
                <p className="text-sm text-ink-muted">
                  This option does not include a pickup or a meeting point. You can continue to payment.
                </p>
              </>
            )}
            {error ? (
              <div className="mt-3">
                <NoticeCallout title="Could not continue" tone="danger">
                  {error}
                </NoticeCallout>
              </div>
            ) : null}
            {presentation !== 'modal' ? (
              <div className="mt-6 hidden flex-col-reverse gap-3 sm:flex-row sm:justify-end lg:flex">
                <button type="button" onClick={() => setStep('contact')} className="tv-btn-ghost w-full sm:w-auto">
                  Back
                </button>
                <button type="button" onClick={handleContinueFromPickup} className="tv-btn-primary w-full sm:w-auto">
                  Continue to payment
                </button>
              </div>
            ) : null}
          </div>
        )}

        {step === 'confirm' && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} pickupLabel={step3Label} />
            <h2 className="text-xl font-bold text-ink mb-1">Review & payment</h2>
            <p className="text-sm text-ink-muted mb-5">Review your details before completing your booking.</p>

            <section className="border-t border-black/[0.06] py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-ink">Contact details</h3>
                <button type="button" onClick={() => setStep('contact')} className="text-sm font-semibold text-finland hover:underline">
                  Edit
                </button>
              </div>
              <p className="text-sm text-ink break-words">{leadGuestName || 'Name missing'}</p>
              <p className="text-sm text-ink-muted break-all">{email}</p>
              {phone.trim() ? <p className="text-sm text-ink-muted">{phone.trim()}</p> : null}
            </section>

            <section className="border-t border-black/[0.06] py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-ink">{pickupMode === 'meet' ? 'Meeting point' : 'Pickup'}</h3>
                {pickupMode === 'pickup' ? (
                  <button type="button" onClick={() => setStep('pickup')} className="text-sm font-semibold text-finland hover:underline">
                    Edit
                  </button>
                ) : null}
              </div>
              <p className="text-sm text-ink break-words">
                {pickupMode === 'pickup'
                  ? selectedPickup?.formattedAddress || 'No pickup location selected'
                  : pickupMode === 'meet'
                    ? meetingAddress || 'Meeting point not set'
                    : 'No pickup or meeting point for this option'}
              </p>
            </section>

            <section className="border-t border-black/[0.06] py-4">
              <h3 className="text-sm font-bold text-ink">Payment</h3>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Total payable</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{totalLabel}</p>
              <p className="mt-2 text-sm text-ink-muted">
                Spots are held for {CHECKOUT_HOLD_MINUTES} minutes while you pay.
              </p>
              <p className="mt-3 text-sm font-semibold text-ink">{cancellationShort}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-sm font-semibold text-finland">Full cancellation terms</summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{cancellationText}</p>
              </details>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
                Secure payment
              </p>
            </section>

            <div className="mb-6">
              <CheckoutConsentCheckbox
                id="booking-checkout-consent"
                checked={checkoutConsentAccepted}
                onChange={(next) => {
                  setCheckoutConsentAccepted(next);
                  if (next) setError(null);
                }}
              />
            </div>

            {capacityBlocksPay ? (
              <div className="mb-4">
                <NoticeCallout
                  title={capacityUnknown ? 'Capacity unavailable' : 'Not enough spots left'}
                  tone="warn"
                >
                  {capacityUnknown
                    ? dayCapacityError ||
                      'We could not verify departure capacity. Check your connection and try again.'
                    : departureTime
                      ? `The ${departureTime} departure no longer has enough space for your party. Go back and choose another time or fewer guests.`
                      : 'This date no longer has enough space for your party. Go back and choose another date or fewer guests.'}
                </NoticeCallout>
              </div>
            ) : null}
            {error ? (
              <div className="mb-4">
                <NoticeCallout title="Payment could not start" tone="danger">
                  {error}
                </NoticeCallout>
              </div>
            ) : null}
            {presentation !== 'modal' ? (
            <div className="hidden flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center lg:flex">
              <button
                type="button"
                onClick={() => setStep(flowMode === 'modal' || selectedVariant ? 'review' : 'date-guests')}
                className="tv-btn-ghost w-full sm:w-auto"
              >
                Edit trip details
              </button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep('pickup')}
                  className="tv-btn-ghost w-full sm:w-auto"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={
                    submitting ||
                    capacityBlocksPay
                  }
                  className="tv-btn-primary w-full sm:w-auto whitespace-normal text-center disabled:opacity-50"
                >
                  {submitting
                    ? 'Processing…'
                    : capacityUnknown
                      ? 'Capacity unavailable'
                    : capacitySoldOut
                      ? departureTime
                        ? `Sold out · ${departureTime}`
                        : 'Sold out'
                    : checkoutPayBlockedByConsent(checkoutConsentAccepted)
                      ? 'Accept terms to pay'
                    : isSupabaseConfigured()
                      ? 'Continue to secure payment'
                      : 'Continue to payment'}
                </button>
              </div>
            </div>
            ) : null}
          </div>
        )}
    </>
  );

  const checkoutDockInner = (
    <>
      {step === 'review' ? (
        <button
          type="button"
          onClick={() => void handleCheckAvailability()}
          // Phase 1631: do not invite checkout when the quote already failed (handler also blocks).
          disabled={quoteFailed || availabilityChecking}
          className="tv-btn-primary w-full disabled:opacity-60"
        >
          {quoteFailed ? 'Price unavailable' : availabilityChecking ? 'Checking…' : 'Continue to contact information'}
        </button>
      ) : null}
      {step === 'date-guests' ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="truncate text-sm text-ink-muted">
            <span className="text-ink-faint">Total</span>{' '}
            <strong className="font-semibold tabular-nums text-ink">
              {totalLabel}
            </strong>
          </p>
          <button
            type="button"
            onClick={handleCheckAvailability}
            disabled={availabilityChecking || availabilityModalOpen}
            className="tv-btn-primary w-full disabled:opacity-60"
          >
            {tourStickyBookCtaLabel({
              hasDate: Boolean(date.trim()),
              hasOption: Boolean(selectedVariant) || Boolean(date.trim()),
              needsDeparture: false,
              checking: availabilityChecking,
              quoteInvalid: Boolean(quoteBlockReason),
              quoteError:
                priceInfo.quote && !priceInfo.quote.ok ? priceInfo.quote.error : null,
              quoteCode: priceInfo.quote && !priceInfo.quote.ok ? priceInfo.quote.code : null,
              soldOut: capacitySoldOut,
              capacityUnknown,
            })}
          </button>
        </div>
      ) : null}
      {step === 'contact' ? (
        <div className="flex flex-col-reverse gap-2">
          <button type="button" onClick={() => setStep(contactBackStep)} className="tv-btn-ghost w-full">
            Back
          </button>
          <button type="button" onClick={() => void handleContinueFromContact()} className="tv-btn-primary w-full">
            {contactContinueLabel}
          </button>
        </div>
      ) : null}
      {step === 'pickup' ? (
        <div className="flex flex-col-reverse gap-2">
          <button type="button" onClick={() => setStep('contact')} className="tv-btn-ghost w-full">
            Back
          </button>
          <button type="button" onClick={handleContinueFromPickup} className="tv-btn-primary w-full">
            Continue to payment
          </button>
        </div>
      ) : null}
      {step === 'confirm' ? (
        <div className="flex min-w-0 flex-col-reverse gap-2">
          <button
            type="button"
            onClick={() => setStep(flowMode === 'modal' || selectedVariant ? 'review' : 'date-guests')}
            className="tv-btn-ghost w-full"
          >
            Edit trip details
          </button>
          <button type="button" onClick={() => setStep('pickup')} className="tv-btn-ghost w-full">
            Back
          </button>
          <button
            type="button"
            onClick={handleConfirmBooking}
            disabled={
              submitting ||
              capacityBlocksPay
            }
            className="tv-btn-primary min-w-0 w-full max-w-full text-center text-sm leading-snug line-clamp-3 disabled:opacity-50"
          >
            {submitting
              ? 'Processing…'
              : capacityUnknown
                ? 'Capacity unavailable'
              : capacitySoldOut
                ? departureTime
                  ? `Sold out · ${departureTime}`
                  : 'Sold out'
              : checkoutPayBlockedByConsent(checkoutConsentAccepted)
                ? 'Accept terms to pay'
              : isSupabaseConfigured()
                ? 'Continue to secure payment'
                : 'Continue to payment'}
          </button>
        </div>
      ) : null}
    </>
  );

  const modalShell =
    presentation === 'modal' ? (
      <div
        ref={bookingModalRef}
        className="fixed inset-0 z-[20000] flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-flow-modal-title"
      >
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-md transition-opacity duration-200 supports-[backdrop-filter]:bg-slate-900/40"
          aria-label="Close booking"
          onClick={handleLeaveBooking}
        />
        <div className="relative z-10 flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none bg-white sm:h-auto sm:max-h-[min(95dvh,1040px)] sm:rounded-xl sm:shadow-2xl sm:ring-1 sm:ring-black/[0.08] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 py-3 sm:px-5">
            <div className="min-w-0 pr-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Checkout</p>
              <h2
                id="booking-flow-modal-title"
                className="truncate text-base font-semibold text-ink sm:text-lg"
              >
                Book: {tour.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="lux-tap-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland"
              aria-label="Close booking"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mx-4 mt-3 h-20 shrink-0 overflow-hidden rounded-xl shadow-soft ring-1 ring-black/[0.08] sm:mx-5 sm:mt-4 sm:h-32">
              {/* Phase 1632: checkout hero images describe the listing for assistive tech. */}
              <img src={tour.image} alt={tour.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 text-white">
                <p className="line-clamp-2 font-sans text-base font-bold leading-tight tracking-tight sm:text-lg">{tour.title}</p>
                <p className="text-[11px] text-white/90">
                  {/* Phase 1558: never invent catalog From when quoteBooking failed (1545/1557). */}
                  {formatTourDurationDisplay(tour.duration)}
                  {quoteFailed
                    ? ' · Price unavailable'
                    : ` · From ${formatMoney(pricePerPerson, currency)}/${priceFromQualifier === 'per adult' ? 'adult' : 'person'}`}
                </p>
              </div>
            </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4 [scrollbar-gutter:stable]">
            {flowInner}
          </div>
          <div className="shrink-0 border-t border-black/[0.06] bg-paper-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {checkoutDockInner}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {presentation === 'modal' ? createPortal(modalShell, document.body) : null}
      {presentation !== 'modal'
        ? createPortal(
        <div className="fixed inset-0 z-[10000] flex flex-col bg-white">
          <header className="shrink-0 border-b border-black/[0.08] bg-white pt-[env(safe-area-inset-top,0px)]">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={handleLeaveBooking}
                className="lux-flat inline-flex h-11 min-w-0 items-center gap-2 rounded-md pr-2 text-ink"
              >
                <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain" />
                <span className="font-sans text-[11px] font-semibold tracking-[0.18em]">TRAVERION</span>
                <span className="sr-only">Back to tour</span>
              </button>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
                Secure checkout
              </p>
            </div>
          </header>
          <div ref={checkoutScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">

            {stripeReturnCancelled ? (
              <div className="mb-5">
                <NoticeCallout title="Checkout cancelled" tone="warn">
                  {STRIPE_CHECKOUT_CANCELLED_TOUR_COPY}
                </NoticeCallout>
              </div>
            ) : null}

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-10">
              <div className="min-w-0">
                <div className="mb-4 overflow-hidden rounded-xl border border-black/10 bg-white lg:hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 p-3 text-left"
                    aria-expanded={summaryOpen}
                    onClick={() => setSummaryOpen((open) => !open)}
                  >
                    {/* Phase 1632: checkout hero images describe the listing for assistive tech. */}
                    <img src={tour.image} alt={tour.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{tour.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {dateDisplay || 'Date'} · {participantsSummary}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-ink">{totalLabel}</span>
                      <ChevronDown className={`ml-auto h-4 w-4 text-ink-muted transition-transform ${summaryOpen ? 'rotate-180' : ''}`} aria-hidden />
                    </span>
                  </button>
                  {summaryOpen ? (
                    <dl className="space-y-2 border-t border-black/[0.06] px-3 py-3 text-sm">
                      {selectedVariant ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Option</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink break-words">{selectedVariant.label}</dd>
                        </div>
                      ) : null}
                      {departureLabel ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Departure</dt>
                          <dd className="text-right font-medium text-ink">{departureLabel}</dd>
                        </div>
                      ) : null}
                      {pickupMode === 'pickup' && placeOfStay.trim() ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Pickup</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink">{placeOfStay.trim()}</dd>
                        </div>
                      ) : null}
                      {pickupMode === 'meet' && meetingAddress ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Meeting point</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink">{meetingAddress}</dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Cancellation</dt>
                        <dd className="max-w-[65%] text-right font-medium text-ink">{cancellationShort}</dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
                {flowInner}
              </div>

              <aside className="mt-6 hidden lg:sticky lg:top-0 lg:mt-0 lg:block lg:max-h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
                <div className="overflow-hidden rounded-xl bg-white ring-1 ring-finland/20">
                  <div className="relative h-28 bg-black/10">
                    <img src={tour.image} alt={tour.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <h2 className="font-sans text-base font-bold leading-snug text-ink line-clamp-3">{tour.title}</h2>
                    </div>
                    <dl className="space-y-2.5 border-t border-black/[0.06] pt-4 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Date</dt>
                        <dd className="text-right font-medium text-ink">{dateDisplay || date || '—'}</dd>
                      </div>
                      {departureLabel ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Departure</dt>
                          <dd className="text-right font-medium tabular-nums text-ink">{departureLabel}</dd>
                        </div>
                      ) : null}
                      {selectedVariant ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Option</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink break-words">{selectedVariant.label}</dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Participants</dt>
                        <dd className="max-w-[65%] text-right font-medium text-ink">{participantsSummary}</dd>
                      </div>
                      {pickupMode === 'pickup' && placeOfStay.trim() ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Pickup</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink">{placeOfStay.trim()}</dd>
                        </div>
                      ) : null}
                      {pickupMode === 'meet' && meetingAddress ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Meeting point</dt>
                          <dd className="max-w-[65%] text-right font-medium text-ink">{meetingAddress}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="border-t border-black/[0.08] pt-4">
                      {quotedSavings != null && quotedOriginalTotal != null ? (
                        <div className="mb-2 space-y-1">
                          <p className="text-sm text-ink-muted">
                            Regular price{' '}
                            <span className="line-through tabular-nums">{formatMoney(quotedOriginalTotal, currency)}</span>
                          </p>
                          <p className="text-sm font-semibold text-emerald-800">
                            You save {formatMoney(quotedSavings, currency)}
                            {quoted?.discountLabel ? ` · ${quoted.discountLabel}` : ''}
                          </p>
                        </div>
                      ) : quoted?.discountLabel ? (
                        <p className="mb-2 text-sm font-semibold text-emerald-800">{quoted.discountLabel}</p>
                      ) : null}
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Total</p>
                      <p className="mt-1 text-[1.65rem] font-bold leading-none tabular-nums text-ink">{totalLabel}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{cancellationShort}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-finland">Full cancellation terms</summary>
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{cancellationText}</p>
                      </details>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
          <footer className="mx-auto mt-8 w-full max-w-6xl border-t border-black/[0.06] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>© {new Date().getFullYear()} Traverion</span>
              <a href="/privacy" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">Privacy</a>
              <a href="/terms" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">Terms</a>
            </div>
          </footer>
          </div>
          <div className="lg:hidden shrink-0 border-t border-black/[0.08] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full min-w-0 max-w-6xl">{checkoutDockInner}</div>
          </div>
        </div>,
        document.body
      ) : null}

      <AvailabilityOptionsModal
        open={availabilityModalOpen}
        checking={availabilityChecking}
        options={availabilityOptions}
        note={availabilityModalNote}
        summaryLine={summaryLineModal}
        onClose={closeAvailabilityModal}
        onSelectOption={handleSelectAvailabilityOption}
      />
    </>
  );
}
