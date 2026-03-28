import { useState, useEffect } from 'react';
import { Download, Share2, Heart, Star, MapPin, Calendar, Users, Clock, ArrowRight, ArrowLeft, Maximize2, Minimize2, BookOpen, Camera, Play, Pause, Volume2, VolumeX, Bookmark, Eye, Filter, Search, Grid, List } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryButton from './ui/LuxuryButton';
import SimpleMap from './SimpleMap';
import { useTranslation } from '../contexts/TranslationContext';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';

interface DigitalBrochureProps {
  tourId: string;
  className?: string;
}

interface BrochurePage {
  id: string;
  title: string;
  type: 'cover' | 'overview' | 'itinerary' | 'highlights' | 'accommodation' | 'gallery' | 'pricing' | 'contact';
  content: any;
}

export default function DigitalBrochure({ tourId, className = '' }: DigitalBrochureProps) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [shortlistedTours, setShortlistedTours] = useState<string[]>([]);
  const [showShortlist, setShowShortlist] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [searchTerm, setSearchTerm] = useState('');

  const tour = tourPackages.find(t => t.id === tourId);
  
  if (!tour) {
    return <div className="text-center py-12 text-gray-500">Tour not found</div>;
  }

  const brochurePages: BrochurePage[] = [
    {
      id: 'cover',
      title: 'Cover',
      type: 'cover',
      content: {
        title: tour.title,
        subtitle: 'Luxury Travel Experience',
        destination: tour.destination,
        duration: tour.duration,
        price: `From $${tour.price.twin}`,
        image: tour.image,
        logo: BRAND_LOGO_SRC
      }
    },
    {
      id: 'overview',
      title: 'Overview',
      type: 'overview',
      content: {
        description: tour.description,
        highlights: tour.highlights,
        rating: tour.rating,
        reviews: tour.reviews,
        groupSize: tour.groupSize,
        difficulty: tour.difficulty
      }
    },
    {
      id: 'itinerary',
      title: 'Itinerary',
      type: 'itinerary',
      content: {
        days: tour.itinerary,
        mapData: tourId
      }
    },
    {
      id: 'highlights',
      title: 'Highlights',
      type: 'highlights',
      content: {
        features: tour.highlights,
        experiences: tour.experiences,
        inclusions: tour.inclusions
      }
    },
    {
      id: 'accommodation',
      title: 'Accommodation',
      type: 'accommodation',
      content: {
        hotels: tour.accommodation,
        roomTypes: ['Standard', 'Superior', 'Deluxe', 'Suite']
      }
    },
    {
      id: 'gallery',
      title: 'Gallery',
      type: 'gallery',
      content: {
        images: tour.gallery,
        videos: tour.videos
      }
    },
    {
      id: 'pricing',
      title: 'Pricing',
      type: 'pricing',
      content: {
        prices: tour.price,
        inclusions: tour.inclusions,
        exclusions: tour.exclusions
      }
    },
    {
      id: 'contact',
      title: 'Contact',
      type: 'contact',
      content: {
        phone: '+1 (555) 123-4567',
        email: 'info@traverion.com',
        website: 'www.traverion.com'
      }
    }
  ];

  const filteredPages = searchTerm 
    ? brochurePages.filter(page => 
        page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.content.title?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : brochurePages;

  const toggleShortlist = (tourId: string) => {
    setShortlistedTours(prev => 
      prev.includes(tourId) 
        ? prev.filter(id => id !== tourId)
        : [...prev, tourId]
    );
  };

  const renderPage = (page: BrochurePage) => {
    switch (page.type) {
      case 'cover':
        return (
          <div className="relative h-full bg-gradient-to-br from-sky-900 via-blue-800 to-indigo-900 overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30"
              style={{ backgroundImage: `url(${page.content.image})` }}
            />
            <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white">
              <div className="flex justify-between items-start">
                <img src={page.content.logo} alt="Traverion" className="h-16 w-auto" />
                <div className="text-right">
                  <p className="text-sm opacity-90">Luxury Travel</p>
                  <p className="text-xs opacity-75">Premium Experiences</p>
                </div>
              </div>
              
              <div className="text-center">
                <h1 className="text-6xl font-display font-bold mb-4 leading-tight">
                  {page.content.title}
                </h1>
                <p className="text-2xl opacity-90 mb-6">{page.content.subtitle}</p>
                <div className="flex justify-center items-center space-x-8 text-lg">
                  <div className="flex items-center">
                    <MapPin className="w-5 h-5 mr-2" />
                    <span>{page.content.destination}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span>{page.content.duration}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-3xl font-bold">{page.content.price}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <div className="bg-white/10 backdrop-blur-sm rounded-full px-6 py-3">
                  <p className="text-sm">2024 Edition • Premium Collection</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'overview':
        return (
          <div className="h-full p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-8 text-center">
                {page.content.title}
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-4">About This Journey</h3>
                  <p className="text-gray-700 leading-relaxed mb-6">
                    {page.content.description}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                      <div className="flex items-center mb-2">
                        <Star className="w-5 h-5 text-yellow-500 mr-2" />
                        <span className="font-semibold">Rating</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{page.content.rating}/5</p>
                      <p className="text-sm text-gray-600">{page.content.reviews} reviews</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                      <div className="flex items-center mb-2">
                        <Users className="w-5 h-5 text-blue-500 mr-2" />
                        <span className="font-semibold">Group Size</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{page.content.groupSize}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-4">Key Highlights</h3>
                  <div className="space-y-3">
                    {page.content.highlights.map((highlight: string, index: number) => (
                      <div key={index} className="flex items-start">
                        <div className="w-2 h-2 bg-sky-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                        <span className="text-gray-700">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'itinerary':
        return (
          <div className="h-full p-8 bg-white">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-8 text-center">
                Detailed Itinerary
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {page.content.days.map((day: any, index: number) => (
                    <LuxuryCard key={index} variant="elevated" className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="bg-sky-500 text-white rounded-full w-12 h-12 flex items-center justify-center font-bold text-lg flex-shrink-0">
                          {day.day}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">{day.title}</h3>
                          <p className="text-gray-700 leading-relaxed">{day.description}</p>
                          {day.activities && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-600 mb-1">Activities:</p>
                              <div className="flex flex-wrap gap-1">
                                {day.activities.map((activity: string, actIndex: number) => (
                                  <span key={actIndex} className="bg-sky-100 text-sky-600 text-xs px-2 py-1 rounded-full">
                                    {activity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </LuxuryCard>
                  ))}
                </div>
                
                <div>
                  <SimpleMap 
                    tourId={page.content.mapData} 
                    height="400px" 
                    showRoute={true}
                    className="rounded-xl shadow-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'gallery':
        return (
          <div className="h-full p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-8 text-center">
                Photo Gallery
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {page.content.images.map((image: string, index: number) => (
                  <div key={index} className="relative group cursor-pointer">
                    <img
                      src={image}
                      alt={`Gallery ${index + 1}`}
                      className="w-full h-48 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 rounded-xl flex items-center justify-center">
                      <Camera className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'pricing':
        return (
          <div className="h-full p-8 bg-white">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-8 text-center">
                Pricing & Inclusions
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <LuxuryCard variant="glass" className="p-8">
                  <h3 className="text-2xl font-semibold text-gray-900 mb-6">Price Per Person</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-gray-200">
                      <span className="text-lg">Twin Sharing</span>
                      <span className="text-2xl font-bold text-sky-600">${page.content.prices.twin}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-gray-200">
                      <span className="text-lg">Single Supplement</span>
                      <span className="text-2xl font-bold text-sky-600">${page.content.prices.single}</span>
                    </div>
                    <div className="flex justify-between items-center py-3">
                      <span className="text-lg">Child (under 12)</span>
                      <span className="text-2xl font-bold text-sky-600">${page.content.prices.child}</span>
                    </div>
                  </div>
                </LuxuryCard>
                
                <div className="space-y-6">
                  <LuxuryCard variant="glass" className="p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">What's Included</h3>
                    <div className="space-y-2">
                      {page.content.inclusions.map((inclusion: string, index: number) => (
                        <div key={index} className="flex items-center">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-3" />
                          <span className="text-gray-700">{inclusion}</span>
                        </div>
                      ))}
                    </div>
                  </LuxuryCard>
                  
                  <LuxuryCard variant="glass" className="p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">Not Included</h3>
                    <div className="space-y-2">
                      {page.content.exclusions.map((exclusion: string, index: number) => (
                        <div key={index} className="flex items-center">
                          <div className="w-2 h-2 bg-red-500 rounded-full mr-3" />
                          <span className="text-gray-700">{exclusion}</span>
                        </div>
                      ))}
                    </div>
                  </LuxuryCard>
                </div>
              </div>
            </div>
          </div>
        );

      case 'contact':
        return (
          <div className="h-full p-8 bg-gradient-to-br from-sky-50 to-blue-50">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-8">
                Ready to Book Your Journey?
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📞</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Call Us</h3>
                  <p className="text-sky-600 font-medium">{page.content.phone}</p>
                </div>
                
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">✉️</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Email Us</h3>
                  <p className="text-sky-600 font-medium">{page.content.email}</p>
                </div>
                
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🌐</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Visit Us</h3>
                  <p className="text-sky-600 font-medium">{page.content.website}</p>
                </div>
              </div>
              
              <LuxuryButton
                variant="gradient"
                size="lg"
                className="group"
              >
                <span>Book This Tour Now</span>
                <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </LuxuryButton>
            </div>
          </div>
        );

      default:
        return <div className="h-full flex items-center justify-center text-gray-500">Page content coming soon...</div>;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Brochure Header */}
      <div className="bg-white shadow-lg rounded-t-xl p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <BookOpen className="w-6 h-6 text-sky-500" />
            <div>
              <h2 className="font-semibold text-gray-900">Digital Brochure</h2>
              <p className="text-sm text-gray-600">{tour.title}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-500 hover:text-sky-500 transition-colors"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 text-gray-500 hover:text-sky-500 transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 text-gray-500 hover:text-sky-500 transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={() => toggleShortlist(tourId)}
              className={`p-2 transition-colors ${
                shortlistedTours.includes(tourId) 
                  ? 'text-red-500' 
                  : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart size={20} className={shortlistedTours.includes(tourId) ? 'fill-current' : ''} />
            </button>
            <button className="p-2 text-gray-500 hover:text-sky-500 transition-colors">
              <Share2 size={20} />
            </button>
            <button className="p-2 text-gray-500 hover:text-sky-500 transition-colors">
              <Download size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Brochure Content */}
      <div className={`bg-white shadow-lg ${isFullscreen ? 'fixed inset-0 z-50' : 'rounded-b-xl'} overflow-hidden`}>
        <div className="h-96 md:h-[600px] lg:h-[700px] relative">
          {renderPage(filteredPages[currentPage])}
        </div>

        {/* Navigation */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-6 py-3 flex items-center space-x-4">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="p-2 text-white hover:text-sky-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft size={20} />
            </button>
            
            <div className="flex items-center space-x-2">
              {filteredPages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentPage ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
            
            <button
              onClick={() => setCurrentPage(Math.min(filteredPages.length - 1, currentPage + 1))}
              disabled={currentPage === filteredPages.length - 1}
              className="p-2 text-white hover:text-sky-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </div>

        {/* Page Info */}
        <div className="absolute top-4 right-4">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm">
            {currentPage + 1} of {filteredPages.length}
          </div>
        </div>
      </div>

      {/* Shortlist Sidebar */}
      {showShortlist && (
        <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-40 transform transition-transform duration-300">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Shortlisted Tours</h3>
              <button
                onClick={() => setShowShortlist(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="p-6">
            {shortlistedTours.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No tours shortlisted yet</p>
            ) : (
              <div className="space-y-4">
                {shortlistedTours.map(tourId => {
                  const shortlistedTour = tourPackages.find(t => t.id === tourId);
                  return shortlistedTour ? (
                    <div key={tourId} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{shortlistedTour.title}</h4>
                      <p className="text-sm text-gray-600">{shortlistedTour.destination}</p>
                      <p className="text-sm font-medium text-sky-600">${shortlistedTour.price.twin}</p>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortlist Toggle */}
      <button
        onClick={() => setShowShortlist(!showShortlist)}
        className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-sky-500 text-white p-3 rounded-full shadow-lg hover:bg-sky-600 transition-colors z-30"
      >
        <Bookmark size={20} />
        {shortlistedTours.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {shortlistedTours.length}
          </span>
        )}
      </button>
    </div>
  );
}
