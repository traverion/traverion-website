import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, Star, Clock, Plane, Shield, Heart, Share2, BookOpen, CheckCircle, XCircle, Download, Bed, UtensilsCrossed, Car, Camera, Mountain } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('itinerary');
  const [bookingDate, setBookingDate] = useState('');
  const [guests, setGuests] = useState(2);

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

      {/* Hero: full-width gallery */}
      <section className="relative">
        <div className="relative h-96 lg:h-[70vh]">
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
      </section>

      {/* Content + Sticky booking widget - GetYourGuide style */}
      <section className="bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Title + description + stats (no pricing/CTA here on desktop; they're in sidebar) */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {tour.isPopular && (
                    <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-medium">Popular</span>
                  )}
                  {tour.discount && (
                    <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">{tour.discount} OFF</span>
                  )}
                  <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm">Free cancellation</span>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">{tour.title}</h1>
                <div className="flex items-center text-gray-600 mb-4">
                  <MapPin size={20} className="mr-2 text-sky-500" />
                  <span>{tour.destination}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-6">
                  <span className="flex items-center">
                    <Star size={18} className="text-amber-400 fill-amber-400 mr-1" />
                    <strong className="text-gray-900">{tour.rating}</strong> ({tour.reviews} reviews)
                  </span>
                  <span className="flex items-center"><Clock size={18} className="mr-1" />{tour.duration}</span>
                  <span className="flex items-center"><Users size={18} className="mr-1" />{tour.groupSize}</span>
                  <span className="flex items-center"><Plane size={18} className="mr-1" />{tour.difficulty}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{tour.description}</p>
              </div>
            </div>

            {/* Right: Sticky booking card */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                <div className="text-2xl font-bold text-gray-900 mb-1">From ${tour.price.startingFrom}</div>
                <p className="text-sm text-gray-500 mb-4">per person</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                    <select
                      value={guests}
                      onChange={(e) => setGuests(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => setShowBooking(true)}
                    className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-sky-600 hover:to-blue-700 transition-all"
                  >
                    Check availability
                  </button>
                  <p className="text-xs text-gray-500 text-center">Free cancellation up to 24 hours before</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tour Highlights */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-8">Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tour.highlights.map((highlight, index) => (
              <div key={index} className="flex items-center">
                <CheckCircle size={20} className="mr-3 text-green-500 flex-shrink-0" />
                <span className="text-gray-700">{highlight}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included / Excluded */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's included</h3>
              <div className="space-y-4">
                {tour.includes.map((item, index) => (
                  <div key={index} className="flex items-center">
                    <CheckCircle size={20} className="mr-3 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">What's not included</h3>
              <div className="space-y-4">
                {tour.excludes.map((item, index) => (
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



