import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, Star, Clock, Plane, Shield, Heart, Share2, BookOpen, CheckCircle, XCircle, Camera, Utensils, Wifi, Car, Mountain, Sun, Waves, Award, Globe, Bed, Coffee } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import BookingSystem from '../components/BookingSystem';
import SimpleMap from '../components/SimpleMap';
import CustomerReviews from '../components/CustomerReviews';
import SustainabilityFeatures from '../components/SustainabilityFeatures';
import EnhancedItinerary from '../components/EnhancedItinerary';
import { tourPackages } from '../data/tours';
import { TourPackage as TourPackageType } from '../types/tour';
import { getReviewsForTour } from '../data/reviews';
import Footer from '../components/Footer';

interface TourPackageProps {
  tourId: string;
  onBack: () => void;
}

interface BookingData {
  tourId: string;
  departureDate: string;
  returnDate: string;
  travelers: any[];
  roomType: 'twin' | 'single';
  totalPrice: number;
  specialRequests: string;
  contactInfo: any;
}

export default function BeautifulTourPackage({ tourId, onBack }: TourPackageProps) {
  const { t } = useTranslation();
  const [tour, setTour] = useState<TourPackageType | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const foundTour = tourPackages.find(t => t.id === tourId);
    setTour(foundTour || null);
    
    // Scroll to top when tour changes
    window.scrollTo(0, 0);
    
    // Trigger animation on mount
    setIsVisible(false);
    setTimeout(() => setIsVisible(true), 50);
  }, [tourId]);

  if (!tour) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Holiday Package Not Found</h1>
          <LuxuryButton variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Holiday Packages
          </LuxuryButton>
        </div>
      </div>
    );
  }

  const images = [
    tour.image,
    'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
    'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
    'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
    'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
  ];

  const tabs = [
    { id: 'overview', label: 'Holiday Overview', icon: Star },
    { id: 'map', label: 'Holiday Map', icon: MapPin },
    { id: 'itinerary', label: 'Daily Itinerary', icon: Calendar },
    { id: 'accommodation', label: 'Luxury Hotels', icon: Bed },
    { id: 'included', label: 'What\'s Included', icon: CheckCircle },
    { id: 'reviews', label: 'Guest Reviews', icon: Star },
    { id: 'sustainability', label: 'Sustainability', icon: Globe },
  ];

  const handleBookingConfirm = (bookingData: BookingData) => {
    console.log('Booking confirmed:', bookingData);
    setShowBooking(false);
    alert('Holiday package booking confirmed! We will contact you shortly to finalize your dream vacation.');
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} mt-32`}>
      {/* Hero Section */}
      <div className="relative h-[90vh] md:h-[80vh] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
          style={{
            backgroundImage: `url(${tour.image})`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70" />
        
        {/* Back Button */}
        <div className="absolute top-20 left-4 sm:left-8 md:left-16 lg:left-24 z-50">
          <LuxuryButton
            variant="gradient"
            size="md"
            onClick={() => {
              console.log('Back button clicked');
              onBack();
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Holiday Packages
          </LuxuryButton>
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex items-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 w-full">
            <div className="max-w-4xl">

              
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold !text-white mb-3 md:mb-4 leading-tight drop-shadow-md">
                {tour.title}
              </h1>
              
              <p className="text-base sm:text-lg md:text-xl !text-white/95 mb-4 md:mb-6 leading-relaxed max-w-3xl drop-shadow-md [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">
                {tour.description}
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 space-y-3 sm:space-y-0">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 sm:w-5 sm:h-5 ${i < Math.floor(tour.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                      ))}
                    </div>
                    <div>
                      <span className="text-white text-lg sm:text-xl font-bold">{tour.rating}</span>
                      <span className="text-white/70 text-xs sm:text-sm ml-1">({tour.reviews} reviews)</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <button
                      onClick={() => setIsLiked(!isLiked)}
                      className={`p-1.5 sm:p-2 rounded-full transition-all duration-300 ${
                        isLiked ? 'bg-red-500 text-white shadow-lg scale-110' : 'bg-white/20 text-white hover:bg-white/30 hover:scale-105'
                      }`}
                    >
                      <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? 'fill-current' : ''}`} />
                    </button>
                    
                    <button className="p-1.5 sm:p-2 bg-white/20 text-white rounded-full hover:bg-white/30 hover:scale-105 transition-all duration-300">
                      <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <LuxuryButton
                  variant="gradient"
                  size="lg"
                  onClick={() => setShowBooking(true)}
                  className="group px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold"
                >
                  <span>Book This Holiday Package</span>
                  <Plane className="ml-2 w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" />
                </LuxuryButton>
                
                <LuxuryButton
                  variant="outline"
                  size="lg"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold"
                >
                  <BookOpen className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />
                  Download Holiday Brochure
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Mobile Optimized */}
      <div className={`bg-white shadow-lg sticky top-20 z-30 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transitionDelay: '200ms' }}>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          {/* Mobile: Dropdown */}
          <div className="block md:hidden">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full p-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                );
              })}
            </select>
          </div>
          
          {/* Desktop: Horizontal Tabs */}
          <div className="hidden md:flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 lg:px-6 py-4 text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                    activeTab === tab.id
                      ? 'text-slate-700 border-b-2 border-slate-700 bg-slate-50'
                      : 'text-gray-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transitionDelay: '300ms' }}>
        {activeTab === 'overview' && (
          <div className="space-y-6 sm:space-y-8 lg:space-y-12">
            {/* Tour Information Badges */}
            <LuxuryCard className="p-4 sm:p-6 lg:p-8">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Holiday Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center space-x-3 bg-gradient-to-r from-sky-50 to-blue-50 p-4 rounded-xl">
                  <MapPin className="w-6 h-6 text-sky-600" />
                  <div>
                    <p className="text-sm text-gray-600">Destination</p>
                    <p className="font-semibold text-gray-900">{tour.destination}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-xl">
                  <Calendar className="w-6 h-6 text-amber-600" />
                  <div>
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="font-semibold text-gray-900">{tour.duration}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl">
                  <Users className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Group Size</p>
                    <p className="font-semibold text-gray-900">{tour.groupSize}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-xl">
                  <Shield className="w-6 h-6 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600">Category</p>
                    <p className="font-semibold text-gray-900">{tour.category} Luxury</p>
                  </div>
                </div>
              </div>
            </LuxuryCard>

            {/* Holiday Highlights */}
            <LuxuryCard className="p-4 sm:p-6 lg:p-8">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Holiday Highlights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tour.highlights.map((highlight, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full flex items-center justify-center mt-1">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-gray-700 text-lg">{highlight}</p>
                  </div>
                ))}
              </div>
            </LuxuryCard>

            {/* Image Gallery */}
            <LuxuryCard className="p-8">
              <h3 className="text-3xl font-bold text-gray-900 mb-6">Holiday Gallery</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`relative overflow-hidden rounded-xl transition-all duration-300 ${
                      selectedImage === index 
                        ? 'ring-4 ring-amber-500 shadow-xl scale-105' 
                        : 'hover:scale-105 hover:shadow-lg'
                    }`}
                  >
                    <img 
                      src={img} 
                      alt={`Gallery ${index + 1}`} 
                      className="w-full h-32 object-cover" 
                    />
                    {selectedImage === index && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </LuxuryCard>
          </div>
        )}


        {activeTab === 'map' && (
          <div className="space-y-6">
            <LuxuryCard className="p-8">
              <h3 className="text-3xl font-bold text-gray-900 mb-6">Holiday Route Map</h3>
              <SimpleMap 
                tourId={tour.id} 
                height="600px" 
                showRoute={true}
                className="rounded-2xl shadow-xl"
              />
            </LuxuryCard>
          </div>
        )}

        {activeTab === 'itinerary' && (
          <div className="space-y-8">
            <EnhancedItinerary 
              itinerary={tour.itinerary} 
              tourTitle={tour.title}
            />
          </div>
        )}

        {activeTab === 'accommodation' && (
          <div className="space-y-8">
            <LuxuryCard className="p-8">
              <h3 className="text-3xl font-bold text-gray-900 mb-8">Luxury Accommodations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tour.hotels.map((hotel, index) => (
                  <div key={index} className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center space-x-3 mb-4">
                      <Bed className="w-6 h-6 text-amber-500" />
                      <div>
                        <h4 className="font-bold text-gray-900">{hotel.name}</h4>
                        <p className="text-sm text-gray-600">{hotel.city}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 mb-3">
                      <Shield className="w-5 h-5 text-amber-500" />
                      <span className="font-semibold text-gray-900">{hotel.category}</span>
                    </div>
                    <p className="text-gray-700 text-sm mb-4">{hotel.description}</p>
                    {hotel.website && (
                      <a 
                        href={hotel.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-amber-600 hover:text-amber-700 font-medium text-sm"
                      >
                        Visit Website →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </LuxuryCard>
          </div>
        )}

        {activeTab === 'included' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <LuxuryCard className="p-8">
                <h3 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
                  What's Included
                </h3>
                <div className="space-y-4">
                  {tour.includes.map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <p className="text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </LuxuryCard>

              <LuxuryCard className="p-8">
                <h3 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
                  <XCircle className="w-8 h-8 text-red-500 mr-3" />
                  Not Included
                </h3>
                <div className="space-y-4">
                  {tour.excludes.map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <XCircle className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" />
                      <p className="text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </LuxuryCard>
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <CustomerReviews tourId={tour.id} />
        )}

        {activeTab === 'sustainability' && (
          <SustainabilityFeatures tourId={tour.id} />
        )}
      </div>

      {/* Footer */}
      <Footer />

      {/* Booking Modal */}
      {showBooking && (
        <BookingSystem
          tour={tour}
          onClose={() => setShowBooking(false)}
          onConfirm={handleBookingConfirm}
        />
      )}
    </div>
  );
}

