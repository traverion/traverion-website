import { useState } from 'react';
import { MapPin, Clock, Utensils, Camera, Plane, Train, Car, Ship, Hotel, Star, ChevronDown, ChevronUp } from 'lucide-react';

interface ItineraryDay {
  day: number;
  title: string;
  description: string;
  meals: string;
  location: string;
  activities: string[];
}

interface EnhancedItineraryProps {
  itinerary: ItineraryDay[];
  tourTitle: string;
}

export default function EnhancedItinerary({ itinerary, tourTitle }: EnhancedItineraryProps) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const getMealIcon = (meals: string) => {
    if (meals.includes('B/L/D')) return <Utensils className="w-4 h-4 text-white" />;
    if (meals.includes('B/L')) return <Utensils className="w-4 h-4 text-white" />;
    if (meals.includes('B')) return <Utensils className="w-4 h-4 text-white" />;
    return <Utensils className="w-4 h-4 text-white" />;
  };

  const getTransportIcon = (activities: string[]) => {
    if (activities.some(a => a.toLowerCase().includes('flight'))) return <Plane className="w-5 h-5 text-blue-600" />;
    if (activities.some(a => a.toLowerCase().includes('train'))) return <Train className="w-5 h-5 text-green-600" />;
    if (activities.some(a => a.toLowerCase().includes('cruise'))) return <Ship className="w-5 h-5 text-cyan-600" />;
    if (activities.some(a => a.toLowerCase().includes('transfer'))) return <Car className="w-5 h-5 text-gray-600" />;
    return <MapPin className="w-5 h-5 text-sky-600" />;
  };

  const getAccommodationIcon = (activities: string[]) => {
    if (activities.some(a => a.toLowerCase().includes('hotel') || a.toLowerCase().includes('resort'))) {
      return <Hotel className="w-5 h-5 text-white" />;
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-light text-gray-900 mb-4">
          Daily Itinerary
        </h2>
        <p className="text-xl text-gray-600">
          {tourTitle} - {itinerary.length} days of unforgettable experiences
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-500 to-blue-600"></div>

        {itinerary.map((day, index) => (
          <div key={day.day} className="relative mb-8">
            {/* Timeline Dot */}
            <div className="absolute left-6 w-4 h-4 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full border-4 border-white shadow-lg z-10"></div>

            {/* Day Card */}
            <div className="ml-16 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
              {/* Day Header */}
              <div 
                className="p-6 cursor-pointer"
                onClick={() => setExpandedDay(expandedDay === day.day ? null : day.day)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {day.day}
                      </div>
                      <div>
                        <h3 className="text-xl font-medium text-gray-900">{day.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-4 h-4" />
                            <span>{day.location}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            {getMealIcon(day.meals)}
                            <span>{day.meals}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {getTransportIcon(day.activities)}
                    {getAccommodationIcon(day.activities)}
                    {expandedDay === day.day ? 
                      <ChevronUp className="w-5 h-5 text-gray-400" /> : 
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    }
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedDay === day.day && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  <div className="pt-4">
                    <p className="text-gray-700 mb-4">{day.description}</p>
                    
                    {/* Activities Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {day.activities.map((activity, activityIndex) => (
                        <div key={activityIndex} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                          <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                          <span className="text-sm text-gray-700">{activity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="text-center p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
          <Clock className="w-8 h-8 text-white mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{itinerary.length} Days</div>
          <div className="text-sm text-white/80">Total Duration</div>
        </div>
        
        <div className="text-center p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
          <MapPin className="w-8 h-8 text-white mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">
            {new Set(itinerary.map(day => day.location)).size}
          </div>
          <div className="text-sm text-white/80">Destinations</div>
        </div>
        
        <div className="text-center p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
          <Utensils className="w-8 h-8 text-white mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">
            {itinerary.filter(day => day.meals !== 'None').length}
          </div>
          <div className="text-sm text-white/80">Meals Included</div>
        </div>
        
        <div className="text-center p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
          <Star className="w-8 h-8 text-white mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">
            {itinerary.reduce((total, day) => total + day.activities.length, 0)}
          </div>
          <div className="text-sm text-white/80">Activities</div>
        </div>
      </div>
    </div>
  );
}
