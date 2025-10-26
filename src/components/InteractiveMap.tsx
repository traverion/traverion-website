import { useState } from 'react';
import { MapPin, Camera, Hotel, Utensils, Mountain, Sun, Waves, Star, Clock, Users } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';

interface MapPoint {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number];
  type: 'attraction' | 'hotel' | 'restaurant' | 'activity' | 'landmark';
  image?: string;
  rating?: number;
  duration?: string;
  groupSize?: string;
  highlights?: string[];
}

interface InteractiveMapProps {
  tourId: string;
  height?: string;
  showRoute?: boolean;
  className?: string;
}

// Map data for different tours
const getMapData = (tourId: string) => {
  const mapData = {
    'vietnam-9-day': {
      center: [10.8231, 106.6297] as [number, number],
      zoom: 6,
      route: [
        [10.8231, 106.6297], // Ho Chi Minh City
        [10.0452, 105.7469], // Can Tho (Mekong Delta)
        [9.2898, 105.7181], // Phu Quoc Island
      ],
      points: [
        {
          id: 'hcmc',
          name: 'Ho Chi Minh City',
          description: 'Start your journey in Vietnam\'s bustling metropolis',
          coordinates: [10.8231, 106.6297],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          highlights: ['War Remnants Museum', 'Cu Chi Tunnels', 'Ben Thanh Market'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'cantho',
          name: 'Can Tho - Mekong Delta',
          description: 'Experience the floating markets and river life',
          coordinates: [10.0452, 105.7469],
          type: 'activity' as const,
          image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
          highlights: ['Cai Rang Floating Market', 'Boat tours', 'Local villages'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'phuquoc',
          name: 'Phu Quoc Island',
          description: 'Relax on pristine beaches and enjoy island life',
          coordinates: [9.2898, 105.7181],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['Long Beach', 'Sao Beach', 'Phu Quoc National Park'],
          duration: '4 days',
          groupSize: 'Small groups',
        },
      ],
    },
    'vietnam-12-day': {
      center: [21.0285, 105.8542] as [number, number],
      zoom: 5,
      route: [
        [21.0285, 105.8542], // Hanoi
        [20.8449, 106.6881], // Halong Bay
        [15.8801, 108.3380], // Hoi An
        [10.8231, 106.6297], // Ho Chi Minh City
      ],
      points: [
        {
          id: 'hanoi',
          name: 'Hanoi',
          description: 'Vietnam\'s charming capital with rich history',
          coordinates: [21.0285, 105.8542],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
          highlights: ['Old Quarter', 'Hoan Kiem Lake', 'Temple of Literature'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'halong',
          name: 'Halong Bay',
          description: 'UNESCO World Heritage limestone karsts',
          coordinates: [20.8449, 106.6881],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          highlights: ['Cruise tours', 'Kayaking', 'Cave exploration'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'hoian',
          name: 'Hoi An',
          description: 'Ancient town with lantern-lit streets',
          coordinates: [15.8801, 108.3380],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['Ancient Town', 'Japanese Bridge', 'Cooking classes'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'hcmc',
          name: 'Ho Chi Minh City',
          description: 'Modern metropolis with historic sites',
          coordinates: [10.8231, 106.6297],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
          highlights: ['War Remnants Museum', 'Cu Chi Tunnels', 'Ben Thanh Market'],
          duration: '4 days',
          groupSize: 'Small groups',
        },
      ],
    },
    'thailand-10-day': {
      center: [13.7563, 100.5018] as [number, number],
      zoom: 5,
      route: [
        [13.7563, 100.5018], // Bangkok
        [18.7883, 98.9853], // Chiang Mai
        [7.8804, 98.3923], // Phuket
      ],
      points: [
        {
          id: 'bangkok',
          name: 'Bangkok',
          description: 'Thailand\'s vibrant capital city',
          coordinates: [13.7563, 100.5018],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
          highlights: ['Grand Palace', 'Wat Pho', 'Chatuchak Market'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'chiangmai',
          name: 'Chiang Mai',
          description: 'Cultural heart of Northern Thailand',
          coordinates: [18.7883, 98.9853],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          highlights: ['Doi Suthep Temple', 'Elephant Sanctuary', 'Night Bazaar'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'phuket',
          name: 'Phuket',
          description: 'Thailand\'s largest island paradise',
          coordinates: [7.8804, 98.3923],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['Patong Beach', 'Phi Phi Islands', 'Big Buddha'],
          duration: '4 days',
          groupSize: 'Small groups',
        },
      ],
    },
    'cambodia-10-day': {
      center: [13.4125, 103.8670] as [number, number],
      zoom: 6,
      route: [
        [13.4125, 103.8670], // Siem Reap (Angkor)
        [11.5564, 104.9282], // Phnom Penh
        [10.6118, 103.5496], // Koh Rong
      ],
      points: [
        {
          id: 'siemreap',
          name: 'Siem Reap - Angkor Wat',
          description: 'Ancient Khmer empire temples',
          coordinates: [13.4125, 103.8670],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
          highlights: ['Angkor Wat', 'Angkor Thom', 'Ta Prohm'],
          duration: '4 days',
          groupSize: 'Small groups',
        },
        {
          id: 'phnompenh',
          name: 'Phnom Penh',
          description: 'Cambodia\'s capital with rich history',
          coordinates: [11.5564, 104.9282],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
          highlights: ['Royal Palace', 'Tuol Sleng Museum', 'Russian Market'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'kohrong',
          name: 'Koh Rong Island',
          description: 'Pristine island with crystal clear waters',
          coordinates: [10.6118, 103.5496],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['White sand beaches', 'Snorkeling', 'Island hopping'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
      ],
    },
    'indochina-14-day': {
      center: [16.0544, 108.2022] as [number, number],
      zoom: 5,
      route: [
        [21.0285, 105.8542], // Hanoi
        [20.8449, 106.6881], // Halong Bay
        [15.8801, 108.3380], // Hoi An
        [9.2898, 105.7181], // Phu Quoc
        [13.4125, 103.8670], // Siem Reap
      ],
      points: [
        {
          id: 'hanoi',
          name: 'Hanoi',
          description: 'Vietnam\'s charming capital',
          coordinates: [21.0285, 105.8542],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
          highlights: ['Old Quarter', 'Hoan Kiem Lake', 'Temple of Literature'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'halong',
          name: 'Halong Bay',
          description: 'UNESCO World Heritage site',
          coordinates: [20.8449, 106.6881],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          highlights: ['Cruise tours', 'Kayaking', 'Cave exploration'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'hoian',
          name: 'Hoi An',
          description: 'Ancient lantern town',
          coordinates: [15.8801, 108.3380],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['Ancient Town', 'Japanese Bridge', 'Cooking classes'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'phuquoc',
          name: 'Phu Quoc Island',
          description: 'Tropical island paradise',
          coordinates: [9.2898, 105.7181],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
          highlights: ['Long Beach', 'Sao Beach', 'National Park'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'siemreap',
          name: 'Siem Reap - Angkor',
          description: 'Ancient Khmer temples',
          coordinates: [13.4125, 103.8670],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
          highlights: ['Angkor Wat', 'Angkor Thom', 'Ta Prohm'],
          duration: '5 days',
          groupSize: 'Small groups',
        },
      ],
    },
    'thailand-vietnam-14-day': {
      center: [13.7563, 100.5018] as [number, number],
      zoom: 5,
      route: [
        [13.7563, 100.5018], // Bangkok
        [18.7883, 98.9853], // Chiang Mai
        [7.8804, 98.3923], // Phuket
        [21.0285, 105.8542], // Hanoi
        [15.8801, 108.3380], // Hoi An
      ],
      points: [
        {
          id: 'bangkok',
          name: 'Bangkok',
          description: 'Thailand\'s vibrant capital',
          coordinates: [13.7563, 100.5018],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
          highlights: ['Grand Palace', 'Wat Pho', 'Chatuchak Market'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'chiangmai',
          name: 'Chiang Mai',
          description: 'Cultural heart of Northern Thailand',
          coordinates: [18.7883, 98.9853],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          highlights: ['Doi Suthep Temple', 'Elephant Sanctuary', 'Night Bazaar'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'phuket',
          name: 'Phuket',
          description: 'Thailand\'s largest island',
          coordinates: [7.8804, 98.3923],
          type: 'attraction' as const,
          image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
          highlights: ['Patong Beach', 'Phi Phi Islands', 'Big Buddha'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
        {
          id: 'hanoi',
          name: 'Hanoi',
          description: 'Vietnam\'s charming capital',
          coordinates: [21.0285, 105.8542],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
          highlights: ['Old Quarter', 'Hoan Kiem Lake', 'Temple of Literature'],
          duration: '2 days',
          groupSize: 'Small groups',
        },
        {
          id: 'hoian',
          name: 'Hoi An',
          description: 'Ancient lantern town',
          coordinates: [15.8801, 108.3380],
          type: 'landmark' as const,
          image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
          highlights: ['Ancient Town', 'Japanese Bridge', 'Cooking classes'],
          duration: '3 days',
          groupSize: 'Small groups',
        },
      ],
    },
  };

  return mapData[tourId] || mapData['vietnam-9-day'];
};

export default function InteractiveMap({ tourId, height = '400px', className = '' }: InteractiveMapProps) {
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const mapData = getMapData(tourId);

  const getIconColor = (type: MapPoint['type']) => {
    const colors = {
      attraction: '#3B82F6', // Blue
      hotel: '#10B981', // Green
      restaurant: '#F59E0B', // Yellow
      activity: '#8B5CF6', // Purple
      landmark: '#EF4444', // Red
    };
    return colors[type];
  };

  const getIcon = (type: MapPoint['type']) => {
    const icons = {
      attraction: <Mountain className="w-4 h-4" />,
      hotel: <Hotel className="w-4 h-4" />,
      restaurant: <Utensils className="w-4 h-4" />,
      activity: <Waves className="w-4 h-4" />,
      landmark: <MapPin className="w-4 h-4" />,
    };
    return icons[type];
  };

  return (
    <div className={`relative ${className}`}>
      {/* Simple Map Display */}
      <div className="rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-blue-50 to-green-50" style={{ height }}>
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Interactive Map</h3>
            <p className="text-gray-600 mb-6">Explore the destinations on this tour</p>
            
            {/* Destination Points */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {mapData.points.map((point) => (
                <div
                  key={point.id}
                  onClick={() => setSelectedPoint(point)}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4"
                  style={{ borderLeftColor: getIconColor(point.type) }}
                >
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: getIconColor(point.type) }}
                    >
                      {getIcon(point.type)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{point.name}</h4>
                      <p className="text-sm text-gray-600">{point.duration}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map Legend */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
        <h4 className="font-semibold text-gray-900 mb-2 text-sm">Legend</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
            <span>Landmarks</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
            <span>Attractions</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
            <span>Hotels</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></span>
            <span>Restaurants</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 rounded-full bg-purple-500 mr-2"></span>
            <span>Activities</span>
          </div>
        </div>
      </div>

      {/* Selected Point Details */}
      {selectedPoint && (
        <div className="absolute bottom-4 left-4 right-4">
          <LuxuryCard variant="glass" className="p-4">
            <div className="flex items-start space-x-4">
              {selectedPoint.image && (
                <img
                  src={selectedPoint.image}
                  alt={selectedPoint.name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{selectedPoint.name}</h3>
                  <button
                    onClick={() => setSelectedPoint(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-3">{selectedPoint.description}</p>
                
                {selectedPoint.highlights && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-gray-700 mb-1">Highlights:</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedPoint.highlights.slice(0, 3).map((highlight, index) => (
                        <span
                          key={index}
                          className="inline-block bg-sky-100 text-sky-600 text-xs px-2 py-1 rounded-full"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <div className="flex items-center">
                    <Clock size={12} className="mr-1" />
                    <span>{selectedPoint.duration}</span>
                  </div>
                  <div className="flex items-center">
                    <Users size={12} className="mr-1" />
                    <span>{selectedPoint.groupSize}</span>
                  </div>
                  {selectedPoint.rating && (
                    <div className="flex items-center">
                      <Star size={12} className="mr-1 text-yellow-500" />
                      <span>{selectedPoint.rating}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </LuxuryCard>
        </div>
      )}
    </div>
  );
}