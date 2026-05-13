/**
 * Single clean booking flow (GetYourGuide/TripAdvisor style):
 * Page: Date & guests → Contact → Confirm → Done.
 * Modal (from tour page): Trip summary → Checkout → Confirm → Done.
 */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Calendar,
  Users,
  User,
  Mail,
  MessageSquare,
  CheckCircle,
  MapPin,
  Shield,
  Inbox,
  ClipboardList,
  X,
  Phone,
} from 'lucide-react';
import { TourPackage } from '../types/tour';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { createBookingCheckoutSession, submitBooking } from '../data/supabase-bookings';
import type { ListingDiscount } from '../data/supabase-discounts';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import { getDisplayPriceForBookingVariant } from '../lib/discount-display';
import {
  checkAvailability,
  incrementAvailabilityBooked,
  type AvailabilityCheckOption,
} from '../data/supabase-availability';
import AvailabilityOptionsModal from '../components/booking/AvailabilityOptionsModal';
import { analytics } from '../lib/analytics';
import { setPageMetaWithOg } from '../lib/seo';
import { dateNotInPast, validateEmail, required, maxLength } from '../lib/validation';
import {
  TRAVERION_STANDARD_CANCELLATION_POLICY,
  formatTourDurationDisplay,
} from '../types/listingExtras';
import {
  getPartySizeBounds,
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
      ? (['Your trip', 'Checkout', 'Confirm'] as const)
      : (['Date & guests', 'Your details', 'Confirm'] as const);
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
                <span className="mx-0.5 sm:mx-1 text-gray-300 select-none" aria-hidden>
                  →
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
                  done
                    ? 'bg-green-50 text-green-800 ring-1 ring-green-200'
                    : current
                      ? 'bg-finland/10 text-finland ring-1 ring-finland/30'
                      : 'bg-gray-50 text-gray-400 ring-1 ring-gray-100'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done ? 'bg-green-600 text-white' : current ? 'bg-finland text-white' : 'bg-gray-200 text-gray-500'
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
  onComplete,
  onNavigate,
  initialDate,
  initialGuests,
  presentation = 'page',
  selectedVariant = null,
  discountsByListing,
  onModalClose,
}: BookingPageProps) {
  const { user, requestAuth } = useAuth();
  const flowMode = presentation === 'modal' ? 'modal' : 'page';
  const [step, setStep] = useState<Step>(presentation === 'modal' ? 'review' : 'date-guests');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
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
  const guestOptions = useMemo(
    () => Array.from({ length: partyBounds.max - partyBounds.min + 1 }, (_, i) => partyBounds.min + i),
    [partyBounds.min, partyBounds.max]
  );

  const hydratedRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const currency = tour.price?.currency ?? 'USD';
  const fallbackBasePrice = tour.price?.startingFrom ?? 0;
  const priceInfo = useMemo(() => {
    const day = date.trim() || new Date().toISOString().slice(0, 10);
    if (presentation === 'modal' && selectedVariant) {
      return getDisplayPriceForBookingVariant(tour, selectedVariant, discountsByListing ?? new Map(), day);
    }
    return { price: fallbackBasePrice, originalPrice: fallbackBasePrice, label: undefined as string | undefined };
  }, [presentation, selectedVariant, tour, date, discountsByListing, fallbackBasePrice]);

  const pricePerPerson = priceInfo.price;
  const total = pricePerPerson * guests;
  const cancellationText =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;

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
      `Reserve ${tour.title}. From ${currency} ${fallbackBasePrice} per person.`,
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
      let nextGuests = typeof initialGuests === 'number' ? initialGuests : 2;
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
    let nextGuests = typeof rawGuests === 'number' ? rawGuests : 2;
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
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
    if (guests < partyBounds.min || guests > partyBounds.max) {
      setError(`Choose between ${partyBounds.min} and ${partyBounds.max} guests for this experience.`);
      return;
    }
    setError(null);
    setAvailabilityModalOpen(true);
    setAvailabilityChecking(true);
    setAvailabilityModalNote(null);
    setAvailabilityOptions([]);
    try {
      const avail = await checkAvailability(tour.id, date.trim(), guests);
      setAvailabilityOptions(avail.options);
      if (avail.error && !avail.available) {
        setAvailabilityModalNote('We could not verify capacity for this date.');
      }
    } catch {
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

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

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
    if (guests < partyBounds.min || guests > partyBounds.max) {
      setError(`Guests must be between ${partyBounds.min} and ${partyBounds.max}.`);
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (isSupabaseConfigured() && !user) return;
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
        const checkout = await createBookingCheckoutSession({
          listingId: tour.id,
          listingTitle: tour.title,
          bookingDate: date,
          guests,
          customerName: leadGuestName,
          customerPhone: phone.trim() || undefined,
          specialRequests: mergedSpecialRequests() || undefined,
          totalAmount: total,
          currency,
          successPath: '/booking-confirmed',
          cancelPath: '/bookings?payment=cancelled',
        });
        if (!checkout.success || !checkout.checkoutUrl) {
          setError(checkout.error ?? 'Could not start checkout. Please try again.');
          setSubmitting(false);
          return;
        }
        analytics.bookComplete(tour.id, guests);
        if (user?.id) markBookingsUnread(user.id);
        clearBookingDraft(tour.id);
        window.location.assign(checkout.checkoutUrl);
        return;
      }

      const result = await submitBooking({
        tour_id: tour.id,
        tour_title: tour.title,
        customer_name: leadGuestName,
        customer_email: email,
        travelers: guests,
        departure_date: date,
        status: 'confirmed',
        special_requests: mergedSpecialRequests() || undefined,
        total_price: total,
        currency,
      });
      if (result.success) {
        await incrementAvailabilityBooked(tour.id, date);
        analytics.bookComplete(tour.id, guests);
        if (user?.id) markBookingsUnread(user.id);
        clearBookingDraft(tour.id);
        setStep('done');
      } else {
        setError(humanizeBookingSubmitError(result.error));
      }
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Your trip</h2>
            <p className="text-sm text-gray-600 mb-6">
              Check the date, party size, and option below. Continue to enter your contact details for checkout.
            </p>
            <div className="space-y-3 text-sm text-gray-700 mb-6 rounded-xl border border-gray-200 bg-slate-50 p-4 sm:p-5">
              <p>
                <span className="font-medium text-gray-900">Experience</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-gray-900">Option</span> — {selectedVariant.label}
              </p>
              <p className="text-gray-600">{selectedVariant.subtitle}</p>
              <p>
                <span className="font-medium text-gray-900">Date</span> — {dateDisplay || date}
              </p>
              <p>
                <span className="font-medium text-gray-900">Guests</span> — {guests}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Estimated total</p>
              <div className="flex justify-between text-sm text-gray-700">
                <span>
                  {currency} {pricePerPerson} × {guests} guests
                  {priceInfo.label ? (
                    <span className="block text-xs text-green-600 mt-1">{priceInfo.label}</span>
                  ) : null}
                </span>
                <span className="font-medium text-gray-900">
                  {currency} {total}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Cancellation</p>
              <p className="text-sm text-gray-700 leading-relaxed">{cancellationText}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setError(null);
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Select date and guests</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onClick={openDatePicker}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                  />
                </div>
                {date.trim() && (
                  <p className="mt-1.5 text-xs text-gray-500">{dateDisplay}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of guests</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <select
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland bg-white focus-visible:outline-none"
                  >
                    {guestOptions.map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'guest' : 'guests'}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  This listing allows {partyBounds.min}–{partyBounds.max} guests per booking.
                </p>
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
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <div className="text-sm text-gray-600">
                <p>
                  <span className="text-gray-500">Estimated total</span>{' '}
                  <strong className="text-gray-900">
                    {currency} {total}
                  </strong>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {guests} × {currency} {pricePerPerson} — no payment taken on this step.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={availabilityChecking || availabilityModalOpen}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                {availabilityChecking ? 'Checking…' : 'Check availability'}
              </button>
            </div>
          </div>
        )}

        {step === 'contact' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Checkout</h2>
            <p className="text-sm text-gray-500 mb-6 flex items-start gap-2">
              <Shield className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                Your details are only used to send this request to the operator and to email you updates. You are not
                charged on this page.
                {user?.email ? (
                  <>
                    {' '}
                    <strong className="text-gray-700">Email is fixed to your account</strong> so confirmations reach the
                    right inbox.
                  </>
                ) : null}
              </span>
            </p>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3.5 text-sm text-gray-700">
                <p className="font-medium text-gray-900">{tour.title}</p>
                <p className="mt-1 text-xs text-gray-600">
                  {dateDisplay || date || 'Select date'} · {guests} {guests === 1 ? 'guest' : 'guests'}
                  {selectedVariant ? ` · ${selectedVariant.label}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      autoComplete="given-name"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      autoComplete="family-name"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+358 …"
                    autoComplete="tel"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Place of stay (optional)</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={placeOfStay}
                    onChange={(e) => setPlaceOfStay(e.target.value)}
                    placeholder="Hotel name or address"
                    autoComplete="street-address"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                  />
                </div>
                {tour.meetingPoint?.trim() ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Meeting point is still {tour.meetingPoint.trim()}. Add your stay location for easier coordination.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
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
                    className={`w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none ${
                      user?.email ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
                {user?.email ? (
                  <p className="mt-1 text-xs text-gray-500">This must match your signed-in account.</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special requests (optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Dietary needs, accessibility, questions for the provider…"
                    rows={3}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland resize-none focus-visible:outline-none"
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
                className="px-4 py-2.5 text-gray-600 hover:text-finland focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleContinueFromContact}
                className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                Review and confirm
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <BookingProgress step={step} flow={flowMode} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Confirm booking</h2>
            <p className="text-sm text-gray-600 mb-6 flex items-start gap-2 rounded-xl bg-finland/5 border border-finland/15 px-3 py-2.5">
              <ClipboardList className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                After you confirm, the provider reviews your request and follows up by email. You are not charged on
                this page — payment terms, if any, are agreed with the operator later.
              </span>
            </p>

            <div className="space-y-3 text-sm text-gray-700 mb-6 rounded-xl border border-gray-200 bg-slate-50 p-4 sm:p-5">
              <p>
                <span className="font-medium text-gray-900">Experience</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-gray-900">Date</span> — {dateDisplay || date}
              </p>
              <p>
                <span className="font-medium text-gray-900">Guests</span> — {guests}
              </p>
              {selectedVariant ? (
                <p>
                  <span className="font-medium text-gray-900">Option</span> — {selectedVariant.label}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-gray-900">Lead guest</span> — {leadGuestName}
              </p>
              {phone.trim() ? (
                <p>
                  <span className="font-medium text-gray-900">Phone</span> — {phone.trim()}
                </p>
              ) : null}
              {placeOfStay.trim() ? (
                <p>
                  <span className="font-medium text-gray-900">Place of stay</span> — {placeOfStay.trim()}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-gray-900">Email</span> — {email}
              </p>
              {specialRequests.trim() && (
                <p>
                  <span className="font-medium text-gray-900">Special requests</span> — {specialRequests.trim()}
                </p>
              )}
              {tour.meetingPoint?.trim() && (
                <p>
                  <span className="font-medium text-gray-900">Meeting / pickup</span> — {tour.meetingPoint.trim()}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Price breakdown</p>
              <div className="flex justify-between text-sm text-gray-700">
                <span>
                  {currency} {pricePerPerson} × {guests} guests
                </span>
                <span className="font-medium text-gray-900">
                  {currency} {total}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Estimated total. Final price may be confirmed by the provider.</p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Cancellation</p>
              <p className="text-sm text-gray-700 leading-relaxed">{cancellationText}</p>
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
                onClick={() => setStep(flowMode === 'modal' ? 'review' : 'date-guests')}
                className="px-4 py-2.5 text-gray-600 hover:text-finland focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 rounded-lg"
              >
                Edit trip details
              </button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep('contact')}
                  className="px-4 py-2.5 text-gray-600 hover:text-finland focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 rounded-lg"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
                >
                  {submitting ? 'Redirecting to payment…' : 'Continue to payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 sm:p-10 text-center animate-fade-in-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-6">
              <CheckCircle className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">Booking requested</h2>
            <p className="text-gray-600 text-sm mb-4">
              The provider will confirm and contact you at <strong className="text-gray-900">{email}</strong>.
            </p>
            <p className="text-sm text-gray-600 mb-6 inline-flex items-start gap-2 max-w-md mx-auto text-left">
              <Inbox className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                If you do not see an email within a few minutes, check your spam or promotions folder. Messages sometimes
                land there depending on your provider.
              </span>
            </p>
            <div className="bg-gray-50 rounded-xl p-5 text-left mb-6">
              <p className="font-medium text-gray-900 mb-3">{tour.title}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 shrink-0" /> {dateDisplay || date}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 shrink-0" /> {guests} {guests === 1 ? 'guest' : 'guests'}
                </span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-gray-900">
                    {currency} {total}
                  </strong>{' '}
                  estimated total
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              {onNavigate && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('bookings');
                      onComplete();
                    }}
                    className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-800 font-medium hover:bg-gray-50 transition-all duration-200 ease-smooth active:scale-[0.98] inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
                  >
                    My bookings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('account');
                      onComplete();
                    }}
                    className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
                  >
                    <MapPin className="w-4 h-4" />
                    Open my account
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onComplete}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                {presentation === 'modal' ? 'Close' : 'Browse more tours'}
              </button>
            </div>
          </div>
        )}
    </>
  );

  const modalShell =
    presentation === 'modal' ? (
      <div
        className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-4 motion-safe:animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-flow-modal-title"
      >
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-md transition-opacity duration-200 supports-[backdrop-filter]:bg-slate-900/40"
          aria-label="Modal backdrop"
          aria-hidden="true"
        />
        <div className="animate-fade-in-up relative z-10 flex w-full max-w-6xl max-h-[min(95dvh,1040px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
            <h2
              id="booking-flow-modal-title"
              className="truncate pr-2 text-base font-semibold text-gray-900 sm:text-lg"
            >
              {step === 'done' ? 'Request sent' : 'Book this experience'}
            </h2>
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland"
              aria-label="Close booking"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {step !== 'done' ? (
            <div className="relative mx-4 mt-3 h-24 shrink-0 overflow-hidden rounded-xl border border-gray-100 sm:mx-5 sm:mt-4 sm:h-28">
              <img src={tour.image} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 text-white">
                <p className="line-clamp-2 text-sm font-semibold leading-tight">{tour.title}</p>
                <p className="text-[11px] text-white/90">
                  {formatTourDurationDisplay(tour.duration)} · From {currency} {pricePerPerson}/person
                </p>
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/70 px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4 [scrollbar-gutter:stable]">
            {flowInner}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {presentation === 'modal' ? createPortal(modalShell, document.body) : null}
      {presentation !== 'modal' ? (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <button
              type="button"
              onClick={handleLeaveBooking}
              className="flex items-center gap-2 text-gray-600 hover:text-finland mb-8 transition-colors duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to tour
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
              <div className="h-32 sm:h-40 bg-gray-200 relative">
                <img src={tour.image} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h1 className="text-lg sm:text-xl font-semibold">{tour.title}</h1>
                  <p className="text-sm text-white/90">
                    {formatTourDurationDisplay(tour.duration)} · From {currency} {pricePerPerson} per person
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
