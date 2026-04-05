/**
 * Consumer: cart items with option to request booking (no payment yet).
 */
import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, LogIn, ArrowLeft, Trash2, Calendar, Users, RefreshCw } from 'lucide-react';
import { SkeletonListItem } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchCartWithListings, removeFromCart, type CartItemWithListing } from '../data/supabase-cart';
import { submitBooking } from '../data/supabase-bookings';

interface CartPageProps {
  onNavigate: (page: string) => void;
  onBookTour?: (listingId: string) => void;
}

export default function CartPage({ onNavigate }: CartPageProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItemWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchCartWithListings(user.id);
      setItems(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  const handleRemove = async (cartItemId: string) => {
    if (!user) return;
    const ok = await removeFromCart(user.id, cartItemId);
    if (ok) setItems((prev) => prev.filter((i) => i.id !== cartItemId));
  };

  const handleRequestBooking = async (item: CartItemWithListing) => {
    if (!user?.email) return;
    setSubmittingId(item.id);
    setError(null);
    const result = await submitBooking({
      tour_id: item.listing_id,
      tour_title: item.listing_title ?? 'Tour',
      customer_name: user.email.split('@')[0] ?? 'Guest',
      customer_email: user.email,
      travelers: item.guests,
      departure_date: item.booking_date,
      status: 'pending',
      total_price: (item.price_per_person ?? 0) * item.guests,
      currency: item.currency ?? 'USD',
    });
    setSubmittingId(null);
    if (result.success) {
      await removeFromCart(user.id, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } else {
      setError(result.error ?? 'Request failed');
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <ShoppingCart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Cart unavailable</h1>
            <p className="text-gray-600 mb-6">
              Cart requests are available only in the live app setup. You can still browse tours and book directly.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              Browse tours
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <ShoppingCart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Your cart</h1>
            <p className="text-gray-600 mb-6">Log in to add tours to your cart and request bookings.</p>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/sign-up?next=cart');
                onNavigate('auth');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <LogIn className="w-5 h-5" />
              Sign in / Sign up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm mb-6">
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
          <button type="button" onClick={() => onNavigate('packages')} className="text-gray-500 hover:text-finland">
            Browse tours
          </button>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-finland" />
          Cart
        </h1>
        {loadError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">Your cart is empty.</p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="mt-4 px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              Find tours
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col sm:flex-row gap-4 p-4"
              >
                <div className="flex-1 flex gap-4 min-w-0">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
                    <img
                      src={item.listing_image ?? 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg'}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 truncate">{item.listing_title ?? 'Tour'}</h2>
                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4" /> {item.booking_date}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <Users className="w-4 h-4" /> {item.guests} {item.guests === 1 ? 'guest' : 'guests'}
                    </p>
                    <p className="text-sm font-medium text-finland mt-1">
                      {(item.price_per_person ?? 0) * item.guests} {item.currency ?? 'USD'} total
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRequestBooking(item)}
                    disabled={!!submittingId}
                    className="px-4 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    {submittingId === item.id ? 'Requesting…' : 'Request booking'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    title="Remove from cart"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
