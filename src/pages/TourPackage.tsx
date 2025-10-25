import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, Star, Clock, Plane, Shield, Heart, Share2, BookOpen, CheckCircle, XCircle, Camera, Utensils, Wifi, Car, Mountain, Sun, Waves } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import BookingSystem from '../components/BookingSystem';
import SimpleMap from '../components/SimpleMap';
import CustomerReviews from '../components/CustomerReviews';
import SustainabilityFeatures from '../components/SustainabilityFeatures';
import DigitalBrochure from '../components/DigitalBrochure';
import { tourPackages } from '../data/tours';
import { TourPackage as TourPackageType } from '../types/tour';
import { getReviewsForTour } from '../data/reviews';

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

export default function TourPackage({ tourId, onBack }: TourPackageProps) {
  const { t } = useTranslation();
  const [tour, setTour] = useState<TourPackageType | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const foundTour = tourPackages.find(t => t.id === tourId);
    setTour(foundTour || null);
  }, [tourId]);

  if (!tour) {
    return (
      <div className="min-h-screen bg-white pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Tour Not Found</h1>
          <LuxuryButton variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Tours
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
    { id: 'overview', label: 'Overview', icon: MapPin },
    { id: 'brochure', label: 'Digital Brochure', icon: Star },
    { id: 'map', label: 'Interactive Map', icon: MapPin },
    { id: 'itinerary', label: 'Itinerary', icon: Calendar },
    { id: 'accommodation', label: 'Accommodation', icon: Shield },
    { id: 'included', label: 'What\'s Included', icon: CheckCircle },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'sustainability', label: 'Sustainability', icon: Star },
  ];

  const handleBookingConfirm = (bookingData: BookingData) => {
    console.log('Booking confirmed:', bookingData);
    setShowBooking(false);
    // Here you would typically send the booking data to your backend
    alert('Booking confirmed! We will contact you shortly to finalize your trip.');
  };

  return (
    <div className="min-h-screen bg-white pt-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <LuxuryButton variant="outline" onClick={onBack} className="group">
              <ArrowLeft className="mr-2 w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
              Back to Tours
            </LuxuryButton>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className={`p-2 rounded-full transition-all duration-300 ${
                  isLiked 
                    ? 'bg-red-500 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500'
                }`}
              >
                <Heart size={20} className={isLiked ? 'fill-current' : ''} />
              </button>
              
              <button className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-sky-50 hover:text-sky-500 transition-all duration-300">
                <Share2 size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Image Gallery */}
          <div className="relative h-96 lg:h-screen">
            <div
              className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
              style={{ backgroundImage: `url(${images[selectedImage]})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            
            {/* Image Thumbnails */}
            <div className="absolute bottom-4 left-4 right-4 flex space-x-2 overflow-x-auto">
              {images.map((img, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                    selectedImage === index 
                      ? 'border-white shadow-lg' 
                      : 'border-white/50 hover:border-white/80'
                  }`}
                >
                  <img src={img} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col space-y-2">
              {tour.isPopular && (
                <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                  🔥 Popular
                </div>
              )}
              {tour.discount && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                  {tour.discount} OFF
                </div>
              )}
            </div>
          </div>

          {/* Tour Info */}
          <div className="p-8 lg:p-12 bg-white">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-heading font-bold text-gray-900 mb-4">
                {tour.title}
              </h1>
              
              <div className="flex items-center text-gray-600 mb-6">
                <MapPin size={20} className="mr-2 text-sky-500" />
                <span className="text-lg font-medium">{tour.destination}</span>
              </div>

              <p className="text-lg text-gray-700 leading-relaxed mb-8">
                {tour.description}
              </p>

              {/* Tour Stats */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center">
                  <Clock size={20} className="mr-3 text-sky-500" />
                  <div>
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="font-semibold">{tour.duration}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Users size={20} className="mr-3 text-sky-500" />
                  <div>
                    <p className="text-sm text-gray-500">Group Size</p>
                    <p className="font-semibold">{tour.groupSize}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Star size={20} className="mr-3 text-yellow-500 fill-current" />
                  <div>
                    <p className="text-sm text-gray-500">Rating</p>
                    <p className="font-semibold">{tour.rating} ({tour.reviews} reviews)</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Plane size={20} className="mr-3 text-sky-500" />
                  <div>
                    <p className="text-sm text-gray-500">Difficulty</p>
                    <p className="font-semibold">Easy</p>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-6 mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Pricing</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Twin Sharing</p>
                    <p className="text-3xl font-bold text-gray-900">${tour.price.twin}</p>
                    <p className="text-sm text-gray-500">per person</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Single Room</p>
                    <p className="text-3xl font-bold text-gray-900">${tour.price.single}</p>
                    <p className="text-sm text-gray-500">per person</p>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <LuxuryButton
                  variant="gradient"
                  size="lg"
                  className="flex-1 group"
                  onClick={() => setShowBooking(true)}
                >
                  <BookOpen className="mr-2 w-5 h-5" />
                  Book This Tour
                </LuxuryButton>
                
                <LuxuryButton
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => setIsLiked(!isLiked)}
                >
                  <Heart className="mr-2 w-5 h-5" />
                  Add to Wishlist
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Tab Navigation */}
          <div className="flex flex-wrap justify-center mb-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-3 rounded-xl font-medium transition-all duration-300 mr-4 mb-4 ${
                    activeTab === tab.id
                      ? 'bg-sky-500 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-sky-50 hover:text-sky-600'
                  }`}
                >
                  <Icon size={20} className="mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="max-w-4xl mx-auto">
            {activeTab === 'map' && (
              <div className="space-y-6">
                <LuxuryCard variant="glass" className="p-6">
                  <h3 className="text-2xl font-heading font-bold text-gray-900 mb-4">Interactive Tour Map</h3>
                  <p className="text-gray-600 mb-6">
                    Explore your journey with our interactive map showing all destinations, routes, and points of interest.
                  </p>
                  
                  <SimpleMap 
                    tourId={tour.id} 
                    height="500px" 
                    showRoute={true}
                    className="mb-6"
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="text-center p-4 bg-sky-50 rounded-xl">
                      <MapPin className="w-8 h-8 text-sky-500 mx-auto mb-2" />
                      <h4 className="font-semibold text-gray-900">Destinations</h4>
                      <p className="text-sm text-gray-600">Key locations you'll visit</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-xl">
                      <Plane className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <h4 className="font-semibold text-gray-900">Route</h4>
                      <p className="text-sm text-gray-600">Your travel path</p>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-xl">
                      <Star className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                      <h4 className="font-semibold text-gray-900">Highlights</h4>
                      <p className="text-sm text-gray-600">Must-see attractions</p>
                    </div>
                  </div>
                </LuxuryCard>
              </div>
            )}

            {activeTab === 'brochure' && (
              <div className="space-y-6">
                <DigitalBrochure tourId={tour.id} />
              </div>
            )}

            {activeTab === 'overview' && (
              <LuxuryCard variant="glass" className="p-8">
                <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">Tour Overview</h3>
                <div className="prose prose-lg max-w-none">
                  <p className="text-gray-700 leading-relaxed mb-6">
                    {tour.description}
                  </p>
                  
                  <h4 className="text-xl font-semibold text-gray-900 mb-4">Highlights</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {[
                      'Visit iconic landmarks and hidden gems',
                      'Experience local culture and traditions',
                      'Enjoy premium accommodations',
                      'Professional local guides',
                      'Small group experience',
                      'All entrance fees included'
                    ].map((highlight, index) => (
                      <div key={index} className="flex items-center">
                        <CheckCircle size={20} className="mr-3 text-green-500 flex-shrink-0" />
                        <span className="text-gray-700">{highlight}</span>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xl font-semibold text-gray-900 mb-4">Best Time to Visit</h4>
                  <p className="text-gray-700 mb-4">
                    The best time to visit is during the dry season from November to April, when the weather is pleasant and ideal for sightseeing and outdoor activities.
                  </p>
                </div>
              </LuxuryCard>
            )}

            {activeTab === 'itinerary' && (
              <LuxuryCard variant="glass" className="p-8">
                <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">Detailed Itinerary</h3>
                <div className="space-y-6">
                  {Array.from({ length: parseInt(tour.duration.split(' ')[0]) || 9 }, (_, index) => (
                    <div key={index} className="flex">
                      <div className="flex-shrink-0 w-8 h-8 bg-sky-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-4">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-2">Day {index + 1}</h4>
                        <p className="text-gray-700">
                          Arrive and explore the city, visit local attractions, enjoy traditional cuisine, and experience the local culture.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </LuxuryCard>
            )}

            {activeTab === 'accommodation' && (
              <LuxuryCard variant="glass" className="p-8">
                <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">Accommodation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Premium Hotels</h4>
                    <div className="space-y-3">
                      {[
                        '4-5 star luxury accommodations',
                        'Prime city center locations',
                        'Modern amenities and facilities',
                        'Professional concierge service',
                        'Room service available',
                        'Free Wi-Fi and parking'
                      ].map((item, index) => (
                        <div key={index} className="flex items-center">
                          <CheckCircle size={16} className="mr-2 text-green-500 flex-shrink-0" />
                          <span className="text-gray-700 text-sm">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Amenities</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Wifi, label: 'Free Wi-Fi' },
                        { icon: Car, label: 'Parking' },
                        { icon: Utensils, label: 'Restaurant' },
                        { icon: Camera, label: 'Photo Spots' },
                        { icon: Mountain, label: 'Mountain Views' },
                        { icon: Waves, label: 'Beach Access' },
                      ].map((amenity, index) => {
                        const Icon = amenity.icon;
                        return (
                          <div key={index} className="flex items-center">
                            <Icon size={16} className="mr-2 text-sky-500" />
                            <span className="text-gray-700 text-sm">{amenity.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </LuxuryCard>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-6">
                <CustomerReviews 
                  tourId={tour.id} 
                  reviews={getReviewsForTour(tour.id)} 
                />
              </div>
            )}

            {activeTab === 'sustainability' && (
              <div className="space-y-6">
                <SustainabilityFeatures tourId={tour.id} />
              </div>
            )}

            {activeTab === 'included' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LuxuryCard variant="glass" className="p-8">
                  <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's Included</h3>
                  <div className="space-y-4">
                    {[
                      'All accommodation as specified',
                      'Professional English-speaking guide',
                      'All transportation during the tour',
                      'All entrance fees and activities',
                      'Daily breakfast',
                      'Airport transfers',
                      'Travel insurance (basic)',
                      '24/7 emergency support'
                    ].map((item, index) => (
                      <div key={index} className="flex items-center">
                        <CheckCircle size={20} className="mr-3 text-green-500 flex-shrink-0" />
                        <span className="text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </LuxuryCard>
                
                <LuxuryCard variant="glass" className="p-8">
                  <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's Not Included</h3>
                  <div className="space-y-4">
                    {[
                      'International flights',
                      'Travel insurance (upgrade available)',
                      'Personal expenses',
                      'Tips and gratuities',
                      'Alcoholic beverages',
                      'Optional activities',
                      'Visa fees',
                      'Personal shopping'
                    ].map((item, index) => (
                      <div key={index} className="flex items-center">
                        <XCircle size={20} className="mr-3 text-red-500 flex-shrink-0" />
                        <span className="text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </LuxuryCard>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Booking System Modal */}
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
