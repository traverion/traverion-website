import { useState, useEffect } from 'react';
import { Calendar, Users, Clock, Percent, TrendingUp, TrendingDown, Star, CheckCircle, AlertCircle, Zap, Gift, Target } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { 
  calculateDynamicPrice, 
  getPriceRange, 
  formatPrice, 
  getPriceSavings, 
  getPriceBadge, 
  getPriceBadgeColor,
  PRICING_TIERS,
  SEASONAL_PRICING,
  TourPackage,
  DynamicPrice
} from '../utils/pricing';

interface DynamicPricingProps {
  tour: TourPackage;
  onPriceSelect?: (price: DynamicPrice) => void;
  className?: string;
}

export default function DynamicPricing({ tour, onPriceSelect, className = '' }: DynamicPricingProps) {
  const [selectedTier, setSelectedTier] = useState(PRICING_TIERS[1]); // Premium by default
  const [travelDate, setTravelDate] = useState(new Date());
  const [groupSize, setGroupSize] = useState(2);
  const [showDetails, setShowDetails] = useState(false);
  const [dynamicPrice, setDynamicPrice] = useState<DynamicPrice | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);

  useEffect(() => {
    const price = calculateDynamicPrice(tour, selectedTier, travelDate, groupSize);
    setDynamicPrice(price);
    
    // Simulate price history for chart
    const history = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return calculateDynamicPrice(tour, selectedTier, date, groupSize).currentPrice;
    });
    setPriceHistory(history);
    
    if (onPriceSelect) {
      onPriceSelect(price);
    }
  }, [tour, selectedTier, travelDate, groupSize, onPriceSelect]);

  const handleTierChange = (tier: typeof PRICING_TIERS[0]) => {
    setSelectedTier(tier);
  };

  const handleDateChange = (date: Date) => {
    setTravelDate(date);
  };

  const handleGroupSizeChange = (size: number) => {
    setGroupSize(Math.max(2, Math.min(tour.groupSize.max, size)));
  };

  const getPriceTrend = () => {
    if (priceHistory.length < 2) return 'stable';
    const recent = priceHistory.slice(-7);
    const older = priceHistory.slice(-14, -7);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.05) return 'rising';
    if (recentAvg < olderAvg * 0.95) return 'falling';
    return 'stable';
  };

  const getTrendIcon = () => {
    const trend = getPriceTrend();
    switch (trend) {
      case 'rising': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'falling': return <TrendingDown className="w-4 h-4 text-green-500" />;
      default: return <TrendingUp className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendText = () => {
    const trend = getPriceTrend();
    switch (trend) {
      case 'rising': return 'Prices rising - Book soon!';
      case 'falling': return 'Prices dropping - Great time to book!';
      default: return 'Prices stable';
    }
  };

  if (!dynamicPrice) return null;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Price Overview */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-900">Dynamic Pricing</h3>
          <div className="flex items-center space-x-2">
            {getTrendIcon()}
            <span className="text-sm text-gray-600">{getTrendText()}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Current Price */}
          <div className="text-center">
            <div className="text-4xl font-bold text-sky-600 mb-2">
              {formatPrice(dynamicPrice.currentPrice)}
            </div>
            <div className="text-sm text-gray-500">Current Price</div>
            {dynamicPrice.savings > 0 && (
              <div className="text-sm text-green-600 font-medium mt-1">
                {getPriceSavings(dynamicPrice)}
              </div>
            )}
          </div>

          {/* Base Price */}
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-400 line-through mb-2">
              {formatPrice(dynamicPrice.basePrice)}
            </div>
            <div className="text-sm text-gray-500">Base Price</div>
          </div>

          {/* Savings */}
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 mb-2">
              {formatPrice(dynamicPrice.savings)}
            </div>
            <div className="text-sm text-gray-500">You Save</div>
            {dynamicPrice.discount > 0 && (
              <div className="text-sm text-green-600 font-medium mt-1">
                {dynamicPrice.discount}% Off
              </div>
            )}
          </div>
        </div>

        {/* Price Badge */}
        {getPriceBadge(dynamicPrice) && (
          <div className="flex justify-center mt-4">
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${getPriceBadgeColor(dynamicPrice)}`}>
              {getPriceBadge(dynamicPrice)}
            </span>
          </div>
        )}
      </LuxuryCard>

      {/* Pricing Controls */}
      <LuxuryCard variant="glass" className="p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Customize Your Experience</h4>
        
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
              onChange={(e) => handleDateChange(new Date(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
            <div className="text-xs text-gray-500 mt-1">
              {dynamicPrice.season.description}
            </div>
          </div>

          {/* Group Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-2" />
              Group Size
            </label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleGroupSizeChange(groupSize - 1)}
                disabled={groupSize <= 2}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-12 text-center font-medium">{groupSize}</span>
              <button
                onClick={() => handleGroupSizeChange(groupSize + 1)}
                disabled={groupSize >= tour.groupSize.max}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Max {tour.groupSize.max} people
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
                if (tier) handleTierChange(tier);
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

      {/* Pricing Tiers */}
      <LuxuryCard variant="glass" className="p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Choose Your Experience</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRICING_TIERS.map(tier => {
            const tierPrice = calculateDynamicPrice(tour, tier, travelDate, groupSize);
            const isSelected = selectedTier.id === tier.id;
            
            return (
              <div
                key={tier.id}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                  isSelected 
                    ? 'border-sky-500 bg-sky-50' 
                    : 'border-gray-200 hover:border-gray-300'
                } ${tier.popular ? 'ring-2 ring-sky-200' : ''}`}
                onClick={() => handleTierChange(tier)}
              >
                {tier.popular && (
                  <div className="text-center mb-2">
                    <span className="bg-sky-500 text-white text-xs px-2 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <h5 className="font-semibold text-gray-900 mb-2">{tier.name}</h5>
                <div className="text-2xl font-bold text-sky-600 mb-2">
                  {formatPrice(tierPrice.currentPrice)}
                </div>
                
                <ul className="space-y-1 text-sm text-gray-600">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </LuxuryCard>

      {/* Special Deals */}
      {(dynamicPrice.lastMinuteDeal?.isActive || dynamicPrice.earlyBirdDeal?.isActive || dynamicPrice.groupDiscount) && (
        <LuxuryCard variant="glass" className="p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Special Deals</h4>
          
          <div className="space-y-4">
            {dynamicPrice.lastMinuteDeal?.isActive && (
              <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Zap className="w-6 h-6 text-red-500" />
                  <div>
                    <div className="font-medium text-red-900">Last Minute Deal</div>
                    <div className="text-sm text-red-700">{dynamicPrice.lastMinuteDeal.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">
                    {dynamicPrice.lastMinuteDeal.discount}% Off
                  </div>
                  <div className="text-xs text-red-500">
                    Expires {dynamicPrice.lastMinuteDeal.expiresAt.toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {dynamicPrice.earlyBirdDeal?.isActive && (
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Gift className="w-6 h-6 text-green-500" />
                  <div>
                    <div className="font-medium text-green-900">Early Bird Special</div>
                    <div className="text-sm text-green-700">{dynamicPrice.earlyBirdDeal.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    {dynamicPrice.earlyBirdDeal.discount}% Off
                  </div>
                  <div className="text-xs text-green-500">
                    Expires {dynamicPrice.earlyBirdDeal.expiresAt.toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {dynamicPrice.groupDiscount && (
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Users className="w-6 h-6 text-blue-500" />
                  <div>
                    <div className="font-medium text-blue-900">Group Discount</div>
                    <div className="text-sm text-blue-700">{dynamicPrice.groupDiscount.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">
                    {dynamicPrice.groupDiscount.discount}% Off
                  </div>
                  <div className="text-xs text-blue-500">
                    Min {dynamicPrice.groupDiscount.minPeople} people
                  </div>
                </div>
              </div>
            )}
          </div>
        </LuxuryCard>
      )}

      {/* Price Breakdown */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900">Price Breakdown</h4>
          <LuxuryButton
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </LuxuryButton>
        </div>

        {showDetails && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Base Price ({selectedTier.name})</span>
              <span className="font-medium">{formatPrice(dynamicPrice.basePrice)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Seasonal Adjustment ({dynamicPrice.season.season})</span>
              <span className="font-medium">
                {dynamicPrice.season.multiplier > 1 ? '+' : ''}
                {Math.round((dynamicPrice.season.multiplier - 1) * 100)}%
              </span>
            </div>

            {dynamicPrice.lastMinuteDeal?.isActive && (
              <div className="flex justify-between items-center text-red-600">
                <span>Last Minute Discount</span>
                <span className="font-medium">-{dynamicPrice.lastMinuteDeal.discount}%</span>
              </div>
            )}

            {dynamicPrice.earlyBirdDeal?.isActive && (
              <div className="flex justify-between items-center text-green-600">
                <span>Early Bird Discount</span>
                <span className="font-medium">-{dynamicPrice.earlyBirdDeal.discount}%</span>
              </div>
            )}

            {dynamicPrice.groupDiscount && (
              <div className="flex justify-between items-center text-blue-600">
                <span>Group Discount</span>
                <span className="font-medium">-{dynamicPrice.groupDiscount.discount}%</span>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Price</span>
                <span className="text-sky-600">{formatPrice(dynamicPrice.currentPrice)}</span>
              </div>
            </div>
          </div>
        )}
      </LuxuryCard>

      {/* Price Alert */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-yellow-500" />
          <div>
            <h4 className="font-medium text-gray-900">Price Alert</h4>
            <p className="text-sm text-gray-600">
              Prices can change based on demand and availability. Book now to lock in this price!
            </p>
          </div>
        </div>
      </LuxuryCard>
    </div>
  );
}



