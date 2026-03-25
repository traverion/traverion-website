import { ArrowRight, MapPin, Search } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings, getAllListingsAsync, SHOW_SEED_LISTINGS } from '../data/listings';
import { getDestinationsFromListings } from '../data/activities';
import { isSupabaseConfigured } from '../lib/supabase';
import { activities } from '../data/activities';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { getDisplayPrice, isSupabaseListingId } from '../lib/discount-display';
import { ListingCardRating } from '../components/ListingCardRating';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

const MAX_RESULTS_HOME = 12;

/** Hardcoded popular experiences (GetYourGuide-style) – clicking runs search for that term */
const POPULAR_EXPERIENCES = [
  {
    id: 'northern-lights',
    title: 'Northern Lights',
    subtitle: 'Iceland, Norway & Finland',
    searchQuery: 'Northern Lights',
    image: 'https://images.pexels.com/photos/1933239/pexels-photo-1933239.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'rome-vespa',
    title: 'Rome Vespa tour',
    subtitle: 'Italy',
    searchQuery: 'Rome Vespa tour',
    image: 'https://images.pexels.com/photos/4276793/pexels-photo-4276793.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    id: 'santorini-sunset',
    title: 'Santorini Sunset Cruise',
    subtitle: 'Greece',
    searchQuery: 'Santorini sunset cruise',
    image: 'https://images.pexels.com/photos/1029599/pexels-photo-1029599.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

function matchSearch(tour: TourPackage, q: string): boolean {
  if (!q.trim()) return true;
  const term = q.toLowerCase().trim();
  const searchable = [
    tour.title,
    tour.destination,
    tour.city,
    tour.country,
    tour.description,
    tour.highlights?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return searchable.includes(term);
}

function matchCountry(tour: TourPackage, countryId: string): boolean {
  if (countryId === 'all') return true;
  const tourCountry = (tour.country ?? '').toLowerCase().replace(/\s+/g, '-');
  return tourCountry === countryId.toLowerCase();
}

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const [supplierListings, setSupplierListings] = useState<TourPackage[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryId, setCountryId] = useState('all');
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false })
      .then(setSupplierListings)
      .catch(() => { /* leave supplierListings null so fallback listings are used */ });
  }, []);

  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    if (SHOW_SEED_LISTINGS) return [...base, ...activities];
    return base;
  }, [supplierListings]);

  const countryOptions = useMemo(() => {
    const all = getDestinationsFromListings(allListings);
    return all.filter((d) => d.type === 'world' || d.type === 'region');
  }, [allListings]);

  const filteredListings = useMemo(() => {
    return allListings.filter(
      (tour) => matchSearch(tour, searchTerm) && matchCountry(tour, countryId)
    );
  }, [allListings, searchTerm, countryId]);

  const displayedListings = useMemo(
    () => filteredListings.slice(0, MAX_RESULTS_HOME),
    [filteredListings]
  );
  const hasMore = filteredListings.length > MAX_RESULTS_HOME;
  const hasActiveFilter = searchTerm.trim() !== '' || countryId !== 'all';

  const displayedIds = useMemo(
    () => displayedListings.map((t) => t.id).filter(isSupabaseListingId),
    [displayedListings]
  );
  const displayedIdsKey = useMemo(() => displayedIds.join(','), [displayedIds]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !displayedIdsKey) {
      setDiscountsByListing(new Map());
      return;
    }
    fetchDiscountsByListingIds(displayedIdsKey.split(',')).then(setDiscountsByListing);
  }, [displayedIdsKey]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !displayedIdsKey) {
      setReviewAggregates(new Map());
      return;
    }
    const ids = displayedIdsKey.split(',');
    let cancelled = false;
    getReviewAggregatesForListingIds(ids).then((m) => {
      if (!cancelled) setReviewAggregates(m);
    });
    return () => {
      cancelled = true;
    };
  }, [displayedIdsKey]);

  const goToPackagesWithFilters = () => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    if (countryId !== 'all') params.set('destination', countryId);
    const query = params.toString();
    window.history.pushState({}, '', query ? `/packages?${query}` : '/packages');
    onNavigate('packages');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero banner: tour image background + search + filter (pt clears fixed header) */}
      <section className="relative text-white pt-24 sm:pt-28 pb-14 sm:pb-20 min-h-[520px] sm:min-h-[520px] lg:min-h-[580px] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(/banner1.jpg)',
          }}
        />
        <div className="absolute inset-0 bg-black/45" aria-hidden />
        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-center mb-2 uppercase tracking-wide !text-white drop-shadow-md">
            Find tours & activities
          </h1>
          <p className="!text-white/95 text-center text-sm sm:text-base mb-8 drop-shadow-md [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
            Search by tour name or location, or filter by country.
          </p>
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 flex justify-center">
            <button
              type="button"
              onClick={goToPackagesWithFilters}
              className="inline-flex items-center gap-2 px-8 py-3 bg-finland text-white font-medium rounded-lg hover:bg-finland-dark transition-colors"
            >
              <Search className="w-5 h-5" />
              Search
            </button>
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/packages');
                onNavigate?.('packages');
              }}
              className="px-6 py-2.5 rounded-lg border-2 border-white text-white font-medium hover:bg-white hover:text-gray-900 transition-colors"
            >
              ALL TOURS
            </button>
          </div>
        </div>
      </section>

      {/* Trust strip (GetYourGuide-style) */}
      <section className="py-4 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 sm:gap-10 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-semibold text-xs">✓</span>
              Free cancellation
            </span>
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-finland/10 flex items-center justify-center text-finland font-semibold text-xs">$</span>
              Best price guarantee
            </span>
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-semibold text-xs">★</span>
              Verified reviews
            </span>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="py-8 sm:py-10 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 uppercase tracking-wide">
            {hasActiveFilter
              ? filteredListings.length === 0
                ? 'No tours match your search'
                : `Tours & activities (${filteredListings.length})`
              : 'Tours & activities'}
          </h2>

          {allListings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-500 mb-6">No tours listed yet.</p>
              <a
                href="/supplier"
                className="inline-flex items-center gap-2 bg-finland text-white font-semibold px-6 py-3 rounded-xl hover:bg-finland-dark transition-colors"
              >
                List your tour
              </a>
            </div>
          ) : !hasActiveFilter ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-600 mb-2">Use the search bar above to find tours.</p>
              <p className="text-sm text-gray-500">
                Try a keyword like &quot;Northern Lights&quot; or &quot;Rome Vespa&quot;, or pick a country.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedListings.map((tour) => (
                  <div
                    key={tour.id}
                    onClick={() => onTourSelect(tour)}
                    className="stagger-item listing-card bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group"
                  >
                    <div className="relative h-44 overflow-hidden">
                      <img
                        src={tour.image}
                        alt={tour.title}
                        className="listing-card-image w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        {tour.tags?.includes('bestseller') && (
                          <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">Bestseller</span>
                        )}
                        {tour.tags?.includes('free-cancellation') && (
                          <span className="bg-white/95 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-md shadow-sm">Free cancellation</span>
                        )}
                      </div>
                      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-0.5">
                        {(() => {
                          const { price, originalPrice, label } = getDisplayPrice(tour.id, tour.price.startingFrom, discountsByListing);
                          const hasDiscount = label && price < originalPrice;
                          return (
                            <div className="bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                              {hasDiscount ? (
                                <>
                                  <span>From ${price.toFixed(0)}</span>
                                  <span className="block text-xs font-normal text-white/90">{label} · was ${originalPrice}</span>
                                </>
                              ) : (
                                `From $${originalPrice}`
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-finland transition-colors duration-200">
                        {tour.title}
                      </h3>
                      {(tour.destination || tour.city) && (
                        <div className="flex items-center text-gray-500 text-sm mt-1">
                          <MapPin className="w-3.5 h-3.5 mr-1 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{tour.city ?? tour.destination}</span>
                        </div>
                      )}
                      <div className="mt-2">
                        <ListingCardRating tour={tour} aggregate={reviewAggregates.get(tour.id)} />
                      </div>
                      {tour.tags && tour.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {tour.tags.filter((t) => t !== 'free-cancellation' && t !== 'bestseller').slice(0, 3).map((tagId) => (
                            <span key={tagId} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {TAG_LABELS[tagId] ?? tagId}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-finland font-medium mt-3 flex items-center text-sm">
                        View details <ArrowRight className="w-4 h-4 ml-1" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {hasMore && (
                <div className="mt-8 text-center">
                  <button
                    onClick={goToPackagesWithFilters}
                    className="inline-flex items-center gap-2 text-finland font-semibold hover:text-finland-dark transition-colors"
                  >
                    View all {filteredListings.length} results <ArrowRight className="w-4 h-4" />
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
