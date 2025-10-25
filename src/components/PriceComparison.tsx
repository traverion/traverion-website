import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Users, Star, CheckCircle, X, Filter, SortAsc, SortDesc } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { 
  calculateDynamicPrice, 
  formatPrice, 
  getPriceSavings, 
  getPriceBadge, 
  getPriceBadgeColor,
  PRICING_TIERS,
  TourPackage,
  DynamicPrice
} from '../utils/pricing';

interface PriceComparisonProps {
  tours: TourPackage[];
  onTourSelect?: (tour: TourPackage, price: DynamicPrice) => void;
  className?: string;
}

type SortOption = 'price-asc' | 'price-desc' | 'duration-asc' | 'duration-desc' | 'savings-desc';
type FilterOption = 'all' | 'deals' | 'luxury' | 'budget';

export default function PriceComparison({ tours, onTourSelect, className = '' }: PriceComparisonProps) {
  const [sortBy, setSortBy] = useState<SortOption>('price-asc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [selectedTier, setSelectedTier] = useState(PRICING_TIERS[1]); // Premium
  const [travelDate, setTravelDate] = useState(new Date());
  const [groupSize, setGroupSize] = useState(2);
  const [showChart, setShowChart] = useState(false);
  const [tourPrices, setTourPrices] = useState<Map<string, DynamicPrice>>(new Map());

  useEffect(() => {
    const prices = new Map<string, DynamicPrice>();
    tours.forEach(tour => {
      const price = calculateDynamicPrice(tour, selectedTier, travelDate, groupSize);
      prices.set(tour.id, price);
    });
    setTourPrices(prices);
  }, [tours, selectedTier, travelDate, groupSize]);

  const filteredAndSortedTours = tours
    .filter(tour => {
      const price = tourPrices.get(tour.id);
      if (!price) return false;

      switch (filterBy) {
        case 'deals':
          return price.savings > 0;
        case 'luxury':
          return price.currentPrice > 2500;
        case 'budget':
          return price.currentPrice < 2000;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const priceA = tourPrices.get(a.id);
      const priceB = tourPrices.get(b.id);
      if (!priceA || !priceB) return 0;

      switch (sortBy) {
        case 'price-asc':
          return priceA.currentPrice - priceB.currentPrice;
        case 'price-desc':
          return priceB.currentPrice - priceA.currentPrice;
        case 'duration-asc':
          return a.duration - b.duration;
        case 'duration-desc':
          return b.duration - a.duration;
        case 'savings-desc':
          return priceB.savings - priceA.savings;
        default:
          return 0;
      }
    });

  const getAveragePrice = () => {
    const prices = Array.from(tourPrices.values());
    return prices.reduce((sum, price) => sum + price.currentPrice, 0) / prices.length;
  };

  const getTotalSavings = () => {
    const prices = Array.from(tourPrices.values());
    return prices.reduce((sum, price) => sum + price.savings, 0);
  };

  const getBestDeal = () => {
    const prices = Array.from(tourPrices.values());
    return prices.reduce((best, current) => 
      current.savings > best.savings ? current : best
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Price Overview Stats */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-sky-600 mb-2">
              {formatPrice(getAveragePrice())}
            </div>
            <div className="text-sm text-gray-500">Average Price</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {formatPrice(getTotalSavings())}
            </div>
            <div className="text-sm text-gray-500">Total Savings</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {filteredAndSortedTours.length}
            </div>
            <div className="text-sm text-gray-500">Available Tours</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600 mb-2">
              {Math.round((getTotalSavings() / (getAveragePrice() * tours.length)) * 100)}%
            </div>
            <div className="text-sm text-gray-500">Average Discount</div>
          </div>
        </div>
      </LuxuryCard>

      {/* Filters and Sorting */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            
            {[
              { key: 'all', label: 'All Tours' },
              { key: 'deals', label: 'Special Deals' },
              { key: 'luxury', label: 'Luxury' },
              { key: 'budget', label: 'Budget' }
            ].map(filter => (
              <LuxuryButton
                key={filter.key}
                variant={filterBy === filter.key ? 'gradient' : 'outline'}
                size="sm"
                onClick={() => setFilterBy(filter.key as FilterOption)}
              >
                {filter.label}
              </LuxuryButton>
            ))}
          </div>

          {/* Sorting */}
          <div className="flex flex-wrap items-center gap-2">
            <SortAsc className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Sort by:</span>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="duration-asc">Duration: Short to Long</option>
              <option value="duration-desc">Duration: Long to Short</option>
              <option value="savings-desc">Best Savings</option>
            </select>
          </div>

          {/* View Options */}
          <div className="flex items-center gap-2">
            <LuxuryButton
              variant={showChart ? 'gradient' : 'outline'}
              size="sm"
              onClick={() => setShowChart(!showChart)}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {showChart ? 'List View' : 'Chart View'}
            </LuxuryButton>
          </div>
        </div>
      </LuxuryCard>

      {/* Price Settings */}
      <LuxuryCard variant="glass" className="p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Price Settings</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Travel Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Travel Date
            </label>
            <input
              type="date"
              value={travelDate.toISOString().split('T')[0]}
              onChange={(e) => setTravelDate(new Date(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus: delay-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Group Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-2" />
              Group Size
            </label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"
              >
                -
              </button>
              <span className="w-12 text-center font-medium">{groupSize}</span>
              <button
                onClick={() => setGroupSize(Math.min(20, groupSize + 1))}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          {/* Pricing Tier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Star className="w-4 h-4 inline mr-2" />
              Experience Level
            </label>
            <select
              value={selectedTier.id}
              onChange={(e) => {
                const tier = PRICING_TIERS.find(t => t.id === e.target.value);
                if (tier) setSelectedTier(tier);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              {PRICING_TIERS.map(tier => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} (+{formatPrice(tier.basePrice)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </LuxuryCard>

      {/* Tours Comparison */}
      <div className="grid grid-cols-1 gap-6">
        {filteredAndSortedTours.map(tour => {
          const price = tourPrices.get(tour.id);
          if (!price) return null;

          return (
            <LuxuryCard key={tour.id} variant="glass" className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tour Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{tour.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {tour.duration} days
                        </span>
                        <span className="flex items-center">
                          <Users className="w-4 h-4 mr-1" />
                          {tour.groupSize.min}-{tour.groupSize.max} people
                        </span>
                        <span className="flex items-center">
                          <Star className="w-4 h-4 mr-1" />
                          {tour.difficulty}
                        </span>
                      </div>
                    </div>
                    
                    {/* Price Badge */}
                    {getPriceBadge(price) && (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriceBadgeColor(price)}`}>
                        {getPriceBadge(price)}
                      </span>
                    )}
                  </div>

                  {/* Categories */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {tour.categories.map(category => (
                      <span
                        key={category}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                      >
                        {category}
                      </span>
                    ))}
                  </div>

                  {/* Price Info */}
                  <div className="flex items-center space-x-4">
                    <div className="text-3xl font-bold text-sky-600">
                      {formatPrice(price.currentPrice)}
                    </div>
                    {price.savings > 0 && (
                      <div className="text-lg text-gray-400 line-through">
                        {formatPrice(price.basePrice)}
                      </div>
                    )}
                  </div>

                  {price.savings > 0 && (
                    <div className="text-green-600 font-medium mt-1">
                      {getPriceSavings(price)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col space-y-2">
                  <LuxuryButton
                    variant="gradient"
                    size="lg"
                    onClick={() => onTourSelect?.(tour, price)}
                    className="w-full md:w-auto"
                  >
                    View Details
                  </LuxuryButton>
                  
                  <LuxuryButton
                    variant="outline"
                    size="lg"
                    onClick={() => onTourSelect?.(tour, price)}
                    className="w-full md:w-auto"
                  >
                    Book Now
                  </LuxuryButton>
                </div>
              </div>
            </LuxuryCard>
          );
        })}
      </div>

      {/* Best Deal Highlight */}
      {getBestDeal() && (
        <LuxuryCard variant="glass" className="p-6 border-2 border-green-200 bg-green-50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-green-900">Best Deal Available!</h4>
              <p className="text-sm text-green-700">Get the most savings on your travel</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatPrice(getBestDeal().savings)}
              </div>
              <div className="text-sm text-green-700">Total Savings</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {getBestDeal().discount}%
              </div>
              <div className="text-sm text-green-700">Discount</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatPrice(getBestDeal().currentPrice)}
              </div>
              <div className="text-sm text-green-700">Final Price</div>
            </div>
          </div>
        </LuxuryCard>
      )}

      {/* No Results */}
      {filteredAndSortedTours.length === 0 && (
        <LuxuryCard variant="glass" className="p-12 text-center">
          <X className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your filters or search criteria to find more options.
          </p>
          <LuxuryButton
            variant="gradient"
            onClick={() => {
              setFilterBy('all');
              setSortBy('price-asc');
            }}
          >
            Reset Filters
          </LuxuryButton>
        </LuxuryCard>
      )}
    </div>
  );
}



