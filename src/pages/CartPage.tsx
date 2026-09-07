/**
 * Consumer: saved items. Booking happens on the experience page via Stripe checkout.
 */
import { useState, useEffect, useCallback } from 'react';
import { LogIn, ArrowLeft, Trash2, ShoppingBag } from 'lucide-react';
import { SkeletonListItem, SkeletonConsumerPage } from '../components/ui/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchCartWithListings, removeFromCart, type CartItemWithListing } from '../data/supabase-cart';

interface CartPageProps {
  onNavigate: (page: string) => void;
  onBookTour?: (listingId: string) => void;
}

export default function CartPage({ onNavigate, onBookTour }: CartPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItemWithListing[]>([]);
  const [loading, setLoading] = useState(true);
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
      setLoadError(userFacingError(e, USER_ERROR.cart));
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

  const handleContinueBooking = (item: CartItemWithListing) => {
    if (onBookTour) {
      onBookTour(item.listing_id);
      return;
    }
    window.history.pushState({}, '', `/packages?tour=${encodeURIComponent(item.listing_id)}`);
    onNavigate('packages');
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Cart</h1>
          <EmptyState
            icon={ShoppingBag}
            className="pt-6 pb-0"
            title="Cart needs the live app"
            body="Saved tours are only available when Traverion is connected. You can still browse and book."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (!user) {
    if (authLoading) {
      return <SkeletonConsumerPage titleWidth="w-24" />;
    }
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Cart</h1>
          <EmptyState
            icon={LogIn}
            className="pt-6 pb-0"
            title="Log in to see saved tours"
            body="Cart is tied to your traveler account. You have not signed in, so there is nothing to show. Booking still happens on the tour page."
            action={
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/sign-up?next=cart');
                  onNavigate('auth');
                }}
                className="tv-btn-primary"
              >
                Log in
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Cart</h1>
            <p className="mt-2 text-ink-muted">Saved tours — book from the tour page.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className="lux-flat inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" />
            Account
          </button>
        </div>
        {loadError && (
          <ErrorState
            className="py-6"
            title="Cart unavailable"
            body={userFacingError(loadError, USER_ERROR.cart)}
            retry={{ onClick: () => void load() }}
          />
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Cart is empty"
            body="You have not saved a tour yet. That is normal until you find one you want. Save from a listing, then book it there — checkout is not on this page."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-5">
                <div className="flex-1 flex gap-4 min-w-0">
                  <img
                    src={item.listing_image ?? 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg'}
                    alt=""
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink truncate">{item.listing_title ?? 'Tour'}</h2>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {item.booking_date} · {item.guests} {item.guests === 1 ? 'guest' : 'guests'}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {(item.price_per_person ?? 0) * item.guests} {item.currency ?? 'USD'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => handleContinueBooking(item)} className="tv-btn-primary">
                    Book
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="lux-flat p-2 text-ink-muted hover:text-red-700"
                    title="Remove from cart"
                    aria-label="Remove from cart"
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
