import { useState } from 'react';
import { Filter, Search, MapPin, Calendar, Users, Star, GitCompare, Grid, List, DollarSign, TrendingUp } from 'lucide-react';
import PackageCard from '../components/PackageCard';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryInput from '../components/ui/LuxuryInput';
import TourComparison from '../components/TourComparison';
import AIRecommendations from '../components/AIRecommendations';
import DynamicPricing from '../components/DynamicPricing';
import PriceComparison from '../components/PriceComparison';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';
import { useTranslation } from '../contexts/TranslationContext';
import { TOUR_PACKAGES } from '../utils/pricing';

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Packages({ onTourSelect, onNavigate }: PackagesProps) {
  const { t } = useTranslation();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTourType, setSelectedTourType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showComparison, setShowComparison] = useState(false);
  const [selectedTours, setSelectedTours] = useState<TourPackage[]>([]);
  const [showAIRecommendations, setShowAIRecommendations] = useState(false);
  const [showDynamicPricing, setShowDynamicPricing] = useState(false);
  const [showPriceComparison, setShowPriceComparison] = useState(false);
  const [selectedTourForPricing, setSelectedTourForPricing] = useState<TourPackage | null>(null);

  // Convert tour packages to package card format
  const packages = tourPackages.map(tour => ({
    title: tour.title,
    destination: tour.destination,
    duration: tour.duration,
    groupSize: tour.groupSize,
    price: `$${tour.price.twin}`,
    image: tour.image,
    description: tour.description,
    region: tour.destination.toLowerCase().includes('vietnam') ? 'asia' : 
            tour.destination.toLowerCase().includes('thailand') ? 'asia' : 'asia',
    priceValue: tour.price.twin,
    rating: tour.rating,
    reviews: tour.reviews,
    isPopular: tour.isPopular,
    discount: tour.discount,
    tourType: tour.tourType,
  }));

  const filteredPackages = packages.filter((pkg) => {
    const regionMatch = selectedRegion === 'all' || pkg.region === selectedRegion;
    const searchMatch = searchTerm === '' || 
      pkg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    let priceMatch = true;
    if (priceRange === 'low') {
      priceMatch = pkg.priceValue < 1700;
    } else if (priceRange === 'medium') {
      priceMatch = pkg.priceValue >= 1700 && pkg.priceValue < 2300;
    } else if (priceRange === 'high') {
      priceMatch = pkg.priceValue >= 2300;
    }

    const categoryMatch = selectedCategory === 'all' || 
      (selectedCategory === 'popular' && pkg.isPopular) ||
      (selectedCategory === 'discounted' && pkg.discount);

    const tourTypeMatch = selectedTourType === 'all' || pkg.tourType === selectedTourType;

    return regionMatch && priceMatch && searchMatch && categoryMatch && tourTypeMatch;
  });

  return (
    <div className="min-h-screen bg-white pt-20">
      <section className="relative h-96 flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
            <div className="mb-6 animate-fade-in-up">
              <span className="inline-block px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium mb-4 border border-white/20">
                {t.packages.hero.badge}
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-white mb-6 animate-fade-in-up stagger-1">
              <span className="bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">
                {t.packages.hero.title.split(' ')[0]}
              </span>
              <br />
              <span className="bg-gradient-to-r from-sky-300 to-blue-300 bg-clip-text text-transparent">
                {t.packages.hero.title.split(' ')[1]}
              </span>
            </h1>
            <p className="text-xl text-white/90 leading-relaxed animate-fade-in-up stagger-2">
              {t.packages.hero.subtitle}
            </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-gray-50 via-white to-sky-50 rounded-2xl p-8 mb-12 shadow-lg">
            <div className="flex items-center mb-6">
              <Filter className="text-sky-500 mr-3" size={24} />
              <h3 className="text-xl font-bold text-gray-900">Filter & Search Packages</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Search */}
              <div className="lg:col-span-2">
                <LuxuryInput
                  type="search"
                  placeholder="Search destinations, tours, or keywords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  icon={<Search size={20} />}
                  onClear={() => setSearchTerm('')}
                />
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Region</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                >
                  <option value="all">All Regions</option>
                  <option value="asia">Asia</option>
                  <option value="europe">Europe</option>
                  <option value="oceania">Oceania</option>
                </select>
              </div>

              {/* Price Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
                <select
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                >
                  <option value="all">All Prices</option>
                  <option value="low">Under $1,700</option>
                  <option value="medium">$1,700 - $2,300</option>
                  <option value="high">Over $2,300</option>
                </select>
              </div>
            </div>

            {/* Category Filters */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Special Categories</label>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedCategory === 'all'
                      ? 'bg-sky-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Packages
                </button>
                <button
                  onClick={() => setSelectedCategory('popular')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedCategory === 'popular'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🔥 Popular
                </button>
                <button
                  onClick={() => setSelectedCategory('discounted')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedCategory === 'discounted'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  💰 Discounted
                </button>
              </div>
            </div>

            {/* Tour Type Filters */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Tour Types</label>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setSelectedTourType('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setSelectedTourType('beach')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'beach'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🏖️ Beach Holidays
                </button>
                <button
                  onClick={() => setSelectedTourType('adventure')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'adventure'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🧗 Adventure Tours
                </button>
                <button
                  onClick={() => setSelectedTourType('cultural')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'cultural'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🏛️ Cultural Experiences
                </button>
                <button
                  onClick={() => setSelectedTourType('city')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'city'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🏙️ City Breaks
                </button>
                <button
                  onClick={() => setSelectedTourType('luxury')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedTourType === 'luxury'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ⭐ Luxury Packages
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <p className="text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredPackages.length}</span> package{filteredPackages.length !== 1 ? 's' : ''}
              </p>
              {selectedTours.length > 0 && (
                <span className="bg-sky-100 text-sky-600 px-3 py-1 rounded-full text-sm font-medium">
                  {selectedTours.length} selected for comparison
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors duration-200 ${
                    viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-50'
                  }`}
                >
                  <Grid size={18} className={viewMode === 'grid' ? 'text-sky-600' : 'text-gray-500'} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors duration-200 ${
                    viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-50'
                  }`}
                >
                  <List size={18} className={viewMode === 'list' ? 'text-sky-600' : 'text-gray-500'} />
                </button>
              </div>

              {/* Dynamic Pricing Button */}
              <LuxuryButton
                variant="gradient"
                size="md"
                onClick={() => setShowDynamicPricing(!showDynamicPricing)}
                className="group"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                <span>Dynamic Pricing</span>
              </LuxuryButton>

              {/* Price Comparison Button */}
              <LuxuryButton
                variant="outline"
                size="md"
                onClick={() => setShowPriceComparison(!showPriceComparison)}
                className="group"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                <span>Price Comparison</span>
              </LuxuryButton>

              {/* AI Recommendations Button */}
              <LuxuryButton
                variant="gradient"
                size="md"
                onClick={() => setShowAIRecommendations(!showAIRecommendations)}
                className="group"
              >
                <span className="mr-2">🤖</span>
                <span>AI Recommendations</span>
              </LuxuryButton>

              {/* Compare Button */}
              <LuxuryButton
                variant="outline"
                size="md"
                onClick={() => setShowComparison(true)}
                disabled={selectedTours.length === 0}
                className="group"
              >
                <GitCompare size={18} className="mr-2" />
                <span>Compare ({selectedTours.length})</span>
              </LuxuryButton>
            </div>
          </div>

              <div className={`grid gap-8 ${
                viewMode === 'grid' 
                  ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
                  : 'grid-cols-1'
              }`}>
                {filteredPackages.map((pkg, index) => {
                  const tour = tourPackages.find(t => t.title === pkg.title);
                  return (
                    <PackageCard 
                      key={index} 
                      {...pkg} 
                      onSelect={(selected) => {
                        if (selected) {
                          if (tour && !selectedTours.find(t => t.id === tour.id)) {
                            setSelectedTours([...selectedTours, tour]);
                          }
                        } else {
                          if (tour) {
                            setSelectedTours(selectedTours.filter(t => t.id !== tour.id));
                          }
                        }
                      }}
                      isSelected={selectedTours.some(t => t.title === pkg.title)}
                      viewMode={viewMode}
                      onViewDetails={() => {
                        if (tour && onNavigate) {
                          // Map tour IDs to page names
                          const tourPageMap: { [key: string]: string } = {
                            'vietnam-southern-9-days': 'vietnam-9-day',
                            'vietnam-complete-12-days': 'vietnam-12-day',
                            'thailand-10-days': 'thailand-10-day',
                            'cambodia-10-days': 'cambodia-10-day',
                            'indochina-14-days': 'indochina-14-day',
                            'thailand-vietnam-14-day': 'thailand-vietnam-14-day'
                          };
                          
                          const pageName = tourPageMap[tour.id];
                          if (pageName) {
                            onNavigate(pageName);
                          }
                        }
                      }}
                      tourId={tour?.id}
                      tourPackage={tour ? TOUR_PACKAGES.find(tp => tp.id === tour.id) : undefined}
                      showDynamicPricing={true}
                    />
                  );
                })}
              </div>

          {filteredPackages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No packages found matching your filters.</p>
              <button
                onClick={() => {
                  setSelectedRegion('all');
                  setPriceRange('all');
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setSelectedTourType('all');
                }}
                className="mt-4 text-sky-500 hover:text-sky-600 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </section>

          {/* Dynamic Pricing Section */}
          {showDynamicPricing && selectedTourForPricing && (
            <div className="mt-12">
              <DynamicPricing 
                tour={selectedTourForPricing} 
                onPriceSelect={(price) => {
                  // Handle price selection
                  console.log('Selected price:', price);
                }}
              />
            </div>
          )}

          {/* Price Comparison Section */}
          {showPriceComparison && (
            <div className="mt-12">
              <PriceComparison 
                tours={TOUR_PACKAGES}
                onTourSelect={(tour, price) => {
                  setSelectedTourForPricing(tour);
                  setShowDynamicPricing(true);
                  setShowPriceComparison(false);
                }}
              />
            </div>
          )}

          {/* AI Recommendations Section */}
          {showAIRecommendations && (
            <div className="mt-12">
              <AIRecommendations onTourSelect={onTourSelect} />
            </div>
          )}

          {/* Tour Comparison Modal */}
          {showComparison && (
            <TourComparison
              tours={selectedTours}
              onClose={() => setShowComparison(false)}
            />
          )}
    </div>
  );
}
