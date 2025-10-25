export interface TourPackage {
  id: string;
  title: string;
  destination: string;
  duration: string;
  style: string;
  startLocation: string;
  endLocation: string;
  price: {
    single: number;
    twin: number;
    triple: number;
    group: number;
    singleSupplement: number;
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
