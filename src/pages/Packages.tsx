import { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Star, Clock, SlidersHorizontal, ChevronDown, Globe, PlusCircle, Filter, X } from 'lucide-react';
import { getAllListings, getAllListingsAsync, SHOW_SEED_LISTINGS, durationToMinutes } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import { tourPackages } from '../data/tours';
import { activities, TAG_OPTIONS, getDestinationsFromListings, SEED_DESTINATION_OPTIONS } from '../data/activities';
import { TourPackage } from '../types/tour';

type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration';

const PRICE_CHIPS = [
  { id: 'all', label: 'Any price' },
  { id: 'under100', label: 'Under $100' },
  { id: '100-500', label: '$100 – $500' },
  { id: '500-1000', label: '$500 – $1k' },
  { id: '1000plus', label: '$1k+' },
] as const;

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

type DestOption = { id: string; label: string; type: 'world' | 'region' | 'city' };

function matchesDestination(tour: TourPackage, destId: string, destinationOptions: DestOption[]): boolean {
  if (destId === 'all') return true;
  const opt = destinationOptions.find(d => d.id === destId);
  if (!opt) return true;
  if (opt.type === 'region') return (tour.country?.toLowerCase() ?? '') === opt.label.toLowerCase();
  if (opt.type === 'city') {
    const cityNorm = (tour.city ?? '').toLowerCase().replace(/\s+/g, '-');
    const idNorm = destId.toLowerCase().replace(/\s+/g, '-');
    return cityNorm === idNorm || (tour.city?.toLowerCase() ?? '') === opt.label.toLowerCase();
  }
  return true;
}

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

function parsePackagesSearchParams(search: string): {
  searchTerm: string;
  destination: string;
  tags: string[];
  sort: SortOption;
  price: string;
} {
  const params = new URLSearchParams(search);
  const tagsParam = params.get('tags');
  return {
    searchTerm: params.get('q') ?? '',
    destination: params.get('destination') ?? 'all',
    tags: tagsParam ? tagsParam.split(',').filter(Boolean) : [],
    sort: (params.get('sort') as SortOption) ?? 'recommended',
    price: params.get('price') ?? 'all',
  };
}

function buildPackagesSearchParams(state: {
  searchTerm: string;
  selectedDestination: string;
  selectedTags: string[];
  sortBy: SortOption;
  priceRange: string;
}): string {
  const p = new URLSearchParams();
  if (state.searchTerm) p.set('q', state.searchTerm);
  if (state.selectedDestination !== 'all') p.set('destination', state.selectedDestination);
  if (state.selectedTags.length) p.set('tags', state.selectedTags.join(','));
  if (state.sortBy !== 'recommended') p.set('sort', state.sortBy);
  if (state.priceRange !== 'all') p.set('price', state.priceRange);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function Packages({ onTourSelect }: PackagesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [priceRange, setPriceRange] = useState('all');
  const [showHolidayPackages, setShowHolidayPackages] = useState(false);
  const [filterBarSticky, setFilterBarSticky] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [supplierListings, setSupplierListings] = useState<TourPackage[] | null>(null);

  // Load supplier listings from Supabase when configured
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false }).then(setSupplierListings);
  }, []);

  // Read URL on mount and when navigating to packages
  useEffect(() => {
    const search = window.location.search;
    const parsed = parsePackagesSearchParams(search);
    setSearchTerm(parsed.searchTerm);
    setSelectedDestination(parsed.destination);
    setSelectedTags(parsed.tags);
    setSortBy(parsed.sort);
    setPriceRange(parsed.price);
  }, []);

  // Sync from sessionStorage (hero search)
  useEffect(() => {
    const searchCriteria = sessionStorage.getItem('searchCriteria');
    if (searchCriteria) {
      try {
        const criteria = JSON.parse(searchCriteria);
        if (criteria.destination) {
          setSearchTerm(criteria.destination);
          const lower = criteria.destination.toLowerCase();
          if (lower.includes('hanoi')) setSelectedDestination('hanoi');
          else if (lower.includes('ho chi minh') || lower.includes('saigon')) setSelectedDestination('ho-chi-minh-city');
          else if (lower.includes('bangkok')) setSelectedDestination('bangkok');
          else if (lower.includes('vietnam')) setSelectedDestination('vietnam');
          else if (lower.includes('thailand')) setSelectedDestination('thailand');
          else if (lower.includes('cambodia')) setSelectedDestination('cambodia');
        }
        sessionStorage.removeItem('searchCriteria');
      } catch (error) {
        console.error('Error parsing search criteria:', error);
      }
    }
  }, []);

  // Write URL when filters change (shareable links)
  useEffect(() => {
    const query = buildPackagesSearchParams({
      searchTerm,
      selectedDestination,
      selectedTags,
      sortBy,
      priceRange,
    });
    const newUrl = `${window.location.pathname}${query}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchTerm, selectedDestination, selectedTags, sortBy, priceRange]);

  useEffect(() => {
    const onScroll = () => setFilterBarSticky(window.scrollY > 280);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : [...getAllListings({ includeSeed: false, includeHolidayPackages: false })];
    if (SHOW_SEED_LISTINGS) base.push(...activities);
    if (showHolidayPackages) base.push(...tourPackages);
    return base;
  }, [supplierListings, showHolidayPackages]);

  const destinationOptions = useMemo(() => {
    return SHOW_SEED_LISTINGS ? SEED_DESTINATION_OPTIONS : getDestinationsFromListings(allListings);
  }, [allListings]);

  const filteredPackages = useMemo(() => {
    let list = allListings.filter(tour => {
      const matchesSearch = !searchTerm ||
        tour.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tour.destination && tour.destination.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tour.city && tour.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tour.country && tour.country.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDest = matchesDestination(tour, selectedDestination, destinationOptions);
      const matchesTag = selectedTags.length === 0 ||
        (tour.tags && selectedTags.every(tagId => tour.tags!.includes(tagId)));
      let matchesPrice = true;
      if (priceRange === 'under100') matchesPrice = tour.price.startingFrom < 100;
      else if (priceRange === '100-500') matchesPrice = tour.price.startingFrom >= 100 && tour.price.startingFrom < 500;
      else if (priceRange === '500-1000') matchesPrice = tour.price.startingFrom >= 500 && tour.price.startingFrom <= 1000;
      else if (priceRange === '1000plus') matchesPrice = tour.price.startingFrom > 1000;
      return matchesSearch && matchesDest && matchesTag && matchesPrice;
    });

    if (sortBy === 'price-asc') list = [...list].sort((a, b) => a.price.startingFrom - b.price.startingFrom);
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => b.price.startingFrom - a.price.startingFrom);
    else if (sortBy === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'duration') list = [...list].sort((a, b) => durationToMinutes(a.duration) - durationToMinutes(b.duration));
    return list;
  }, [allListings, destinationOptions, searchTerm, selectedDestination, selectedTags, priceRange, sortBy]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleTourSelect = (tour: TourPackage) => {
    analytics.listingClick(tour.id, tour.title);
    if (onTourSelect) onTourSelect(tour);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      {/* Simple page header - TripAdvisor/GetYourGuide style */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-1">
            Tours & activities
          </h1>
          <p className="text-gray-600">
            {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'} · Free cancellation on most
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sticky filter bar - GYG/Airbnb style */}
        <div
          className={`mb-6 transition-all duration-200 ${
            filterBarSticky
              ? 'sticky top-20 z-30 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-lg py-4 px-4'
              : 'bg-white border border-gray-200 rounded-xl py-4 px-4'
          }`}
        >
          {/* Search row */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tours or destinations..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland transition-all text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              <span className="text-sm text-gray-500 whitespace-nowrap hidden sm:block">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm font-medium text-gray-700"
              >
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Top rated</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>

          {/* Filter chips - destination, tags, price (hidden on mobile; use Filters drawer) */}
          <div className="hidden lg:flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Destination
            </span>
            {destinationOptions.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSelectedDestination(chip.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  selectedDestination === chip.id
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Tags</span>
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  selectedTags.includes(tag.id)
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tag.label}
              </button>
            ))}
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Price</span>
            {PRICE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setPriceRange(chip.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  priceRange === chip.id
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {/* Mobile filter drawer */}
          {mobileFiltersOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFiltersOpen(false)} aria-hidden />
              <div className="relative w-full max-w-sm bg-white shadow-xl flex flex-col ml-auto">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Filters</h3>
                  <button type="button" onClick={() => setMobileFiltersOpen(false)} className="p-2 text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Destination</p>
                    <div className="flex flex-wrap gap-2">
                      {destinationOptions.map((chip) => (
                        <button
                          key={chip.id}
                          onClick={() => setSelectedDestination(chip.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            selectedDestination === chip.id ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {TAG_OPTIONS.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            selectedTags.includes(tag.id) ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Price</p>
                    <div className="flex flex-wrap gap-2">
                      {PRICE_CHIPS.map((chip) => (
                        <button
                          key={chip.id}
                          onClick={() => setPriceRange(chip.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            priceRange === chip.id ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="w-full py-3 rounded-lg bg-finland text-white font-semibold"
                  >
                    Show {filteredPackages.length} results
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Holiday / multi-day packages hidden from UI for now */}
        </div>

        {/* Recommended - GYG style (only when we have listings) */}
        {SHOW_SEED_LISTINGS && selectedDestination === 'all' && selectedTags.length === 0 && !searchTerm && allListings.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended for you</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {allListings
                .filter(a => a.isPopular)
                .slice(0, 4)
                .map((tour) => (
                  <div
                    key={tour.id}
                    onClick={() => handleTourSelect(tour)}
                    className="stagger-item listing-card bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group"
                  >
                    <div className="relative h-44 overflow-hidden">
                      <img src={tour.image} alt={tour.title} className="listing-card-image w-full h-full object-cover" />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        {tour.tags?.includes('bestseller') && (
                          <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">Bestseller</span>
                        )}
                      </div>
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                        From ${tour.price.startingFrom}
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2 group-hover:text-finland transition-colors">{tour.title}</h3>
                      <div className="flex items-center text-gray-500 text-xs">
                        <Star className="w-3.5 h-3.5 text-finland fill-finland mr-0.5" />
                        <strong>{tour.rating}</strong>
                        <span className="ml-0.5">({tour.reviews})</span>
                        <span className="mx-1 text-gray-300">·</span>
                        <Clock className="w-3 h-3 mr-0.5 text-gray-400" />
                        {tour.duration}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Listing grid - only when we have listings */}
        {allListings.length > 0 && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedDestination !== 'all' || selectedTags.length > 0 || searchTerm ? 'Results' : 'All tours & activities'}
            </h2>
            {filteredPackages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPackages.map((tour, index) => (
            <div
              key={tour.id}
              onClick={() => handleTourSelect(tour)}
              className="stagger-item listing-card bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group"
            >
              <div className="relative h-52 overflow-hidden">
                <img
                  src={tour.image}
                  alt={tour.title}
                  className="listing-card-image w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  {tour.isPopular && (
                    <span className="bg-finland text-white text-xs font-semibold px-2.5 py-1 rounded-md">
                      Popular
                    </span>
                  )}
                  {tour.tags?.includes('free-cancellation') && (
                    <span className="bg-white/95 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-md shadow-sm">
                      Free cancellation
                    </span>
                  )}
                  {tour.tags?.includes('bestseller') && (
                    <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">
                      Bestseller
                    </span>
                  )}
                </div>
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                  From ${tour.price.startingFrom}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1.5 line-clamp-2 group-hover:text-finland transition-colors duration-200">
                  {tour.title}
                </h3>
                <div className="flex items-center text-gray-500 text-sm mb-2">
                  <MapPin className="w-4 h-4 mr-1 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{tour.destination}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center text-gray-600">
                    <Star className="w-4 h-4 text-finland fill-finland mr-0.5" />
                    <strong className="text-gray-900">{tour.rating}</strong>
                    <span className="ml-1">({tour.reviews})</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <Clock className="w-3.5 h-3.5 mr-0.5 text-gray-400" />
                    {tour.duration}
                  </span>
                </div>
                {tour.tags && tour.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tour.tags.filter(t => t !== 'free-cancellation' && t !== 'bestseller').map(tagId => (
                      <span key={tagId} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {TAG_LABELS[tagId] ?? tagId}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-lg font-bold text-finland">From ${tour.price.startingFrom}</span>
                  <span className="text-sm text-gray-500 ml-1">/ person</span>
                </div>
              </div>
            </div>
          ))}
        </div>
            ) : (
              <div className="text-center py-20">
                <Search className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
                <p className="text-gray-500">Try different filters or search terms</p>
              </div>
            )}
          </>
        )}

        {isSupabaseConfigured() && supplierListings === null ? (
          <div className="text-center py-20 text-gray-500">Loading tours…</div>
        ) : allListings.length === 0 && (
          <div className="text-center py-20 px-4">
            <Globe className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Tours & activities · worldwide</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              No tours listed yet. List your first tour and reach travelers everywhere.
            </p>
            <a
              href="/supplier"
              className="inline-flex items-center gap-2 bg-finland text-white font-semibold px-6 py-3 rounded-xl hover:bg-finland-dark transition-colors"
            >
              <PlusCircle className="w-5 h-5" />
              List your tour
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
