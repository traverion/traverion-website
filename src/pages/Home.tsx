import { Star, Clock, ArrowRight, MapPin, Search } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings, getAllListingsAsync, SHOW_SEED_LISTINGS } from '../data/listings';
import { getDestinationsFromListings } from '../data/activities';
import { isSupabaseConfigured } from '../lib/supabase';
import { activities } from '../data/activities';
import { TourPackage } from '../types/tour';

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

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false }).then(setSupplierListings);
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

  const displayedListings = filteredListings.slice(0, MAX_RESULTS_HOME);
  const hasMore = filteredListings.length > MAX_RESULTS_HOME;
  const hasActiveFilter = searchTerm.trim() !== '' || countryId !== 'all';

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
      {/* Hero banner: tour image background + search + filter */}
      <section className="relative text-white py-10 sm:py-14 min-h-[320px] flex items-center">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg?auto=compress&cs=tinysrgb&w=1920)`,
          }}
        />
        <div className="absolute inset-0 bg-finland/75" />
        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-center mb-2">
            Find tours & activities
          </h1>
          <p className="text-white/90 text-center text-sm sm:text-base mb-8">
            Search by tour name or location, or filter by country.
          </p>
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tours or location, e.g. Northern Lights, Rome Vespa..."
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-finland focus:border-finland outline-none"
              />
            </div>
            <div className="sm:w-44">
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-finland focus:border-finland outline-none"
              >
                {countryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={goToPackagesWithFilters}
              className="px-6 py-3 bg-finland text-white font-medium rounded-lg hover:bg-finland-dark transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </div>
      </section>

      {/* Popular experiences – 3 hardcoded cards (GetYourGuide-style) */}
      <section className="py-8 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular experiences</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {POPULAR_EXPERIENCES.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => setSearchTerm(exp.searchQuery)}
                className="text-left rounded-xl overflow-hidden border border-gray-200 hover:border-finland hover:shadow-md transition-all duration-200 group"
              >
                <div className="relative h-36 sm:h-40">
                  <img
                    src={exp.image}
                    alt={exp.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <h3 className="font-semibold text-white drop-shadow-sm">{exp.title}</h3>
                    <p className="text-xs text-white/90">{exp.subtitle}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="py-8 sm:py-10 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
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
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                        From ${tour.price.startingFrom}
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
                      <div className="flex items-center text-sm text-gray-600 mt-2">
                        <Star className="w-4 h-4 text-finland fill-finland mr-0.5" />
                        <strong className="text-gray-900">{tour.rating}</strong>
                        <span className="ml-1">({tour.reviews})</span>
                        <span className="mx-1.5 text-gray-300">·</span>
                        <Clock className="w-3.5 h-3.5 mr-0.5" />
                        {tour.duration}
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
