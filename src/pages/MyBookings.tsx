/**
 * Consumer: list of the logged-in user's bookings with status.
 * RLS ensures only rows where guest_email = auth user email are returned.
 */
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Users, MapPin, LogIn, RefreshCw, XCircle, ArrowLeft, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMyBookings,
  cancelBookingAsCustomer,
  updateGuestBookingSpecialRequests,
  type BookingRow,
} from '../data/supabase-bookings';
import { fetchListingTitlesByIds, pgTimeToHm } from '../data/supabase-listings';
import { decrementAvailabilityBooked } from '../data/supabase-availability';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';

interface MyBookingsProps {
  onNavigate: (page: string) => void;
  onTourSelect?: (tour: { id: string }) => void;
}

export default function MyBookings({ onNavigate, onTourSelect }: MyBookingsProps) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<BookingRow | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingId, setNoteSavingId] = useState<string | null>(null);

  /** Tour start is within 24 hours from now → no refund. Otherwise full refund. */
  const getRefundChoiceForCancel = useCallback((bookingDate: string | null): 'full_refund' | 'no_refund' => {
    if (!bookingDate) return 'no_refund';
    const startMs = new Date(bookingDate + 'T00:00:00').getTime();
    const nowMs = Date.now();
    const hours24 = 24 * 60 * 60 * 1000;
    return startMs - nowMs > hours24 ? 'full_refund' : 'no_refund';
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMyBookings();
      setBookings(list);
      const ids = [...new Set(list.map((b) => b.listing_id))];
      const titleMap = await fetchListingTitlesByIds(ids);
      setTitles(titleMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const b of bookings) {
      next[b.id] = b.special_requests ?? '';
    }
    setNoteDrafts(next);
  }, [bookings]);

  const handleSaveNote = useCallback(
    async (b: BookingRow) => {
      setError(null);
      const text = noteDrafts[b.id] ?? '';
      if (text.trim() === (b.special_requests ?? '').trim()) {
        return;
      }
      setNoteSavingId(b.id);
      const res = await updateGuestBookingSpecialRequests(b.id, text);
      setNoteSavingId(null);
      if (res.success) await load();
      else setError(res.error ?? 'Could not save your note.');
    },
    [noteDrafts, load]
  );

  const handleCancelBooking = useCallback(async (b: BookingRow) => {
    setCancellingId(b.id);
    setError(null);
    const refundChoice = getRefundChoiceForCancel(b.booking_date);
    const res = await cancelBookingAsCustomer(b.id, refundChoice);
    setCancellingId(null);
    setCancelConfirm(null);
    if (res.success) {
      if (b.booking_date) await decrementAvailabilityBooked(b.listing_id, b.booking_date);
      load();
    } else {
      setError(res.error ?? 'Could not cancel booking');
    }
  }, [getRefundChoiceForCancel, load]);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20">
        <PageHero
          imageSrc={HERO_IMG.beach2}
          overlay="slateSoft"
          title="Your bookings"
          subtitle="View reservations and status for tours you have booked with Traverion."
        />
        <div className="max-w-2xl mx-auto px-4 py-8 pb-12">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Bookings unavailable</h2>
            <p className="text-gray-600 mb-5">
              Booking history is available only in the live app setup.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('packages')}
                className="px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
              >
                Browse tours
              </button>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
              >
                Contact support
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20">
        <PageHero
          imageSrc={HERO_IMG.beach2}
          overlay="slateSoft"
          title="Your bookings"
          subtitle="Log in to see your reservations and their status (confirmed or cancelled)."
        />
        <div className="max-w-xl mx-auto px-4 py-8 pb-12 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Your bookings</h1>
            <p className="text-gray-600 mb-6">Log in to see your reservations and their status (confirmed or cancelled).</p>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/log-in?next=account');
                onNavigate('auth');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <LogIn className="w-5 h-5" />
              Log in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.beach2}
        overlay="slateSoft"
        title="Your bookings"
        subtitle="View status of your tour and activity reservations."
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => onNavigate('account')}
              className="inline-flex items-center gap-1.5 text-gray-600 hover:text-finland font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              My account
            </button>
            <span className="text-gray-300 hidden sm:inline" aria-hidden>
              |
            </span>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="text-gray-500 hover:text-finland"
            >
              Browse tours
            </button>
          </div>
        </div>
        <div className="flex justify-end mb-8">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Loading your bookings…</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No bookings yet</h2>
            <p className="text-gray-600 mb-6">When you book a tour or activity, it will appear here with its status.</p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <MapPin className="w-5 h-5" />
              Browse tours
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {titles[b.listing_id] ?? 'Tour'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'Date TBC'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {b.guests} {b.guests === 1 ? 'guest' : 'guests'}
                    </span>
                    {(b.start_time || b.pickup_time) && (
                      <span className="flex items-center gap-1 text-gray-700">
                        <Clock className="w-4 h-4 shrink-0" />
                        {b.start_time ? `Start ${pgTimeToHm(b.start_time) ?? ''}` : null}
                        {b.start_time && b.pickup_time ? ' · ' : null}
                        {b.pickup_time ? `Pickup ${pgTimeToHm(b.pickup_time) ?? ''}` : null}
                      </span>
                    )}
                  </div>
                  {b.status === 'cancelled' && b.special_requests && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-3">{b.special_requests}</p>
                  )}
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <div className="mt-3 w-full max-w-lg">
                      <label htmlFor={`guest-note-${b.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        Note for the host
                      </label>
                      <textarea
                        id={`guest-note-${b.id}`}
                        rows={3}
                        value={noteDrafts[b.id] ?? ''}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({
                            ...d,
                            [b.id]: e.target.value,
                          }))
                        }
                        placeholder="Pickup details, dietary needs, questions…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-finland/40 focus:border-finland"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveNote(b)}
                        disabled={noteSavingId === b.id}
                        className="mt-2 text-sm px-3 py-1.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                      >
                        {noteSavingId === b.id ? 'Saving…' : 'Save note'}
                      </button>
                      <p className="mt-1 text-xs text-gray-500">
                        The supplier receives an email when you save. You can edit again anytime before the tour.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start sm:items-center gap-1 sm:flex-row sm:gap-3 sm:flex-shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                        b.status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : b.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {b.status}
                    </span>
                    {b.status === 'cancelled' && b.refund_choice && (
                      <span className="text-sm text-gray-600">
                        Refund: {b.refund_choice === 'full_refund' ? 'Full refund' : b.refund_choice === 'no_refund' ? 'No refund' : 'Reschedule'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {onTourSelect && (
                      <button
                        type="button"
                        onClick={() => onTourSelect({ id: b.listing_id })}
                        className="text-sm text-finland hover:underline"
                      >
                        View tour
                      </button>
                    )}
                    {b.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(b)}
                        disabled={cancellingId !== null}
                        className="text-sm text-red-600 hover:text-red-800 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {cancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel this booking?</h3>
              <p className="text-sm text-gray-600 mb-2">
                {titles[cancelConfirm.listing_id] ?? 'Tour'} · {cancelConfirm.booking_date ? new Date(cancelConfirm.booking_date).toLocaleDateString() : 'Date TBC'}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {getRefundChoiceForCancel(cancelConfirm.booking_date) === 'full_refund'
                  ? 'Your tour start is more than 24 hours away. You will receive a full refund.'
                  : 'Your tour starts within 24 hours. No refund applies.'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelConfirm(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Keep booking
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelBooking(cancelConfirm)}
                  disabled={cancellingId !== null}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {cancellingId === cancelConfirm.id ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
