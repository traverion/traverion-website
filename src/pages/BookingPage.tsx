/**
 * Single clean booking flow (GetYourGuide/TripAdvisor style):
 * Date & guests → Contact details → Confirm → Done.
 * All in one page, minimal fields.
 */
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Users, User, Mail, MessageSquare, CheckCircle, MapPin } from 'lucide-react';
import { TourPackage } from '../types/tour';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { submitBooking } from '../data/supabase-bookings';
import { checkAvailability } from '../data/supabase-availability';
import { analytics } from '../lib/analytics';
import { setPageMetaWithOg } from '../lib/seo';
import { dateNotInPast, validateEmail, required, maxLength } from '../lib/validation';

interface BookingPageProps {
  tour: TourPackage;
  onBack: () => void;
  onComplete: () => void;
  onNavigate?: (page: string) => void;
}

type Step = 'date-guests' | 'contact' | 'confirm' | 'done';

export default function BookingPage({ tour, onBack, onComplete, onNavigate }: BookingPageProps) {
  const { user, requestAuth } = useAuth();
  const [step, setStep] = useState<Step>('date-guests');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = tour.price?.startingFrom ?? 0;
  const currency = tour.price?.currency ?? 'USD';
  const total = price * guests;

  useEffect(() => {
    setPageMetaWithOg(`Book: ${tour.title}`, `Reserve ${tour.title}. From ${currency} ${price} per person.`, {
      title: `Book: ${tour.title}`,
      image: tour.image,
      type: 'website',
    });
  }, [tour.id, tour.title, tour.image, price, currency]);

  const handleContinueFromDateGuests = () => {
    const dateCheck = dateNotInPast(date.trim());
    if (!dateCheck.valid) {
      setError(dateCheck.message ?? 'Please select a date');
      return;
    }
    if (guests < 1 || guests > 99) {
      setError('Please enter between 1 and 99 guests');
      return;
    }
    setError(null);
    setStep('contact');
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
    setError(null);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (isSupabaseConfigured() && !user) {
      requestAuth({ onSuccess: () => {} });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isSupabaseConfigured()) {
        const avail = await checkAvailability(tour.id, date, guests);
        if (!avail.available) {
          setError(avail.remaining !== undefined && avail.remaining === 0
            ? 'This date is fully booked. Please choose another.'
            : 'Not enough capacity for this date. Please choose another.');
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
        status: 'pending',
        special_requests: specialRequests.trim() || undefined,
        total_price: total,
        currency,
      });
      if (result.success) {
        analytics.bookComplete(tour.id, guests);
        setStep('done');
      } else {
        setError(result.error ?? 'Booking failed');
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-finland mb-8 transition-colors duration-200 ease-smooth active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tour
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="h-32 sm:h-40 bg-gray-200 relative">
            <img
              src={tour.image}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 text-white">
              <h1 className="text-lg sm:text-xl font-semibold">{tour.title}</h1>
              <p className="text-sm text-white/90">{tour.duration} · From {currency} {price} per person</p>
            </div>
          </div>
        </div>

        {step === 'date-guests' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Select date and guests</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of guests</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-between items-center">
              <p className="text-gray-600">Total: <strong className="text-gray-900">{currency} {total}</strong></p>
              <button
                type="button"
                onClick={handleContinueFromDateGuests}
                className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'contact' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Your details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special requests (optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Dietary needs, accessibility, questions for the provider…"
                    rows={3}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland resize-none"
                  />
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setStep('date-guests')} className="px-4 py-2.5 text-gray-600 hover:text-finland">
                Back
              </button>
              <button
                type="button"
                onClick={handleContinueFromContact}
                className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Confirm booking</h2>
            <div className="space-y-2 text-sm text-gray-600 mb-6">
              <p><strong className="text-gray-900">Date:</strong> {date}</p>
              <p><strong className="text-gray-900">Guests:</strong> {guests}</p>
              <p><strong className="text-gray-900">Name:</strong> {name}</p>
              <p><strong className="text-gray-900">Email:</strong> {email}</p>
              {specialRequests.trim() && (
                <p><strong className="text-gray-900">Special requests:</strong> {specialRequests.trim()}</p>
              )}
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-6">Total: {currency} {total}</p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setStep('contact')} className="px-4 py-2.5 text-gray-600 hover:text-finland">
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmBooking}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-60 transition-all duration-200 ease-smooth active:scale-[0.98]"
              >
                {submitting ? 'Booking…' : 'Confirm booking'}
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
            <p className="text-gray-500 text-sm mb-6">The provider will confirm and contact you at {email}</p>
            <div className="bg-gray-50 rounded-xl p-5 text-left mb-6">
              <p className="font-medium text-gray-900 mb-3">{tour.title}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {date}</span>
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {guests} {guests === 1 ? 'guest' : 'guests'}</span>
                <span className="flex items-center gap-1.5"><strong className="text-gray-900">{currency} {total}</strong> total</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => { onNavigate('bookings'); onComplete(); }}
                  className="px-6 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] inline-flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  View my bookings
                </button>
              )}
              <button
                type="button"
                onClick={onComplete}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 ease-smooth active:scale-[0.98]"
              >
                Browse more tours
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
