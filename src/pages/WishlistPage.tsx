/**
 * Consumer: saved listings (wishlist). Requires login when Supabase is configured.
 */
import { useState, useEffect, useCallback } from 'react';
import { LogIn, ArrowLeft, Heart } from 'lucide-react';
import { SkeletonCardGrid, SkeletonConsumerPage } from '../components/ui/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchWishlistListingIds, removeFromWishlist } from '../data/supabase-wishlist';
import { fetchListingById } from '../data/supabase-listings';
import { TourPackage } from '../types/tour';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';

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
          <header className="mb-6 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              <Heart className="h-3.5 w-3.5" aria-hidden />
              Saved for later
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
          </header>
          <EmptyState
            icon={Heart}
            className="pt-2 pb-0"
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
          <header className="mb-6 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              <Heart className="h-3.5 w-3.5" aria-hidden />
              Saved for later
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
          </header>
          <EmptyState
            icon={LogIn}
            className="pt-2 pb-0"
            title="Log in to see saved experiences"
            body="Wishlist is tied to your traveler account. Sign in to save tours and stays while you browse."
            action={
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', travelerLoginHref('wishlist'));
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
        <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Saved for later</p>
              <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
              <p className="mt-2 text-sm text-ink-muted max-w-md leading-relaxed">
                Tours and stays you want to come back to — open one to check dates and book.
              </p>
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
        </header>
        {error && (
          <ErrorState
            className="py-6"
            title="Saved listings unavailable"
            body={userFacingError(error, USER_ERROR.wishlist)}
            retry={{ onClick: () => void load() }}
          />
        )}
        {loading ? (
          <div aria-busy="true" aria-label="Loading wishlist">
            <SkeletonCardGrid count={4} />
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            body="Your wishlist is empty because you have not saved a tour or stay. Save one while browsing and it will show up here."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse experiences
              </button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {listings.map((tour, index) => (
              <div key={tour.id} className="relative">
                <PublicListingBrowseCard
                  tour={tour}
                  index={index}
                  onSelect={() => onTourSelect(tour)}
                  discountsByListing={new Map()}
                  tagLabels={{}}
                  size="compact"
                />
                <button
                  type="button"
                  onClick={() => void handleRemove(tour.id)}
                  className="lux-flat absolute top-3 right-3 z-10 rounded-full bg-paper-raised/95 p-2.5 text-rose-700 shadow-soft ring-1 ring-rose-200/80 hover:bg-rose-50 hover:text-rose-900"
                  title="Remove from wishlist"
                  aria-label={`Remove ${tour.title} from wishlist`}
                >
                  <Heart className="w-4 h-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
