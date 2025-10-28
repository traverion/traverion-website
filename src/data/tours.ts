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
      startingFrom: 499, // USD - Category 3*, 16-20 people (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 298, // Category 3* single supplement
      validity: '01 Oct 2025 - 31 Dec 2026',
      // Detailed pricing for custom quotes
      category3: {
        '2-people': 808,
        '3-6-people': 695,
        '7-10-people': 599,
        '11-15-people': 562,
        '16-20-people': 499,
        singleSupplement: 298
      },
      category4: {
        '2-people': 900,
        '3-6-people': 787,
        '7-10-people': 694,
        '11-15-people': 671,
        '16-20-people': 620,
        singleSupplement: 340
      },
      category5: {
        '2-people': 1145,
        '3-6-people': 1054,
        '7-10-people': 989,
        '11-15-people': 968,
        '16-20-people': 885,
        singleSupplement: 644
      }
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
        title: 'Ho Chi Minh City Arrival - Airport Pick Up',
        description: 'Welcome to Ho Chi Minh City – the biggest and most dynamic city in Vietnam! Upon your arrival at Tan Son Nhat International Airport, our friendly driver/guide will be waiting to greet you with a warm welcome sign. You\'ll enjoy a comfortable transfer to your hotel in the city center. On arrival at the hotel, you will proceed with check-in. Take this time to relax and settle in after your journey, or explore the nearby streets to start soaking up the vibrant energy of Saigon- Ho Chi Minh City.',
        meals: 'None',
        location: 'Ho Chi Minh City',
        activities: ['Airport pick-up', 'Hotel transfer', 'Hotel check-in', 'City exploration', 'Rest and relaxation']
      },
      {
        day: 2,
        title: 'Ho Chi Minh City Half-Day City Tour - Cu Chi Tunnels',
        description: 'Take the morning trip to visit Independence Palace, also known at the Reunification palace, was built on the sight of the former Norodom palace. The Independence palace is a widely known landmark of Ho Chi Minh City and was designed by the architect Ngo Viet Thu. Continue seeing the beautiful structures from the French Colonial times such as the Notre Dame Cathedral, the historic Central Post Office. Followed by the remarkable site of the War Remnants Museum the museum has a vast display of the both the Indochina wars. Have lunch at local restaurant. Depart for Cu Chi tunnel, the trip will take approximately one and a half hours bus driving. Upon arrival, before exploring the tunnels, you will have some short introduction followed by introductory video about how the tunnels were constructed and how the people survived in the harsh conditions of the war time. Then, spend your time to explore the remaining area and tunnel systems which included the special constructed living areas with kitchens, bedrooms side by side with other martial facilities like storage, weapons factories, field hospitals, and command centers helping whoever lives inside the tunnels meet their basic needs. Besides, there are also many hidden trap doors and dangerous traps within the maze-like tunnels for security purpose during the war. Afterward, special tea and cassava (guerilla\'s food during the war) will be served. Break time for relax or time for those who want to try the real shooting gun (bullets you pay by yourself).',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Independence Palace (Reunification Palace)', 'Notre Dame Cathedral', 'Central Post Office', 'War Remnants Museum', 'Local lunch', 'Cu Chi Tunnels exploration', 'Tunnel systems tour', 'Special tea and cassava tasting', 'Optional: Real shooting gun experience']
      },
      {
        day: 3,
        title: 'Explore Mekong Delta Tour',
        description: 'Heading out of town, we travel by roads to the Mekong Delta. This plain region boasts the largest rice bowl of Vietnam. On the way, we will visit Vinh Trang pagoda, the biggest pagoda in the Mekong delta. Upon arrival in My Tho, we board a boat navigating around the intricate small canals, which is a great way to observe the local lifestyle close-up and catch a view dotted by many islands. The exciting river trip will pass by the lush green vegetation towards the famous Unicorn Island where we have a chance to stroll around an orchard, taste many seasonal fruits, see farmers at work and Vietnamese folk music performed by the local people. We navigate some narrower canals using small rowing boats to Ben Tre Province for an interesting visit to some local industries. The extra enjoyment is a lunch at one of the famous local eating spots. After lunch, enjoy your time relaxing, walking around the village, or perhaps going for a short bike ride.',
        meals: 'B/L',
        location: 'Can Tho',
        activities: ['Vinh Trang pagoda', 'My Tho boat trip', 'Canal navigation', 'Unicorn Island visit', 'Fruit tasting', 'Vietnamese folk music', 'Ben Tre Province visit', 'Local industries tour', 'Local lunch', 'Village exploration', 'Bike ride']
      },
      {
        day: 4,
        title: 'Floating Market – Back to Ho Chi Minh',
        description: 'Have breakfast at the hotel. Take a leisure boat trip to explore the picturesque tributaries of the Lower Mekong River (Bassac River) then visit to Cai Rang floating market which is the liveliest one in the whole of region. Take in the beautiful scenery and the daily activities of the locals who live along the Mekong canals. Enjoy fresh fruits on boat and walking trip to visit local noodle factory. Have lunch and return to Ho Chi Minh City.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Boat trip on Lower Mekong River', 'Cai Rang floating market', 'Local lifestyle observation', 'Fresh fruits on boat', 'Local noodle factory visit', 'Lunch', 'Return to Ho Chi Minh City']
      },
      {
        day: 5,
        title: 'Ho Chi Minh City - Flight to Phu Quoc',
        description: 'Having breakfast at hotel. Then you are free and relaxing before meeting our driver to get private transfer to Tan Son Nhat Airport. Flight to Phu Quoc Island. This flight usually takes about 1 hour to 1 hour and 15 minutes. Upon arrival in Phu Quoc, you will be transferred to your accommodation to check in and drop off your luggage. Then you are free to explore Phu Quoc.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Hotel check-out', 'Airport transfer', 'Flight to Phu Quoc', 'Hotel check-in', 'Island exploration', 'Free time']
      },
      {
        day: 6,
        title: 'Phu Quoc – Free Day',
        description: 'Having breakfast at hotel. OPTIONAL TOUR: ISLANDS SPEED BOAT – CABLE CAR TO HON THOM. Then Embark on an Island Speed Boat Tour from An Thoi port. This typically includes snorkeling or swimming at beautiful islands like Hon Roi, Hon Mong Tay, and Hon May Rut, known for their clear waters and vibrant coral reefs. After the island hopping, you will head to the Sun World Hon Thom Cable Car station. Board the world\'s longest sea-crossing Cable Car to Hon Thom Island. The ride offers breathtaking aerial views of the archipelago. On Hon Thom, you\'ll have access to Sun World Hon Thom Nature Park, which includes Aquatopia Water Park and various beach activities. Late Afternoon Return via cable car to the mainland and proceed to Sunset Town (also known as Mediterranean Town). This beautifully designed area features European-inspired architecture, charming streets, and the iconic Kiss Bridge. As dusk settles, find a good spot to witness the spectacular sunset. Optional activity: The evening culminates with the grand "Kiss of the Sea" show, a world-class multimedia performance with water, fire, lasers, international artists, and a nightly Fireworks Show.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Free time', 'Optional: Island Speed Boat Tour', 'Snorkeling', 'Swimming', 'Hon Roi Island', 'Hon Mong Tay Island', 'Hon May Rut Island', 'Cable Car to Hon Thom', 'Sun World Hon Thom Nature Park', 'Aquatopia Water Park', 'Sunset Town visit', 'Kiss Bridge', 'Sunset viewing', 'Optional: Kiss of the Sea show', 'Fireworks Show']
      },
      {
        day: 7,
        title: 'Phu Quoc at Your Leisure',
        description: 'Having breakfast, then you are to discover Phu Quoc Island. OPTIONAL TOUR 1: VinWonders & Vinpearl Safari Immersion. Dedicate your entire day to the Vinpearl complex in the north of Phu Quoc. Start with VinWonders Phu Quoc, Vietnam\'s largest theme park. It offers six themed zones with a wide array of rides, shows, and attractions suitable for all ages, from thrilling roller coasters to magical dark rides and a large water park. After exploring VinWonders, transfer to Vinpearl Safari Phu Quoc, Vietnam\'s first open-range safari park. Here, you\'ll experience a unique "safari" where animals roam freely, and visitors observe from specialized buses, mimicking a real safari experience. You\'ll see a diverse range of animals from around the world, including giraffes, zebras, rhinos, and various primates. OPTIONAL TOUR 2: Visiting the 6 most popular sites in the South of Phu Quoc: Phu Quoc Prison (Coconut Tree Prison), Pearl Farm, Sao Beach, Phu Quoc Fish Sauce Factory, Phu Quoc Pepper Farm.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Free time', 'Optional: VinWonders Phu Quoc', 'Theme park rides', 'Water park', 'Optional: Vinpearl Safari', 'Safari experience', 'Animal observation', 'Optional: Phu Quoc Prison visit', 'Optional: Pearl Farm visit', 'Optional: Sao Beach', 'Optional: Fish Sauce Factory', 'Optional: Pepper Farm']
      },
      {
        day: 8,
        title: 'Phu Quoc Island – Flight to Ho Chi Minh',
        description: 'Having breakfast at hotel. Then you will be transferred to Phu Quoc International Airport (PQC) for your flight back to Ho Chi Minh.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Hotel check-out', 'Airport transfer', 'Flight to Ho Chi Minh', 'Hotel check-in']
      },
      {
        day: 9,
        title: 'Ho Chi Minh – Departure',
        description: 'Having breakfast at hotel. Say goodbye to Vietnam and see you next time!',
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
      startingFrom: 935, // USD - Category 3*, 19-20+ people (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 265, // Category 3* single supplement (low season)
      validity: '01 Nov 2025 - 31 Oct 2026',
      // Detailed pricing for custom quotes - HIGH SEASON (10 Jan - 31 Mar 2026, except Chinese New Year 14-20 Feb)
      category3: {
        '2-people': 1197,
        '3-6-people': 1005,
        '7-10-people': 1103,
        '11-12-people': 928,
        '13-15-people': 1033,
        '16-18-people': 997,
        '19-20-people': 935,
        singleSupplement: 358
      },
      category4: {
        '2-people': 1340,
        '3-6-people': 1148,
        '7-10-people': 1245,
        '11-12-people': 1071,
        '13-15-people': 1176,
        '16-18-people': 1157,
        '19-20-people': 1093,
        singleSupplement: 500
      },
      category5: {
        '2-people': 1770,
        '3-6-people': 1578,
        '7-10-people': 1676,
        '11-12-people': 1501,
        '13-15-people': 1607,
        '16-18-people': 1641,
        '19-20-people': 1567,
        singleSupplement: 930
      },
      // LOW SEASON pricing (01 Nov - 01 Apr to 31 Oct 2026, except Songkran Festival 12-16 Apr)
      lowSeason: {
        category3: {
          '2-people': 1104,
          '3-6-people': 1005,
          '7-10-people': 1103,
          '11-12-people': 928,
          '13-15-people': 1088,
          '16-18-people': 997,
          '19-20-people': 935,
          singleSupplement: 265
        },
        category4: {
          '2-people': 1205,
          '3-6-people': 1013,
          '7-10-people': 1111,
          '11-12-people': 935,
          '13-15-people': 1041,
          '16-18-people': 1005,
          '19-20-people': 943,
          singleSupplement: 366
        },
        category5: {
          '2-people': 1541,
          '3-6-people': 1349,
          '7-10-people': 1447,
          '11-12-people': 1272,
          '13-15-people': 1378,
          '16-18-people': 1383,
          '19-20-people': 1316,
          singleSupplement: 703
        }
      },
      // Children policies
      childrenPolicies: {
        infant: 'Free (below 2 years, sharing room with parents)',
        child90: '90% of adult price (below 11 years, sharing room with 1 adult)',
        child65: '65% of adult price (below 11 years, extra bed, sharing with parents)',
        child55: '55% of adult price (below 11 years, no extra bed, sharing with parents)'
      }
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
        description: 'Upon arrival at Bangkok airport, you will be warmly welcomed by our tour guide, then transfer to the hotel for relaxing (standard check-in time is 2pm). Back to hotel. Feel free to rest after long flight and transfer.',
        meals: 'None',
        location: 'Bangkok',
        activities: ['Airport pick-up', 'Hotel transfer', 'Hotel check-in', 'Rest and relaxation']
      },
      {
        day: 2,
        title: 'Bangkok - Full Day Highlights Tour of Bangkok',
        description: 'Experience Bangkok\'s highlights and history on a full-day tour through the heart of the city. First, visit the Royal Grand Palace, the nation\'s landmark and most praised royal monument in Thailand, with the enclosed and dazzling Wat Phra Keo with its revered Emerald Buddha, the Golden Chedi, the Pantheon of the Chakri Kings and the Eight Colored Towers. Wat Pho is also regarded as the first center of public education and is sometimes called \'Thailand\'s first university\'. Here, you will enjoy a 30-minutes\' Thai massage as an excellent break after a morning sightseeing. Enjoy an afternoon trip along the bustling Chao Phraya River. A stop will be made at the "Temple of Dawn" (officially named Wat Arun) - it is one of the most spectacular and recognizable Thai landmarks.',
        meals: 'B',
        location: 'Bangkok',
        activities: ['Royal Grand Palace', 'Wat Phra Keo (Emerald Buddha)', 'Golden Chedi', 'Pantheon of Chakri Kings', 'Eight Colored Towers', 'Wat Pho temple', 'Thai massage (30 minutes)', 'Chao Phraya River cruise', 'Wat Arun (Temple of Dawn)']
      },
      {
        day: 3,
        title: 'Bangkok - Railway Market & Damnoen Saduak Floating Market',
        description: 'Depart from Bangkok and head to Maeklong Railway Market, also known as Talad Rom Hoop. Upon arrival, the guide will introduce you to the history of this area. See the action in several minutes before the train passing through the market. The process happens so quick it will amaze you for the unique moment. Then tour takes you to the rural yet world-famous floating market of Damnoen Saduak, situated around 100 kilometers west of Bangkok. It is generally known as Klong Ton Khem Floating Market or Damnoen Saduak Floating Market. You can taste at the traditional Thai\'s cuisine at the market by your own choice such as Tom-yum soup, Pad Thai Noodle, seasonal fruits, Thai sweets, coconut ice cream or juice from the boat vender pass by during tour.',
        meals: 'B',
        location: 'Bangkok',
        activities: ['Maeklong Railway Market', 'Train passing experience', 'Damnoen Saduak Floating Market', 'Traditional Thai cuisine tasting', 'Tom-yum soup', 'Pad Thai Noodle', 'Seasonal fruits', 'Thai sweets', 'Coconut ice cream', 'Boat vendor experience']
      },
      {
        day: 4,
        title: 'Bangkok – Flight to Chiang Rai – Golden Triangle & Long Neck Women\'s Village',
        description: 'After breakfast, transfer by driver to Bangkok International airport for flight to Chiang Rai. Arrival at Chiang Rai airport, meet our guide/driver then transfer to central. Visit the Long Neck Tribe Village; the woman wears several brass rings around their long, slender necks. A woman generally has about twenty or more rings around her neck. They are originated from Shan state, The Union of Myanmar. Explore their daily life, listen the stories about their culture. You can find beautiful handy craft souvenirs in here, all made by locals. Heading to The Golden Triangle is the area where the borders of Thailand, Laos, and Myanmar meet at the confluence of the Ruak and Mekong rivers. Witness the mighty of Mekong River and then experience boat riding on Mae Khong River for about 30-40mins. Then further to The House of Opium Museum - a museum that tells stories of opium in the Golden Triangle through beautiful antiques such as opium harvesting knives, scales, weights, pipes, mats and pillows.',
        meals: 'B',
        location: 'Chiang Rai',
        activities: ['Airport transfer', 'Flight to Chiang Rai', 'Long Neck Tribe Village visit', 'Cultural exploration', 'Handicraft shopping', 'Golden Triangle visit', 'Mekong River boat ride', 'House of Opium Museum', 'Opium history learning']
      },
      {
        day: 5,
        title: 'Chiang Rai – Color Temples & San Kamphaeng Hot Spring – Transfer to Chiang Mai',
        description: 'After breakfast, get ready to pick at the lobby then depart to Chiang Mai city, the heart of Northern Thailand (3.5hrs transfer). Today we take time to visit Blue Temple (Wat Rong Seur Ten): designed by the local Chiang Rai artist who used to do the teamwork of White Temple before. The main temple building is a distinctive blue color with the new philosophy of Buddhist art. Then visit to White Temple (Rong Khun Temple); designed by the famous national artist. The main temple building is a distinctive white color, decorated with fragments of reflective glass which can be seen from afar. On the way take a short rest at San Kamphaeng Hot Springs Chiang Mai. Rest your feet in warm water, enjoy a boiled egg or soak your body in Minerals bath with the natural steam water of hot-spring.',
        meals: 'B',
        location: 'Chiang Mai',
        activities: ['Transfer to Chiang Mai', 'Blue Temple (Wat Rong Seur Ten)', 'White Temple (Rong Khun Temple)', 'San Kamphaeng Hot Springs', 'Mineral bath soak', 'Boiled egg experience', 'Hotel check-in']
      },
      {
        day: 6,
        title: 'Chiang Mai – Half Day Kanta Elephant Camp & Doi Suthep Temples',
        description: 'A half-day package to Kanta Elephant Sanctuary offers visitors an enjoyable opportunity to spend quality time with elephants in their natural home, as well as gain an insight into their history and behavior, and create cherished lifelong memories. Drive approximately 50 Mins North of Chiang Mai through a beautiful countryside, forest, and local farming areas. Arrive at Kanta Elephant Sanctuary. Walk through and learn about the elephants, change into traditional clothing and prepare fruits for our elephants. Meet the elephants. Feed, interact, and play with the elephants in a natural environment and learn about their behavior and history. Take photos with the elephants. Walk with the elephants to a clean water pond where they will cool off themselves and you will have chance to observe them as well. In the afternoon: Proceed to Phrathat Doi Suthep Temple, one of northern Thailand\'s most sacred temples built in the year 1383. It is located 1,050 meters above sea level. See the marvelous golden chedi, which contains the holy relics of Lord Buddha. Enjoy the panoramic view of Chiang Mai City and Ping valley from the summit of Suthep Mountain.',
        meals: 'B',
        location: 'Chiang Mai',
        activities: ['Kanta Elephant Sanctuary', 'Traditional clothing change', 'Elephant feeding', 'Elephant interaction', 'Elephant photos', 'Elephant walking to pond', 'Elephant observation', 'Phrathat Doi Suthep Temple', 'Golden chedi visit', 'Panoramic city view', '306 stairs climb', 'Naga statues viewing']
      },
      {
        day: 7,
        title: 'Chiang Mai - Flight to Phuket',
        description: 'Breakfast in the morning & free time at hotel until transferring to airport for flight to Phuket. Upon arrival, meet our representative and driver. Transfer to hotel in central. Free resting at night.',
        meals: 'B',
        location: 'Phuket',
        activities: ['Hotel check-out', 'Airport transfer', 'Flight to Phuket', 'Airport pick-up', 'Hotel check-in', 'Free time']
      },
      {
        day: 8,
        title: 'Phuket – Phuket City & Old Town - Tiger Park Experiences',
        description: 'Sightseeing Kata, Karon Beach. Karon View Point also known as Three Beach View Point. As once you reach its peak perched in the south of Kata Beach, in front of you is the breathtaking view of beautiful Kata Noi, Kata and Karon beaches as well as the deep-blue Andaman Sea. Windmill View Point is located between Ya Nui and Nai Harn beaches in south Phuket. Not far from Phromthep Cape, it has several tall, slim white windmills belonging to the Promthep Alternative Energy Station. Wat Chalong Temple is a historical landmark and Buddhist temple in Phuket\'s Chalong Bay. For centuries, locals come to pray almost every day while westerners learn about Buddhism during their holiday. Phuket Old Town (Sino Portuguese style). Rang Hill Top Phuket Town View Point. Visit Souvenir Shop such as Cashew Nut Factory, Honey Bee Farm, Pearl Farm etc. Drop off at Tiger Kingdom Phuket. Come explore the majestic world of tigers at Tiger Kingdom Phuket! Get up close and personal with these beautiful creatures and upgrade your holiday from good to awesome!',
        meals: 'B',
        location: 'Phuket',
        activities: ['Kata Beach', 'Karon Beach', 'Karon View Point', 'Three Beach View Point', 'Windmill View Point', 'Wat Chalong Temple', 'Phuket Old Town', 'Sino Portuguese architecture', 'Rang Hill View Point', 'Cashew Nut Factory', 'Honey Bee Farm', 'Pearl Farm', 'Tiger Kingdom Phuket', 'Tiger interaction', 'Tiger photos']
      },
      {
        day: 9,
        title: 'Phuket – Phi Phi Island by Speed Boat',
        description: 'Pick up at Hotel Lobby. Meet up at Royal Phuket Marina. Depart from the pier, Enjoy a trip by luxury speedboat to Maya bay, Stop at Maya Bay to see the stunning location at the Hollywood movie "The Beach". Experience of fun and enjoy sightseeing, swimming, and snorkeling with an experienced crew. Visit Pileh Lagoon where you can swimming and jumping in crystal clear water. Visit Viking cave and see ancient cave paintings and thousands of swallows living the hidden cove of Ao Ling or Monkey Beach. Enjoy a buffet lunch and walking on the white sand beach to explore the beauty of Phi Phi Don Island. Enjoy Snorkeling and swimming nearby Phi Phi Don. Arrive at Bamboo Island. This is a great island with white beaches and clear blue water, great for snorkeling. Worth visiting amazing sand beaches. Amazing views which are quieter and privacy. Relaxing on the white sandy beaches and enjoy making your own papaya salad "SOMTUM" tradition Thai food by your own flavor.',
        meals: 'B/L',
        location: 'Phuket',
        activities: ['Royal Phuket Marina', 'Luxury speedboat', 'Maya Bay visit', 'The Beach movie location', 'Swimming', 'Snorkeling', 'Pileh Lagoon', 'Viking Cave', 'Ancient cave paintings', 'Monkey Beach', 'Buffet lunch', 'Phi Phi Don Island', 'Bamboo Island', 'White sand beaches', 'Papaya salad making', 'SOMTUM preparation']
      },
      {
        day: 10,
        title: 'Phuket Departure',
        description: 'Have breakfast and free leisure until transfer to airport. Take flight to the next destination. Tour ends with many thanks.',
        meals: 'B',
        location: 'Departure',
        activities: ['Breakfast', 'Free leisure time', 'Airport transfer', 'Departure']
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
      startingFrom: 858, // USD - Category 3*, 16-20 PAX + 1 Tour Leader (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 452, // Category 3* single supplement
      validity: '2025-2026',
      // Detailed pricing for custom quotes
      category3: {
        '2-people': 1129,
        '3-6-people': 1006,
        '7-10-people': 891,
        '11-15-people': 925,
        '16-20-people': 858,
        singleSupplement: 452
      },
      category4: {
        '2-people': 1287,
        '3-6-people': 1164,
        '7-10-people': 1049,
        '11-15-people': 1112,
        '16-20-people': 1036,
        singleSupplement: 609
      },
      category5: {
        '2-people': 1678,
        '3-6-people': 1555,
        '7-10-people': 1440,
        '11-15-people': 1570,
        '16-20-people': 1473,
        singleSupplement: 936
      },
      // Additional flight costs
      additionalFlights: {
        'HAN-DAD': {
          route: 'Hanoi (HAN) to Da Nang (DAD)',
          price: 105,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        },
        'DAD-SGN': {
          route: 'Da Nang (DAD) to Ho Chi Minh (SGN)',
          price: 105,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        }
      },
      // Tour leader policy
      tourLeaderPolicy: 'Free of charge for groups of 11+ people, stays in single room',
      // Tipping recommendations
      tippingRecommendations: {
        guide: '5 USD per client per day',
        driver: '2 USD per client per day'
      }
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
        title: 'Hanoi – Arrival',
        description: 'Upon arrival at Noi Bai International Airport, meet your local guide and transfer to your hotel for check-in. Take some time to rest and recover from your flight. Depending on your arrival time, you may take a short walk around the Old Quarter or enjoy a cup of Vietnamese coffee by Hoan Kiem Lake, watching local life unfold.',
        meals: 'None',
        location: 'Hanoi',
        activities: ['Airport pick-up', 'Hotel transfer', 'Hotel check-in', 'Old Quarter walk', 'Hoan Kiem Lake', 'Vietnamese coffee', 'Rest and relaxation']
      },
      {
        day: 2,
        title: 'Hanoi – Full Day City Walking and Street Food Tour',
        description: 'After breakfast, begin your walking city tour to discover the historical and cultural heart of Hanoi. Start with the Ho Chi Minh Mausoleum Complex, where you\'ll learn about Vietnam\'s most respected leader, then visit the One Pillar Pagoda, a symbol of purity and resilience. Continue to the Temple of Literature, Vietnam\'s first university, rich in Confucian heritage. Enjoy lunch at a local restaurant before exploring the charming Old Quarter in the afternoon. Wander through narrow alleys bustling with shops, street vendors, and colonial architecture. Taste Hanoi\'s signature dishes such as Bún Chả, Bánh Cuốn, and Chè, while your guide shares stories of the city\'s rich culinary traditions. End your day at the famous Train Street, where you can sip strong Vietnamese coffee as trains pass through the narrow lanes — a truly unique Hanoi experience.',
        meals: 'B/L',
        location: 'Hanoi',
        activities: ['Ho Chi Minh Mausoleum Complex', 'One Pillar Pagoda', 'Temple of Literature', 'Local lunch', 'Old Quarter exploration', 'Street food tasting', 'Bún Chả', 'Bánh Cuốn', 'Chè', 'Train Street', 'Vietnamese coffee']
      },
      {
        day: 3,
        title: 'Hanoi – Full Day Trip to Hoa Lu – Tam Coc – Mua Cave Group Tour',
        description: 'After breakfast, depart from Hanoi on a scenic drive through lush countryside toward Ninh Binh Province, known as the "Halong Bay on land." Your first stop is Hoa Lu Ancient Capital, where you\'ll visit the historic temples of King Dinh and King Le and learn about Vietnam\'s early dynastic history. Continue to Tam Coc, where you\'ll board a traditional sampan boat, gliding along calm rivers surrounded by limestone cliffs and green rice fields — a serene and picturesque experience. Enjoy lunch at a local restaurant featuring regional specialties. In the afternoon, visit Mua Cave, where a short climb rewards you with breathtaking panoramic views of Tam Coc valley and the Ngo Dong River below — one of the most iconic vistas in Vietnam.',
        meals: 'B/L',
        location: 'Ninh Binh',
        activities: ['Hoa Lu Ancient Capital', 'King Dinh Temple', 'King Le Temple', 'Tam Coc boat ride', 'Traditional sampan boat', 'Limestone cliffs viewing', 'Rice fields', 'Regional lunch', 'Mua Cave visit', 'Panoramic views', 'Ngo Dong River views']
      },
      {
        day: 4,
        title: 'Hanoi – Tuan Chau Marina - Halong Bay',
        description: 'After breakfast, the shuttle bus will pick up at your hotel in Hanoi Old Quarter. Enjoy the landscape of the Red River Delta on the way to Ha Long Bay. Arrive at Tuan Chau Marina, get checked in at the waiting lounge. Embark on cruises, enjoy the welcome drinks while being given a short briefing. Check in to your room and get ready for a tasty lunch. Enjoy Vietnamese and international lunch and the picturesque scenery of the bay, pass by the most beautiful areas: Incense Burner, Dog Stone Islet, Fighting Cock Islet, Three Coconuts Island. Continue to explore Halong Bay by visiting Luon Cave. This is also an ideal place for kayaking, get up and close to the timeless beauty of Ha Long Bay. Visit Titov Island - a small limestone island with one of the best sandy beaches in Ha Long Bay. You can immerse yourself in emerald water and hike to the top for stunning panoramic views of the bay. Back to the boat and take part in a cooking demonstration on our sundeck, enjoy the bar\'s Happy Hour (buy 01 get 01) program and watch the magnificent sunset over the bay. Deluxe dinner is served. Enjoy our traditional and fusion dishes prepared by our talented chefs.',
        meals: 'B/L/D',
        location: 'Halong Bay',
        activities: ['Shuttle bus to Halong Bay', 'Tuan Chau Marina check-in', 'Cruise embarkation', 'Welcome drinks', 'Lunch on board', 'Luon Cave visit', 'Kayaking', 'Titov Island visit', 'Swimming', 'Hiking', 'Cooking demonstration', 'Happy Hour', 'Sunset viewing', 'Deluxe dinner', 'Spa services', 'Squid fishing', 'Movie watching']
      },
      {
        day: 5,
        title: 'Halong Bay – Private Car to Noi Bai Airport – Flight to Danang – Onward to Hoi An',
        description: 'Seeing the bay in the morning is a wonderful experience, awaken all your senses with a Tai Chi session on the sundeck while gathering vitamin sea to refresh yourself before enjoying breakfast. Coffee, tea and pastries for breakfast are served in the restaurant. Visit Sung Sot Cave - a magnificent and largest limestone cave as its original name: Grotte des Surprising. The beautiful stalactites and stalagmites formed over millions of years are the reward after the steep climb on Bo Hon Island. Back to the cruise ship. Check out and settle your bill at the reception. Have brunch while cruising back. Relax on the sundeck or in the restaurant. Disembark at Tuan Chau Marina. You will be met by our private driver. Then be transferred directly to Noi Bai International airport to depart to Da Nang. Upon arrival at Da Nang Airport, you will be met by our driver. We will then transfer to your hotel in Hoi An for relaxing or wandering around on your own.',
        meals: 'B/BR',
        location: 'Hoi An',
        activities: ['Tai Chi session', 'Breakfast', 'Sung Sot Cave visit', 'Stalactites viewing', 'Check-out', 'Brunch on board', 'Disembarkation', 'Airport transfer', 'Flight to Da Nang', 'Transfer to Hoi An', 'Hotel check-in']
      },
      {
        day: 6,
        title: 'Hoi An – Half Day Walking Tour',
        description: 'After breakfast, enjoy a half-day walking tour of Hoi An Ancient Town, a UNESCO World Heritage site known for its timeless beauty and cultural charm. Stroll through lantern-lined streets, visit the Japanese Covered Bridge, Tan Ky Old House, and Hoi An Market, where colorful stalls showcase local handicrafts and spices. The afternoon is free at your leisure — perfect for relaxing by the riverside, visiting a local tailor, or exploring Hoi An\'s cafés and art galleries. Optional Tour: Half day My Son Sanctuary Tour. At 7:30 – 8:00 am, our guide will pick you up at your hotel in the center of Hoi An town and transfer you to My Son Holy Land, the ruins of the Cham people and an imperial city during the Cham dynasty. Here, you will have the opportunity to explore and learn about the techniques used by the ancient Cham people in making red bricks to build towers—a secret that remains largely unknown. You can view a large complex of religious relics comprising more than 65 architectural works, which will fascinate those interested in architectural art. Additionally, you will have the chance to enjoy traditional music performed by Cham girls in their colorful uniforms. Following your visit, you will be transferred to the boat pier for a boat trip along the Thu Bon River back to Hoi An Ancient Town.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Hoi An Ancient Town walking tour', 'Japanese Covered Bridge', 'Tan Ky Old House', 'Hoi An Market', 'Local handicrafts', 'Spices shopping', 'Free time', 'Optional: My Son Sanctuary Tour', 'Cham ruins exploration', 'Red brick techniques', 'Traditional Cham music', 'Thu Bon River boat trip']
      },
      {
        day: 7,
        title: 'Learning Farming, Fishing and Cooking Class in Tra Que Village',
        description: 'Early this morning, our guide will welcome you at your hotel in Hoi An and transfer you to visit the Green Bay Mau Water Coconut Forest. Here, you will have the chance to row a basket boat, enjoy the tranquil atmosphere, explore the revolutionary base of Hoi An from the Vietnam War, and learn how to use fishing tools to catch field crabs. Next, you will cycle through the beautiful countryside to Tra Que Vegetable Village, 3 km from Hoi An Ancient Town. Upon arrival, you will be welcomed with friendly smiles and a special drink: "E" water or local tea. You will dress in farming clothes and take a short walk around the garden where local farmers use traditional methods without electrical machines. Under the guidance of a local, you will learn how to prepare and make the land, fertilize it with green manure before growing vegetables, and water the newly planted vegetables. Afterward, you will return to the house to relax by soaking your feet in Vietnamese herbs, a refreshing way to unwind after working on the farm. Then, you will join a cooking class with the family, where you will learn how to prepare Hoi An\'s special foods and enjoy lunch with them. After lunch, you will be transferred to Thanh Ha Ceramic Village to see how local people create pottery. You will have the opportunity to make a piece of pottery under the guidance of the workshop owner and receive a clay whistle called "To He" as a gift before leaving. From there, you will embark on a boat trip to Cam Nam Fishing Village to gain more fishing experience under the instruction of local people. You will practice catching fish and using fishing nets.',
        meals: 'B/L',
        location: 'Hoi An',
        activities: ['Green Bay Mau Water Coconut Forest', 'Basket boat rowing', 'Revolutionary base exploration', 'Fishing tools learning', 'Field crab catching', 'Cycling to Tra Que Village', 'Farming clothes', 'Traditional farming methods', 'Land preparation', 'Vegetable growing', 'Vietnamese herbs foot soak', 'Cooking class', 'Hoi An special foods', 'Thanh Ha Ceramic Village', 'Pottery making', 'Clay whistle gift', 'Cam Nam Fishing Village', 'Fishing experience', 'Fishing nets practice']
      },
      {
        day: 8,
        title: 'Hoi An – Free at Your Own Leisure',
        description: 'Enjoy breakfast at your hotel and spend the day at leisure to relax or explore at your own pace. You may stroll through Hoi An\'s charming streets, shop for souvenirs, unwind at a riverside café, or enjoy the beach nearby. Optional Tour: Full day Bana Hills & Golden Bridge Tour. At 8:00, our guide and driver will pick you up at your hotel in Hoi An or Da Nang and transfer you to discover Ba Na Hills, located 25 km southwest of Da Nang City. To reach the summit, you will take a cable car from the base and enjoy spectacular views of the forest. Upon arrival, you will have the opportunity to sightsee and take photos at the world-famous Golden Bridge with its iconic Giant Hand. Continue to the flower garden Le Jardin D\'amour, which features many kinds of beautiful flowers, and visit the Debay Wine Cellar, which houses a variety of wines. Take another cable car ride to reach the Old French Villas at an elevation of 1,138 meters to experience the architecture. Enjoy lunch at a restaurant. After lunch, you will have more time to explore and play games at the Fantasy Theme Amusement Park (most games and the 4D movie are included in your tour package, but some games with rewards will require an additional fee). Following your visit, you will take the cable car back to the base.',
        meals: 'B',
        location: 'Hoi An',
        activities: ['Free time', 'Street strolling', 'Souvenir shopping', 'Riverside café', 'Beach time', 'Optional: Ba Na Hills & Golden Bridge Tour', 'Cable car ride', 'Golden Bridge', 'Giant Hand photos', 'Le Jardin D\'amour flower garden', 'Debay Wine Cellar', 'Old French Villas', 'Fantasy Theme Amusement Park', '4D movie', 'Games and attractions']
      },
      {
        day: 9,
        title: 'Hoi An – Danang Airport – Flight to Ho Chi Minh City',
        description: 'After breakfast, enjoy some free time to relax or take a final stroll around the charming streets of Hoi An. At the appointed time, transfer to Danang International Airport for your flight to Ho Chi Minh City. Upon arrival, meet your local guide and transfer to your hotel for check-in and relaxation. The rest of the day is free at your leisure to explore the city\'s vibrant atmosphere.',
        meals: 'B',
        location: 'Ho Chi Minh City',
        activities: ['Free time', 'Hoi An street stroll', 'Airport transfer', 'Flight to Ho Chi Minh City', 'Airport pick-up', 'Hotel check-in', 'City exploration']
      },
      {
        day: 10,
        title: 'Ho Chi Minh City – Full Day City Tour & Cu Chi Tunnels',
        description: 'Today we spend a half day exploring the captivating Ho Chi Minh City. The most places of interest are located near the town center. We pass by the now-demolished wartime American Embassy on our way to the Reunification Palace. This famous edifice was a former residence of the President of Southern Vietnam until end of April 1975. Close to the palace are some striking French colonial structures including the Notre Dame Cathedral and the Old Sai Gon Post Office. We follow these with a visit to the Jade Emperor Pagoda and the War Remnant Museum with a wealth of images from the notorious conflicts. The sightseeing ends up with a walk around the retail Ben Thanh Market where anything and everything is for sale! Have a lunch at a local restaurant. After lunch and short break, we start to transfer about 30km north-west of Ho Chi Minh City to Cu Chi town. Cu Chi tunnels were used as the base from which the Vietnamese mounted their operations of the Tet Offensive in 1968. The incredible underground network in Cu Chi stretched over 200 kilometres and became legendary during the American war. The extensive tunnels have been specially constructed with living areas, weapon factories, filed hospitals, command centres, plus accommodation. Today we have an excursion to Cu Chi Tunnels to visit an exposition hall and a widened section of the tunnels to get a feel of the underground life. There are also possibilities to fire off rounds from an AK47 or MK16 at the nearby rifle range.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Reunification Palace', 'Notre Dame Cathedral', 'Old Sai Gon Post Office', 'Jade Emperor Pagoda', 'War Remnant Museum', 'Ben Thanh Market', 'Local lunch', 'Cu Chi Tunnels exploration', 'Exposition hall', 'Underground life experience', 'Optional: AK47/MK16 shooting']
      },
      {
        day: 11,
        title: 'Ho Chi Minh – Full Day Explore Mekong Delta Area',
        description: 'After breakfast, depart from Ho Chi Minh City for a scenic drive to the Mekong Delta, Vietnam\'s fertile "rice bowl." Arrive in My Tho, where you\'ll board a boat for a leisurely cruise along the Mekong River, passing stilt houses and lush fruit plantations. Stop at local islands to visit a coconut candy workshop and honey farm, where you can taste tropical fruits and enjoy traditional folk music performed by villagers. Continue with a rowboat ride through small canals shaded by water coconut trees, experiencing the peaceful rhythm of local life. Enjoy lunch at a local restaurant with Mekong specialties before returning to the pier. Drive back to Ho Chi Minh City in the late afternoon.',
        meals: 'B/L',
        location: 'Mekong Delta',
        activities: ['Mekong Delta drive', 'My Tho boat cruise', 'Mekong River cruise', 'Stilt houses viewing', 'Fruit plantations', 'Coconut candy workshop', 'Honey farm visit', 'Tropical fruit tasting', 'Traditional folk music', 'Rowboat ride', 'Water coconut trees', 'Mekong specialties lunch', 'Return to Ho Chi Minh City']
      },
      {
        day: 12,
        title: 'Ho Chi Minh – Departure',
        description: 'After breakfast, enjoy some free time to relax or explore the city at your own pace until your driver transfers you to Tan Son Nhat International Airport for your departure flight. End of services!',
        meals: 'B',
        location: 'Departure',
        activities: ['Breakfast', 'Free time', 'City exploration', 'Airport transfer', 'Departure']
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
      startingFrom: 770, // USD - Category 3*, 16-20 PAX + 1 Leader (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 436, // Category 3* single supplement
      validity: '01 Oct 2025 - 31 Dec 2026',
      // Detailed pricing for custom quotes
      category3: {
        '2-people': 1082,
        '3-6-people': 948,
        '7-10-people': 828,
        '11-15-people': 808,
        '16-20-people': 770,
        singleSupplement: 436
      },
      category4: {
        '2-people': 1148,
        '3-6-people': 1015,
        '7-10-people': 895,
        '11-15-people': 878,
        '16-20-people': 848,
        singleSupplement: 530
      },
      category5: {
        '2-people': 1718,
        '3-6-people': 1595,
        '7-10-people': 1480,
        '11-15-people': 1465,
        '16-20-people': 1485,
        singleSupplement: 918
      },
      // Alternative pricing structure (Vietlong Travel Offer)
      vietlongOffer: {
        category3: {
          '2-people': 1082,
          '3-6-people': 948,
          '7-10-people': 828,
          '11-15-people': 808,
          '16-20-people': 775,
          singleSupplement: 446
        },
        category4: {
          '2-people': 1148,
          '3-6-people': 1025,
          '7-10-people': 895,
          '11-15-people': 878,
          '16-20-people': 855,
          singleSupplement: 535
        },
        category5: {
          '2-people': 1718,
          '3-6-people': 1587,
          '7-10-people': 1485,
          '11-15-people': 1468,
          '16-20-people': 1480,
          singleSupplement: 928
        }
      },
      // Tour leader policy
      tourLeaderPolicy: 'Free of charge for groups of 11+ people, stays in single room',
      // FOC policy
      focPolicy: '1 FOC in single room for groups of 16+ people'
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
        title: 'Arrival - Siem Reap',
        description: 'Upon arrival at Siem Reap airport, meets our driver and guide and transfer to hotel for check in. (Early check-in before 14h00 is not included) Lunch and dinner are not included.',
        meals: 'None',
        location: 'Siem Reap',
        activities: ['Airport pick-up', 'Hotel transfer', 'Hotel check-in', 'Rest and relaxation']
      },
      {
        day: 2,
        title: 'Siem Reap – Angkor Thom – Ta Prohm – Angkor Wat',
        description: 'Rise up early to pick up the most beautiful, haunting and spiritual moment to visit magnificent Angkor Wat at dawn. This special activity is designed also to help you see "the Temple reflex on the water" when it\'s much cooler and less crowded. Later on come back to the hotel for breakfast and short break. After breakfast, visit the antique capital of Angkor Thom (12th century): the South Gate with its huge statues depicting the churning of the ocean of milk, the Bayon Temple, unique for its 54 towers decorated with over 200 smiling faces of Avolokitesvara, the Phimeanakas, the Royal Enclosure, the Elephants Terrace and the Terrace of the Leper King. Then, visit Ta Prohm, one of the area\'s most beautiful temples. Ta Prohm has been relatively untouched since it was discovered and retains much of its mystery. This afternoon, visit to the most famous of all the temples on the plain of Angkor: Angkor Wat. The temple complex covers 81 hectares and is comparable in size to the Imperial Palace in Beijing. Its distinctive five towers are emblazoned on the Cambodian flag and the 12th century masterpiece is considered by art historians to be the prime example of classical Khmer art and architecture. This evening, enjoy the sunset on Bakheng Hill.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Angkor Wat sunrise visit', 'Temple reflection on water', 'Angkor Thom complex', 'South Gate', 'Bayon Temple', 'Phimeanakas', 'Royal Enclosure', 'Elephants Terrace', 'Terrace of the Leper King', 'Ta Prohm temple', 'Angkor Wat temple', 'Bakheng Hill sunset']
      },
      {
        day: 3,
        title: 'Siem Reap – Tonle Sap Lake – Banteay Srei – Banteay Samre',
        description: 'After breakfast, you will enjoy a boat ride on the Tonle Sap Lake at Kampong Phluk Village. This is the largest permanent fresh-water lake in South East Asia and flows into Tonle Sap River, joining the Mekong in Phnom Penh. We will see a fishermen\'s "floating village" with floating schools, floating police station, etc. It is same as a big village floating on the lake, and the "village" move from place-to-place following water levels and current. This afternoon, continue to stroll around Banteay Samre temple which was built in 12th century during Angkor period, admired by its serenity, take some beautiful photo before heading to reveal the intricately carved, beautiful red-pink sandstone temple of Banteay Srei - considered to be a Jewel of Khmer art which features elaborate decorations and its finest details. These factors have made the temple extremely popular with tourists, and have led to its being widely praised as a "precious gem". On the way back, we will stop at Preah Dak village for a short tour, enjoying to observing the real-life of Cambodian in this area, how they make a living from the hand-made products, how to producing sugar palm and fruit itself.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Tonle Sap Lake boat ride', 'Kampong Phluk Village', 'Floating village tour', 'Floating schools', 'Floating police station', 'Banteay Samre temple', 'Banteay Srei temple', 'Red-pink sandstone carvings', 'Preah Dak village visit', 'Hand-made products observation', 'Sugar palm production', 'Fruit production']
      },
      {
        day: 4,
        title: 'Siem Reap – Phnom Penh by Public Bus',
        description: 'This morning, with your driver, you will be transfer to Siem Reap to bus station for your trip to Phnom Penh. The trip might take up to 6 or 6 hours on good conditions road. Upon arrival at Phnom Penh bus station, meet with our driver then transfer to hotel for check-in. Rest at your own leisure.',
        meals: 'B',
        location: 'Phnom Penh',
        activities: ['Bus station transfer', 'Public bus to Phnom Penh', '6-hour journey', 'Bus station pick-up', 'Hotel transfer', 'Hotel check-in', 'Free time']
      },
      {
        day: 5,
        title: 'Phnom Penh – City Tours',
        description: 'After breakfast, head out to the Choeung Ek Memorial, where a stupa made up of some 8,000 human skulls marks the site of the infamous Killing Fields. This was the execution ground for the torture victims of Tuol Sleng and standing in this peaceful setting it\'s almost unthinkable to imagine that to date nearly 9000 corpses have been exhumed from the area. Then, continue your visit to Tuol Sleng Genocide Museum (S21 prison). This prison was a high school, and used as a prison by Pol Pot\'s security forces and became the largest center for detention and torture during the rule of the Khmer Rouge. In the afternoon, visit the Royal Palace, built by King Norodom in 1866 on the site of the old town, and the Silver Pagoda, located within the grounds of the Royal Palace, the Silver Pagoda is so named because of its floor, which is made up of 5000 silver tiles. Then, continue your visit at visit to the National Museum, one of Phnom Penh\'s true architectural gems. The Museum is instantly recognizable with its warm red terracotta and its gracefully cured roof topped by dozens of guardians nagas. It was designed in Khmer style in 1917 by famed French architect Georges Groslier & Ecole Des Arts Cambodgiens. After that, explore Wat Phnom, a peaceful temple situated on a hill for which the city is named. According to legend, a 14th-century woman named Penh found sacred Buddhist objects in the nearby river and placed them here on the small hill.',
        meals: 'B',
        location: 'Phnom Penh',
        activities: ['Choeung Ek Memorial', 'Killing Fields visit', 'Tuol Sleng Genocide Museum', 'S21 prison', 'Royal Palace', 'Silver Pagoda', '5000 silver tiles', 'National Museum', 'Khmer architecture', 'Wat Phnom temple', 'Buddhist objects', 'City legend']
      },
      {
        day: 6,
        title: 'Phnom Penh – Transfer to Koh Rong',
        description: 'After breakfast, with your driver you will transfer to Sihanoukville. Upon arrival at Sihanoukville, transfer to boat pier and head out to Koh Rong. Once you arrive at Koh Rong, transfer to hotel for check-in. Rest at your own leisure.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Transfer to Sihanoukville', 'Boat pier transfer', 'Boat to Koh Rong', 'Hotel transfer', 'Hotel check-in', 'Beach relaxation']
      },
      {
        day: 7,
        title: 'Koh Rong – Free & Leisure',
        description: 'Enjoy your own time at the beach! For any other activities like diving or snorkeling please check on spot with hotel you selected and this will be on your own account.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Beach relaxation', 'Swimming', 'Optional: Diving', 'Optional: Snorkeling', 'Island exploration', 'Free time']
      },
      {
        day: 8,
        title: 'Koh Rong – Free & Leisure',
        description: 'Enjoy your own time at the beach! For any other activities like diving or snorkeling please check on spot with hotel you selected and this will be on your own account.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Beach relaxation', 'Swimming', 'Optional: Diving', 'Optional: Snorkeling', 'Island exploration', 'Free time']
      },
      {
        day: 9,
        title: 'Koh Rong – Free & Leisure',
        description: 'Enjoy your own time at the beach! For any other activities like diving or snorkeling please check on spot with hotel you selected and this will be on your own account.',
        meals: 'B',
        location: 'Koh Rong',
        activities: ['Beach relaxation', 'Swimming', 'Optional: Diving', 'Optional: Snorkeling', 'Island exploration', 'Free time']
      },
      {
        day: 10,
        title: 'Koh Rong – Sihanoukville - Phnom Penh – Departure',
        description: 'This morning, head back to Sihanoukville by boat. Upon arrival at Sihanoukville boat pier head out to Phnom Penh. Once you arrive at Phnom Penh, transfer to Phnom Penh\'s International Airport for the taking the flight to your next destination.',
        meals: 'B',
        location: 'Departure',
        activities: ['Boat to Sihanoukville', 'Transfer to Phnom Penh', 'Airport transfer', 'Departure']
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
      startingFrom: 1035, // USD - Category 3*, 11-15 people (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 450, // Category 3* single supplement
      validity: 'High Tourism Season 2025-2026',
      // Detailed pricing for custom quotes - HIGH TOURISM SEASON
      category3: {
        '2-people': 1600,
        '3-6-people': 1440,
        '7-10-people': 1167,
        '11-15-people': 1035,
        '16-20-people': 1062,
        singleSupplement: 450
      },
      category4: {
        '2-people': 1790,
        '3-6-people': 1630,
        '7-10-people': 1360,
        '11-15-people': 1226,
        '16-20-people': 1276,
        singleSupplement: 655
      },
      category5: {
        '2-people': 2230,
        '3-6-people': 2476,
        '7-10-people': 2155,
        '11-15-people': 1992,
        '16-20-people': 2103,
        singleSupplement: 876
      },
      // Additional flight costs
      additionalFlights: {
        'HAN-DAD': {
          route: 'Hanoi (HAN) to Da Nang (DAD)',
          price: 105,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        },
        'DAD-PQC': {
          route: 'Da Nang (DAD) to Phu Quoc (PQC)',
          price: 100,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        },
        'PQC-SAI': {
          route: 'Phu Quoc (PQC) to Siem Reap (SAI)',
          price: 280,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        }
      },
      // FOC (Free of Charge) policy
      focPolicy: 'Free of charge for groups of 16+ people',
      // Tipping recommendations
      tippingRecommendations: {
        guide: '5 USD per client per day',
        driver: '2 USD per client per day'
      }
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
        title: 'Arrival in Hanoi – Rickshaws Cycling Trip',
        description: 'Upon arrival at Noi Bai International Airport, you will be greeted by our friendly driver and guide. We will then transfer to the central of Hanoi for check-in the hotel. Stay leisurely until being picked up for a Rickshaw Cycling Trip Around the Old Quarter. The journey typically begins in the heart of the Old Quarter, where the narrow, winding streets are lined with colonial-era buildings, traditional shops, and local markets. As you settle into the comfortable seat of the rickshaw, the rider begins to pedal, and you\'re immediately drawn into the rhythm of Hanoi\'s daily life.',
        meals: 'None',
        location: 'Hanoi',
        activities: ['Airport pick-up', 'Hotel check-in', 'Rickshaw cycling tour', 'Old Quarter exploration', 'Free time for dinner']
      },
      {
        day: 2,
        title: 'Ha Noi Full Day City Tour: Historical & Heritage',
        description: 'Get picked up by our friendly guide and start to explore Hanoi City. Visit Tran Quoc Pagoda located on Golden Fish Island in West Lake - the oldest pagoda in Ha Noi built in the 6th century. Visit Ho Chi Minh complex, you have a chance to see the embalmed body of Ho Chi Minh then walk around the garden to see 2 houses where he lived & worked from 1954 to 1969. Then visit One Pillar Pagoda where worships the Goddess of Mercy – It is the most unique pagoda in the world. Visit Vietnam Ethnology Museum to learn about the culture of 54 ethnic groups living in the whole country of Vietnam. Have lunch at our restaurant with 8 delicious Vietnamese dishes. Continue to visit Temple of Literature – the first university of Vietnam, established in the 11th century. Leave for Hoa Lo Prison Museum which originally used by the French colonists in Indochina for political prisoners, and later by North Vietnam for U.S. prisoners of war during the Vietnam War.',
        meals: 'B/L',
        location: 'Hanoi',
        activities: ['Tran Quoc Pagoda', 'Ho Chi Minh Mausoleum', 'One Pillar Pagoda', 'Vietnam Ethnology Museum', 'Vietnamese lunch (8 dishes)', 'Temple of Literature', 'Hoa Lo Prison Museum']
      },
      {
        day: 3,
        title: 'Hanoi - Tuan Chau Marina - Set Sail for Halong Bay',
        description: 'After breakfast, the shuttle bus will pick up at your hotel in Hanoi Old Quarter. Enjoy the landscape of the Red River Delta on the way to Ha Long Bay. Arrive at Tuan Chau Marina, get checked in at the waiting lounge. Embark on cruises, enjoy the welcome drinks while being given a short briefing. Check in to your room and get ready for a tasty lunch. Enjoy Vietnamese and international lunch and the picturesque scenery of the bay, pass by the most beautiful areas: Incense Burner, Dog Stone Islet, Fighting Cock Islet, Three Coconuts Island. Continue to explore Halong Bay by visiting Luon Cave. This is also an ideal place for kayaking, get up and close to the timeless beauty of Ha Long Bay. Visit Titov Island - a small limestone island with one of the best sandy beaches in Ha Long Bay. You can immerse yourself in emerald water and hike to the top for stunning panoramic views of the bay. Back to the boat and take part in a cooking demonstration on our sundeck, enjoy the bar\'s Happy Hour (buy 01 get 01) program and watch the magnificent sunset over the bay. Deluxe dinner is served. Enjoy our traditional and fusion dishes prepared by our talented chefs.',
        meals: 'B/L/D',
        location: 'Halong Bay',
        activities: ['Shuttle bus to Halong Bay', 'Tuan Chau Marina check-in', 'Cruise embarkation', 'Welcome drinks', 'Lunch on board', 'Luon Cave visit', 'Kayaking', 'Titov Island visit', 'Swimming', 'Hiking', 'Cooking demonstration', 'Happy Hour', 'Sunset viewing', 'Deluxe dinner', 'Spa services', 'Squid fishing', 'Movie watching']
      },
      {
        day: 4,
        title: 'Morning in Halong Bay – Back to Ha Noi- Flight to Ho Chi Minh City',
        description: 'Seeing the bay in the morning is a wonderful experience, awaken all your senses with a Tai Chi session on the sundeck while gathering vitamin sea to refresh yourself before enjoying breakfast. Coffee, tea and pastries for breakfast are served in the restaurant. Visit Sung Sot Cave - a magnificent and largest limestone cave as its original name: Grotte des Surprising. The beautiful stalactites and stalagmites formed over millions of years are the reward after the steep climb on Bo Hon Island. Back to the cruise ship. Check out and settle your bill at the reception. Have brunch while cruising back. Relax on the sundeck or in the restaurant. Disembark at Tuan Chau Marina. You will be met by our private driver. Then be transferred directly to Noi Bai International airport to depart to Ho Chi Minh. Upon arrival at Tan San Nhat Airport, you will be met by our driver. We will then transfer to your hotel in Ho Chi Minh city for relaxing or wandering around on your own.',
        meals: 'B/BR',
        location: 'Ho Chi Minh City',
        activities: ['Tai Chi session', 'Breakfast', 'Sung Sot Cave visit', 'Stalactites viewing', 'Check-out', 'Brunch on board', 'Disembarkation', 'Airport transfer', 'Flight to Ho Chi Minh', 'Hotel check-in']
      },
      {
        day: 5,
        title: 'Ho Chi Minh City Tour- Cu Chi Tunnels',
        description: 'Take the morning trip to visit Independence Palace, also known at the Reunification palace, was built on the sight of the former Norodom palace. The Independence palace is a widely known landmark of Ho Chi Minh City and was designed by the architect Ngo Viet Thu. Continue seeing the beautiful structures from the French Colonial times such as the Notre Dame Cathedral, the historic Central Post Office. Followed by the remarkable site of the War Remnants Museum the museum has a vast display of the both the Indochina wars. Have lunch at local restaurant. Depart for Cu Chi tunnel, the trip will take approximately one and a half hours bus driving. Upon arrival, before exploring the tunnels, you will have some short introduction followed by introductory video about how the tunnels were constructed and how the people survived in the harsh conditions of the war time. Then, spend your time to explore the remaining area and tunnel systems which included the special constructed living areas with kitchens, bedrooms side by side with other martial facilities like storage, weapons factories, field hospitals, and command centers helping whoever lives inside the tunnels meet their basic needs. Besides, there are also many hidden trap doors and dangerous traps within the maze-like tunnels for security purpose during the war. Afterward, special tea and cassava (guerilla\'s food during the war) will be served. Break time for relax or time for those who want to try the real shooting gun.',
        meals: 'B/L',
        location: 'Ho Chi Minh City',
        activities: ['Independence Palace (Reunification Palace)', 'Notre Dame Cathedral', 'Central Post Office', 'War Remnants Museum', 'Local lunch', 'Cu Chi Tunnels exploration', 'Tunnel systems tour', 'Special tea and cassava tasting', 'Optional: Real shooting gun experience']
      },
      {
        day: 6,
        title: 'Ho Chi Minh City- My Tho- Ben Tre- Can Tho',
        description: 'Heading out of town, we travel by roads to the Mekong Delta. This plain region boasts the largest rice bowl of Vietnam. On the way, we will visit Vinh Trang pagoda, the biggest pagoda in the Mekong delta. Upon arrival in My Tho, we board a boat navigating around the intricate small canals, which is a great way to observe the local lifestyle close-up and catch a view dotted by many islands. The exciting river trip will pass by the lush green vegetation towards the famous Unicorn Island where we have a chance to stroll around an orchard, taste many seasonal fruits, see farmers at work and Vietnamese folk music performed by the local people. We navigate some narrower canals using small rowing boats to Ben Tre Province for an interesting visit to some local industries. The extra enjoyment is a lunch at one of the famous local eating spots. After lunch, enjoy your time relaxing, walking around the village, or perhaps going for a short bike ride.',
        meals: 'B/L',
        location: 'Can Tho',
        activities: ['Vinh Trang pagoda', 'My Tho boat trip', 'Canal navigation', 'Unicorn Island visit', 'Fruit tasting', 'Vietnamese folk music', 'Ben Tre Province visit', 'Local industries tour', 'Local lunch', 'Village exploration', 'Bike ride']
      },
      {
        day: 7,
        title: 'Cai Rang Floating Market- Flight to Phu Quoc',
        description: 'Have breakfast at the hotel. Take a leisure boat trip to explore the picturesque tributaries of the Lower Mekong River (Bassac River) then visit to Cai Rang floating market which is the liveliest one in the whole of region. Take in the beautiful scenery and the daily activities of the locals who live along the Mekong canals. Enjoy fresh fruits on boat and walking trip to visit local noodle factory. Then get transfer to Tan Son Nhat airport. Flight to Phu Quoc. On arrival in Phu Quoc. You will meet our driver then get private transfer to Hotel in Phu Quoc.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Boat trip on Lower Mekong River', 'Cai Rang floating market', 'Local lifestyle observation', 'Fresh fruits on boat', 'Local noodle factory visit', 'Airport transfer', 'Flight to Phu Quoc', 'Hotel check-in']
      },
      {
        day: 8,
        title: 'Phu Quoc – Free Beach Leisure',
        description: 'After breakfast at your hotel your are free leisure to discover Phu Quoc. Free leisure and overnight in Phu Quoc.',
        meals: 'B',
        location: 'Phu Quoc',
        activities: ['Free beach leisure', 'Island exploration', 'Beach relaxation', 'Swimming']
      },
      {
        day: 9,
        title: 'Phu Quoc- Speed Boat- Cable Car to Hon Thom- Water Park',
        description: 'Having breakfast at hotel. Then Embark on an Island Speed Boat Tour from An Thoi port. This typically includes snorkeling or swimming at beautiful islands like Hon Roi, Hon Mong Tay, and Hon May Rut, known for their clear waters and vibrant coral reefs on your own. After the island hopping, you will head to the Sun World Hon Thom Cable Car station. Board the world\'s longest sea-crossing Cable Car to Hon Thom Island. The ride offers breathtaking aerial views of the archipelago. On Hon Thom, you\'ll have access to Sun World Hon Thom Nature Park, which includes Aquatopia Water Park and various beach activities. Late Afternoon Return via cable car to the mainland and proceed to Sunset Town (also known as Mediterranean Town). This beautifully designed area features European-inspired architecture, charming streets, and the iconic Kiss Bridge. As dusk settles, find a good spot to witness the spectacular sunset.',
        meals: 'B/L',
        location: 'Phu Quoc',
        activities: ['Island Speed Boat Tour', 'Snorkeling', 'Swimming', 'Hon Roi Island', 'Hon Mong Tay Island', 'Hon May Rut Island', 'Cable Car to Hon Thom', 'Sun World Hon Thom Nature Park', 'Aquatopia Water Park', 'Sunset Town visit', 'Kiss Bridge', 'Sunset viewing']
      },
      {
        day: 10,
        title: 'Vin Wonder- Grand World Relaxing',
        description: 'The car will pick you up at the hotel and depart for VinWonders Phu Quoc - the first and largest theme park in Vietnam. The tour guide will pick you up at the gate and accompany you throughout the journey. Conquer the thrilling game area, cool off at the modern water park, explore the central castle, step into the fairy tale world and visit the unique Viking village. Visit Neptune Palace - an underground aquarium, home to thousands of marine creatures and stunning mermaid shows. Enjoy the spectacular Once show with stunning sound and light effects. Arrive at Grand World and start your journey to explore the "City that never sleeps" with famous spots: Visit the Vietnam Quintessence area, enjoy Vietnamese cuisine & watch the Nha Tich Thanh Hoang show, Sunset Beach Bar: Watch the sunset & enjoy live music. Enjoy dinner with Kien - Xay specialty Bun Quay, Visit the Teddy Bear Museum. Watch the big show Tinh Hoa Viet Nam (at your own expense). Enjoy drinks, watch Grand World at night and watch the water music show "Colors of Venice".',
        meals: 'B/D',
        location: 'Phu Quoc',
        activities: ['VinWonders Phu Quoc', 'Thrilling game area', 'Modern water park', 'Central castle', 'Fairy tale world', 'Viking village', 'Neptune Palace aquarium', 'Mermaid shows', 'Once show', 'Vietnam Quintessence area', 'Vietnamese cuisine', 'Nha Tich Thanh Hoang show', 'Sunset Beach Bar', 'Live music', 'Kien - Xay specialty Bun Quay', 'Teddy Bear Museum', 'Tinh Hoa Viet Nam show', 'Water music show "Colors of Venice"']
      },
      {
        day: 11,
        title: 'Phu Quoc- Connect Flight to Ho Chi Minh City & Siem Reap',
        description: 'Then you will get transfer to Phu Quoc Airport for your flight to Ho Chi Minh City, where you\'ll connect to an international flight bound for Siem Reap, Cambodia — the gateway to the legendary temples of Angkor. Upon arrival at Siem Reap International Airport, you\'ll be warmly greeted by our local transferred to your hotel for check-in. Take some time to relax after your journey.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Airport transfer', 'Flight to Ho Chi Minh City', 'Connection flight to Siem Reap', 'Airport pick-up', 'Hotel check-in', 'Relaxation']
      },
      {
        day: 12,
        title: 'Siem Reap- Angkor Temple Tour',
        description: 'The take a trip to Visit the antique capital of Angkor Thom (12th century): the South Gate with its huge statues depicting the churning of the ocean of milk, the Bayon Temple, unique for its 54 towers decorated with over 200 smiling faces of Avolokitesvara, the Phimeanakas, the Royal Enclosure, the Elephants Terrace, the Terrace of the Leper King, and Ta Prohm, one of the area\'s most beautiful temples. Ta Prohm has been relatively untouched since it was discovered and retains much of its mystery. Visit to the most famous of all the temples on the plain of Angkor: Angkor Wat. The temple complex covers 81 hectares and is comparable in size to the Imperial Palace in Beijing. Its distinctive five towers are emblazoned on the Cambodian flag and the 12th century masterpiece is considered by art historians to be the prime example of classical Khmer art and architecture. Enjoy wonderful sunset from the top of Pre Rup temple.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Angkor Thom complex', 'South Gate', 'Bayon Temple', 'Phimeanakas', 'Royal Enclosure', 'Elephants Terrace', 'Terrace of the Leper King', 'Ta Prohm temple', 'Angkor Wat temple', 'Pre Rup temple sunset']
      },
      {
        day: 13,
        title: 'Siem Reap- Banteay Srey- Grand Circuit',
        description: 'Visit to Banteay Srey, known as Citadel of Women or a Pink Temple, and Banteay Samre Temples. Visit to the unique interior brick sculptures of Prasat Kravan, Srah Srang ("The Royal Baths" was once used or ritual bathing), Banteay Kdei (surrounded by 4 concentric walls), Neak Pean, a fountain built in the middle of a pool (representing the paradisiacal Himalayan mountain-lake) and Preah Khan temple, Built by the King Jayavarman VII. Preah Khan is, like Ta Prohm, a place of towered enclosures and shoulder hugging corridors. Unlike Ta Prohm, however, the temple of Preah Khan is in a reasonable state of preservation and ongoing restoration efforts should maintain and even improve this situation.',
        meals: 'B',
        location: 'Siem Reap',
        activities: ['Banteay Srey temple (Pink Temple)', 'Banteay Samre temple', 'Prasat Kravan', 'Srah Srang (Royal Baths)', 'Banteay Kdei', 'Neak Pean fountain', 'Preah Khan temple']
      },
      {
        day: 14,
        title: 'Siem Reap- Tonle Sap Lake Boat Trip– Departure',
        description: 'In the morning, we will enjoy a boat ride on the Tonle Sap Lake at KAMPONG PHLUK VILLAGE. This is the largest permanent fresh-water lake in South East Asia and flows into Tonle Sap River, joining the Mekong in Phnom Penh. We will see a fishermen\'s "floating village" with floating schools, floating police station, etc. It is same as a big village floating on the lake, and the "village" move from place to place following water levels and current. Transfer to Siem Reap airport for flight to next destination. End of Services!',
        meals: 'B',
        location: 'Departure',
        activities: ['Tonle Sap Lake boat ride', 'Kampong Phluk Village', 'Floating village tour', 'Floating schools', 'Floating police station', 'Airport transfer', 'Departure']
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
      startingFrom: 879, // USD - Category 3*, 11-15 people (cheapest option)
      currency: 'USD',
      perPerson: true,
      twinOccupancy: true,
      customQuote: true,
      singleSupplement: 484, // Category 3* single supplement
      validity: '01 Oct 2025 - 31 Dec 2026',
      // Detailed pricing for custom quotes
      category3: {
        '2-people': 1180,
        '3-6-people': 1025,
        '7-10-people': 908,
        '11-15-people': 879,
        '16-20-people': 905,
        singleSupplement: 484
      },
      category4: {
        '2-people': 1311,
        '3-6-people': 1156,
        '7-10-people': 1073,
        '11-15-people': 1010,
        '16-20-people': 1046,
        singleSupplement: 731
      },
      category5: {
        '2-people': 1833,
        '3-6-people': 1678,
        '7-10-people': 1595,
        '11-15-people': 1538,
        '16-20-people': 1615,
        singleSupplement: 1048
      },
      // Additional flight costs
      additionalFlights: {
        'SGN-DAD': {
          route: 'Ho Chi Minh (SGN) to Da Nang (DAD)',
          price: 105,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        },
        'DAD-HAN': {
          route: 'Da Nang (DAD) to Hanoi (HAN)',
          price: 105,
          airline: 'VNA Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        },
        'BKK-SGN': {
          route: 'Bangkok (BKK) to Ho Chi Minh (SGN)',
          price: 'To be advised',
          airline: 'TG/PG Economy Class',
          baggage: '7kg carry-on + 20kg checked'
        }
      },
      // FOC policy
      focPolicy: '1 FOC for groups of 16+ people',
      // Important notes
      importantNotes: [
        'All airfares are subject to change without prior notice',
        'All tour prices exclude surcharges for Christmas and New Year period'
      ]
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
