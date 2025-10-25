import { TourPackage } from '../types/tour';

export const tourPackages: TourPackage[] = [
  {
    id: 'vietnam-southern-9-days',
    title: '9-Day Southern Vietnam Tour',
    destination: 'Ho Chi Minh City, Cu Chi Tunnels, Phu Quoc Islands',
    duration: '9 Days - 8 Nights',
    style: 'Nature, Culture & Relaxation Tour',
    startLocation: 'Ho Chi Minh City',
    endLocation: 'Ho Chi Minh City',
    price: {
      single: 0, // Will be filled from actual data
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '4*',
    tourType: 'beach',
    validity: '01 Oct 2025 - 31 Dec 2026',
    image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
    description: 'Experience the vibrant energy of Ho Chi Minh City, explore the historic Cu Chi Tunnels, cruise through the Mekong Delta, and relax on the beautiful beaches of Phu Quoc Island.',
    highlights: [
      'Explore Ho Chi Minh City landmarks',
      'Discover Cu Chi Tunnels history',
      'Cruise Mekong Delta waterways',
      'Visit Cai Rang floating market',
      'Relax on Phu Quoc beaches',
      'Optional cable car to Hon Thom Island'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Ho Chi Minh City Arrival',
        description: 'Welcome to Ho Chi Minh City! Airport pick-up and hotel check-in.',
        meals: 'None',
        location: 'Ho Chi Minh City',
        activities: ['Airport pick-up', 'Hotel check-in', 'Free time']
      },
      {
        day: 2,
        title: 'City Tour & Cu Chi Tunnels',
        description: 'Half-day city tour including Independence Palace, Notre Dame Cathedral, and Cu Chi Tunnels exploration.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Independence Palace', 'Notre Dame Cathedral', 'Central Post Office', 'War Remnants Museum', 'Cu Chi Tunnels']
      },
      {
        day: 3,
        title: 'Mekong Delta Exploration',
        description: 'Journey to the Mekong Delta, visit Vinh Trang pagoda, and explore the intricate canal system.',
        meals: 'B/L',
        location: 'Can Tho',
        activities: ['Vinh Trang pagoda', 'Boat cruise', 'Unicorn Island', 'Fruit tasting', 'Local industries visit']
      },
      {
        day: 4,
        title: 'Floating Market',
        description: 'Visit Cai Rang floating market and explore local lifestyle along the Mekong canals.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Cai Rang floating market', 'Boat trip', 'Local noodle factory', 'Fresh fruits on boat']
      },
      {
        day: 5,
        title: 'Flight to Phu Quoc',
        description: 'Transfer to airport and fly to Phu Quoc Island for beach relaxation.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Airport transfer', 'Flight to Phu Quoc', 'Hotel check-in', 'Free time']
      },
      {
        day: 6,
        title: 'Phu Quoc Free Day',
        description: 'Optional island speed boat tour and cable car to Hon Thom Island.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Island speed boat tour', 'Snorkeling', 'Cable car to Hon Thom', 'Sunset Town visit', 'Kiss Bridge']
      },
      {
        day: 7,
        title: 'Phu Quoc Leisure',
        description: 'Optional VinWonders theme park and Vinpearl Safari, or explore popular sites in southern Phu Quoc.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['VinWonders theme park', 'Vinpearl Safari', 'Phu Quoc Prison', 'Pearl Farm', 'Sao Beach', 'Fish Sauce Factory', 'Pepper Farm']
      },
      {
        day: 8,
        title: 'Return to Ho Chi Minh',
        description: 'Flight back to Ho Chi Minh City from Phu Quoc.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Airport transfer', 'Flight to Ho Chi Minh', 'Hotel check-in']
      },
      {
        day: 9,
        title: 'Departure',
        description: 'Final breakfast and departure from Ho Chi Minh City.',
        meals: 'B',
        location: 'Departure',
        activities: ['Breakfast', 'Airport transfer', 'Departure']
      }
    ],
    includes: [
      'Accommodation in twin/double room with daily breakfast',
      'Services of professional English-speaking guide',
      'Private air-conditioned vehicle for all tours and transfers',
      'Entrance fees for all visits as mentioned',
      'Meals as indicated in the program (B/L/D)',
      '01 bottle of mineral water per person per day'
    ],
    excludes: [
      'International & Domestic flight tickets',
      'Early check-in or late check-out',
      'Meals other than mentioned',
      'Visa fees',
      'Travel insurance',
      'Tips for guides and drivers',
      'Optional excursions and activities'
    ],
    hotels: [
      {
        city: 'Ho Chi Minh',
        category: '3*',
        name: 'AVANTI HOTEL SAIGON DELUXE',
        website: 'https://avantihotel.vn/'
      },
      {
        city: 'Ho Chi Minh',
        category: '4*',
        name: 'THE ODYS BOUTIQUE HOTEL DELUXE',
        website: 'https://theodyshotel.com/'
      },
      {
        city: 'Ho Chi Minh',
        category: '5*',
        name: 'REX SAIGON HOTEL DELUXE',
        website: 'https://www.rexhotelsaigon.com/'
      },
      {
        city: 'Phu Quoc',
        category: '3*',
        name: 'NESTA PHU QUOC HOTEL SUPERIOR BALCONY',
        website: 'https://nestahotel.com.vn/'
      },
      {
        city: 'Phu Quoc',
        category: '4*',
        name: 'SUNSET BEACH RESORT DELUXE',
        website: 'https://sunsetbeach.vn/'
      },
      {
        city: 'Phu Quoc',
        category: '5*',
        name: 'SEASHELLs PHU QUOC CLASSIC CITY VIEW',
        website: 'https://www.seashellshotel.vn/'
      }
    ],
    flights: [
      {
        departure: 'Tan Son Nhat International Airport (SGN)',
        arrival: 'Phu Quoc International Airport (PQC)',
        price: 0, // To be filled from actual data
        airline: 'VNA',
        class: 'Economy Class',
        baggage: '7 kg carry-on + 20 kg checked'
      }
    ],
    optionalTours: [
      {
        title: 'Islands Speed Boat & Cable Car to Hon Thom',
        description: 'Island hopping with snorkeling and cable car experience',
        duration: 'Half day',
        includes: ['Speed boat tour', 'Snorkeling equipment', 'Cable car ticket', 'Lunch']
      },
      {
        title: 'VinWonders & Vinpearl Safari',
        description: 'Full day at Vietnam\'s largest theme park and safari',
        duration: 'Full day',
        includes: ['Theme park entrance', 'Safari experience', 'Transportation']
      },
      {
        title: 'Southern Phu Quoc Sites Tour',
        description: 'Visit 6 popular sites including prison, pearl farm, and beaches',
        duration: 'Full day',
        includes: ['Transportation', 'Entrance fees', 'Guide']
      }
    ],
    difficulty: 'Easy',
    groupSize: '2-10 People',
    bestTime: 'October - December',
    rating: 4.8,
    reviews: 156,
    isPopular: true,
    discount: '15%'
  },
  {
    id: 'thailand-10-days',
    title: '10-Day Thailand Sightseeing Tour with Phuket Beach',
    destination: 'Bangkok, Chiang Mai, Phuket',
    duration: '10 Days - 9 Nights',
    style: 'Culture, History & Beach Relaxation',
    startLocation: 'Bangkok',
    endLocation: 'Phuket',
    price: {
      single: 0,
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '4*',
    tourType: 'cultural',
    validity: '2024-2025',
    image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
    description: 'Discover the cultural heart of Thailand in Bangkok and Chiang Mai, then unwind on the beautiful beaches of Phuket.',
    highlights: [
      'Explore Bangkok\'s royal palaces and temples',
      'Experience traditional Thai culture in Chiang Mai',
      'Relax on Phuket\'s pristine beaches',
      'Visit floating markets and local villages',
      'Enjoy authentic Thai cuisine',
      'Optional elephant sanctuary visit'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Bangkok Arrival',
        description: 'Arrive in Bangkok and check into your hotel. Free time to explore the city.',
        meals: 'None',
        location: 'Bangkok',
        activities: ['Airport pick-up', 'Hotel check-in', 'Free time', 'Evening stroll']
      },
      {
        day: 2,
        title: 'Bangkok Full-Day Tour',
        description: 'Visit the Royal Grand Palace, Wat Phra Keo, and Wat Pho with traditional Thai massage.',
        meals: 'B',
        location: 'Bangkok',
        activities: ['Royal Grand Palace', 'Wat Phra Keo', 'Wat Pho', 'Thai massage', 'Local markets']
      },
      {
        day: 3,
        title: 'Night Train to Chiang Mai',
        description: 'Take the scenic night train journey to Chiang Mai.',
        meals: 'B',
        location: 'Chiang Mai',
        activities: ['Night train journey', 'Scenic countryside views']
      },
      {
        day: 4,
        title: 'Chiang Mai Tour',
        description: 'Explore Chiang Mai\'s temples, markets, and cultural sites.',
        meals: 'B',
        location: 'Chiang Mai',
        activities: ['Temple visits', 'Local markets', 'Cultural sites', 'Traditional crafts']
      },
      {
        day: 5,
        title: 'Chiang Mai Free Day',
        description: 'Optional activities including elephant sanctuary or mountain trekking.',
        meals: 'B',
        location: 'Chiang Mai',
        activities: ['Elephant sanctuary', 'Mountain trekking', 'Local villages', 'Cooking class']
      },
      {
        day: 6,
        title: 'Flight to Phuket',
        description: 'Fly to Phuket and check into beach resort.',
        meals: 'B',
        location: 'Phuket',
        activities: ['Flight to Phuket', 'Resort check-in', 'Beach time', 'Sunset viewing']
      },
      {
        day: 7,
        title: 'Phuket Beach Day',
        description: 'Relax on the beautiful beaches of Phuket.',
        meals: 'B',
        location: 'Phuket',
        activities: ['Beach relaxation', 'Water sports', 'Island hopping', 'Snorkeling']
      },
      {
        day: 8,
        title: 'Phuket Free Day',
        description: 'Optional island tours or continue beach relaxation.',
        meals: 'B',
        location: 'Phuket',
        activities: ['Island tours', 'Beach activities', 'Local exploration', 'Shopping']
      },
      {
        day: 9,
        title: 'Phuket Leisure',
        description: 'Final day in Phuket for last-minute activities or relaxation.',
        meals: 'B',
        location: 'Phuket',
        activities: ['Beach time', 'Optional tours', 'Shopping', 'Spa treatments']
      },
      {
        day: 10,
        title: 'Departure',
        description: 'Transfer to airport for onward flight.',
        meals: 'B',
        location: 'Departure',
        activities: ['Airport transfer', 'Departure']
      }
    ],
    includes: [
      'Accommodation with daily breakfast',
      'Professional English-speaking guide',
      'Private air-conditioned vehicle',
      'Entrance fees for all visits',
      'Meals as indicated',
      'Night train ticket Bangkok-Chiang Mai',
      'Domestic flight Chiang Mai-Phuket'
    ],
    excludes: [
      'International flights',
      'Optional activities',
      'Personal expenses',
      'Tips',
      'Travel insurance',
      'Visa fees'
    ],
    hotels: [
      {
        city: 'Bangkok',
        category: '4*',
        name: 'Bangkok Hotel',
        description: 'Centrally located hotel in Bangkok'
      },
      {
        city: 'Chiang Mai',
        category: '4*',
        name: 'Chiang Mai Hotel',
        description: 'Traditional hotel in Chiang Mai'
      },
      {
        city: 'Phuket',
        category: '4*',
        name: 'Phuket Beach Resort',
        description: 'Beachfront resort in Phuket'
      }
    ],
    difficulty: 'Easy',
    groupSize: '2-8 People',
    bestTime: 'November - March',
    rating: 4.7,
    reviews: 89,
    isPopular: false
  },
  {
    id: 'vietnam-complete-12-days',
    title: '12-Day Complete Vietnam Discovery',
    destination: 'Hanoi, Halong Bay, Da Nang, Hoi An, Ho Chi Minh City, Mekong Delta',
    duration: '12 Days - 11 Nights',
    style: 'Nature, Culture & Relaxation Tour',
    startLocation: 'Hanoi',
    endLocation: 'Ho Chi Minh City',
    price: {
      single: 0,
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '4*',
    tourType: 'cultural',
    validity: '2024-2025',
    image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    description: 'Discover the complete beauty of Vietnam from north to south. Experience Hanoi\'s rich culture, cruise through Halong Bay, explore the ancient town of Hoi An, and discover the vibrant energy of Ho Chi Minh City.',
    highlights: [
      'Explore Hanoi\'s historical sites and street food',
      'Cruise through stunning Halong Bay',
      'Visit Hoa Lu ancient capital and Tam Coc',
      'Discover the charming ancient town of Hoi An',
      'Experience Ho Chi Minh City and Cu Chi Tunnels',
      'Cruise Mekong Delta and visit floating markets'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Hanoi Arrival',
        description: 'Arrive in Hanoi and check into your hotel. Free time to explore the city.',
        meals: 'None',
        location: 'Hanoi',
        activities: ['Airport pick-up', 'Hotel check-in', 'Free time']
      },
      {
        day: 2,
        title: 'Hanoi City & Street Food Tour',
        description: 'Full day walking tour of Hanoi including Ho Chi Minh Mausoleum, Temple of Literature, and street food experience.',
        meals: 'B/L',
        location: 'Hanoi',
        activities: ['Ho Chi Minh Mausoleum', 'One Pillar Pagoda', 'Temple of Literature', 'Old Quarter', 'Street food tour', 'Train Street']
      },
      {
        day: 3,
        title: 'Hoa Lu & Tam Coc Day Trip',
        description: 'Visit the ancient capital of Hoa Lu and enjoy a boat ride through Tam Coc\'s limestone caves.',
        meals: 'B/L',
        location: 'Ninh Binh',
        activities: ['Hoa Lu ancient capital', 'Tam Coc boat ride', 'Mua Cave climb', 'Panoramic views']
      },
      {
        day: 4,
        title: 'Halong Bay Cruise',
        description: 'Set sail on a traditional junk boat through the stunning limestone karsts of Halong Bay.',
        meals: 'B/L/D',
        location: 'Halong Bay',
        activities: ['Halong Bay cruise', 'Kayaking', 'Cave exploration', 'Sunset viewing', 'Overnight on cruise']
      },
      {
        day: 5,
        title: 'Halong Bay to Da Nang',
        description: 'Morning activities in Halong Bay, then flight to Da Nang and transfer to Hoi An.',
        meals: 'B/BR',
        location: 'Hoi An',
        activities: ['Morning cruise activities', 'Flight to Da Nang', 'Transfer to Hoi An', 'Free time']
      },
      {
        day: 6,
        title: 'Hoi An Walking Tour',
        description: 'Explore the UNESCO World Heritage ancient town of Hoi An with its charming architecture.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Ancient town walking tour', 'Japanese Bridge', 'Assembly Halls', 'Local markets', 'Optional My Son Sanctuary']
      },
      {
        day: 7,
        title: 'Tra Que Village Experience',
        description: 'Learn traditional farming, fishing, and cooking methods in Tra Que vegetable village.',
        meals: 'B/L',
        location: 'Hoi An',
        activities: ['Farming experience', 'Fishing with locals', 'Cooking class', 'Village tour']
      },
      {
        day: 8,
        title: 'Hoi An Free Day',
        description: 'Free day to explore Hoi An or optional tour to Ba Na Hills and Golden Bridge.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Free time', 'Optional Ba Na Hills tour', 'Golden Bridge visit', 'Beach time']
      },
      {
        day: 9,
        title: 'Flight to Ho Chi Minh City',
        description: 'Transfer to Da Nang airport and fly to Ho Chi Minh City.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Airport transfer', 'Flight to Ho Chi Minh', 'Hotel check-in', 'Free time']
      },
      {
        day: 10,
        title: 'Ho Chi Minh City & Cu Chi Tunnels',
        description: 'Full day city tour including Independence Palace, Notre Dame Cathedral, and Cu Chi Tunnels.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Independence Palace', 'Notre Dame Cathedral', 'Central Post Office', 'War Remnants Museum', 'Cu Chi Tunnels']
      },
      {
        day: 11,
        title: 'Mekong Delta Exploration',
        description: 'Full day trip to explore the Mekong Delta, visit floating markets and local villages.',
        meals: 'B/L',
        location: 'Mekong Delta',
        activities: ['Mekong Delta cruise', 'Floating markets', 'Local villages', 'Fruit tasting', 'Traditional music']
      },
      {
        day: 12,
        title: 'Departure',
        description: 'Transfer to airport for departure.',
        meals: 'B',
        location: 'Departure',
        activities: ['Breakfast', 'Airport transfer', 'Departure']
      }
    ],
    includes: [
      'Accommodation with daily breakfast',
      'Professional English-speaking guide',
      'Private air-conditioned vehicle',
      'Entrance fees for all visits',
      'Meals as indicated',
      'Halong Bay cruise (2 days/1 night)',
      'Domestic flights Hanoi-Da Nang, Da Nang-Ho Chi Minh'
    ],
    excludes: [
      'International flights',
      'Optional activities',
      'Personal expenses',
      'Tips',
      'Travel insurance',
      'Visa fees'
    ],
    hotels: [
      {
        city: 'Hanoi',
        category: '4*',
        name: 'Hanoi Hotel',
        description: 'Centrally located hotel in Hanoi'
      },
      {
        city: 'Hoi An',
        category: '4*',
        name: 'Hoi An Hotel',
        description: 'Traditional hotel in Hoi An'
      },
      {
        city: 'Ho Chi Minh',
        category: '4*',
        name: 'Ho Chi Minh Hotel',
        description: 'Modern hotel in Ho Chi Minh City'
      }
    ],
    difficulty: 'Easy',
    groupSize: '2-10 People',
    bestTime: 'October - April',
    rating: 4.9,
    reviews: 234,
    isPopular: true,
    discount: '20%'
  },
  {
    id: 'cambodia-10-days',
    title: '10-Day Cambodia Tour with Beach Relaxation',
    destination: 'Siem Reap, Phnom Penh, Koh Rong',
    duration: '10 Days - 9 Nights',
    style: 'Nature, Culture & Relaxation Tour',
    startLocation: 'Siem Reap',
    endLocation: 'Koh Rong',
    price: {
      single: 0,
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '4*',
    tourType: 'adventure',
    validity: '2024-2025',
    image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
    description: 'Discover the ancient wonders of Angkor Wat, explore the capital city of Phnom Penh, and relax on the pristine beaches of Koh Rong Island.',
    highlights: [
      'Visit magnificent Angkor Wat at sunrise',
      'Explore the ancient capital of Angkor Thom',
      'Discover the mysterious Ta Prohm temple',
      'Experience Phnom Penh\'s history and culture',
      'Relax on Koh Rong\'s pristine beaches',
      'Visit Tonle Sap floating villages'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Siem Reap Arrival',
        description: 'Arrive in Siem Reap and check into your hotel.',
        meals: 'None',
        location: 'Siem Reap',
        activities: ['Airport pick-up', 'Hotel check-in', 'Free time']
      },
      {
        day: 2,
        title: 'Angkor Thom & Ta Prohm & Angkor Wat',
        description: 'Early morning visit to Angkor Wat at sunrise, then explore Angkor Thom and Ta Prohm temples.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Angkor Wat sunrise', 'Angkor Thom complex', 'Ta Prohm temple', 'Bayon temple', 'Sunset at Bakheng Hill']
      },
      {
        day: 3,
        title: 'Tonle Sap Lake & Banteay Srei',
        description: 'Visit Tonle Sap floating village and explore the beautiful Banteay Srei temple.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Tonle Sap boat ride', 'Floating village tour', 'Banteay Srei temple', 'Banteay Samre temple']
      },
      {
        day: 4,
        title: 'Transfer to Phnom Penh',
        description: 'Travel by bus to Phnom Penh, Cambodia\'s capital city.',
        meals: 'B',
        location: 'Phnom Penh',
        activities: ['Bus transfer to Phnom Penh', 'Hotel check-in', 'Free time']
      },
      {
        day: 5,
        title: 'Phnom Penh City Tour',
        description: 'Explore Phnom Penh\'s historical sites including the Royal Palace and Silver Pagoda.',
        meals: 'B',
        location: 'Phnom Penh',
        activities: ['Royal Palace', 'Silver Pagoda', 'National Museum', 'Central Market']
      },
      {
        day: 6,
        title: 'Phnom Penh History Tour',
        description: 'Visit the Killing Fields and Tuol Sleng Genocide Museum to learn about Cambodia\'s history.',
        meals: 'B',
        location: 'Phnom Penh',
        activities: ['Killing Fields', 'Tuol Sleng Museum', 'Independence Monument', 'Russian Market']
      },
      {
        day: 7,
        title: 'Transfer to Koh Rong',
        description: 'Travel to Sihanoukville and take a boat to Koh Rong Island.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Transfer to Sihanoukville', 'Boat to Koh Rong', 'Beach relaxation']
      },
      {
        day: 8,
        title: 'Koh Rong Free Day',
        description: 'Free day to enjoy the pristine beaches and crystal-clear waters of Koh Rong.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Beach relaxation', 'Swimming', 'Snorkeling', 'Island exploration']
      },
      {
        day: 9,
        title: 'Koh Rong Leisure',
        description: 'Continue enjoying the beautiful beaches and optional water activities.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Beach time', 'Water sports', 'Island hopping', 'Sunset viewing']
      },
      {
        day: 10,
        title: 'Departure',
        description: 'Transfer back to Phnom Penh for departure.',
        meals: 'B',
        location: 'Departure',
        activities: ['Boat to Sihanoukville', 'Transfer to Phnom Penh', 'Airport departure']
      }
    ],
    includes: [
      'Accommodation with daily breakfast',
      'Professional English-speaking guide',
      'Private air-conditioned vehicle',
      'Entrance fees for all visits',
      'Meals as indicated',
      'Boat transfers to Koh Rong'
    ],
    excludes: [
      'International flights',
      'Optional activities',
      'Personal expenses',
      'Tips',
      'Travel insurance',
      'Visa fees'
    ],
    hotels: [
      {
        city: 'Siem Reap',
        category: '4*',
        name: 'Siem Reap Hotel',
        description: 'Luxury hotel near Angkor temples'
      },
      {
        city: 'Phnom Penh',
        category: '4*',
        name: 'Phnom Penh Hotel',
        description: 'Modern hotel in Phnom Penh'
      },
      {
        city: 'Koh Rong',
        category: '4*',
        name: 'Koh Rong Resort',
        description: 'Beachfront resort on Koh Rong'
      }
    ],
    difficulty: 'Easy',
    groupSize: '2-8 People',
    bestTime: 'November - March',
    rating: 4.6,
    reviews: 78,
    isPopular: false
  },
  {
    id: 'indochina-14-days',
    title: '14-Day Indochina Highlight Tour',
    destination: 'Hanoi, Halong Bay, Da Nang, Hoi An, Phu Quoc, Ho Chi Minh City, Siem Reap',
    duration: '14 Days - 13 Nights',
    style: 'Natural, Cultural & Historical Tour',
    startLocation: 'Hanoi',
    endLocation: 'Siem Reap',
    price: {
      single: 0,
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '5*',
    tourType: 'luxury',
    validity: '2024-2025',
    image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
    description: 'Experience the best of Indochina with this comprehensive 14-day journey through Vietnam and Cambodia. From Hanoi\'s rich culture to Angkor Wat\'s ancient wonders.',
    highlights: [
      'Hanoi rickshaw cycling tour through Old Quarter',
      'Halong Bay luxury cruise experience',
      'Hoi An ancient town exploration',
      'Phu Quoc island paradise',
      'Ho Chi Minh City and Cu Chi Tunnels',
      'Angkor Wat temple complex discovery'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Hanoi Arrival & Rickshaw Tour',
        description: 'Arrive in Hanoi and enjoy a rickshaw cycling tour through the Old Quarter.',
        meals: 'None',
        location: 'Hanoi',
        activities: ['Airport pick-up', 'Hotel check-in', 'Rickshaw cycling tour', 'Old Quarter exploration']
      },
      {
        day: 2,
        title: 'Hanoi Full Day City Tour',
        description: 'Comprehensive city tour including Ho Chi Minh complex, Temple of Literature, and Ethnology Museum.',
        meals: 'B/L',
        location: 'Hanoi',
        activities: ['Ho Chi Minh Mausoleum', 'One Pillar Pagoda', 'Temple of Literature', 'Ethnology Museum', 'Old Quarter']
      },
      {
        day: 3,
        title: 'Halong Bay Cruise',
        description: 'Set sail on a luxury cruise through the stunning limestone karsts of Halong Bay.',
        meals: 'B/L/D',
        location: 'Halong Bay',
        activities: ['Halong Bay cruise', 'Kayaking', 'Cave exploration', 'Sunset viewing', 'Overnight on cruise']
      },
      {
        day: 4,
        title: 'Halong Bay to Ho Chi Minh City',
        description: 'Morning activities in Halong Bay, then flight to Ho Chi Minh City.',
        meals: 'B/BR',
        location: 'Ho Chi Minh City',
        activities: ['Morning cruise activities', 'Flight to Ho Chi Minh', 'Hotel check-in']
      },
      {
        day: 5,
        title: 'Ho Chi Minh City & Cu Chi Tunnels',
        description: 'Explore Ho Chi Minh City and discover the historic Cu Chi Tunnels.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['City tour', 'Independence Palace', 'Notre Dame Cathedral', 'Cu Chi Tunnels']
      },
      {
        day: 6,
        title: 'Mekong Delta Tour',
        description: 'Full day trip to explore the Mekong Delta and visit My Tho and Ben Tre.',
        meals: 'B/L',
        location: 'Mekong Delta',
        activities: ['My Tho boat trip', 'Ben Tre coconut processing', 'Local villages', 'Fruit tasting']
      },
      {
        day: 7,
        title: 'Cai Rang Floating Market & Phu Quoc',
        description: 'Visit Cai Rang floating market and fly to Phu Quoc Island.',
        meals: 'B/L',
        location: 'Phu Quoc',
        activities: ['Cai Rang floating market', 'Flight to Phu Quoc', 'Beach relaxation']
      },
      {
        day: 8,
        title: 'Phu Quoc Free Day',
        description: 'Free day to enjoy the beautiful beaches of Phu Quoc.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Beach relaxation', 'Swimming', 'Island exploration']
      },
      {
        day: 9,
        title: 'Phu Quoc Speed Boat & Cable Car Tour',
        description: 'Optional speed boat tour and cable car to Hon Thom Island.',
        meals: 'B/L',
        location: 'Phu Quoc',
        activities: ['Speed boat tour', 'Snorkeling', 'Cable car to Hon Thom', 'Sunset Town']
      },
      {
        day: 10,
        title: 'VinWonders & Grand World',
        description: 'Full day at VinWonders theme park and Grand World complex.',
        meals: 'B/D',
        location: 'Phu Quoc',
        activities: ['VinWonders theme park', 'Grand World exploration', 'Entertainment shows']
      },
      {
        day: 11,
        title: 'Phu Quoc to Siem Reap',
        description: 'Flight from Phu Quoc to Ho Chi Minh City, then to Siem Reap.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Flight to Ho Chi Minh', 'Connection to Siem Reap', 'Hotel check-in']
      },
      {
        day: 12,
        title: 'Angkor Temple Tour',
        description: 'Explore the magnificent Angkor Wat temple complex.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Angkor Wat temple', 'Angkor Thom complex', 'Bayon temple', 'Ta Prohm temple']
      },
      {
        day: 13,
        title: 'Banteay Srei & Grand Circuit',
        description: 'Visit Banteay Srei temple and explore the Grand Circuit of Angkor.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Banteay Srei temple', 'Grand Circuit temples', 'Local villages']
      },
      {
        day: 14,
        title: 'Tonle Sap Lake & Departure',
        description: 'Boat trip on Tonle Sap Lake and departure from Siem Reap.',
        meals: 'B',
        location: 'Departure',
        activities: ['Tonle Sap boat trip', 'Floating village visit', 'Airport transfer', 'Departure']
      }
    ],
    includes: [
      'Accommodation with daily breakfast',
      'Professional English-speaking guide',
      'Private air-conditioned vehicle',
      'Entrance fees for all visits',
      'Meals as indicated',
      'Halong Bay cruise (2 days/1 night)',
      'Domestic flights as per itinerary'
    ],
    excludes: [
      'International flights',
      'Optional activities',
      'Personal expenses',
      'Tips',
      'Travel insurance',
      'Visa fees'
    ],
    hotels: [
      {
        city: 'Hanoi',
        category: '5*',
        name: 'Hanoi Luxury Hotel',
        description: 'Premium hotel in Hanoi city center'
      },
      {
        city: 'Ho Chi Minh',
        category: '5*',
        name: 'Ho Chi Minh Luxury Hotel',
        description: 'Luxury hotel in Ho Chi Minh City'
      },
      {
        city: 'Phu Quoc',
        category: '5*',
        name: 'Phu Quoc Resort',
        description: 'Beachfront luxury resort'
      },
      {
        city: 'Siem Reap',
        category: '5*',
        name: 'Siem Reap Resort',
        description: 'Luxury resort near Angkor temples'
      }
    ],
    difficulty: 'Moderate',
    groupSize: '2-12 People',
    bestTime: 'October - April',
    rating: 4.8,
    reviews: 156,
    isPopular: true,
    discount: '25%'
  },
  {
    id: 'thailand-vietnam-14-day',
    title: '14-Day Thailand & Vietnam Holiday Package',
    destination: 'Bangkok, Chiang Mai, Phuket, Ho Chi Minh City, Mekong Delta, Hanoi, Halong Bay',
    duration: '14 Days - 13 Nights',
    style: 'Culture, History, Beach & Nature Holiday',
    startLocation: 'Bangkok',
    endLocation: 'Hanoi',
    price: {
      single: 0,
      twin: 0,
      triple: 0,
      group: 0,
      singleSupplement: 0
    },
    category: '5*',
    tourType: 'luxury',
    validity: '2024-2025',
    image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
    description: 'Experience the best of both Thailand and Vietnam in this comprehensive 14-day holiday package. From Bangkok\'s vibrant culture to Vietnam\'s stunning landscapes, enjoy a perfect blend of city exploration, beach relaxation, and cultural immersion.',
    highlights: [
      'Explore Bangkok\'s royal palaces and floating markets',
      'Experience traditional Thai culture in Chiang Mai',
      'Relax on Phuket\'s pristine beaches',
      'Discover Ho Chi Minh City\'s vibrant energy',
      'Cruise through the Mekong Delta',
      'Explore Hanoi\'s rich history and culture',
      'Sail through the stunning Halong Bay'
    ],
    itinerary: [
      {
        day: 1,
        title: 'Arrival in Bangkok',
        description: 'Upon arrival at Airport, you\'ll be met & transferred to your hotel in Bangkok for a Check-in. (Hotel check-in time is after 14:00) The rest of time, you\'ll be free on your own.',
        meals: 'None',
        location: 'Bangkok',
        activities: ['Airport pick-up', 'Hotel check-in', 'Free time', 'Evening stroll']
      },
      {
        day: 2,
        title: 'Bangkok Free Day',
        description: 'Today you will have freetime to discover Bangkok by yourself (no services) or you can choose this tour optional as below: Tour option 1: Bangkok city tour full day - Visit Royal Grand Palace, Wat Phra Kaew (Emerald Buddha), Wat Pho (Giant Buddha), Chao Phraya River cruise, Wat Arun (Temple of Dawn), Wat Traimit (Golden Buddha). Tour option 2: Bangkok – Salt Farm – Train Market – Coconut Sugar Farm - Damnoen Saduak Floating Market Half Day.',
        meals: 'B',
        location: 'Bangkok',
        activities: ['Free time', 'Optional: Bangkok city tour full day', 'Optional: Salt Farm - Train Market - Coconut Sugar Farm - Damnoen Saduak Floating Market Half Day', 'Royal Grand Palace', 'Wat Phra Kaew (Emerald Buddha)', 'Wat Pho (Giant Buddha)', 'Chao Phraya River cruise', 'Wat Arun (Temple of Dawn)', 'Wat Traimit (Golden Buddha)']
      },
      {
        day: 3,
        title: 'Bangkok Free Day',
        description: 'Today you will have freetime to shopping in Bangkok by yourself and your own cost. (Please note that no additional services will be provided during this free period.)',
        meals: 'B',
        location: 'Bangkok',
        activities: ['Free time', 'Shopping', 'Self-exploration', 'City discovery']
      },
      {
        day: 4,
        title: 'Bangkok – Ho Chi Minh by Flight',
        description: 'Breakfast at hotel. You will be picked up and transferred to the airport for the departure to Ho Chi Minh City. On arrival at the airport, you are met and transferred to hotel for check in.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Airport transfer', 'Flight to Ho Chi Minh City', 'Hotel check-in', 'Free time']
      },
      {
        day: 5,
        title: 'Ho Chi Minh City & Cu Chi Private Tour',
        description: 'Take the morning trip to visit Independence Palace, also known as the Reunification palace, designed by architect Ngo Viet Thu. Continue seeing beautiful structures from the French Colonial times such as the Notre Dame Cathedral and the historic Central Post Office. Visit the remarkable War Remnants Museum with vast display of both Indochina wars. Afternoon departure for Cu Chi tunnel. Explore the remaining area and tunnel systems including special constructed living areas with kitchens, bedrooms, storage, weapons factories, field hospitals, and command centers. Experience hidden trap doors and dangerous traps within the maze-like tunnels.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Independence Palace (Reunification Palace)', 'Notre Dame Cathedral', 'Central Post Office', 'War Remnants Museum', 'Cu Chi Tunnels exploration', 'Tunnel systems tour', 'Special tea and cassava tasting', 'Optional: Real shooting gun experience']
      },
      {
        day: 6,
        title: 'Ho Chi Minh Free Day',
        description: 'After having breakfast at hotel, you\'ll be free on your own to relax at hotel or explore Sai Gon by yourself (No car & No guide). You might like our option as below: Option tour: Full Day Mekong Delta Tour (My Tho – Ben Tre) - Visit Vinh Trang pagoda, sampan cruise around four beautiful islands, visit fruit plantation, hand-rowed sampan through Thoi Son canal, visit honey-bee farm, enjoy honey tea and coconut candy workshop, cycling around Tan Thach village.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Free time', 'City exploration', 'Optional: Full Day Mekong Delta Tour (My Tho – Ben Tre)', 'Vinh Trang pagoda', 'Sampan cruise', 'Fruit plantation visit', 'Honey-bee farm', 'Coconut candy workshop', 'Cycling around Tan Thach village']
      },
      {
        day: 7,
        title: 'Ho Chi Minh – Flight to DaNang – Hoi An',
        description: 'Breakfast at hotel, you\'ll be free to discover Ho Chi Minh until transferred to Tan Son Nhat airport for a departure flight to Da Nang. On arrival at Da Nang Airport, you are met and transferred to hotel in Hoi An.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Airport transfer', 'Flight to DaNang', 'Transfer to Hoi An', 'Hotel check-in', 'Free time']
      },
      {
        day: 8,
        title: 'Hoi An Free Day',
        description: 'After breakfast at hotel, you will have freetime in Hoi An or you can choose this optional tour as below: Option tour 1: Hoi An Ancient Town - My Son Holy Land Private Tour - Visit My Son Sanctuary, Thanh Ha ceramic village, boat on Thu Bon River, walking tour around old streets including Japanese Covered Bridge, Chinese Assembly Halls, Sa Huynh Museum, old houses, and local market. Option tour 2: Learning Fishing – Cooking Class – Hoi An Ancient Town & Street Food Private Tour - Boat trip to Cam Nam fishing village, Bay Mau water coconut forest, basket boat, cycling to Tra Que Vegetable Village, cooking class, Hoi An Ancient Town exploration, street food tasting.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Free time', 'Hoi An exploration', 'Optional: Hoi An Ancient Town - My Son Holy Land Private Tour', 'Optional: Learning Fishing – Cooking Class – Hoi An Ancient Town & Street Food Private Tour', 'My Son Sanctuary', 'Thanh Ha ceramic village', 'Thu Bon River boat trip', 'Japanese Covered Bridge', 'Chinese Assembly Halls', 'Sa Huynh Museum', 'Fishing village visit', 'Bay Mau water coconut forest', 'Basket boat', 'Tra Que Vegetable Village', 'Cooking class', 'Street food tasting']
      },
      {
        day: 9,
        title: 'Hoi An Free Day',
        description: 'After having breakfast at hotel, you\'ll be free on your own to relax at hotel or explore Hoi An town by yourself (No Car & No Guide). Option tour: Da Nang – Discover Marble Mountain & Ba Na Hill - Visit Marble Mountain, Ba Na Hills cable car, Golden Bridge, flower garden Le Jardin D\'amour, Debay Wine Cellar, French Village, Fantasy Amusement Park.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Free time', 'Hoi An exploration', 'Optional: Da Nang – Discover Marble Mountain & Ba Na Hill', 'Marble Mountain', 'Ba Na Hills cable car', 'Golden Bridge', 'Le Jardin D\'amour flower garden', 'Debay Wine Cellar', 'French Village', 'Fantasy Amusement Park']
      },
      {
        day: 10,
        title: 'Hoi An - Danang Flight to Hanoi',
        description: 'Then you will be picked up to Da Nang Train Station for departure to Hanoi. Arrive in Noi Bai airport, Hanoi, you will be picked up to hotel to drop off your luggage. Free to discover the city or walk around the town.',
        meals: 'B',
        location: 'Hanoi',
        activities: ['Transfer to DaNang', 'Flight to Hanoi', 'Airport transfer', 'Hotel check-in', 'Free time', 'City exploration']
      },
      {
        day: 11,
        title: 'Hanoi Half Day Walking Private Tour',
        description: 'Have breakfast before walking tour to visit the Ho Chi Minh Complex, which contains the mausoleum of the nation\'s founder Ho Chi Minh, the Presidential Palace, and the Ho Chi Minh\'s house on stilts. Close to this complex is the One Pillar Pagoda, whose origins date back to the foundation of city. We follow it with a visit to the Temple of Literature, which is well known as the first university of Vietnam. Later, we will take a visit at Ngoc Son Temple. Optional: Hanoi Street Food Tour in the evening.',
        meals: 'B',
        location: 'Hanoi',
        activities: ['Ho Chi Minh Complex', 'Ho Chi Minh Mausoleum', 'Presidential Palace', 'Ho Chi Minh\'s house on stilts', 'One Pillar Pagoda', 'Temple of Literature', 'Ngoc Son Temple', 'Optional: Hanoi Street Food Tour']
      },
      {
        day: 12,
        title: 'Hanoi – Halong Bay on Cruise',
        description: 'Pick up at Old Quarter area to transfer from Hanoi to Halong Bay. Check-in at Tuan Chau Island Aquamarine lounge. Welcome drink and safety briefing. Lunch on board while cruising towards southeast of Halong Bay, passing Fighting-Cock and Finger Islet. Visit Luon Cave or Pearl Farm area by bamboo boat or kayaking. Visit Titov Island for swimming or hiking. Sunset party with HAPPY HOUR. Traditional Vietnamese cooking class. Dinner on board. Spa treatments or cocktail. Squid fishing tools available.',
        meals: 'B/L/D',
        location: 'Halong Bay',
        activities: ['Transfer to Halong Bay', 'Cruise check-in', 'Welcome drink', 'Safety briefing', 'Lunch on board', 'Luon Cave or Pearl Farm visit', 'Kayaking', 'Titov Island visit', 'Swimming', 'Hiking', 'Sunset party', 'Cooking class', 'Dinner on board', 'Spa treatments', 'Squid fishing']
      },
      {
        day: 13,
        title: 'Halong – Hanoi',
        description: 'Warm up your day with a Tai Chi lesson on the sundeck. Light breakfast at the restaurant. Visit the magnificent Sung Sot Cave, one of the biggest caves in Ha Long Bay with beautiful stalactites. Back on board, check-out and return to Tuan Chau Island. Brunch is served at the restaurant. Disembark at Tuan Chau Marina, return to Hanoi. Free in Hanoi.',
        meals: 'B/L',
        location: 'Hanoi',
        activities: ['Tai Chi lesson', 'Light breakfast', 'Sung Sot Cave visit', 'Cave exploration', 'Stalactites viewing', 'Check-out', 'Brunch on board', 'Return to Hanoi', 'Free time']
      },
      {
        day: 14,
        title: 'Hanoi – Departure',
        description: 'Breakfast at hotel then you will have freetime to discover Hanoi Old Quarter until transferred to Noi Bai Airport for you departure flight.',
        meals: 'B',
        location: 'Hanoi',
        activities: ['Hotel check-out', 'Free time', 'Hanoi Old Quarter exploration', 'Airport transfer', 'Departure']
      }
    ],
    includes: [
      'Transportation in private with air-condition',
      'Accommodation in Double/Twin shared room',
      'Local English-speaking guides',
      'Entrance fee at indicated sights',
      'Hanoi walking private tour',
      'Halong Bay cruise with round trip shared transfer',
      'Ho Chi Minh city + Cu Chi Tunnel private tour',
      'Meals as indicated in the itinerary: B = Breakfast, L = Lunch',
      'Gov\'t tax and service charge',
      'Luggage handling and drinking water'
    ],
    excludes: [
      'Visa',
      'Travel insurance, drinks',
      'Items of a personal nature',
      'Tips for guide and driver',
      'All airfares (Bangkok to Ho Chi Minh City/Saigon to Danang/Danang to Hanoi)'
    ],
    hotels: [
      {
        city: 'Bangkok',
        category: '5*',
        name: 'Bangkok Luxury Hotel',
        description: 'Premium hotel in Bangkok city center'
      },
      {
        city: 'Chiang Mai',
        category: '5*',
        name: 'Chiang Mai Resort',
        description: 'Luxury resort in Chiang Mai'
      },
      {
        city: 'Phuket',
        category: '5*',
        name: 'Phuket Beach Resort',
        description: 'Beachfront luxury resort in Phuket'
      },
      {
        city: 'Ho Chi Minh',
        category: '5*',
        name: 'Ho Chi Minh Luxury Hotel',
        description: 'Luxury hotel in Ho Chi Minh City'
      },
      {
        city: 'Hanoi',
        category: '5*',
        name: 'Hanoi Luxury Hotel',
        description: 'Premium hotel in Hanoi city center'
      }
    ],
    difficulty: 'Easy',
    groupSize: '2-12 People',
    bestTime: 'November - March',
    rating: 4.9,
    reviews: 189,
    isPopular: true,
    discount: '30%'
  }
];

export const getTourById = (id: string): TourPackage | undefined => {
  return tourPackages.find(tour => tour.id === id);
};

export const getToursByDestination = (destination: string): TourPackage[] => {
  return tourPackages.filter(tour => 
    tour.destination.toLowerCase().includes(destination.toLowerCase())
  );
};

export const getPopularTours = (): TourPackage[] => {
  return tourPackages.filter(tour => tour.isPopular);
};
