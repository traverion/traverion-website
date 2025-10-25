import { useState } from 'react';
import { Star, MapPin, Clock, Users } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import { tourPackages } from '../data/tours';
import { useTranslation } from '../contexts/TranslationContext';

interface FeaturedDestinationsProps {
  onTourSelect?: (tour: any) => void;
  onNavigate?: (page: string) => void;
}

export default function FeaturedDestinations({ onTourSelect, onNavigate }: FeaturedDestinationsProps) {
  const { t } = useTranslation();
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filters = [
    { id: 'all', label: t.destinations.filters.all },
    { id: 'vietnam', label: t.destinations.filters.vietnam },
    { id: 'thailand', label: t.destinations.filters.thailand },
    { id: 'cambodia', label: t.destinations.filters.cambodia },
    { id: 'indochina', label: t.destinations.filters.indochina }
  ];

  const filteredDestinations = tourPackages.filter(tour => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'vietnam') return tour.destination.toLowerCase().includes('vietnam');
    if (selectedFilter === 'thailand') return tour.destination.toLowerCase().includes('thailand');
    if (selectedFilter === 'cambodia') return tour.destination.toLowerCase().includes('cambodia');
    if (selectedFilter === 'indochina') return tour.destination.toLowerCase().includes('indochina');
    return true;
  });

  return (
    <section className="py-16 bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-gray-900 mb-4">
            {t.destinations.title}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t.destinations.subtitle}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id)}
              className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                selectedFilter === filter.id
                  ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Tour Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredDestinations.map((tour) => (
            <div
              key={tour.id}
              className="bg-white rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-2 transition-all duration-300 overflow-hidden group cursor-pointer"
              onClick={() => {
                if (onNavigate) {
                  // Map tour IDs to page names
                  const tourPageMap: { [key: string]: string } = {
                    'vietnam-southern-9-days': 'vietnam-9-day',
                    'vietnam-complete-12-days': 'vietnam-12-day',
                    'thailand-10-days': 'thailand-10-day',
                    'cambodia-10-days': 'cambodia-10-day',
                    'indochina-14-days': 'indochina-14-day',
                    'thailand-vietnam-14-day': 'thailand-vietnam-14-day'
                  };
                  const pageName = tourPageMap[tour.id] || 'packages';
                  onNavigate(pageName);
                }
              }}
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <img
                  src={tour.image}
                  alt={tour.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {tour.category}
                  </span>
                </div>
                <div className="absolute top-4 right-4">
                  <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                    <Star className="w-4 h-4 text-amber-400 fill-current" />
                    <span className="text-sm font-medium text-gray-700">4.8</span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-slate-600" />
                  <span className="text-sm text-slate-600">{tour.destination}</span>
                </div>

                <h3 className="text-xl font-medium text-gray-900 mb-2 group-hover:text-slate-700 transition-colors">
                  {tour.title}
                </h3>

                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {tour.description}
                </p>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{tour.duration}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>2-10 People</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-2xl font-medium text-slate-700">
                    From €1,299
                  </div>
                  <LuxuryButton
                    variant="outline"
                    size="sm"
                    className="px-4 py-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigate) {
                        const tourPageMap: { [key: string]: string } = {
                          'vietnam-southern-9-days': 'vietnam-9-day',
                          'vietnam-complete-12-days': 'vietnam-12-day',
                          'thailand-10-days': 'thailand-10-day',
                          'cambodia-10-days': 'cambodia-10-day',
                          'indochina-14-days': 'indochina-14-day',
                          'thailand-vietnam-14-day': 'thailand-vietnam-14-day'
                        };
                        const pageName = tourPageMap[tour.id] || 'packages';
                        onNavigate(pageName);
                      }
                    }}
                  >
                    View Details
                  </LuxuryButton>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Results Message */}
        {filteredDestinations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No packages found for the selected filter.</p>
          </div>
        )}

      </div>
    </section>
  );
}
