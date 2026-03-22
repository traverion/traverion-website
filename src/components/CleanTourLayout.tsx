import { useState } from 'react';
import { MapPin, Calendar, Users, Star, Clock, Plane, Shield, Heart, Share2, BookOpen, CheckCircle, Globe, Bed, Mail, Phone, User, Send } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import EnhancedItinerary from './EnhancedItinerary';
import BookingForm from './BookingForm';

interface TourPackage {
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
  };
  category: string;
  tourType: string;
  validity: string;
  image: string;
  description: string;
  highlights: string[];
  itinerary: Array<{
    day: number;
    title: string;
    description: string;
    meals: string;
    location: string;
    activities: string[];
  }>;
  rating: number;
  reviews: number;
  groupSize: string;
}

interface CleanTourLayoutProps {
  tour: TourPackage;
  onBack: () => void;
}

export default function CleanTourLayout({ tour, onBack }: CleanTourLayoutProps) {
  const { t } = useTranslation();
  const [isLiked, setIsLiked] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [activeTab, setActiveTab] = useState('itinerary');
  const [isVisible, setIsVisible] = useState(false);

  const tabs = [
    { id: 'itinerary', label: 'Itinerary', icon: Calendar },
    { id: 'highlights', label: 'Highlights', icon: Star },
    { id: 'included', label: 'What\'s Included', icon: CheckCircle },
    { id: 'accommodation', label: 'Hotels', icon: Bed },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100" style={{ marginTop: '180px' }}>
      {/* Hero Section */}
      <div className="relative h-[60vh] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${tour.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70" />
        
        {/* Back Button */}
        <div className="absolute top-6 left-6 z-10">
          <LuxuryButton
            variant="gradient"
            size="sm"
            onClick={onBack}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-xl"
          >
            ← Back to Tours
          </LuxuryButton>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 h-full flex items-end">
          <div className="max-w-7xl mx-auto px-6 pb-16 w-full">
            <div className="max-w-4xl ml-32">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
                {tour.title}
              </h1>
              
              <p className="text-lg md:text-xl text-white/90 mb-6 leading-relaxed max-w-3xl">
                {tour.description}
              </p>

              <div className="flex items-center space-x-6 mb-6">
                <div className="flex items-center space-x-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-5 h-5 ${i < Math.floor(tour.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                    ))}
                  </div>
                  <div>
                    <span className="text-white text-xl font-bold">{tour.rating}</span>
                    <span className="text-white/70 text-sm ml-1">({tour.reviews} reviews)</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsLiked(!isLiked)}
                    className={`p-2 rounded-full transition-all duration-300 ${isLiked ? 'bg-red-500 text-white shadow-lg scale-110' : 'bg-white/20 text-white hover:bg-white/30 hover:scale-105'}`}
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                  </button>
                  
                  <button className="p-2 bg-white/20 text-white rounded-full hover:bg-white/30 hover:scale-105 transition-all duration-300">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <LuxuryButton
                  variant="gradient"
                  size="lg"
                  onClick={() => setShowBooking(true)}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-4 text-lg font-semibold"
                >
                  <span>Book This Tour</span>
                  <Plane className="ml-2 w-5 h-5" />
                </LuxuryButton>
                
                <LuxuryButton
                  variant="outline"
                  size="lg"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30 px-8 py-4 text-lg font-semibold"
                >
                  <BookOpen className="mr-2 w-5 h-5" />
                  Download Brochure
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Itinerary & Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Navigation Tabs */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center space-x-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              {activeTab === 'itinerary' && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Daily Itinerary</h3>
                  <EnhancedItinerary 
                    itinerary={tour.itinerary} 
                    tourTitle={tour.title}
                  />
                </div>
              )}

              {activeTab === 'highlights' && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Tour Highlights</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tour.highlights.map((highlight, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mt-1">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-gray-700">{highlight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'included' && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">What's Included</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900">Included</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Accommodation with daily breakfast</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Professional English-speaking guide</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Private air-conditioned vehicle</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Entrance fees for all visits</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Meals as indicated in itinerary</span>
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900">Not Included</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li className="flex items-center space-x-2">
                          <span className="w-4 h-4 text-red-600">✗</span>
                          <span>International flights</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span className="w-4 h-4 text-red-600">✗</span>
                          <span>Travel insurance</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span className="w-4 h-4 text-red-600">✗</span>
                          <span>Personal expenses</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span className="w-4 h-4 text-red-600">✗</span>
                          <span>Tips for guides and drivers</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'accommodation' && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Accommodation</h3>
                  <div className="space-y-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900">4-Star Hotels</h4>
                      <p className="text-gray-600 text-sm">Comfortable accommodation with modern amenities</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900">5-Star Hotels (Optional)</h4>
                      <p className="text-gray-600 text-sm">Luxury accommodation with premium services</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Pricing & Booking */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6">
              {/* Pricing Display */}
              <div className="mb-6">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-gray-900 mb-2">
                    Starting from {tour.price.startingFrom} {tour.price.currency}
                  </div>
                  <div className="text-sm text-gray-600">
                    per person • {tour.price.twinOccupancy ? 'Twin/Double occupancy' : 'Single occupancy'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Valid: {tour.price.validity}
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-700 mb-2">
                    <strong>Custom quotes available for:</strong>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>• All group sizes (2-20+ people)</div>
                    <div>• Hotel categories (3*, 4*, 5*)</div>
                    <div>• Single supplement options</div>
                    <div>• Flexible travel dates</div>
                  </div>
                </div>
              </div>

              {/* Booking Button */}
              <LuxuryButton
                variant="gradient"
                size="lg"
                onClick={() => setShowBooking(true)}
                className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white py-4 text-lg font-semibold mb-4"
              >
                <Send className="mr-2 w-5 h-5" />
                Get Custom Quote
              </LuxuryButton>

              {/* Additional Info */}
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span>Secure booking guaranteed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span>Quote within 24 hours</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span>Flexible payment options</span>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3">Need Help?</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4" />
                    <a href="mailto:info@traverion.com" className="hover:text-sky-600 transition-colors">
                      info@traverion.com
                    </a>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4" />
                    <a href="tel:+358458803060" className="hover:text-sky-600 transition-colors">
                      +358 45 8803060
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Form Modal */}
      {showBooking && (
        <BookingForm
          tourTitle={tour.title}
          tourId={tour.id}
          startingPrice={tour.price.startingFrom}
          currency={tour.price.currency}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  );
}
