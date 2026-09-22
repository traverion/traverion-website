/**
 * Single clean booking flow (GetYourGuide/TripAdvisor style):
 * Page: Date & guests → Contact → Confirm → Done.
 * Modal (from tour page): Trip summary → Checkout → Confirm → Done.
 */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  User,
  Mail,
  MessageSquare,
  MapPin,
  Shield,
  ClipboardList,
  X,
  Phone,
} from 'lucide-react';
import { TourPackage } from '../types/tour';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { createBookingCheckoutSession } from '../data/supabase-bookings';
import type { ListingDiscount } from '../data/supabase-discounts';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import { getDisplayPriceForBookingVariant } from '../lib/discount-display';
import { quoteBooking, formatOptionWeekdays, tourQuotePriceLines } from '../lib/booking-quote';
import {
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  resolveScheduleForDate,
  applyScheduleToOption,
} from '../lib/listing-option-schedules';
import { localYmd } from '../lib/local-ymd';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown from '../components/PriceBreakdown';
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
import { tourSoldOutDates } from '../lib/tour-calendar';
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
import {
  buildParticipantMixLines,
  formatMixSummaryCompact,
  optionUsesAgePricing,
  totalGuestsFromMix,
  validateParticipantMix,
} from '../lib/participant-mix';
import { activePriceCategories } from '../lib/price-categories';
import { markBookingsUnread } from '../lib/customerBookingNotifications';
import {
  BOOKING_CONTACT_EMAIL_FIELD_NOTE,
  bookingContactIntroCopy,
  bookingPayConfirmAfterPayCopy,
} from '../lib/booking-confirmation-copy';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import NoticeCallout from '../components/NoticeCallout';

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
}: {
  step: Step;
  flow: 'page' | 'modal' | 'variant';
}) {
  if (step === 'done') return null;
  const labels = (['Trip', 'Contact', 'Pay'] as const);
  const order: Step[] =
    flow === 'page' ? ['date-guests', 'contact', 'confirm'] : ['review', 'contact', 'confirm'];
  const currentIndex = Math.max(0, order.indexOf(step));

  return (
    <nav className="mb-6" aria-label="Booking steps">
      <ol className="flex flex-wrap items-center gap-y-2 gap-x-1 sm:gap-x-3">
        {labels.map((label, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={label} className="contents">
              {i > 0 && (
                <span className="mx-0.5 sm:mx-1 text-ink-faint select-none" aria-hidden>
                  →
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
                  done
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
                    : current
                      ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                      : 'bg-black/[0.04] text-ink-faint ring-1 ring-black/[0.04]'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done
                      ? 'bg-emerald-600 text-white'
                      : current
                        ? 'bg-white/20 text-white'
                        : 'bg-black/[0.08] text-ink-faint'
                  }`}
                  aria-hidden
                >
                  {done ? '✓' : i + 1}
                </span>
                {label}
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
  const userRef = useRef(user);
  userRef.current = user;
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
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availabilityChecking, setAvailabilityChecking] = useState(false);
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilityCheckOption[]>([]);
  const [availabilityModalNote, setAvailabilityModalNote] = useState<string | null>(null);
  const [soldOutDates, setSoldOutDates] = useState<ReadonlySet<string>>(() => new Set());
  const [dayCapacitySnap, setDayCapacitySnap] = useState<{
    paidByDay: Record<string, number>;
    paidBySlot: Record<string, number>;
    capByDay: Map<string, number>;
    fallback: number;
  } | null>(null);

  const partyBounds = useMemo(() => getPartySizeBounds(tour), [tour]);

  const hydratedRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const bookingModalRef = useRef<HTMLDivElement>(null);
  const currency = normalizeCurrency(tour.price?.currency);
  const fallbackBasePrice = tour.price?.startingFrom ?? 0;
  const departureTime = (initialStartTime ?? '').trim() || undefined;
  const appliedOption = useMemo(() => {
    const opt = selectedVariant?.listingOption ?? null;
    if (!opt) return null;
    if (!listingOptionHasSchedules(opt)) return opt;
    const day = date.trim() || localYmd();
    const resolved = resolveScheduleForDate(opt, day, departureTime);
    return resolved ? applyScheduleToOption(opt, resolved) : opt;
  }, [selectedVariant, date, departureTime]);
  const priceInfo = useMemo(() => {
    const day = date.trim() || localYmd();
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
  }, [presentation, selectedVariant, tour, date, guests, discountsByListing, fallbackBasePrice, participantMix, departureTime]);

  const pricePerPerson = priceInfo.price;
  const quoted = priceInfo.quote && priceInfo.quote.ok ? priceInfo.quote : null;
  const total = quoted ? quoted.totalAmount : pricePerPerson * guests;
  const cancellationText =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;

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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchAvailabilityByListingId(tour.id),
      fetchPublishedTourPaidGuests(tour.id),
      fetchPublishedTourPaidGuestsBySlot(tour.id),
    ]).then(([caps, paidByDay, paidBySlot]) => {
      if (cancelled) return;
      const fallbackCap = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(calendarOptions));
      const capByDay = new Map<string, number>();
      for (const row of caps) {
        const day = String(row.available_date ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        capByDay.set(day, row.capacity);
      }
      setDayCapacitySnap({ paidByDay, paidBySlot, capByDay, fallback: fallbackCap });
      setSoldOutDates(tourSoldOutDates({ paidByDay, capByDay, fallbackCapacity: fallbackCap }));
    });
    return () => {
      cancelled = true;
    };
  }, [tour.id, calendarOptions]);

  const selectedDaySpotsLeft = useMemo(() => {
    const day = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !dayCapacitySnap) return null;
    if (soldOutDates.has(day)) return 0;
    const dayCapOverride = dayCapacitySnap.capByDay.has(day);
    if (!dayCapOverride && departureTime && appliedOption) {
      const spots = appliedOption.maxSpotsPerSlot;
      const cap =
        typeof spots === 'number' && Number.isFinite(spots) && spots >= 1
          ? Math.min(99, Math.floor(spots))
          : Math.min(99, Math.max(1, appliedOption.maxPersons));
      const paid = dayCapacitySnap.paidBySlot[tourPaidSlotKey(day, departureTime)] ?? 0;
      return remainingCapacity(cap, paid);
    }
    const cap = dayCapacitySnap.capByDay.get(day) ?? dayCapacitySnap.fallback;
    return remainingCapacity(cap, dayCapacitySnap.paidByDay[day] ?? 0);
  }, [date, dayCapacitySnap, soldOutDates, departureTime, appliedOption]);

  const partyMaxForSelectedDay = useMemo(() => {
    if (selectedDaySpotsLeft == null || selectedDaySpotsLeft < 1) return partyBounds.max;
    return Math.max(1, Math.min(partyBounds.max, selectedDaySpotsLeft));
  }, [partyBounds.max, selectedDaySpotsLeft]);

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
    });
  }, [presentation, tour.id, step, date, guests, leadGuestName, email, placeOfStay, specialRequests]);

  useEffect(() => {
    if (presentation === 'modal') return;
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
        setSpecialRequests(draft.specialRequests);
      } else {
        setFirstName('');
        setLastName('');
        setPhone('');
        setEmail(user?.email ?? '');
        setPlaceOfStay('');
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
      setSpecialRequests(draft.specialRequests);
      setStep(sanitizeRestoredBookingStep(draft.step, Boolean(user), 'page'));
    } else {
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail(user?.email ?? '');
      setPlaceOfStay('');
      setSpecialRequests('');
      setStep('date-guests');
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user is read once for initial email/draft sanitize
  }, [tour.id, initialDate, initialGuests, presentation, selectedVariant?.id]);

  useEffect(() => {
    const opt = appliedOption;
    if (!opt || !optionUsesAgePricing(opt)) return;
    const next = totalGuestsFromMix(buildParticipantMixLines(opt, participantMix));
    if (next > 0) setGuests(next);
  }, [participantMix, appliedOption]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured() || profileHydratedRef.current) return;
    const meta = user.user_metadata as {
      customer_first_name?: string;
      customer_last_name?: string;
      customer_phone?: string;
      phone?: string;
    };
    let fn = (meta?.customer_first_name ?? '').trim();
    let ln = (meta?.customer_last_name ?? '').trim();
    void fetchConsumerProfileRow(user.id).then((row) => {
      if (profileHydratedRef.current) return;
      if (row?.display_name?.trim() && !fn && !ln) {
        const parts = row.display_name.trim().split(/\s+/).filter(Boolean);
        fn = parts[0] ?? '';
        ln = parts.slice(1).join(' ');
      }
      const ph = (row?.contact_phone ?? meta?.customer_phone ?? meta?.phone ?? '').trim();
      setFirstName((prev) => prev.trim() || fn);
      setLastName((prev) => prev.trim() || ln);
      setPhone((prev) => prev.trim() || ph);
      profileHydratedRef.current = true;
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

  useEffect(() => {
    if (!hydratedRef.current || !onCheckoutUrlState || presentation === 'modal') return;
    if (!selectedVariant) return;
    const urlStep: TourCheckoutFlowStep =
      step === 'contact' || step === 'confirm' ? step : 'review';
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
    const phoneLine = phone.trim() ? `Guest phone: ${phone.trim()}` : '';
    const stayLine = placeOfStay.trim() ? `Place of stay: ${placeOfStay.trim()}` : '';
    const rest = specialRequests.trim();
    return [phoneLine, stayLine, rest].filter(Boolean).join('\n\n');
  }, [phone, placeOfStay, specialRequests]);

  const proceedToContactAfterOption = () => {
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
    const dateCheck = dateNotInPast(date.trim());
    if (!dateCheck.valid) {
      setError(dateCheck.message ?? 'Please select a date');
      return;
    }
    const guestErr = guestCountValidationError(guests, partyBounds);
    if (guestErr) {
      setError(guestErr);
      return;
    }
    if (priceInfo.quote && !priceInfo.quote.ok) {
      setError(priceInfo.quote.error);
      return;
    }
    setError(null);
    setAvailabilityChecking(true);
    setAvailabilityModalNote(null);
    setAvailabilityOptions([]);
    try {
      const avail = await checkAvailability(tour.id, date.trim(), guests);
      if (avail.available && avail.options.some((o) => o.selectable)) {
        proceedToContactAfterOption();
        return;
      }
      setAvailabilityModalOpen(true);
      setAvailabilityOptions(avail.options);
      if (avail.error && !avail.available) {
        setAvailabilityModalNote('We could not verify capacity for this date.');
      }
    } catch {
      setAvailabilityModalOpen(true);
      setAvailabilityOptions([
        {
          id: 'network',
          title: 'Could not check availability',
          description: 'Check your connection and try again in a moment.',
          selectable: false,
        },
      ]);
      setAvailabilityModalNote(null);
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
    proceedToContactAfterOption();
  };

  const handleContinueFromContact = () => {
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
    const guestErr = guestCountValidationError(guests, partyBounds);
    if (guestErr) {
      setError(guestErr);
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleContinueFromReview = () => {
    setError(null);
    if (usesAgePricingOnVariant && appliedOption) {
      const mixErr = validateParticipantMix(appliedOption, participantMix);
      if (mixErr) {
        setError(mixErr);
        return;
      }
    }
    if (priceInfo.quote && !priceInfo.quote.ok) {
      setError(priceInfo.quote.error);
      return;
    }
    setStep('contact');
  };

  const handleConfirmBooking = async () => {
    if (submitting) return;
    if (isSupabaseConfigured() && !userRef.current) {
      requestAuth({
        onSuccess: () => {
          window.setTimeout(() => {
            void handleConfirmBooking();
          }, 0);
        },
      });
      return;
    }
    if (!isListingVisibleToTravelers(tour.status)) {
      setError('This tour is not available to book.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isSupabaseConfigured()) {
        const avail = await checkAvailability(tour.id, date, guests);
        if (!avail.available) {
          setError(
            avail.remaining !== undefined && avail.remaining === 0
              ? 'This date is fully booked. Go back and pick another date.'
              : 'Not enough capacity left for your party. Adjust guests or choose another date.'
          );
          setSubmitting(false);
          return;
        }
      }
      if (isSupabaseConfigured()) {
        const optionId =
          selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
        const quoted = quoteBooking({
          tour,
          discounts: discountsByListing?.get(tour.id) ?? [],
          bookingDate: date,
          guests,
          bookingOptionId: optionId,
          participantMix: Object.keys(participantMix).length > 0 ? participantMix : null,
          startTime: departureTime,
        });
        if (!quoted.ok) {
          setError(userFacingError(quoted.error, USER_ERROR.checkout));
          setSubmitting(false);
          return;
        }
        const mixNote =
          quoted.guestBreakdown && quoted.guestBreakdown.length > 0
            ? `Participants: ${quoted.guestBreakdown.map((r) => `${r.quantity} ${r.label}`).join(' · ')}`
            : '';
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
          bookingOptionId: quoted.optionId ?? undefined,
          startTime: departureTime,
          guestBreakdown: quoted.guestBreakdown,
          participantMix: Object.keys(participantMix).length > 0 ? participantMix : undefined,
          currency: quoted.currency,
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
            : '/bookings?payment=cancelled',
        });
        if (!checkout.success || !checkout.checkoutUrl) {
          setError(userFacingError(checkout.error, USER_ERROR.checkout));
          setSubmitting(false);
          return;
        }
        analytics.bookComplete(tour.id, quoted.guests);
        if (user?.id) markBookingsUnread(user.id);
        clearBookingDraft(tour.id);
        window.location.assign(checkout.checkoutUrl);
        return;
      }

      setError(
        'Card checkout is not available in this environment. No booking was created, and nothing was charged.'
      );
      setSubmitting(false);
      return;
    } catch (err) {
      setError(humanizeBookingSubmitError(err instanceof Error ? err.message : undefined));
    } finally {
      setSubmitting(false);
    }
  };

  const dateDisplay = formatBookingDateDisplay(date.trim());
  const usesAgePricingOnVariant = optionUsesAgePricing(appliedOption);
  const participantsSummary = quoted?.guestBreakdown?.length
    ? quoted.guestBreakdown.map((r) => `${r.quantity} ${r.label}`).join(' · ')
    : appliedOption && usesAgePricingOnVariant
      ? formatMixSummaryCompact(buildParticipantMixLines(appliedOption, participantMix)) ||
        `${guests} ${guests === 1 ? 'guest' : 'guests'}`
      : `${guests} ${guests === 1 ? 'guest' : 'guests'}`;
  const priceFromQualifier = usesAgePricingOnVariant ? 'per adult' : 'per person';
  const departureLabel = departureTime || null;
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
            <BookingProgress step={step} flow={progressFlow} />
            <h2 className="font-display text-xl text-ink mb-1.5">Your trip</h2>
            <p className="text-sm text-ink-muted mb-6">
              Confirm date, option, and participants. Next you will enter contact details, then pay on Stripe TEST until live.
            </p>
            <div className="space-y-3 text-sm text-ink-muted mb-6 rounded-xl bg-paper px-4 py-3.5 ring-1 ring-black/[0.05]">
              <p>
                <span className="font-medium text-ink">Tour</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-ink">Option</span> — {selectedVariant.label}
              </p>
              {selectedVariant.subtitle ? <p className="text-ink-muted">{selectedVariant.subtitle}</p> : null}
              <p>
                <span className="font-medium text-ink">Date</span> — {dateDisplay || date}
              </p>
              {departureLabel ? (
                <p>
                  <span className="font-medium text-ink">Departure</span> — {departureLabel}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-ink">Participants</span> — {participantsSummary}
              </p>
              {selectedVariant.listingOption?.pickupPlace?.trim() ? (
                <p>
                  <span className="font-medium text-ink">Pickup / meeting</span> —{' '}
                  {selectedVariant.listingOption.pickupPlace.trim()}
                </p>
              ) : null}
            </div>
            {usesAgePricingOnVariant && appliedOption ? (
              <div className="mb-6 space-y-2">
                <p className="text-sm font-medium text-ink">Adjust participants</p>
                {activePriceCategories(appliedOption).map((cat) => (
                  <ParticipantCategoryStepper
                    key={cat.id}
                    category={cat}
                    quantity={participantMix[cat.id] ?? 0}
                    currency={currency}
                    max={appliedOption.maxPersons}
                    onChange={(qty) => {
                      setParticipantMix((prev) => ({ ...prev, [cat.id]: qty }));
                      setError(null);
                    }}
                    onBoundaryAttempt={setError}
                  />
                ))}
              </div>
            ) : null}
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2">Total</p>
              {quoted ? (
                <PriceBreakdown
                  currency={quoted.currency}
                  lines={tourQuotePriceLines(quoted)}
                  total={quoted.totalAmount}
                  originalTotal={quoted.originalUnitPrice * quoted.guests}
                  discountLabel={quoted.discountLabel}
                  footnote={`${quoted.optionLabel} · ${participantsSummary}`}
                />
              ) : (
                <div className="flex justify-between text-sm text-ink-muted">
                  <span>
                    {participantsSummary}
                    {priceInfo.label ? (
                      <span className="block text-xs text-green-600 mt-1">{priceInfo.label}</span>
                    ) : null}
                  </span>
                  <span className="font-medium text-ink">{formatMoney(total, currency)}</span>
                </div>
              )}
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-1.5">Cancellation</p>
              <p className="text-sm text-ink-muted leading-relaxed">{cancellationText}</p>
            </div>
            {presentation !== 'modal' ? (
            <div className="mt-6 hidden justify-end lg:flex">
              <button
                type="button"
                onClick={handleContinueFromReview}
                className="tv-btn-primary w-full sm:w-auto"
              >
                Go to checkout
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'date-guests' && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} />
            <h2 className="text-xl font-semibold text-ink mb-4">Select date and guests</h2>
            <div className="space-y-4">
              <TourDatePicker
                id="booking-flow-date-input"
                value={date}
                onChange={setDate}
                options={calendarOptions}
                soldOutDates={soldOutDates}
                hint={weekdayHint}
              />
              {selectedDaySpotsLeft != null ? (
                <p
                  className={`-mt-1 text-xs font-medium ${
                    selectedDaySpotsLeft === 0 ? 'text-ink-muted' : 'text-finland'
                  }`}
                >
                  {selectedDaySpotsLeft === 0
                    ? 'Fully booked this day'
                    : selectedDaySpotsLeft === 1
                      ? '1 spot left this day'
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
                      max={Math.min(appliedOption.maxPersons, partyMaxForSelectedDay)}
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
                />
              )}
            </div>
            {(error || quoteBlockReason) ? (
              <div className="mt-3">
                <NoticeCallout title={error ? 'Could not continue' : 'Pricing unavailable'} tone="danger">
                  {error || quoteBlockReason}
                </NoticeCallout>
              </div>
            ) : null}
            {presentation !== 'modal' ? (
            <div className="mt-6 hidden flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center lg:flex">
              <div className="text-sm text-ink-muted">
                <p>
                  <span className="text-ink-faint">Total</span>{' '}
                  <strong className="text-ink">
                    {quoteBlockReason ? '—' : formatMoney(total, currency)}
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
                disabled={availabilityChecking || availabilityModalOpen || Boolean(quoteBlockReason)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                {availabilityChecking ? 'Checking…' : 'See options'}
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'contact' && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} />
            <h2 className="text-xl font-semibold text-ink mb-2">Your details</h2>
            <p className="text-sm text-ink-muted mb-6 flex items-start gap-2">
              <Shield className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>{bookingContactIntroCopy(Boolean(user?.email))}</span>
            </p>
            <div className="space-y-4">
              <div className="rounded-2xl bg-finland/[0.05] ring-1 ring-finland/15 p-3.5 text-sm text-ink-muted">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland mb-1.5">Your booking</p>
                <p className="font-medium text-ink">{tour.title}</p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Date</dt>
                    <dd className="font-medium text-ink text-right">{dateDisplay || date || '—'}</dd>
                  </div>
                  {departureLabel ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Departure</dt>
                      <dd className="font-medium text-ink text-right tabular-nums">{departureLabel}</dd>
                    </div>
                  ) : null}
                  {selectedVariant ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Option</dt>
                      <dd className="font-medium text-ink text-right">
                        {selectedVariant.label}
                        {selectedVariant.listingOption?.isPrivate ? (
                          <span className="mt-0.5 block text-[11px] font-semibold text-ink">
                            Private · your group only
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Participants</dt>
                    <dd className="font-medium text-ink text-right">{participantsSummary}</dd>
                  </div>
                  {selectedVariant?.listingOption?.pickupPlace?.trim() ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Pickup / meeting</dt>
                      <dd className="font-medium text-ink text-right max-w-[60%] line-clamp-2">
                        {selectedVariant.listingOption.pickupPlace.trim()}
                      </dd>
                    </div>
                  ) : tour.meetingPoint?.trim() ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Meeting</dt>
                      <dd className="font-medium text-ink text-right max-w-[60%] line-clamp-2">
                        {tour.meetingPoint.trim()}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 pt-1 border-t border-finland/15">
                    <dt className="text-ink-faint">Total</dt>
                    <dd className="font-semibold text-ink tabular-nums">{formatMoney(total, currency)}</dd>
                  </div>
                </dl>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">First name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="tv-input pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Last name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      autoComplete="family-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="tv-input pl-10"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Phone (optional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+358 …"
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    className="tv-input pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Place of stay (optional)</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
                  <input
                    type="text"
                    value={placeOfStay}
                    onChange={(e) => setPlaceOfStay(e.target.value)}
                    placeholder="Hotel name or address"
                    autoComplete="street-address"
                    className="tv-input pl-10"
                  />
                </div>
                {tour.meetingPoint?.trim() ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    Meeting point is still {tour.meetingPoint.trim()}. Add your stay location for easier coordination.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
                  <input
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
                    className={`tv-input pl-10 ${user?.email ? 'bg-black/[0.04] text-ink-muted cursor-not-allowed' : ''}`}
                  />
                </div>
                {user?.email ? (
                  <p className="mt-1 text-xs text-ink-muted">This must match your signed-in account.</p>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">{BOOKING_CONTACT_EMAIL_FIELD_NOTE}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Special requests (optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-ink-faint pointer-events-none" />
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Dietary needs, accessibility, questions for the provider…"
                    rows={3}
                    className="tv-input pl-10 min-h-[5.5rem] py-3 resize-none"
                  />
                </div>
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
                onClick={handleContinueFromContact}
                className="tv-btn-primary w-full sm:w-auto"
              >
                Review and pay
              </button>
            </div>
            ) : null}
          </div>
        )}

        {step === 'confirm' && (
          <div className="tv-card p-4 sm:p-5">
            <BookingProgress step={step} flow={progressFlow} />
            <h2 className="font-display text-xl text-ink mb-1.5">Review &amp; pay</h2>
            <p className="text-sm text-ink-muted mb-6 flex items-start gap-2 rounded-xl bg-finland/5 ring-1 ring-finland/15 px-3 py-2.5">
              <ClipboardList className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                {isSupabaseConfigured()
                  ? `Confirm the details below, then pay ${formatMoney(total, currency)} on Stripe TEST. Your spots are held for ${CHECKOUT_HOLD_MINUTES} minutes while you check out.`
                  : 'Live card checkout is not configured in this environment. We will not pretend a payment succeeded.'}
              </span>
            </p>

            <section className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-3">Your booking</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Tour</dt>
                  <dd className="font-medium text-ink text-right max-w-[65%]">{tour.title}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Date</dt>
                  <dd className="font-medium text-ink text-right">{dateDisplay || date}</dd>
                </div>
                {selectedVariant ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Option</dt>
                    <dd className="font-medium text-ink text-right">
                      {selectedVariant.label}
                      {selectedVariant.listingOption?.isPrivate ? (
                        <span className="mt-0.5 block text-[11px] font-semibold text-ink">
                          Private · your group only
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Participants</dt>
                  <dd className="font-medium text-ink text-right">
                    {quoted?.guestBreakdown?.length ? (
                      <ul className="space-y-1">
                        {quoted.guestBreakdown.map((r) => (
                          <li key={r.categoryId}>
                            {r.quantity} × {r.label}
                            <span className="text-ink-muted font-normal">
                              {' '}
                              · {formatMoney(r.unitPrice, quoted.currency)} each
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      `${guests} ${guests === 1 ? 'guest' : 'guests'}`
                    )}
                  </dd>
                </div>
                {selectedVariant?.listingOption?.pickupPlace?.trim() || tour.meetingPoint?.trim() ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Pickup / meeting</dt>
                    <dd className="font-medium text-ink text-right max-w-[65%]">
                      {selectedVariant?.listingOption?.pickupPlace?.trim() || tour.meetingPoint?.trim()}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="mb-6 border-t border-black/[0.06] pt-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-3">Contact</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Lead guest</dt>
                  <dd className="font-medium text-ink text-right">{leadGuestName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="font-medium text-ink text-right">{email}</dd>
                </div>
                {phone.trim() ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Phone</dt>
                    <dd className="font-medium text-ink text-right">{phone.trim()}</dd>
                  </div>
                ) : null}
                {placeOfStay.trim() ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Place of stay</dt>
                    <dd className="font-medium text-ink text-right">{placeOfStay.trim()}</dd>
                  </div>
                ) : null}
                {specialRequests.trim() ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Requests</dt>
                    <dd className="font-medium text-ink text-right max-w-[65%]">{specialRequests.trim()}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-xs text-ink-muted">{BOOKING_CONTACT_EMAIL_FIELD_NOTE}</p>
            </section>

            <section className="mb-6 border-t border-black/[0.06] pt-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">Payment</h3>
              {quoted ? (
                <PriceBreakdown
                  currency={quoted.currency}
                  lines={tourQuotePriceLines(quoted)}
                  total={quoted.totalAmount}
                  originalTotal={quoted.originalUnitPrice * quoted.guests}
                  discountLabel={quoted.discountLabel}
                  holdNote={`Spots are held for ${CHECKOUT_HOLD_MINUTES} minutes after you continue to Stripe. If checkout expires, the hold is released.`}
                  footnote="This is the amount Stripe TEST will charge until live payments. Currency matches the listing."
                />
              ) : (
                <>
                  <div className="flex justify-between text-sm text-ink">
                    <span>
                      {participantsSummary}
                      {!usesAgePricingOnVariant
                        ? ` · ${formatMoney(pricePerPerson, currency)} each`
                        : ''}
                    </span>
                    <span className="font-medium">{formatMoney(total, currency)}</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-2">This is the amount you pay at checkout.</p>
                </>
              )}
            </section>

            <div className="mb-6 rounded-xl bg-paper px-4 py-3 ring-1 ring-black/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1.5">Cancellation</p>
              <p className="text-sm text-ink-muted leading-relaxed">{cancellationText}</p>
            </div>

            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1.5">After you pay</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                {bookingPayConfirmAfterPayCopy(CHECKOUT_HOLD_MINUTES)}
              </p>
            </div>

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
                  onClick={() => setStep('contact')}
                  className="tv-btn-ghost w-full sm:w-auto"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="tv-btn-primary w-full sm:w-auto whitespace-normal text-center"
                >
                  {submitting
                    ? 'Redirecting to Stripe…'
                    : isSupabaseConfigured()
                      ? `Pay with Stripe TEST · ${formatMoney(total, currency)}`
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
        <button type="button" onClick={handleContinueFromReview} className="tv-btn-primary w-full">
          Go to checkout
        </button>
      ) : null}
      {step === 'date-guests' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            <span className="text-ink-faint">Total</span>{' '}
            <strong className="text-ink">{quoteBlockReason ? '—' : formatMoney(total, currency)}</strong>
          </p>
          <button
            type="button"
            onClick={handleCheckAvailability}
            disabled={availabilityChecking || availabilityModalOpen || Boolean(quoteBlockReason)}
            className="tv-btn-primary w-full disabled:opacity-60"
          >
            {availabilityChecking ? 'Checking…' : 'See options'}
          </button>
        </div>
      ) : null}
      {step === 'contact' ? (
        <div className="flex flex-col-reverse gap-2">
          <button type="button" onClick={() => setStep(contactBackStep)} className="tv-btn-ghost w-full">
            Back
          </button>
          <button type="button" onClick={handleContinueFromContact} className="tv-btn-primary w-full">
            Review and pay
          </button>
        </div>
      ) : null}
      {step === 'confirm' ? (
        <div className="flex flex-col-reverse gap-2">
          <button
            type="button"
            onClick={() => setStep(flowMode === 'modal' || selectedVariant ? 'review' : 'date-guests')}
            className="tv-btn-ghost w-full"
          >
            Edit trip details
          </button>
          <button type="button" onClick={() => setStep('contact')} className="tv-btn-ghost w-full">
            Back
          </button>
          <button
            type="button"
            onClick={handleConfirmBooking}
            disabled={submitting}
            className="tv-btn-primary w-full whitespace-normal text-center disabled:opacity-50"
          >
            {submitting
              ? 'Redirecting to Stripe…'
              : isSupabaseConfigured()
                ? `Pay with Stripe TEST · ${formatMoney(total, currency)}`
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
        <div className="relative z-10 flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none bg-paper sm:h-auto sm:max-h-[min(95dvh,1040px)] sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-black/[0.08] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-gradient-to-b from-finland/[0.06] to-paper-raised px-4 py-3 sm:px-5">
            <div className="min-w-0 pr-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Checkout</p>
              <h2
                id="booking-flow-modal-title"
                className="truncate text-base font-semibold text-ink sm:text-lg"
              >
                Book this tour
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
              <img src={tour.image} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 text-white">
                <p className="line-clamp-2 font-display text-base font-semibold leading-tight tracking-tight sm:text-lg">{tour.title}</p>
                <p className="text-[11px] text-white/90">
                  {formatTourDurationDisplay(tour.duration)} · From {formatMoney(pricePerPerson, currency)}/{priceFromQualifier === 'per adult' ? 'adult' : 'person'}
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
      {presentation !== 'modal' ? (
        <div className="min-h-screen bg-paper tv-page pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-12">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="lux-flat flex items-center gap-2 text-ink-muted hover:text-ink mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to tour
            </button>

            {stripeReturnCancelled ? (
              <div className="mb-6">
                <NoticeCallout title="Payment was not completed" tone="warn">
                  Stripe TEST checkout was cancelled. Your trip details are still here — you can pay
                  again, or go back to the tour.
                </NoticeCallout>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl mb-6 shadow-soft ring-1 ring-black/[0.08]">
              <div className="h-36 sm:h-44 bg-black/10 relative">
                <img src={tour.image} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland shadow-sm ring-1 ring-black/[0.06]">
                    Checkout
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h1 className="font-display text-xl sm:text-2xl tracking-tight">{tour.title}</h1>
                  <p className="mt-1 text-sm text-white/90">
                    {formatTourDurationDisplay(tour.duration)} · From {formatMoney(pricePerPerson, currency)}{' '}
                    {priceFromQualifier}
                  </p>
                </div>
              </div>
            </div>

            {flowInner}
          </div>
        </div>
      ) : null}

      {presentation !== 'modal'
        ? createPortal(
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-black/[0.06] bg-paper-raised/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {checkoutDockInner}
            </div>,
            document.body
          )
        : null}

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
