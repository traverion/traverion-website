import { useState } from 'react';
import { Calendar, Clock, Users, MapPin, Star, Heart, Share2, Download, Plane, Hotel, Utensils, Shield, ArrowRight, Check, X } from 'lucide-react';
import { TourPackage } from '../types/tour';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';

interface TourDetailProps {
  tour: TourPackage;
}

export default function TourDetail({ tour }: TourDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLiked, setIsLiked] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <MapPin size={18} /> },
    { id: 'itinerary', label: 'Itinerary', icon: <Calendar size={18} /> },
    { id: 'hotels', label: 'Hotels', icon: <Hotel size={18} /> },
    { id: 'pricing', label: 'Pricing', icon: <Star size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-white pt-20">
      {/* Hero Section */}
      <section className="relative h-96 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${tour.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        <div className="relative z-10 h-full flex items-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  {tour.isPopular && (
                    <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse-slow">
                      🔥 Popular
                    </span>
                  )}
                  {tour.discount && (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                      {tour.discount} OFF
                    </span>
                  )}
                  <span className="bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
                    {tour.category} Category
                  </span>
                </div>
                
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  {tour.title}
                </h1>
                
                <div className="flex items-center space-x-6 text-white/90 mb-4">
                  <div className="flex items-center">
                    <MapPin size={20} className="mr-2" />
                    <span>{tour.destination}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar size={20} className="mr-2" />
                    <span>{tour.duration}</span>
                  </div>
                  <div className="flex items-center">
                    <Users size={20} className="mr-2" />
                    <span>{tour.groupSize}</span>
                  </div>
                </div>
                
                <p className="text-white/90 text-lg max-w-3xl leading-relaxed">
                  {tour.description}
                </p>
              </div>
              
              <div className="flex items-center space-x-4 mt-6 lg:mt-0">
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={`p-3 rounded-full transition-all duration-300 ${
                    isLiked 
                      ? 'bg-red-500 text-white scale-110' 
                      : 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30'
                  }`}
                >
                  <Heart size={24} className={isLiked ? 'fill-current' : ''} />
                </button>
                
                <button className="p-3 bg-white/20 backdrop-blur-sm text-white rounded-full hover:bg-white/30 transition-all duration-300">
                  <Share2 size={24} />
                </button>
                
                <LuxuryButton
                  variant="gradient"
                  size="lg"
                  className="group"
                >
                  <span>Book Now</span>
                  <ArrowRight className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <section className="bg-white border-b border-gray-200 sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition-colors duration-300 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-gray-600 hover:text-sky-500'
                }`}
              >
                {tab.icon}
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* Highlights */}
                  <LuxuryCard variant="default" className="p-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Tour Highlights</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tour.highlights.map((highlight, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{highlight}</span>
                        </div>
                      ))}
                    </div>
                  </LuxuryCard>

                  {/* What's Included */}
                  <LuxuryCard variant="default" className="p-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">What's Included</h3>
                    <div className="space-y-3">
                      {tour.includes.map((item, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </LuxuryCard>

                  {/* What's Not Included */}
                  <LuxuryCard variant="default" className="p-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">What's Not Included</h3>
                    <div className="space-y-3">
                      {tour.excludes.map((item, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <X className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </LuxuryCard>
                </div>
              )}

              {activeTab === 'itinerary' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Detailed Itinerary</h3>
                  {tour.itinerary.map((day, index) => (
                    <LuxuryCard key={index} variant="default" className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-sky-500 text-white rounded-full flex items-center justify-center font-bold">
                          {day.day}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-xl font-semibold text-gray-900 mb-2">{day.title}</h4>
                          <p className="text-gray-600 mb-3">{day.description}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                            <div className="flex items-center">
                              <Utensils size={16} className="mr-1" />
                              <span>{day.meals}</span>
                            </div>
                            <div className="flex items-center">
                              <MapPin size={16} className="mr-1" />
                              <span>{day.location}</span>
                            </div>
                          </div>
                          {day.activities.length > 0 && (
                            <div>
                              <h5 className="font-medium text-gray-900 mb-2">Activities:</h5>
                              <div className="flex flex-wrap gap-2">
                                {day.activities.map((activity, actIndex) => (
                                  <span
                                    key={actIndex}
                                    className="px-3 py-1 bg-sky-100 text-sky-600 text-sm rounded-full"
                                  >
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
              )}

              {activeTab === 'hotels' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Accommodation</h3>
                  {tour.hotels.map((hotel, index) => (
                    <LuxuryCard key={index} variant="default" className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="text-xl font-semibold text-gray-900">{hotel.name}</h4>
                            <span className="bg-sky-100 text-sky-600 px-3 py-1 rounded-full text-sm font-medium">
                              {hotel.category}
                            </span>
                          </div>
                          <p className="text-gray-600 mb-2">{hotel.city}</p>
                          {hotel.description && (
                            <p className="text-gray-500 text-sm">{hotel.description}</p>
                          )}
                        </div>
                        {hotel.website && (
                          <LuxuryButton variant="outline" size="sm">
                            <span>Visit Website</span>
                            <ArrowRight size={16} className="ml-1" />
                          </LuxuryButton>
                        )}
                      </div>
                    </LuxuryCard>
                  ))}
                </div>
              )}

              {activeTab === 'pricing' && (
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Pricing Information</h3>
                  <LuxuryCard variant="default" className="p-6">
                    <div className="text-center mb-6">
                      <p className="text-gray-600 mb-2">Valid: {tour.validity}</p>
                      <p className="text-sm text-gray-500">Prices are per person in USD</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Single Room</h4>
                        <p className="text-2xl font-bold text-sky-600">${tour.price.single}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Twin/Double</h4>
                        <p className="text-2xl font-bold text-sky-600">${tour.price.twin}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Triple</h4>
                        <p className="text-2xl font-bold text-sky-600">${tour.price.triple}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Group (7-10)</h4>
                        <p className="text-2xl font-bold text-sky-600">${tour.price.group}</p>
                      </div>
                    </div>
                    
                    {tour.price.singleSupplement > 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <strong>Single Supplement:</strong> ${tour.price.singleSupplement} per person
                        </p>
                      </div>
                    )}
                  </LuxuryCard>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-32 space-y-6">
                {/* Quick Info */}
                <LuxuryCard variant="elevated" className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Duration</span>
                      <span className="font-medium">{tour.duration}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Style</span>
                      <span className="font-medium">{tour.style}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Difficulty</span>
                      <span className="font-medium">{tour.difficulty}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Group Size</span>
                      <span className="font-medium">{tour.groupSize}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Best Time</span>
                      <span className="font-medium">{tour.bestTime}</span>
                    </div>
                  </div>
                </LuxuryCard>

                {/* Rating */}
                <LuxuryCard variant="elevated" className="p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={20}
                          className={`${i < Math.floor(tour.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                    <span className="text-2xl font-bold text-gray-900">{tour.rating}</span>
                  </div>
                  <p className="text-gray-600 text-sm">{tour.reviews} reviews</p>
                </LuxuryCard>

                {/* Download Brochure */}
                <LuxuryCard variant="elevated" className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Download Brochure</h3>
                  <LuxuryButton variant="outline" size="md" className="w-full group">
                    <Download size={18} className="mr-2" />
                    <span>PDF Brochure</span>
                  </LuxuryButton>
                </LuxuryCard>

                {/* Contact */}
                <LuxuryCard variant="elevated" className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Need Help?</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Our travel experts are here to help you plan your perfect trip.
                  </p>
                  <LuxuryButton variant="gradient" size="md" className="w-full">
                    <span>Contact Us</span>
                  </LuxuryButton>
                </LuxuryCard>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
