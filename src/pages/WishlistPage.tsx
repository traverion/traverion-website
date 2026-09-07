/**
 * Consumer: saved listings (wishlist). Requires login when Supabase is configured.
 */
import { useState, useEffect, useCallback } from 'react';
import { LogIn, ArrowLeft, Heart } from 'lucide-react';
import { SkeletonListItem, SkeletonConsumerPage } from '../components/ui/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchWishlistListingIds, removeFromWishlist } from '../data/supabase-wishlist';
import { fetchListingById } from '../data/supabase-listings';
import { TourPackage } from '../types/tour';

interface WishlistPageProps {
  onNavigate: (page: string) => void;
  onTourSelect: (tour: TourPackage) => void;
}

export default function WishlistPage({ onNavigate, onTourSelect }: WishlistPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchWishlistListingIds(user.id);
      const tours: TourPackage[] = [];
      for (const id of ids) {
        const t = await fetchListingById(id);
        if (t) tours.push(t);
      }
      setListings(tours);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.wishlist));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  const handleRemove = async (listingId: string) => {
    if (!user) return;
    const ok = await removeFromWishlist(user.id, listingId);
    if (ok) {
      setListings((prev) => prev.filter((t) => t.id !== listingId));
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
          <EmptyState
            icon={Heart}
            className="pt-6 pb-0"
            title="Saved tours need the live app"
            body="Wishlist is only available when Traverion is connected. You can still browse tours."
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
      return <SkeletonConsumerPage titleWidth="w-36" rows={4} />;
    }
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
          <EmptyState
            icon={LogIn}
            className="pt-6 pb-0"
            title="Log in to see saved tours"
            body="Wishlist is tied to your traveler account. You have not signed in, so this list is empty."
            action={
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/sign-up?next=wishlist');
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
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
            <p className="mt-2 text-ink-muted">Tours you’ve saved.</p>
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
        {error && (
          <ErrorState
            className="py-6"
            title="Saved tours unavailable"
            body={userFacingError(error, USER_ERROR.wishlist)}
            retry={{ onClick: () => void load() }}
          />
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            body="Your wishlist is empty because you have not saved a tour. That is expected. Save one while browsing and it will show up here."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {listings.map((tour) => (
              <div key={tour.id} className="flex items-center gap-4 py-5">
                <button
                  type="button"
                  onClick={() => onTourSelect(tour)}
                  className="lux-flat flex-1 text-left flex gap-4 min-w-0"
                >
                  <img src={tour.image} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-ink truncate">{tour.title}</h2>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {tour.destination} · {tour.duration}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      From {tour.price?.currency ?? 'USD'} {tour.price?.startingFrom ?? 0}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(tour.id)}
                  className="lux-flat p-2 text-ink-muted hover:text-ink active:scale-90"
                  title="Remove from wishlist"
                  aria-label={`Remove ${tour.title} from wishlist`}
                >
                  <Heart className="w-5 h-5 fill-ink/80" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
