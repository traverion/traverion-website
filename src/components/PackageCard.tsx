import { MapPin, Calendar, Users, Heart, Star, ArrowRight, Clock, Plane, Check, Leaf, Percent, TrendingDown, Zap } from 'lucide-react';
import { useState } from 'react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { getReviewStats } from '../data/reviews';
import { calculateDynamicPrice, formatPrice, getPriceBadge, getPriceBadgeColor, PRICING_TIERS } from '../utils/pricing';
import { TourPackage } from '../utils/pricing';

interface PackageCardProps {
  title: string;
  destination: string;
  duration: string;
  groupSize: string;
  price: string;
  image: string;
  description: string;
  rating?: number;
  reviews?: number;
  isPopular?: boolean;
  discount?: string;
  onSelect?: (selected: boolean) => void;
  isSelected?: boolean;
  viewMode?: 'grid' | 'list';
  onViewDetails?: () => void;
  tourId?: string;
  tourPackage?: TourPackage;
  showDynamicPricing?: boolean;
}

export default function PackageCard({
  title,
  destination,
  duration,
  groupSize,
  price,
  image,
  description,
  rating = 4.8,
  reviews = 127,
  isPopular = false,
  discount,
  onSelect,
  isSelected = false,
  viewMode = 'grid',
  onViewDetails,
  tourId,
  tourPackage,
  showDynamicPricing = false,
}: PackageCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  // Get real review stats if tourId is provided
  const reviewStats = tourId ? getReviewStats(tourId) : null;
  const displayRating = reviewStats?.averageRating || rating;
  const displayReviews = reviewStats?.totalReviews || reviews;

  // Calculate dynamic pricing if tour package is provided
  const dynamicPrice = tourPackage && showDynamicPricing 
    ? calculateDynamicPrice(tourPackage, PRICING_TIERS[1], new Date(), 2)
    : null;

  return (
    <LuxuryCard 
      variant="elevated" 
      hover={true}
      className="group relative overflow-hidden animate-fade-in-up cursor-pointer transition-all duration-250 ease-out-smooth hover:-translate-y-1 hover:shadow-soft-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onViewDetails}
    >
      {/* Image Section */}
      <div className="relative h-72 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out-smooth group-hover:scale-[1.04]"
          style={{ backgroundImage: `url(${image})` }}
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-4 left-4 flex flex-col space-y-2">
          {isPopular && (
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse-slow">
              🔥 Popular
            </div>
          )}
          
          {/* Dynamic Pricing Badges */}
          {dynamicPrice && getPriceBadge(dynamicPrice) && (
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${getPriceBadgeColor(dynamicPrice)} flex items-center`}>
              {dynamicPrice.lastMinuteDeal?.isActive && <Zap className="w-3 h-3 mr-1" />}
              {dynamicPrice.earlyBirdDeal?.isActive && <TrendingDown className="w-3 h-3 mr-1" />}
              {getPriceBadge(dynamicPrice)}
            </div>
          )}
          
          {discount && !dynamicPrice && (
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold">
              {discount} OFF
            </div>
          )}
          
          {/* Sustainability Badge */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center">
            <Leaf className="w-3 h-3 mr-1" />
            Eco-Friendly
          </div>
        </div>

        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLiked(!isLiked);
          }}
          className={`absolute top-4 right-4 p-2 rounded-full transition-all duration-300 ${
            isLiked 
              ? 'bg-red-500 text-white scale-110' 
              : 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30'
          }`}
        >
          <Heart 
            size={18} 
            className={`transition-all duration-300 ${isLiked ? 'fill-current' : ''}`}
          />
        </button>

        {/* Selection Checkbox */}
        {onSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(!isSelected);
            }}
            className={`absolute top-4 right-16 p-2 rounded-full transition-all duration-300 ${
              isSelected 
                ? 'bg-sky-500 text-white scale-110' 
                : 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30'
            }`}
          >
            <Check 
              size={18} 
              className={`transition-all duration-300 ${isSelected ? 'fill-current' : ''}`}
            />
          </button>
        )}

            {/* Rating */}
            <div className={`absolute top-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center space-x-1 ${
              onSelect ? 'right-28' : 'right-16'
            }`}>
              <Star size={14} className="text-yellow-500 fill-current" />
              <span className="text-sm font-semibold text-gray-900">{displayRating.toFixed(1)}</span>
            </div>

        {/* Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className="text-2xl font-heading font-bold text-white mb-2 group-hover:text-sky-200 transition-colors">
            {title}
          </h3>
          <div className="flex items-center text-white/90 text-sm mb-2">
            <MapPin size={16} className="mr-2 text-sky-300" />
            <span className="font-medium">{destination}</span>
          </div>
          <p className="text-white/80 text-sm leading-relaxed line-clamp-2">
            {description}
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-6">
        {/* Stats */}
        <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Calendar size={16} className="mr-2 text-sky-500" />
              <span className="font-medium">{duration}</span>
            </div>
            <div className="flex items-center">
              <Users size={16} className="mr-2 text-sky-500" />
              <span className="font-medium">{groupSize}</span>
            </div>
          </div>
          <div className="flex items-center text-gray-500">
            <Star size={14} className="text-yellow-500 mr-1" />
            <span className="text-sm">{displayRating.toFixed(1)} ({displayReviews} reviews)</span>
          </div>
        </div>

        {/* Features */}
        <div className="flex items-center space-x-4 mb-6 text-xs text-gray-500">
          <div className="flex items-center">
            <Plane size={14} className="mr-1 text-sky-500" />
            <span>Flights Included</span>
          </div>
          <div className="flex items-center">
            <Clock size={14} className="mr-1 text-sky-500" />
            <span>24/7 Support</span>
          </div>
        </div>

        {/* Price and CTA */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div>
            <span className="text-gray-500 text-xs font-medium">Starting from</span>
            <div className="flex items-baseline space-x-2">
              {dynamicPrice ? (
                <>
                  <p className="text-3xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                    {formatPrice(dynamicPrice.currentPrice)}
                  </p>
                  {dynamicPrice.savings > 0 && (
                    <p className="text-lg text-gray-400 line-through">
                      {formatPrice(dynamicPrice.basePrice)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-3xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                  {price}
                </p>
              )}
              <span className="text-sm text-gray-500">per person</span>
            </div>
            {dynamicPrice && dynamicPrice.savings > 0 && (
              <div className="text-green-600 text-sm font-medium mt-1">
                Save {formatPrice(dynamicPrice.savings)} ({dynamicPrice.discount}% off)
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <LuxuryButton
              variant="outline"
              size="sm"
              className="group/btn"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails?.();
              }}
            >
              <span>View Details</span>
              <ArrowRight 
                size={16} 
                className="ml-1 transition-transform duration-300 group-hover/btn:translate-x-1" 
              />
            </LuxuryButton>
            
            <LuxuryButton
              variant="gradient"
              size="sm"
              className="group/btn"
            >
              <span>Book Now</span>
              <ArrowRight 
                size={16} 
                className="ml-1 transition-transform duration-300 group-hover/btn:translate-x-1" 
              />
            </LuxuryButton>
          </div>
        </div>

        {/* Hover Effect Overlay */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-sky-500/5 to-transparent pointer-events-none animate-fade-in-up" />
        )}
      </div>
    </LuxuryCard>
  );
}
