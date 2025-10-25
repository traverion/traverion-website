export interface PricingTier {
  id: string;
  name: string;
  basePrice: number;
  currency: string;
  discount: number;
  features: string[];
  popular?: boolean;
}

export interface SeasonalPricing {
  season: 'low' | 'shoulder' | 'peak' | 'high';
  multiplier: number;
  description: string;
  months: number[];
}

export interface DynamicPrice {
  basePrice: number;
  currentPrice: number;
  discount: number;
  savings: number;
  tier: PricingTier;
  season: SeasonalPricing;
  lastMinuteDeal?: {
    isActive: boolean;
    discount: number;
    expiresAt: Date;
    description: string;
  };
  earlyBirdDeal?: {
    isActive: boolean;
    discount: number;
    expiresAt: Date;
    description: string;
  };
  groupDiscount?: {
    minPeople: number;
    discount: number;
    description: string;
  };
}

export interface TourPackage {
  id: string;
  name: string;
  duration: number;
  basePrice: number;
  currency: string;
  categories: string[];
  difficulty: 'easy' | 'moderate' | 'challenging';
  groupSize: {
    min: number;
    max: number;
  };
  availability: {
    startDate: Date;
    endDate: Date;
    availableSpots: number;
  };
}

// Seasonal pricing configurations
export const SEASONAL_PRICING: SeasonalPricing[] = [
  {
    season: 'low',
    multiplier: 0.75,
    description: 'Low Season - Best Value',
    months: [5, 6, 7, 8, 9] // May to September
  },
  {
    season: 'shoulder',
    multiplier: 0.85,
    description: 'Shoulder Season - Great Deals',
    months: [4, 10] // April and October
  },
  {
    season: 'peak',
    multiplier: 1.2,
    description: 'Peak Season - Premium Experience',
    months: [11, 12, 1, 2, 3] // November to March
  },
  {
    season: 'high',
    multiplier: 1.1,
    description: 'High Season - Popular Time',
    months: [] // Special events or holidays
  }
];

// Pricing tiers
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'standard',
    name: 'Standard',
    basePrice: 0,
    currency: 'USD',
    discount: 0,
    features: ['Basic accommodations', 'Group tours', 'Standard meals', 'Local guide']
  },
  {
    id: 'premium',
    name: 'Premium',
    basePrice: 500,
    currency: 'USD',
    discount: 0,
    features: ['Upgraded accommodations', 'Small group tours', 'Premium meals', 'Expert guide', 'Airport transfers'],
    popular: true
  },
  {
    id: 'luxury',
    name: 'Luxury',
    basePrice: 1000,
    currency: 'USD',
    discount: 0,
    features: ['5-star accommodations', 'Private tours', 'Fine dining', 'Personal guide', 'Luxury transfers', 'Spa treatments']
  }
];

// Sample tour packages with dynamic pricing
export const TOUR_PACKAGES: TourPackage[] = [
  {
    id: 'vietnam-9-day',
    name: '9-Day Southern Vietnam Discovery',
    duration: 9,
    basePrice: 1800,
    currency: 'USD',
    categories: ['Cultural', 'Adventure'],
    difficulty: 'easy',
    groupSize: { min: 2, max: 16 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 12
    }
  },
  {
    id: 'vietnam-12-day',
    name: '12-Day Complete Vietnam Experience',
    duration: 12,
    basePrice: 2200,
    currency: 'USD',
    categories: ['Cultural', 'Historical', 'Nature'],
    difficulty: 'moderate',
    groupSize: { min: 2, max: 12 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 8
    }
  },
  {
    id: 'thailand-10-day',
    name: '10-Day Thailand Cultural Journey',
    duration: 10,
    basePrice: 1900,
    currency: 'USD',
    categories: ['Cultural', 'Spiritual'],
    difficulty: 'easy',
    groupSize: { min: 2, max: 14 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 10
    }
  },
  {
    id: 'cambodia-10-day',
    name: '10-Day Cambodia & Angkor Wat',
    duration: 10,
    basePrice: 1700,
    currency: 'USD',
    categories: ['Historical', 'Archaeological'],
    difficulty: 'moderate',
    groupSize: { min: 2, max: 12 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 6
    }
  },
  {
    id: 'indochina-14-day',
    name: '14-Day Indochina Grand Tour',
    duration: 14,
    basePrice: 3200,
    currency: 'USD',
    categories: ['Cultural', 'Historical', 'Nature'],
    difficulty: 'challenging',
    groupSize: { min: 2, max: 10 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 4
    }
  },
  {
    id: 'thailand-vietnam-14-day',
    name: '14-Day Thailand & Vietnam Combo',
    duration: 14,
    basePrice: 2800,
    currency: 'USD',
    categories: ['Cultural', 'Adventure'],
    difficulty: 'moderate',
    groupSize: { min: 2, max: 12 },
    availability: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      availableSpots: 8
    }
  }
];

// Utility functions for dynamic pricing
export const getCurrentSeason = (date: Date = new Date()): SeasonalPricing => {
  const month = date.getMonth() + 1;
  
  // Check for special high season periods (holidays, festivals)
  const specialHighSeasonDates = [
    { start: new Date('2024-12-20'), end: new Date('2025-01-05') }, // Christmas/New Year
    { start: new Date('2024-02-10'), end: new Date('2024-02-17') }, // Lunar New Year
    { start: new Date('2024-04-13'), end: new Date('2024-04-15') }, // Songkran
  ];
  
  for (const period of specialHighSeasonDates) {
    if (date >= period.start && date <= period.end) {
      return SEASONAL_PRICING.find(s => s.season === 'high') || SEASONAL_PRICING[0];
    }
  }
  
  // Regular seasonal pricing
  return SEASONAL_PRICING.find(season => season.months.includes(month)) || SEASONAL_PRICING[0];
};

export const calculateDynamicPrice = (
  tour: TourPackage,
  tier: PricingTier,
  travelDate: Date = new Date(),
  groupSize: number = 2
): DynamicPrice => {
  const season = getCurrentSeason(travelDate);
  const basePrice = tour.basePrice + tier.basePrice;
  
  // Apply seasonal pricing
  const seasonalPrice = basePrice * season.multiplier;
  
  // Check for last-minute deals (within 30 days)
  const daysUntilTravel = Math.ceil((travelDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const lastMinuteDeal = daysUntilTravel <= 30 ? {
    isActive: true,
    discount: Math.min(25, daysUntilTravel * 0.8), // Up to 25% discount
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    description: `Last-minute deal! Save ${Math.round(Math.min(25, daysUntilTravel * 0.8))}% on this tour`
  } : undefined;
  
  // Check for early bird deals (more than 90 days)
  const earlyBirdDeal = daysUntilTravel >= 90 ? {
    isActive: true,
    discount: 15,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    description: 'Early bird special! Save 15% when you book early'
  } : undefined;
  
  // Group discounts
  const groupDiscount = groupSize >= 4 ? {
    minPeople: 4,
    discount: Math.min(20, (groupSize - 2) * 3), // 3% per extra person, max 20%
    description: `Group discount! Save ${Math.min(20, (groupSize - 2) * 3)}% for ${groupSize} people`
  } : undefined;
  
  // Calculate final price
  let finalPrice = seasonalPrice;
  let totalDiscount = 0;
  
  if (lastMinuteDeal?.isActive) {
    finalPrice *= (1 - lastMinuteDeal.discount / 100);
    totalDiscount += lastMinuteDeal.discount;
  }
  
  if (earlyBirdDeal?.isActive) {
    finalPrice *= (1 - earlyBirdDeal.discount / 100);
    totalDiscount += earlyBirdDeal.discount;
  }
  
  if (groupDiscount) {
    finalPrice *= (1 - groupDiscount.discount / 100);
    totalDiscount += groupDiscount.discount;
  }
  
  const savings = basePrice - finalPrice;
  
  return {
    basePrice,
    currentPrice: Math.round(finalPrice),
    discount: Math.round(totalDiscount),
    savings: Math.round(savings),
    tier,
    season,
    lastMinuteDeal,
    earlyBirdDeal,
    groupDiscount
  };
};

export const getPriceRange = (tour: TourPackage): { min: number; max: number } => {
  const standardTier = PRICING_TIERS.find(t => t.id === 'standard')!;
  const luxuryTier = PRICING_TIERS.find(t => t.id === 'luxury')!;
  
  const lowSeason = SEASONAL_PRICING.find(s => s.season === 'low')!;
  const peakSeason = SEASONAL_PRICING.find(s => s.season === 'peak')!;
  
  const minPrice = calculateDynamicPrice(tour, standardTier, new Date(), 2).currentPrice;
  const maxPrice = calculateDynamicPrice(tour, luxuryTier, new Date(), 2).currentPrice;
  
  return { min: minPrice, max: maxPrice };
};

export const formatPrice = (price: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

export const getPriceSavings = (dynamicPrice: DynamicPrice): string => {
  if (dynamicPrice.savings <= 0) return '';
  
  const percentage = Math.round((dynamicPrice.savings / dynamicPrice.basePrice) * 100);
  return `Save ${formatPrice(dynamicPrice.savings)} (${percentage}%)`;
};

export const getPriceBadge = (dynamicPrice: DynamicPrice): string => {
  if (dynamicPrice.lastMinuteDeal?.isActive) return 'Last Minute Deal';
  if (dynamicPrice.earlyBirdDeal?.isActive) return 'Early Bird';
  if (dynamicPrice.groupDiscount) return 'Group Discount';
  if (dynamicPrice.season.season === 'low') return 'Low Season';
  if (dynamicPrice.season.season === 'shoulder') return 'Shoulder Season';
  return '';
};

export const getPriceBadgeColor = (dynamicPrice: DynamicPrice): string => {
  if (dynamicPrice.lastMinuteDeal?.isActive) return 'bg-red-500 text-white';
  if (dynamicPrice.earlyBirdDeal?.isActive) return 'bg-green-500 text-white';
  if (dynamicPrice.groupDiscount) return 'bg-blue-500 text-white';
  if (dynamicPrice.season.season === 'low') return 'bg-yellow-500 text-black';
  if (dynamicPrice.season.season === 'shoulder') return 'bg-orange-500 text-white';
  return 'bg-gray-500 text-white';
};



