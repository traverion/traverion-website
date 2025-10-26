import { useState, useEffect } from 'react';
import { Filter, Search, MapPin, Calendar, Users, Star, GitCompare, Grid, List, DollarSign, TrendingUp, SlidersHorizontal } from 'lucide-react';
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Load search criteria from hero search
  useEffect(() => {
    const searchCriteria = sessionStorage.getItem('searchCriteria');
    if (searchCriteria) {
      try {
        const criteria = JSON.parse(searchCriteria);
        // Apply search criteria to filters
        if (criteria.destination) {
          setSearchTerm(criteria.destination);
        }
        if (criteria.duration) {
          // Map duration to price range
          const duration = parseInt(criteria.duration);
          if (duration <= 7) {
            setPriceRange('low');
          } else if (duration <= 14) {
            setPriceRange('medium');
          } else {
            setPriceRange('high');
          }
        }
        // Clear the stored search criteria after applying
        sessionStorage.removeItem('searchCriteria');
      } catch (error) {
        console.error('Error parsing search criteria:', error);
      }
    }
  }, []);

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
    <div className="min-h-screen bg-gray-50 pt-20">
      {/* Header Section */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Holiday Packages
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover our premium travel packages to Southeast Asia
            </p>
          </div>
        </div>
      </section>

      {/* Main Content - Two Column Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Sidebar - Search & Filters */}
          <div className="lg:w-1/4">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-24">
              {/* Mobile Filter Toggle */}
              <div className="lg:hidden mb-6">
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                  <span>{showMobileFilters ? 'Hide Filters' : 'Show Filters'}</span>
                </button>
              </div>

              {/* Filter Content */}
              <div className={`${showMobileFilters ? 'block' : 'hidden'} lg:block`}>
                <div className="flex items-center mb-6">
                  <Filter className="text-blue-600 mr-3" size={24} />
                  <h3 className="text-xl font-bold text-gray-900">Search & Filters</h3>
                </div>

                {/* Search */}
                <div className="mb-6">
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
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Region Filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Region
                  </label>
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Regions</option>
                    <option value="asia">Southeast Asia</option>
                    <option value="europe">Europe</option>
                    <option value="america">America</option>
                  </select>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price Range
                  </label>
                  <select
                    value={priceRange}
                    onChange={(e) => setPriceRange(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Prices</option>
                    <option value="low">Under $1,700</option>
                    <option value="medium">$1,700 - $2,300</option>
                    <option value="high">Over $2,300</option>
                  </select>
                </div>

                {/* Category */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="popular">Popular</option>
                    <option value="discounted">Discounted</option>
                  </select>
                </div>

                {/* Tour Type */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tour Type
                  </label>
                  <select
                    value={selectedTourType}
                    onChange={(e) => setSelectedTourType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="luxury">Luxury</option>
                    <option value="beach">Beach</option>
                    <option value="culture">Culture</option>
                    <option value="nature">Nature</option>
                  </select>
                </div>

                {/* Clear Filters */}
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedRegion('all');
                    setPriceRange('all');
                    setSelectedCategory('all');
                    setSelectedTourType('all');
                  }}
                  className="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Tour Packages */}
          <div className="lg:w-3/4">
            {/* Results Header */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="mb-4 sm:mb-0">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {filteredPackages.length} Tours Found
                  </h2>
                  <p className="text-gray-600">
                    {searchTerm && `Search results for "${searchTerm}"`}
                  </p>
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* View Mode Toggle */}
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-md transition-colors ${
                        viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                      }`}
                    >
                      <Grid className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-md transition-colors ${
                        viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                      }`}
                    >
                      <List className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Comparison Button */}
                  {selectedTours.length > 0 && (
                    <LuxuryButton
                      variant="outline"
                      onClick={() => setShowComparison(true)}
                      className="flex items-center space-x-2"
                    >
                      <GitCompare className="w-4 h-4" />
                      <span>Compare ({selectedTours.length})</span>
                    </LuxuryButton>
                  )}
                </div>
              </div>
            </div>

            {/* Tour Packages Grid */}
            {filteredPackages.length > 0 ? (
              <div className={`grid gap-6 ${
                viewMode === 'grid' 
                  ? 'grid-cols-1 md:grid-cols-2' 
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
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <Search className="w-16 h-16 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your search criteria or filters to find more tours.
                </p>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedRegion('all');
                    setPriceRange('all');
                    setSelectedCategory('all');
                    setSelectedTourType('all');
                  }}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showComparison && (
        <TourComparison
          tours={selectedTours}
          onClose={() => setShowComparison(false)}
          onTourSelect={onTourSelect}
        />
      )}

      {showAIRecommendations && (
        <AIRecommendations
          onClose={() => setShowAIRecommendations(false)}
          onTourSelect={onTourSelect}
        />
      )}

      {showDynamicPricing && selectedTourForPricing && (
        <DynamicPricing
          tour={selectedTourForPricing}
          onClose={() => {
            setShowDynamicPricing(false);
            setSelectedTourForPricing(null);
          }}
        />
      )}

      {showPriceComparison && (
        <PriceComparison
          onClose={() => setShowPriceComparison(false)}
        />
      )}
    </div>
  );
}