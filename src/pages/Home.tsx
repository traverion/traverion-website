import { useState, useEffect } from 'react';
import { Star, MapPin, Clock, ArrowRight } from 'lucide-react';
import FeaturedDestinations from '../components/FeaturedDestinations';
import TUIHeroSection from '../components/TUIHeroSection';
import AurinkoStyleSaleBanner from '../components/AurinkoStyleSaleBanner';
import { tourPackages } from '../data/tours';
import { useTranslation } from '../contexts/TranslationContext';
import { TourPackage } from '../types/tour';

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const popularTours = tourPackages.filter(tour => tour.isPopular).slice(0, 6);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <TUIHeroSection onSearch={(searchData) => {
        if (onNavigate) onNavigate('packages');
        sessionStorage.setItem('searchCriteria', JSON.stringify(searchData));
      }} />

      <AurinkoStyleSaleBanner />

      {/* Popular tours - GetYourGuide/TripAdvisor style */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Popular tours & activities</h2>
          <p className="text-gray-600 mb-8">Best-selling experiences chosen by travelers</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {popularTours.map((tour) => (
              <div
                key={tour.id}
                onClick={() => onTourSelect(tour)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-sky-100 transition-all cursor-pointer group"
              >
                <div className="relative h-40">
                  <img src={tour.image} alt={tour.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute top-2 left-2 flex gap-2">
                    {tour.discount && (
                      <span className="bg-amber-500 text-white text-xs font-medium px-2 py-0.5 rounded">{tour.discount} off</span>
                    )}
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-sm font-semibold px-2 py-0.5 rounded">From ${tour.price.startingFrom}</div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-sky-600">{tour.title}</h3>
                  <div className="flex items-center text-gray-500 text-sm mt-2">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 mr-1" />
                    <span className="font-medium text-gray-900">{tour.rating}</span>
                    <span className="ml-1">({tour.reviews})</span>
                    <span className="mx-2">·</span>
                    <Clock className="w-4 h-4 inline mr-0.5" />
                    {tour.duration}
                  </div>
                  <p className="text-sky-600 font-medium mt-2 flex items-center">
                    View details <ArrowRight className="w-4 h-4 ml-1" />
                  </p>
                </div>
              </div>
            ))}
          </div>
          {onNavigate && (
            <div className="text-center mt-8">
              <button
                onClick={() => onNavigate('packages')}
                className="inline-flex items-center text-sky-600 font-semibold hover:text-sky-700"
              >
                View all tours <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          )}
        </div>
      </section>

      <FeaturedDestinations onNavigate={onNavigate} onTourSelect={onTourSelect} />
    </div>
  );
}
