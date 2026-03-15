export interface TourPackage {
  id: string;
  title: string;
  destination: string;
  duration: string;
  style: string;
  startLocation: string;
  endLocation: string;
  price: {
    startingFrom: number;
    currency: string;
    perPerson: boolean;
    twinOccupancy: boolean;
    customQuote: boolean;
    singleSupplement: number;
    validity: string;
    category3?: any;
    category4?: any;
    category5?: any;
    lowSeason?: any;
    additionalFlights?: any;
    tourLeaderPolicy?: string;
    focPolicy?: string;
    childrenPolicies?: any;
    vietlongOffer?: any;
    tippingRecommendations?: any;
    importantNotes?: string[];
  };
  category: '3*' | '4*' | '5*';
  tourType: 'beach' | 'adventure' | 'cultural' | 'city' | 'family' | 'luxury' | 'budget';
  validity: string;
  image: string;
  description: string;
  highlights: string[];
  itinerary: DayPlan[];
  includes: string[];
  excludes: string[];
  hotels: Hotel[];
  flights?: FlightInfo[];
  optionalTours?: OptionalTour[];
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  groupSize: string;
  bestTime: string;
  rating: number;
  reviews: number;
  isPopular: boolean;
  discount?: string;
  /** GetYourGuide/TripAdvisor-style: hide from main listing when true */
  isHolidayPackage?: boolean;
  /** e.g. "Ho Chi Minh City", "Bangkok" */
  city?: string;
  /** e.g. "Southeast Asia", "Mekong" */
  region?: string;
  /** e.g. "Vietnam", "Thailand" */
  country?: string;
  /** e.g. "free-cancellation", "small-group", "pickup-available", "mobile-ticket", "bestseller" */
  tags?: string[];
  /** When true, hidden from main listing in platform mode (supplier-built tours only). */
  isSeedData?: boolean;
  /** Supplier id who created this listing (for platform mode). */
  supplierId?: string;
  /** draft = not visible on main site; published = visible. */
  status?: 'draft' | 'published';
}

export interface DayPlan {
  day: number;
  title: string;
  description: string;
  meals: string;
  location: string;
  activities: string[];
  optional?: boolean;
}

export interface Hotel {
  city: string;
  category: string;
  name: string;
  website?: string;
  description?: string;
}

export interface FlightInfo {
  departure: string;
  arrival: string;
  price: number;
  airline: string;
  class: string;
  baggage: string;
}

export interface OptionalTour {
  title: string;
  description: string;
  price?: number;
  duration: string;
  includes: string[];
}
