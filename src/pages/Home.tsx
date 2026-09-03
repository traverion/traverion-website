import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings, SHOW_SEED_LISTINGS } from '../data/listings';
import { getDestinationsFromListings } from '../data/activities';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { activities } from '../data/activities';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { supplierPortalHref } from '../lib/partnerHost';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

const MAX_RESULTS_HOME = 12;

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const { listings: supplierListings } = usePublishedSupplierListings({ emptyOnFirstError: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    if (SHOW_SEED_LISTINGS) return [...base, ...activities];
    return base;
  }, [supplierListings]);

  const placeChips = useMemo(() => {
    return getDestinationsFromListings(allListings)
      .filter((d) => d.type === 'city' || d.type === 'region')
      .slice(0, 8);
  }, [allListings]);

  const displayedListings = useMemo(() => allListings.slice(0, MAX_RESULTS_HOME), [allListings]);
  const hasMore = allListings.length > MAX_RESULTS_HOME;

  const displayedIds = useMemo(
    () => displayedListings.map((t) => t.id).filter(isSupabaseListingId),
    [displayedListings]
  );
  const displayedIdsKey = useMemo(() => displayedIds.join(','), [displayedIds]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !displayedIdsKey) {
      setDiscountsByListing(new Map());
      setReviewAggregates(new Map());
      return;
    }
    const ids = displayedIdsKey.split(',');
    let cancelled = false;
    Promise.all([fetchDiscountsByListingIds(ids), getReviewAggregatesForListingIds(ids)]).then(
      ([discounts, reviews]) => {
        if (cancelled) return;
        setDiscountsByListing(discounts);
        setReviewAggregates(reviews);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [displayedIdsKey]);

  const goToPackages = (extra?: { q?: string; destination?: string }) => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    const q = (extra?.q ?? searchTerm).trim();
    if (q) params.set('q', q);
    if (extra?.destination) params.set('destination', extra.destination);
    const query = params.toString();
    window.history.pushState({}, '', query ? `/packages?${query}` : '/packages');
    onNavigate('packages');
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    goToPackages();
  };

  return (
    <div className="min-h-screen bg-white">
      <section className="relative text-white pt-24 sm:pt-28 pb-16 sm:pb-24 min-h-[560px] sm:min-h-[620px] flex items-center overflow-hidden">
        <div className="page-hero-media" aria-hidden>
          <img src="/banner1.jpg" alt="" />
        </div>
        <div className="absolute inset-0 bg-black/40" aria-hidden />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 page-hero-content">
          <p className="page-hero-eyebrow text-center text-xs sm:text-sm tracking-[0.18em] uppercase font-medium mb-3">
            Tours &amp; activities
          </p>
          <h1 className="page-hero-title text-3xl sm:text-5xl font-semibold text-center tracking-tight mb-3">
            Find an experience worth the trip
          </h1>
          <p className="page-hero-subtitle text-center text-sm sm:text-lg mb-8 max-w-xl mx-auto font-normal">
            Browse live tours from independent operators. Book in minutes, with free cancellation up to 24 hours before.
          </p>
          <form
            onSubmit={submitSearch}
            className="bg-white rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row gap-2 shadow-none"
          >
            <label className="sr-only" htmlFor="home-search">
              Search experiences
            </label>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                id="home-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Northern lights, Lisbon, food tour…"
                className="w-full h-12 sm:h-14 pl-11 pr-4 rounded-xl border-0 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-finland/30 text-base"
              />
            </div>
            <button
              type="submit"
              className="h-12 sm:h-14 px-8 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark transition-colors"
            >
              Search
            </button>
          </form>
          {placeChips.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {placeChips.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => goToPackages({ destination: p.id })}
                  className="lux-flat text-xs sm:text-sm px-3 py-1.5 rounded-full bg-white/15 text-white border border-white/25 hover:bg-white hover:text-gray-900 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-4 border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-finland" aria-hidden />
              {TRAVERION_STANDARD_CANCELLATION_POLICY.split('.')[0]}.
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-finland/10 text-finland text-[10px] font-bold flex items-center justify-center">
                $
              </span>
              Secure card checkout
            </span>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14 bg-gray-50/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">Experiences</h2>
              <p className="mt-1 text-sm text-gray-600">
                What operators are offering on Traverion right now.
              </p>
            </div>
            <button
              type="button"
              onClick={() => goToPackages()}
              className="lux-flat inline-flex items-center gap-1.5 text-sm font-semibold text-finland hover:text-finland-dark self-start"
            >
              All experiences <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {allListings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
              <p className="text-gray-700 font-medium mb-2">No experiences listed yet</p>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                Operators are setting up tours on Traverion. If you run experiences, you can publish yours today.
              </p>
              <a
                href={supplierPortalHref('/login')}
                className="inline-flex items-center gap-2 bg-finland text-white font-semibold px-6 py-3 rounded-xl hover:bg-finland-dark transition-colors"
              >
                List your experience
              </a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {displayedListings.map((item, index) => (
                  <PublicListingBrowseCard
                    key={item.id}
                    tour={item}
                    index={index}
                    onSelect={() => onTourSelect(item)}
                    discountsByListing={discountsByListing}
                    reviewAggregate={reviewAggregates.get(item.id)}
                    tagLabels={TAG_LABELS}
                    size="default"
                    showViewDetailsHint
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-10 text-center">
                  <button
                    type="button"
                    onClick={() => goToPackages()}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
                  >
                    View all {allListings.length} experiences <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
