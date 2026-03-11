import { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Star, Clock, ChevronDown } from 'lucide-react';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';
import { useTranslation } from '../contexts/TranslationContext';

type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration';

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Packages({ onTourSelect }: PackagesProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [priceRange, setPriceRange] = useState('all');

  useEffect(() => {
    const searchCriteria = sessionStorage.getItem('searchCriteria');
    if (searchCriteria) {
      try {
        const criteria = JSON.parse(searchCriteria);
        if (criteria.destination) {
          setSearchTerm(criteria.destination);
        }
        sessionStorage.removeItem('searchCriteria');
      } catch (error) {
        console.error('Error parsing search criteria:', error);
      }
    }
  }, []);

  const filteredPackages = useMemo(() => {
    let list = tourPackages.filter(tour => {
      const matchesSearch = !searchTerm ||
        tour.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tour.destination.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCountry = selectedCountry === 'all' ||
        tour.destination.toLowerCase().includes(selectedCountry.toLowerCase());
      let matchesPrice = true;
      if (priceRange === 'under500') matchesPrice = tour.price.startingFrom < 500;
      else if (priceRange === '500-1000') matchesPrice = tour.price.startingFrom >= 500 && tour.price.startingFrom <= 1000;
      else if (priceRange === '1000-2000') matchesPrice = tour.price.startingFrom > 1000 && tour.price.startingFrom <= 2000;
      else if (priceRange === '2000plus') matchesPrice = tour.price.startingFrom > 2000;
      return matchesSearch && matchesCountry && matchesPrice;
    });

    if (sortBy === 'price-asc') list = [...list].sort((a, b) => a.price.startingFrom - b.price.startingFrom);
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => b.price.startingFrom - a.price.startingFrom);
    else if (sortBy === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'duration') list = [...list].sort((a, b) => {
      const daysA = parseInt(a.duration, 10) || 0;
      const daysB = parseInt(b.duration, 10) || 0;
      return daysA - daysB;
    });

    return list;
  }, [searchTerm, selectedCountry, priceRange, sortBy]);

  const handleTourSelect = (tour: TourPackage) => {
    if (onTourSelect) onTourSelect(tour);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24">
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Tours & Activities
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
              Book the best tours, day trips and experiences. Free cancellation on most tours.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Instant confirmation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Free cancellation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                <span>Best price guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters bar - GetYourGuide/TripAdvisor style */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tours or destinations..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
            >
              <option value="all">All destinations</option>
              <option value="vietnam">Vietnam</option>
              <option value="thailand">Thailand</option>
              <option value="cambodia">Cambodia</option>
            </select>
            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
            >
              <option value="all">Any price</option>
              <option value="under500">Under $500</option>
              <option value="500-1000">$500 – $1,000</option>
              <option value="1000-2000">$1,000 – $2,000</option>
              <option value="2000plus">$2,000+</option>
            </select>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Rating</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
        </div>

        <p className="text-gray-600 mb-6">
          <strong>{filteredPackages.length}</strong> {filteredPackages.length === 1 ? 'tour' : 'tours'} found
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((tour) => (
            <div
              key={tour.id}
              onClick={() => handleTourSelect(tour)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:border-sky-100 transition-all duration-200 cursor-pointer group"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={tour.image}
                  alt={tour.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 left-3 flex gap-2">
                  {tour.isPopular && (
                    <span className="bg-amber-500 text-white text-xs font-medium px-2 py-1 rounded">
                      Popular
                    </span>
                  )}
                  <span className="bg-white/95 text-gray-800 text-xs font-medium px-2 py-1 rounded">
                    Free cancellation
                  </span>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/70 text-white text-sm font-semibold px-2 py-1 rounded">
                  From ${tour.price.startingFrom}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-sky-600 transition-colors">
                  {tour.title}
                </h3>
                <div className="flex items-center text-gray-500 text-sm mb-2">
                  <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                  <span className="truncate">{tour.destination}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
                  <span className="flex items-center">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 mr-0.5" />
                    <strong className="text-gray-900">{tour.rating}</strong>
                    <span className="ml-1">({tour.reviews})</span>
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-0.5" />
                    {tour.duration}
                  </span>
                </div>
                <div className="text-lg font-bold text-sky-600">
                  From ${tour.price.startingFrom} <span className="text-sm font-normal text-gray-500">per person</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredPackages.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
            <p className="text-gray-600">Try changing your filters or search term</p>
          </div>
        )}
      </div>
    </div>
  );
}