/**
 * Consumer: saved listings (wishlist). Requires login when Supabase is configured.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { LogIn, ArrowLeft, Heart } from 'lucide-react';
import { SkeletonCardGrid, SkeletonConsumerPage } from '../components/ui/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchWishlistListingIds, removeFromWishlist } from '../data/supabase-wishlist';
import { fetchListingsByIds } from '../data/supabase-listings';
import { TourPackage } from '../types/tour';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import { listingIsFamily } from '../lib/inventory';
import { listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { MARKETPLACE_BROWSE_GRID_CLASS } from '../lib/marketplaceBrowse';
import { fetchDiscountsByListingIds, type ListingDiscount } from '../data/supabase-discounts';
import { isSupabaseListingId } from '../lib/discount-display';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';

interface WishlistPageProps {
  onNavigate: (page: string) => void;
  onTourSelect: (tour: TourPackage) => void;
}

/** Layer C: named Saved region (MyBookings Trips landmark parity). */
const WISHLIST_HEADING_ID = 'wishlist-heading';

// Phase 1607: same marketplace tag labels as Home / Packages / Destination.
const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
};

export default function WishlistPage({ onNavigate, onTourSelect }: WishlistPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, ListingDiscount[]> | null>(null);
  const [discountsLoadedForKey, setDiscountsLoadedForKey] = useState<string | null>(null);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const loadGenRef = useRef(0);
  const discountsLoadGenRef = useRef(0);
  const wishlistUserIdRef = useRef<string | null>(null);

  const wishlistListingIds = useMemo(
    () => listings.map((t) => t.id).filter(isSupabaseListingId),
    [listings]
  );
  const wishlistListingIdsKey = useMemo(() => wishlistListingIds.join(','), [wishlistListingIds]);
  const discountsForWishlistCatalog =
    discountsLoadedForKey === wishlistListingIdsKey ? discountsByListing : null;

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setLoading(false);
      setListings([]);
      setUnavailableCount(0);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchWishlistListingIds(user.id);
      const hydrated = await fetchListingsByIds(ids);
      const byId = new Map(hydrated.map((t) => [t.id, t]));
      const visible: TourPackage[] = [];
      let hidden = 0;
      for (const id of ids) {
        const t = byId.get(id);
        if (!t) {
          hidden += 1;
          continue;
        }
        if (
          isListingVisibleToTravelers(t.status) &&
          // Phase 1265: season-ended tours are unavailable (catalog 1260 parity).
          (listingIsFamily(t, 'stay') || listingHasUpcomingBookableSeason(t))
        ) {
          visible.push(t);
        } else {
          hidden += 1;
        }
      }
      if (gen !== loadGenRef.current) return;
      setListings(visible);
      setUnavailableCount(hidden);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Phase 1301: keep prior Saved cards — load failure ≠ empty wishlist.
      setError(userFacingError(e, USER_ERROR.wishlist));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [user?.id]);

  // Phase 1377 + layout: clear prior account's Saved cards before paint (useEffect ran one frame too late).
  useLayoutEffect(() => {
    if (!user?.id) {
      wishlistUserIdRef.current = null;
      setListings([]);
      setUnavailableCount(0);
      return;
    }
    if (wishlistUserIdRef.current !== user.id) {
      wishlistUserIdRef.current = user.id;
      setListings([]);
      setUnavailableCount(0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      void load();
    } else {
      setLoading(false);
    }
  }, [user?.id, load]);

  // Phase 1156/1183/1194: wishlist cards need live offers and reviews (decoupled browse parity).
  useEffect(() => {
    if (!isSupabaseConfigured() || !wishlistListingIdsKey) {
      setDiscountsByListing(new Map());
      setDiscountsLoadedForKey(null);
      setReviewAggregates(new Map());
      return;
    }
    const ids = wishlistListingIdsKey.split(',');
    const keyAtStart = wishlistListingIdsKey;
    const gen = ++discountsLoadGenRef.current;
    setDiscountsByListing(null);
    setDiscountsLoadedForKey(null);
    let cancelled = false;
    void fetchDiscountsByListingIds(ids)
      .then((discounts) => {
        if (cancelled || gen !== discountsLoadGenRef.current) return;
        setDiscountsByListing(discounts);
        setDiscountsLoadedForKey(keyAtStart);
      })
      .catch(() => {
        // Phase 1151: empty map → honest list From (not endless "Checking offers…").
        if (cancelled || gen !== discountsLoadGenRef.current) return;
        setDiscountsByListing(new Map());
        setDiscountsLoadedForKey(keyAtStart);
      });
    void getReviewAggregatesForListingIds(ids)
      .then((reviews) => {
        if (!cancelled) setReviewAggregates(reviews);
      })
      .catch(() => {
        // Keep prior reviews — failure ≠ zero ratings.
      });
    return () => {
      cancelled = true;
    };
  }, [wishlistListingIdsKey]);

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
        <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 py-8">
          <header className="mb-6 border-b border-black/[0.06] pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Your travel</p>
            <h1 id={WISHLIST_HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              Saved
            </h1>
          </header>
          <section aria-labelledby={WISHLIST_HEADING_ID}>
          <EmptyState
            icon={Heart}
            className="pt-2 pb-0"
            title="Saved tours and stays need the live app"
            body="Saved listings are only available when Traverion is connected. You can still browse tours and stays."
            action={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
          </section>
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
        <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 py-8">
          <header className="mb-6 border-b border-black/[0.06] pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Your travel</p>
            <h1 id={WISHLIST_HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              Saved
            </h1>
          </header>
          <section aria-labelledby={WISHLIST_HEADING_ID}>
          <EmptyState
            icon={LogIn}
            className="pt-2 pb-0"
            title="Log in to see saved tours and stays"
            body="Saved listings are tied to your traveler account. Sign in to keep tours and stays while you browse."
            action={
              <div className="flex flex-wrap gap-2">
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
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 py-8 pb-12">
        <header className="mb-6 border-b border-black/[0.06] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Your travel</p>
              <h1 id={WISHLIST_HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
                Saved
              </h1>
              <p className="mt-2 text-sm text-ink-muted max-w-xl leading-relaxed">
                Tours and stays you want to come back to — open one to check dates and book.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('account')}
              className="lux-flat lux-tap-target min-h-11 inline-flex items-center gap-1.5 px-2 py-2 text-sm text-ink-muted hover:text-ink"
            >
              <ArrowLeft className="w-4 h-4" />
              Account
            </button>
          </div>
        </header>
        <section aria-labelledby={WISHLIST_HEADING_ID}>
        {error && (
          <ErrorState
            className="py-6"
            title="Saved listings unavailable"
            body={userFacingError(error, USER_ERROR.wishlist)}
            retry={{ onClick: () => void load() }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}
        {loading && listings.length === 0 ? (
          <div aria-busy="true" aria-label="Loading saved listings">
            <SkeletonCardGrid count={8} />
          </div>
        ) : listings.length > 0 ? (
          <>
            {unavailableCount > 0 ? (
              <p className="mb-4 text-sm text-ink-muted">
                {unavailableCount} saved listing{unavailableCount === 1 ? '' : 's'} no longer available — hidden from
                this grid.
              </p>
            ) : null}
            <div className={MARKETPLACE_BROWSE_GRID_CLASS} aria-busy={loading || undefined}>
              {listings.map((tour, index) => (
                <PublicListingBrowseCard
                  key={tour.id}
                  tour={tour}
                  index={index}
                  onSelect={() => onTourSelect(tour)}
                  discountsByListing={discountsForWishlistCatalog}
                  reviewAggregate={reviewAggregates.get(tour.id)}
                  tagLabels={TAG_LABELS}
                  size="compact"
                  showTagPills
                  wishlist={{
                    saved: true,
                    onToggle: () => void handleRemove(tour.id),
                  }}
                />
              ))}
            </div>
          </>
        ) : error ? null : (
          <EmptyState
            icon={Heart}
            title={unavailableCount > 0 ? 'No bookable saved listings' : 'Nothing saved yet'}
            body={
              unavailableCount > 0
                ? `${unavailableCount} saved listing${unavailableCount === 1 ? '' : 's'} are unpublished or gone, so they are not shown as bookable. Browse for something new or remove saves from listing pages when you reopen them.`
                : 'You have not saved a tour or stay yet. Save one while browsing and it will show up here.'
            }
            action={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
        )}
        </section>
      </div>
    </div>
  );
}
