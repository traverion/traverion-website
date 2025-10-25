import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, Star, Clock, Plane, Shield, Heart, Share2, BookOpen, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';

interface TourDetailsProps {
  tourId: string;
  onBack: () => void;
  onBook: (tour: TourPackage) => void;
}

export default function TourDetails({ tourId, onBack, onBook }: TourDetailsProps) {
  const { t } = useTranslation();
  const [tour, setTour] = useState<TourPackage | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

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
  ];

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
          </div>

          {/* Tour Info */}
          <div className="p-8 lg:p-12 bg-white">
            <div className="max-w-2xl">
              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {tour.isPopular && (
                  <span className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    🔥 Popular
                  </span>
                )}
                {tour.discount && (
                  <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    {tour.discount} OFF
                  </span>
                )}
              </div>

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
                  onClick={() => {/* Add to wishlist */}}
                >
                  <Heart className="mr-2 w-5 h-5" />
                  Add to Wishlist
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tour Highlights */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-8">Tour Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </div>
      </section>

      {/* What's Included */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's Included</h3>
              <div className="space-y-4">
                {[
                  'All accommodation as specified',
                  'Professional English-speaking guide',
                  'All transportation during the tour',
                  'All entrance fees and activities',
                  'Daily breakfast',
                  'Airport transfers'
                ].map((item, index) => (
                  <div key={index} className="flex items-center">
                    <CheckCircle size={20} className="mr-3 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's Not Included</h3>
              <div className="space-y-4">
                {[
                  'International flights',
                  'Travel insurance',
                  'Personal expenses',
                  'Tips and gratuities',
                  'Alcoholic beverages',
                  'Optional activities'
                ].map((item, index) => (
                  <div key={index} className="flex items-center">
                    <XCircle size={20} className="mr-3 text-red-500 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Booking Modal */}
      {showBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <LuxuryCard className="max-w-2xl w-full p-8">
            <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">Book This Tour</h3>
            <p className="text-gray-600 mb-6">Ready to book your amazing {tour.title}? Contact us to get started!</p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <LuxuryButton
                variant="gradient"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setShowBooking(false);
                  onBook(tour);
                }}
              >
                Confirm Booking
              </LuxuryButton>
              
              <LuxuryButton
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowBooking(false)}
              >
                Cancel
              </LuxuryButton>
            </div>
          </LuxuryCard>
        </div>
      )}
    </div>
  );
}



