import { useState } from 'react';
import { MapPin, Camera, Hotel, Utensils, Mountain, Sun, Waves, Star, Clock, Users } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';

interface MapPoint {
  id: string;
  name: string;
  position: [number, number];
  type: 'attraction' | 'hotel' | 'restaurant' | 'activity' | 'landmark';
  description: string;
  highlights?: string[];
  image?: string;
}

interface SimpleMapProps {
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
      points: [
        {
          id: 'ho-chi-minh',
          name: 'Ho Chi Minh City',
          position: [10.8231, 106.6297] as [number, number],
          type: 'attraction' as const,
          description: 'Vietnam\'s largest city and economic hub',
          highlights: ['Ben Thanh Market', 'War Remnants Museum', 'Notre-Dame Cathedral']
        },
        {
          id: 'mekong-delta',
          name: 'Mekong Delta',
          position: [10.0452, 105.7469] as [number, number],
          type: 'activity' as const,
          description: 'Lush river delta with floating markets',
          highlights: ['Cai Rang Floating Market', 'Coconut Candy Factory', 'Boat Tours']
        }
      ]
    },
    'vietnam-12-day': {
      center: [16.0471, 108.2068] as [number, number],
      zoom: 5,
      points: [
        {
          id: 'hanoi',
          name: 'Hanoi',
          position: [21.0285, 105.8542] as [number, number],
          type: 'attraction' as const,
          description: 'Vietnam\'s capital with rich history',
          highlights: ['Old Quarter', 'Hoan Kiem Lake', 'Temple of Literature']
        },
        {
          id: 'halong-bay',
          name: 'Halong Bay',
          position: [20.9101, 107.1839] as [number, number],
          type: 'landmark' as const,
          description: 'UNESCO World Heritage limestone karsts',
          highlights: ['Cruise Tours', 'Cave Exploration', 'Kayaking']
        },
        {
          id: 'hoi-an',
          name: 'Hoi An',
          position: [15.8801, 108.3380] as [number, number],
          type: 'landmark' as const,
          description: 'Ancient trading port with lantern-lit streets',
          highlights: ['Ancient Town', 'Japanese Bridge', 'Tailor Shops']
        }
      ]
    }
  };

  return mapData[tourId as keyof typeof mapData] || mapData['vietnam-9-day'];
};

const getIconForType = (type: MapPoint['type']) => {
  switch (type) {
    case 'hotel':
      return <Hotel className="w-4 h-4" />;
    case 'restaurant':
      return <Utensils className="w-4 h-4" />;
    case 'activity':
      return <Mountain className="w-4 h-4" />;
    case 'landmark':
      return <Star className="w-4 h-4" />;
    default:
      return <MapPin className="w-4 h-4" />;
  }
};

const getColorForType = (type: MapPoint['type']) => {
  switch (type) {
    case 'hotel':
      return 'bg-blue-500';
    case 'restaurant':
      return 'bg-green-500';
    case 'activity':
      return 'bg-purple-500';
    case 'landmark':
      return 'bg-yellow-500';
    default:
      return 'bg-sky-500';
  }
};

export default function SimpleMap({ tourId, height = '400px', showRoute = true, className = '' }: SimpleMapProps) {
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const mapData = getMapData(tourId);

  return (
    <div className={`relative ${className}`}>
      {/* Map Container */}
      <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-xl shadow-lg overflow-hidden" style={{ height }}>
        {/* Map Header */}
        <div className="p-4 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MapPin className="w-5 h-5 text-sky-500" />
              <h3 className="font-semibold text-gray-900">Tour Destinations</h3>
            </div>
            <span className="text-sm text-gray-500">{mapData.points.length} locations</span>
          </div>
        </div>

        {/* Map Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mapData.points.map((point, index) => (
              <LuxuryCard
                key={point.id}
                variant="glass"
                className="p-4 cursor-pointer hover:shadow-lg transition-all duration-300"
                onClick={() => {
                  setSelectedPoint(point);
                  setShowDetails(true);
                }}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${getColorForType(point.type)}`}>
                    {getIconForType(point.type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{point.name}</h4>
                    <p className="text-sm text-gray-600 line-clamp-2">{point.description}</p>
                    <div className="flex items-center mt-2 space-x-4 text-xs text-gray-500">
                      <div className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        Day {index + 1}
                      </div>
                      <div className="flex items-center">
                        <Users className="w-3 h-3 mr-1" />
                        Group tour
                      </div>
                    </div>
                  </div>
                </div>
              </LuxuryCard>
            ))}
          </div>

          {/* Route Information */}
          {showRoute && (
            <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Tour Route</h4>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-sky-500" />
                <span>Start: {mapData.points[0]?.name}</span>
                <span>→</span>
                <span>End: {mapData.points[mapData.points.length - 1]?.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Point Details Modal */}
      {showDetails && selectedPoint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${getColorForType(selectedPoint.type)}`}>
                    {getIconForType(selectedPoint.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedPoint.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{selectedPoint.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <p className="text-gray-700 mb-4">{selectedPoint.description}</p>
              
              {selectedPoint.highlights && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Highlights</h4>
                  <ul className="space-y-1">
                    {selectedPoint.highlights.map((highlight, index) => (
                      <li key={index} className="flex items-center text-sm text-gray-600">
                        <Star className="w-3 h-3 text-yellow-500 mr-2" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



