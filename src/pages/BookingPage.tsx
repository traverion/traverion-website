/**
 * Single clean booking flow (GetYourGuide/TripAdvisor style):
 * Date & guests → Contact details → Confirm → Done.
 * All in one page, minimal fields.
 */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Users,
  User,
  Mail,
  MessageSquare,
  CheckCircle,
  MapPin,
  Shield,
  Inbox,
  ClipboardList,
} from 'lucide-react';
import { TourPackage } from '../types/tour';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { submitBooking } from '../data/supabase-bookings';
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
} from '../lib/booking-flow';
import { downloadBookingIcs } from '../lib/booking-calendar';

interface BookingPageProps {
  tour: TourPackage;
  onBack: () => void;
  onComplete: () => void;
  onNavigate?: (page: string) => void;
  /** When opening booking from tour sidebar after “Check availability”. */
  initialDate?: string;
  initialGuests?: number;
}

type Step = BookingFlowStep;

function BookingProgress({ step }: { step: Step }) {
  if (step === 'done') return null;
  const labels = ['Date & guests', 'Your details', 'Confirm'] as const;
  const order: Step[] = ['date-guests', 'contact', 'confirm'];
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
}: BookingPageProps) {
  const { user, requestAuth } = useAuth();
  const [step, setStep] = useState<Step>('date-guests');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
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

  const price = tour.price?.startingFrom ?? 0;
  const currency = tour.price?.currency ?? 'USD';
  const total = price * guests;
  const cancellationText =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;

  const flushDraft = useCallback(() => {
    saveBookingDraft(tour.id, {
      step,
      date: date.trim(),
      guests,
      name: name.trim(),
      email: email.trim(),
      specialRequests,
    });
  }, [tour.id, step, date, guests, name, email, specialRequests]);

  useEffect(() => {
    setPageMetaWithOg(`Book: ${tour.title}`, `Reserve ${tour.title}. From ${currency} ${price} per person.`, {
      title: `Book: ${tour.title}`,
      image: tour.image,
      type: 'website',
    });
  }, [tour.id, tour.title, tour.image, price, currency]);

  useEffect(() => {
    if (user?.email) {
      setEmail((prev) => (prev.trim() ? prev : user.email!));
    }
  }, [user?.email]);

  useLayoutEffect(() => {
    hydratedRef.current = false;
    const bounds = getPartySizeBounds(tour);
    const draft = loadBookingDraft(tour.id);
    const fromDraft = Boolean(draft && draft.tourId === tour.id);
    const nextDate = (initialDate?.trim() || (fromDraft ? draft!.date : '') || '').trim();
    const rawGuests = initialGuests ?? (fromDraft ? draft!.guests : undefined);
    let nextGuests = typeof rawGuests === 'number' ? rawGuests : 2;
    nextGuests = Math.min(bounds.max, Math.max(bounds.min, nextGuests));
    setDate(nextDate);
    setGuests(nextGuests);
    if (fromDraft && draft) {
      setName(draft.name);
      setEmail(draft.email || user?.email || '');
      setSpecialRequests(draft.specialRequests);
      setStep(sanitizeRestoredBookingStep(draft.step, Boolean(user)));
    } else {
      setName('');
      setEmail(user?.email ?? '');
      setSpecialRequests('');
      setStep('date-guests');
    }
    hydratedRef.current = true;
    // Intentionally snapshot tour by id + URL-ish prefill only; avoid re-running on every parent re-render of `tour`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user is read once for initial email/draft sanitize
  }, [tour.id, initialDate, initialGuests]);

  useEffect(() => {
    setGuests((g) => Math.min(partyBounds.max, Math.max(partyBounds.min, g)));
  }, [partyBounds.min, partyBounds.max]);

  useEffect(() => {
    if (!hydratedRef.current || step === 'done') return;
    const t = window.setTimeout(() => {
      flushDraft();
    }, 400);
    return () => window.clearTimeout(t);
  }, [tour.id, step, date, guests, name, email, specialRequests, flushDraft]);

  const handleLeaveBooking = () => {
    clearBookingDraft(tour.id);
    onBack();
  };

  const proceedToContactAfterOption = () => {
    saveBookingDraft(tour.id, {
      step: 'date-guests',
      date: date.trim(),
      guests,
      name: name.trim(),
      email: email.trim(),
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

  const handleSelectAvailabilityOption = (option: AvailabilityCheckOption) => {
    if (!option.selectable) return;
    closeAvailabilityModal();
    proceedToContactAfterOption();
  };

  const handleContinueFromContact = () => {
    const nameCheck = required(name, 1);
    if (!nameCheck.valid) {
      setError(nameCheck.message ?? 'Name is required');
      return;
    }
    if (!maxLength(name, 200).valid) {
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
      const result = await submitBooking({
        tour_id: tour.id,
        tour_title: tour.title,
        customer_name: name,
        customer_email: email,
        travelers: guests,
        departure_date: date,
        status: 'confirmed',
        special_requests: specialRequests.trim() || undefined,
        total_price: total,
        currency,
      });
      if (result.success) {
        if (isSupabaseConfigured()) await incrementAvailabilityBooked(tour.id, date);
        analytics.bookComplete(tour.id, guests);
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

  return (
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
                {formatTourDurationDisplay(tour.duration)} · From {currency} {price} per person
              </p>
            </div>
          </div>
        </div>

        {step === 'date-guests' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <BookingProgress step={step} />
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Select date and guests</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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
                  {guests} × {currency} {price} — no payment taken on this step.
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <BookingProgress step={step} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Your details</h2>
            <p className="text-sm text-gray-500 mb-6 flex items-start gap-2">
              <Shield className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                Your details are only used to send this request to the operator and to email you updates. You are not
                charged on this page.
              </span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    autoComplete="name"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland focus-visible:outline-none"
                  />
                </div>
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
                onClick={() => setStep('date-guests')}
                className="px-4 py-2.5 text-gray-600 hover:text-finland focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleContinueFromContact}
                className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <BookingProgress step={step} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Confirm booking</h2>
            <p className="text-sm text-gray-600 mb-6 flex items-start gap-2 rounded-xl bg-finland/5 border border-finland/15 px-3 py-2.5">
              <ClipboardList className="w-4 h-4 text-finland shrink-0 mt-0.5" aria-hidden />
              <span>
                After you confirm, the provider reviews your request and follows up by email. You are not charged on
                this page — payment terms, if any, are agreed with the operator later.
              </span>
            </p>

            <div className="space-y-3 text-sm text-gray-700 mb-6 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
              <p>
                <span className="font-medium text-gray-900">Experience</span> — {tour.title}
              </p>
              <p>
                <span className="font-medium text-gray-900">Date</span> — {dateDisplay || date}
              </p>
              <p>
                <span className="font-medium text-gray-900">Guests</span> — {guests}
              </p>
              <p>
                <span className="font-medium text-gray-900">Lead guest</span> — {name}
              </p>
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
                  {currency} {price} × {guests} guests
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
                {submitting ? 'Sending request…' : 'Confirm booking'}
              </button>
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
              <button
                type="button"
                onClick={() =>
                  downloadBookingIcs({
                    title: tour.title,
                    dateIso: date,
                    descriptionLines: [
                      tour.title,
                      `${formatBookingDateDisplay(date)} — ${guests} guests`,
                      tour.meetingPoint?.trim() ? `Meeting: ${tour.meetingPoint.trim()}` : '',
                      `Estimated total ${currency} ${total} (confirm with provider)`,
                    ],
                  })
                }
                className="px-6 py-2.5 rounded-lg border border-finland text-finland font-medium hover:bg-finland/5 transition-all duration-200 ease-smooth active:scale-[0.98] inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
              >
                <CalendarPlus className="w-4 h-4" />
                Add to calendar
              </button>
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
                Browse more tours
              </button>
            </div>
          </div>
        )}
      </div>

      <AvailabilityOptionsModal
        open={availabilityModalOpen}
        checking={availabilityChecking}
        options={availabilityOptions}
        note={availabilityModalNote}
        summaryLine={summaryLineModal}
        onClose={closeAvailabilityModal}
        onSelectOption={handleSelectAvailabilityOption}
      />
    </div>
  );
}
