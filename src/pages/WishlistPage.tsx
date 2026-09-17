/**
 * Consumer: saved listings (wishlist). Requires login when Supabase is configured.
 */
import { useState, useEffect, useCallback } from 'react';
import { LogIn, ArrowLeft, Heart, MapPin } from 'lucide-react';
import { SkeletonListItem, SkeletonConsumerPage } from '../components/ui/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchWishlistListingIds, removeFromWishlist } from '../data/supabase-wishlist';
import { fetchListingById } from '../data/supabase-listings';
import { TourPackage } from '../types/tour';
import { formatMoney } from '../lib/money';
import { catalogHeadlineAmount } from '../lib/discount-display';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';

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
            title="Log in to see saved tours"
            body="Wishlist is tied to your traveler account. You have not signed in, so this list is empty."
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
        <div className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Saved for later</p>
              <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Wishlist</h1>
              <p className="mt-2 text-sm text-ink-muted max-w-md">
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
          <div className="space-y-3" aria-busy="true" aria-label="Loading wishlist">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            body="Your wishlist is empty because you have not saved a tour or stay. Save one while browsing and it will show up here."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {listings.map((tour) => {
              const thumb = listingHeroImageSrc(tour.image);
              const place = (tour.city || tour.destination || '').trim();
              return (
                <article
                  key={tour.id}
                  className="overflow-hidden rounded-2xl border-l-[3px] border-l-rose-400 bg-paper-raised shadow-soft ring-1 ring-black/[0.06] transition-[box-shadow,ring-color] hover:ring-rose-300/50 hover:shadow-soft-lg"
                >
                  <div className="flex items-stretch gap-0">
                    <button
                      type="button"
                      onClick={() => onTourSelect(tour)}
                      className="lux-flat flex min-w-0 flex-1 items-start gap-3.5 p-3.5 sm:gap-4 sm:p-4 text-left"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-cover shrink-0 bg-black/[0.04] ring-1 ring-black/[0.06]"
                          width={96}
                          height={96}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div
                          className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-200/70"
                          aria-hidden
                        >
                          <Heart className="h-7 w-7 text-rose-400 fill-rose-400/30" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 ring-1 ring-rose-200/70">
                          Saved
                        </span>
                        <h2 className="mt-1.5 font-semibold text-ink line-clamp-2 leading-snug">{tour.title}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                          {place ? (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                              <span className="truncate">{place}</span>
                            </span>
                          ) : null}
                          {tour.duration ? <span>{tour.duration}</span> : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          From {formatMoney(catalogHeadlineAmount(tour), tour.price?.currency)}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-start border-l border-black/[0.05] bg-rose-50/40 p-2 sm:p-3">
                      <button
                        type="button"
                        onClick={() => void handleRemove(tour.id)}
                        className="lux-flat rounded-xl p-2.5 text-rose-700 hover:bg-rose-100 hover:text-rose-900 active:scale-90"
                        title="Remove from wishlist"
                        aria-label={`Remove ${tour.title} from wishlist`}
                      >
                        <Heart className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
