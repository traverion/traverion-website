import { useState } from 'react';
import { X, Star, MapPin, Calendar, Users, Clock, Check, X as XIcon } from 'lucide-react';
import { TourPackage } from '../types/tour';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';

interface TourComparisonProps {
  tours: TourPackage[];
  onClose: () => void;
}

export default function TourComparison({ tours, onClose }: TourComparisonProps) {
  const [selectedTours, setSelectedTours] = useState<TourPackage[]>(tours.slice(0, 3));

  const addTour = (tour: TourPackage) => {
    if (selectedTours.length < 3 && !selectedTours.find(t => t.id === tour.id)) {
      setSelectedTours([...selectedTours, tour]);
    }
  };

  const removeTour = (tourId: string) => {
    setSelectedTours(selectedTours.filter(tour => tour.id !== tourId));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Compare Tours</h2>
            <p className="text-gray-600">Select up to 3 tours to compare features and pricing</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Tour Selection */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Tours</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tours.map((tour) => (
              <div
                key={tour.id}
                className={`p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                  selectedTours.find(t => t.id === tour.id)
                    ? 'border-sky-500 bg-sky-50'
                    : selectedTours.length >= 3
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-sky-300 hover:bg-sky-50'
                }`}
                onClick={() => addTour(tour)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900 truncate">{tour.title}</h4>
                  {selectedTours.find(t => t.id === tour.id) && (
                    <Check size={20} className="text-sky-500" />
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-2">{tour.destination}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span className="flex items-center">
                    <Calendar size={16} className="mr-1" />
                    {tour.duration}
                  </span>
                  <span className="flex items-center">
                    <Star size={16} className="mr-1" />
                    {tour.rating}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison Table */}
        <div className="p-6 overflow-auto max-h-96">
          <div className="grid grid-cols-4 gap-4 min-w-[800px]">
            {/* Feature Column */}
            <div className="space-y-4">
              <div className="h-16"></div> {/* Spacer for tour headers */}
              <div className="space-y-3">
                <div className="h-8 flex items-center font-medium text-gray-700">Destination</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Duration</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Style</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Difficulty</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Group Size</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Best Time</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Rating</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Price (Twin)</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Category</div>
                <div className="h-8 flex items-center font-medium text-gray-700">Popular</div>
              </div>
            </div>

            {/* Tour Columns */}
            {selectedTours.map((tour) => (
              <div key={tour.id} className="space-y-4">
                {/* Tour Header */}
                <LuxuryCard variant="elevated" className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{tour.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">{tour.destination}</p>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              className={`${i < Math.floor(tour.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500">({tour.reviews})</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeTour(tour.id)}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
                    >
                      <XIcon size={16} className="text-gray-400" />
                    </button>
                  </div>
                  <LuxuryButton variant="gradient" size="sm" className="w-full">
                    View Details
                  </LuxuryButton>
                </LuxuryCard>

                {/* Tour Details */}
                <div className="space-y-3">
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.destination}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.duration}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.style}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.difficulty}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.groupSize}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.bestTime}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">
                    <div className="flex items-center">
                      <Star size={14} className="text-yellow-400 mr-1" />
                      {tour.rating}
                    </div>
                  </div>
                  <div className="h-8 flex items-center text-sm text-gray-700">
                    ${tour.price.twin}
                  </div>
                  <div className="h-8 flex items-center text-sm text-gray-700">{tour.category}</div>
                  <div className="h-8 flex items-center text-sm text-gray-700">
                    {tour.isPopular ? (
                      <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded-full text-xs">
                        Popular
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {selectedTours.length} of 3 tours selected
          </div>
          <div className="flex items-center space-x-3">
            <LuxuryButton variant="outline" onClick={onClose}>
              Close
            </LuxuryButton>
            <LuxuryButton variant="gradient">
              Book Selected Tours
            </LuxuryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
