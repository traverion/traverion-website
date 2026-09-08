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
import { quoteBooking, formatOptionWeekdays } from '../lib/booking-quote';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import {
  checkAvailability,
  type AvailabilityCheckOption,
} from '../data/supabase-availability';
import AvailabilityOptionsModal from '../components/booking/AvailabilityOptionsModal';
import BookingDateField from '../components/booking/BookingDateField';
import GuestStepper from '../components/booking/GuestStepper';
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
import { markBookingsUnread } from '../lib/customerBookingNotifications';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

interface BookingPageProps {
  tour: TourPackage;
  onBack: () => void;
  onComplete: () => void;
  onNavigate?: (page: string) => void;
  /** When opening booking from tour sidebar after “Check availability”. */
  initialDate?: string;
  initialGuests?: number;
  presentation?: 'page' | 'modal';
  /** Required when presentation is modal (after traveler picks a tour option). */
  selectedVariant?: TourBookingVariant | null;
  discountsByListing?: Map<string, ListingDiscount[]>;
  onModalClose?: () => void;
}

type Step = BookingFlowStep;

function BookingProgress({ step, flow }: { step: Step; flow: 'page' | 'modal' }) {
  if (step === 'done') return null;
  const labels =
    flow === 'modal'
      ? (['Trip', 'Details', 'Pay'] as const)
      : (['Date', 'Details', 'Pay'] as const);
  const order: Step[] = flow === 'modal' ? ['review', 'contact', 'confirm'] : ['date-guests', 'contact', 'confirm'];
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
                    ? 'bg-finland/10 text-finland ring-1 ring-finland/20'
                    : current
                      ? 'bg-finland/10 text-finland ring-1 ring-finland/30'
                      : 'bg-black/[0.04] text-ink-faint ring-1 ring-black/[0.04]'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done ? 'bg-finland text-white' : current ? 'bg-finland text-white' : 'bg-black/[0.08] text-ink-faint'
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
  presentation = 'page',
  selectedVariant = null,
  discountsByListing,
  onModalClose,
}: BookingPageProps) {
  const { user, requestAuth } = useAuth();
  const flowMode = presentation === 'modal' ? 'modal' : 'page';
  const [step, setStep] = useState<Step>(
    presentation === 'modal' || selectedVariant ? 'review' : 'date-guests'
  );
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(1);
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

  const partyBounds = useMemo(() => getPartySizeBounds(tour), [tour]);

  const hydratedRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const bookingModalRef = useRef<HTMLDivElement>(null);
  const currency = normalizeCurrency(tour.price?.currency);
  const fallbackBasePrice = tour.price?.startingFrom ?? 0;
  const priceInfo = useMemo(() => {
    const day = date.trim() || new Date().toISOString().slice(0, 10);
    const optionId =
      selectedVariant && selectedVariant.id !== '__default__' ? selectedVariant.id : undefined;
    const quoted = quoteBooking({
      tour,
      discounts: discountsByListing?.get(tour.id) ?? [],
      bookingDate: day,
      guests,
      bookingOptionId: optionId,
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
  }, [presentation, selectedVariant, tour, date, guests, discountsByListing, fallbackBasePrice]);

  const pricePerPerson = priceInfo.price;
  const total = pricePerPerson * guests;
  const cancellationText =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;

  const weekdayHint = useMemo(() => {
    const opt = selectedVariant?.listingOption;
    if (!opt) return undefined;
    return `Runs ${formatOptionWeekdays(opt.weekdays)}`;
  }, [selectedVariant]);

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
    setPageMetaWithOg(
      `Book: ${tour.title}`,
      `Reserve ${tour.title}. From ${formatMoney(fallbackBasePrice, currency)} per person.`,
      {
        title: `Book: ${tour.title}`,
        image: tour.image,
        type: 'website',
      }
    );
  }, [presentation, tour.id, tour.title, tour.image, fallbackBasePrice, currency]);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  useLayoutEffect(() => {
    hydratedRef.current = false;
    const bounds = getPartySizeBounds(tour);
    if (presentation === 'modal') {
      profileHydratedRef.current = false;
      const nextDate = (initialDate?.trim() || '').trim();
      let nextGuests = typeof initialGuests === 'number' ? initialGuests : bounds.min;
      nextGuests = Math.min(bounds.max, Math.max(bounds.min, nextGuests));
      setDate(nextDate);
      setGuests(nextGuests);
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail(user?.email ?? '');
      setPlaceOfStay('');
      setSpecialRequests('');
      setStep('review');
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
  }, [tour.id, initialDate, initialGuests, presentation]);

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
    setGuests((g) => Math.min(partyBounds.max, Math.max(partyBounds.min, g)));
  }, [partyBounds.min, partyBounds.max]);

  useEffect(() => {
    if (!hydratedRef.current || step === 'done') return;
    const t = window.setTimeout(() => {
      flushDraft();
    }, 400);
    return () => window.clearTimeout(t);
  }, [tour.id, step, date, guests, leadGuestName, email, placeOfStay, specialRequests, flushDraft]);

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
    clearBookingDraft(tour.id);
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
    if (isSupabaseConfigured() && !user) {
      setError(null);
      requestAuth({
        onSuccess: () => {
          setStep('contact');
        },
      });
      return;
    }
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

  const handleConfirmBooking = async () => {
    if (isSupabaseConfigured() && !user) return;
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
        });
        if (!quoted.ok) {
          setError(userFacingError(quoted.error, USER_ERROR.checkout));
          setSubmitting(false);
          return;
        }
        const checkout = await createBookingCheckoutSession({
          listingId: tour.id,
          listingTitle: tour.title,
          bookingDate: date,
          guests,
          customerName: leadGuestName,
          customerPhone: phone.trim() || undefined,
          specialRequests: mergedSpecialRequests() || undefined,
          bookingOptionId: quoted.optionId ?? undefined,
          currency: quoted.currency,
          successPath: '/booking-confirmed',
          cancelPath: '/bookings?payment=cancelled',
        });
        if (!checkout.success || !checkout.checkoutUrl) {
          setError(userFacingError(checkout.error, USER_ERROR.checkout));
          setSubmitting(false);
          return;
        }
        analytics.bookComplete(tour.id, guests);
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
  const summaryLineModal = `${dateDisplay || date || '—'} · ${guests} ${guests === 1 ? 'guest' : 'guests'}`;

  const contactBackStep: Step = flowMode === 'modal' ? 'review' : 'date-guests';

  const flowInner = (
    <>
        {step === 'review' && presentation === 'modal' && selectedVariant && (
          <div className="bg-paper-raised rounded-2xl p-6 sm:p-8 ring-1 ring-black/[0.06]">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-ink mb-2">Your trip</h2>
            <p className="text-sm text-ink-muted mb-6">
              Check the date, party size, and option below. Continue to enter your contact details for checkout.
            </p>
            <div className="space-y-3 text-sm text-ink-muted mb-6">
              <p>
                <span className="font-medium text-ink">Tour</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-ink">Option</span> — {selectedVariant.label}
              </p>
              <p className="text-ink-muted">{selectedVariant.subtitle}</p>
              <p>
                <span className="font-medium text-ink">Date</span> — {dateDisplay || date}
              </p>
              <p>
                <span className="font-medium text-ink">Guests</span> — {guests}
              </p>
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2">Estimated total</p>
              <div className="flex justify-between text-sm text-ink-muted">
                <span>
                  {formatMoney(pricePerPerson, currency)} × {guests} guests
                  {priceInfo.label ? (
                    <span className="block text-xs text-green-600 mt-1">{priceInfo.label}</span>
                  ) : null}
                </span>
                <span className="font-medium text-ink">
                  {formatMoney(total, currency)}
                </span>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-1.5">Cancellation</p>
              <p className="text-sm text-ink-muted leading-relaxed">{cancellationText}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (priceInfo.quote && !priceInfo.quote.ok) {
                    setError(priceInfo.quote.error);
                    return;
                  }
                  if (isSupabaseConfigured() && !user) {
                    requestAuth({ onSuccess: () => setStep('contact') });
                    return;
                  }
                  setStep('contact');
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                Go to checkout
              </button>
            </div>
          </div>
        )}

        {step === 'date-guests' && (
          <div className="bg-paper-raised rounded-2xl p-6 sm:p-8 ring-1 ring-black/[0.06]">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-ink mb-6">Select date and guests</h2>
            <div className="space-y-4">
              <BookingDateField
                id="booking-flow-date-input"
                value={date}
                onChange={setDate}
                hint={weekdayHint}
              />
              <GuestStepper
                id="booking-flow-guests"
                label="Number of guests"
                value={guests}
                min={partyBounds.min}
                max={partyBounds.max}
                onChange={setGuests}
                onBoundaryAttempt={setError}
              />
            </div>
            <div
              className="mt-3 min-h-[1.25rem]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!error && quoteBlockReason && <p className="text-sm text-red-600">{quoteBlockReason}</p>}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <div className="text-sm text-ink-muted">
                <p>
                  <span className="text-ink-faint">Estimated total</span>{' '}
                  <strong className="text-ink">
                    {quoteBlockReason ? '—' : formatMoney(total, currency)}
                  </strong>
                </p>
                <p className="text-xs text-ink-faint mt-0.5">
                  {guests} × {formatMoney(pricePerPerson, currency)} — no payment taken on this step.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={availabilityChecking || availabilityModalOpen || Boolean(quoteBlockReason)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                {availabilityChecking ? 'Checking…' : 'Check availability'}
              </button>
            </div>
          </div>
        )}

        {step === 'contact' && (
          <div className="bg-paper-raised rounded-2xl p-6 sm:p-8 ring-1 ring-black/[0.06]">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-ink mb-2">Your details</h2>
            <p className="text-sm text-ink-muted mb-6 flex items-start gap-2">
              <Shield className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                Your details are used for the booking confirmation. You are not charged on this page — payment happens
                on the next step.
                {user?.email ? (
                  <>
                    {' '}
                    <strong className="text-ink">Email is fixed to your account</strong> so confirmations reach the
                    right inbox.
                  </>
                ) : null}
              </span>
            </p>
            <div className="space-y-4">
              <div className="rounded-xl bg-black/[0.03] ring-1 ring-black/[0.06] p-3.5 text-sm text-ink-muted">
                <p className="font-medium text-ink">{tour.title}</p>
                <p className="mt-1 text-xs">
                  {dateDisplay || date || 'Select date'} · {guests} {guests === 1 ? 'guest' : 'guests'}
                  {selectedVariant ? ` · ${selectedVariant.label}` : ''}
                </p>
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
                    aria-readonly={Boolean(user?.email)}
                    className={`tv-input pl-10 ${user?.email ? 'bg-black/[0.04] text-ink-muted cursor-not-allowed' : ''}`}
                  />
                </div>
                {user?.email ? (
                  <p className="mt-1 text-xs text-ink-muted">This must match your signed-in account.</p>
                ) : null}
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
            <div
              className="mt-3 min-h-[1.25rem]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStep(contactBackStep)}
                className="tv-btn-ghost"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleContinueFromContact}
                className="tv-btn-primary"
              >
                Review and pay
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-paper-raised rounded-2xl p-6 sm:p-8 ring-1 ring-black/[0.06]">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-ink mb-2">Pay to confirm</h2>
            <p className="text-sm text-ink-muted mb-6 flex items-start gap-2 rounded-xl bg-finland/5 ring-1 ring-finland/15 px-3 py-2.5">
              <ClipboardList className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                {isSupabaseConfigured()
                  ? `Pay ${formatMoney(total, currency)} on Stripe to confirm this tour. Nothing is taken until checkout completes.`
                  : 'Live card checkout is not configured in this environment. We will not pretend a payment succeeded.'}
              </span>
            </p>

            <div className="space-y-3 text-sm text-ink-muted mb-6">
              <p>
                <span className="font-medium text-ink">Tour</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-ink">Date</span> — {dateDisplay || date}
              </p>
              <p>
                <span className="font-medium text-ink">Guests</span> — {guests}
              </p>
              {selectedVariant ? (
                <p>
                  <span className="font-medium text-ink">Option</span> — {selectedVariant.label}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-ink">Lead guest</span> — {leadGuestName}
              </p>
              {phone.trim() ? (
                <p>
                  <span className="font-medium text-ink">Phone</span> — {phone.trim()}
                </p>
              ) : null}
              {placeOfStay.trim() ? (
                <p>
                  <span className="font-medium text-ink">Place of stay</span> — {placeOfStay.trim()}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-ink">Email</span> — {email}
              </p>
              {specialRequests.trim() && (
                <p>
                  <span className="font-medium text-ink">Special requests</span> — {specialRequests.trim()}
                </p>
              )}
              {tour.meetingPoint?.trim() && (
                <p>
                  <span className="font-medium text-ink">Meeting / pickup</span> — {tour.meetingPoint.trim()}
                </p>
              )}
            </div>

            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2">Price breakdown</p>
              <div className="flex justify-between text-sm text-ink">
                <span>
                  {formatMoney(pricePerPerson, currency)} × {guests} guests
                </span>
                <span className="font-medium">
                  {formatMoney(total, currency)}
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-2">This is the amount you pay at checkout.</p>
            </div>

            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-1.5">Cancellation</p>
              <p className="text-sm text-ink-muted leading-relaxed">{cancellationText}</p>
            </div>

            <div
              className="mb-4 min-h-[1.25rem]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <button
                type="button"
                onClick={() => setStep(flowMode === 'modal' || selectedVariant ? 'review' : 'date-guests')}
                className="tv-btn-ghost"
              >
                Edit trip details
              </button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep('contact')}
                  className="tv-btn-ghost"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="tv-btn-primary"
                >
                  {submitting
                    ? 'Redirecting to Stripe…'
                    : isSupabaseConfigured()
                      ? `Pay with Stripe · ${formatMoney(total, currency)}`
                      : 'Continue to payment'}
                </button>
              </div>
            </div>
          </div>
        )}
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
          <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 sm:px-5">
            <h2
              id="booking-flow-modal-title"
              className="truncate pr-2 text-base font-semibold text-ink sm:text-lg"
            >
              Book this tour
            </h2>
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="lux-tap-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland"
              aria-label="Close booking"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mx-4 mt-3 h-24 shrink-0 overflow-hidden rounded-xl sm:mx-5 sm:mt-4 sm:h-28">
              <img src={tour.image} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 text-white">
                <p className="line-clamp-2 text-sm font-semibold leading-tight">{tour.title}</p>
                <p className="text-[11px] text-white/90">
                  {formatTourDurationDisplay(tour.duration)} · From {formatMoney(pricePerPerson, currency)}/person
                </p>
              </div>
            </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4 [scrollbar-gutter:stable]">
            {flowInner}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {presentation === 'modal' ? createPortal(modalShell, document.body) : null}
      {presentation !== 'modal' ? (
        <div className="min-h-screen bg-paper tv-page pb-12">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="lux-flat flex items-center gap-2 text-ink-muted hover:text-ink mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to tour
            </button>

            <div className="overflow-hidden rounded-2xl mb-6">
              <div className="h-32 sm:h-40 bg-black/10 relative">
                <img src={tour.image} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h1 className="text-lg sm:text-xl font-semibold">{tour.title}</h1>
                  <p className="text-sm text-white/90">
                    {formatTourDurationDisplay(tour.duration)} · From {formatMoney(pricePerPerson, currency)} per person
                  </p>
                </div>
              </div>
            </div>

            {flowInner}
          </div>
        </div>
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
