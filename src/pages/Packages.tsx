import { useState, useEffect } from 'react';
import { Search, MapPin, Star } from 'lucide-react';
import PackageCard from '../components/PackageCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';
import { useTranslation } from '../contexts/TranslationContext';

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Packages({ onTourSelect, onNavigate }: PackagesProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');

  // Load search criteria from hero search
  useEffect(() => {
    const searchCriteria = sessionStorage.getItem('searchCriteria');
    if (searchCriteria) {
      try {
        const criteria = JSON.parse(searchCriteria);
        if (criteria.destination) {
          setSearchTerm(criteria.destination);
        }
        // Clear the stored search criteria after applying
        sessionStorage.removeItem('searchCriteria');
      } catch (error) {
        console.error('Error parsing search criteria:', error);
      }
    }
  }, []);

  // Simple filtering logic
  const filteredPackages = tourPackages.filter(tour => {
    const matchesSearch = !searchTerm || 
      tour.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tour.destination.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCountry = selectedCountry === 'all' || 
      tour.destination.toLowerCase().includes(selectedCountry.toLowerCase());

    return matchesSearch && matchesCountry;
  });

  const handleTourSelect = (tour: TourPackage) => {
    if (onTourSelect) {
      onTourSelect(tour);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      {/* Simple Header with Trust Elements */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Our Luxury Tours
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
              Premium Southeast Asia travel experiences starting from $499
            </p>
            
            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>500+ Happy Travelers</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>24h Quote Response</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Premium Service</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>Secure Booking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simple Search & Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Tours
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search destinations..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            {/* Country Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="all">All Countries</option>
                <option value="vietnam">Vietnam</option>
                <option value="thailand">Thailand</option>
                <option value="cambodia">Cambodia</option>
              </select>
            </div>

            {/* Results Count */}
            <div className="flex items-end">
              <div className="w-full bg-gray-50 rounded-lg p-3 text-center">
                <span className="text-sm text-gray-600">
                  {filteredPackages.length} tours found
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tours Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPackages.map((tour) => (
            <div key={tour.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
              {/* Tour Image */}
              <div className="relative h-48 overflow-hidden">
                <img
                  src={tour.image}
                  alt={tour.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 right-4">
                  <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-medium text-gray-900">
                    Starting from ${tour.price.startingFrom}
                  </div>
                </div>
                {tour.isPopular && (
                  <div className="absolute top-4 left-4">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Popular
                    </div>
                  </div>
                )}
              </div>

              {/* Tour Content */}
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                    {tour.title}
                  </h3>
                  <div className="flex items-center text-gray-600 mb-2">
                    <MapPin className="w-4 h-4 mr-1" />
                    <span className="text-sm">{tour.destination}</span>
                  </div>
                  <div className="flex items-center text-gray-600 mb-3">
                    <Star className="w-4 h-4 mr-1 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm">{tour.rating} ({tour.reviews} reviews)</span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-2xl font-bold text-sky-600 mb-1">
                    Starting from ${tour.price.startingFrom} {tour.price.currency}
                  </div>
                  <div className="text-sm text-gray-600">
                    per person • {tour.duration}
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => handleTourSelect(tour)}
                    className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:from-sky-600 hover:to-blue-700 transition-all duration-300"
                  >
                    View Details & Get Quote
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {filteredPackages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
            <p className="text-gray-600">Try adjusting your search criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}