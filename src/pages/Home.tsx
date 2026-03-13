import { Star, Clock, ArrowRight, MapPin } from 'lucide-react';
import FeaturedDestinations from '../components/FeaturedDestinations';
import TUIHeroSection from '../components/TUIHeroSection';
import AurinkoStyleSaleBanner from '../components/AurinkoStyleSaleBanner';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings, getAllListingsAsync, SHOW_SEED_LISTINGS } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { activities } from '../data/activities';
import { TourPackage } from '../types/tour';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const [supplierListings, setSupplierListings] = useState<TourPackage[] | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false }).then(setSupplierListings);
  }, []);
  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    if (SHOW_SEED_LISTINGS) return [...base, ...activities];
    return base;
  }, [supplierListings]);
  const popularTours = allListings.filter(tour => tour.isPopular).slice(0, 6);

  return (
    <div className="min-h-screen bg-white">
      <TUIHeroSection onSearch={(searchData) => {
        if (onNavigate) onNavigate('packages');
        sessionStorage.setItem('searchCriteria', JSON.stringify(searchData));
      }} />

      <AurinkoStyleSaleBanner />

      {/* Popular tours - same card style as listing, with stagger; or empty state when platform has no listings */}
      <section className="py-14 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Popular tours & activities</h2>
          <p className="text-gray-600 mb-8">
            {allListings.length > 0 ? 'Best-selling experiences' : 'List your tour and reach travelers worldwide.'}
          </p>
          {allListings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-500 mb-6">No tours listed yet.</p>
              <a
                href="/supplier"
                className="inline-flex items-center gap-2 bg-finland text-white font-semibold px-6 py-3 rounded-xl hover:bg-finland-dark transition-colors"
              >
                List your tour
              </a>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {popularTours.map((tour) => (
              <div
                key={tour.id}
                onClick={() => onTourSelect(tour)}
                className="stagger-item listing-card bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={tour.image}
                    alt={tour.title}
                    className="listing-card-image w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {tour.tags?.includes('bestseller') && (
                      <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">Bestseller</span>
                    )}
                    {tour.tags?.includes('free-cancellation') && (
                      <span className="bg-white/95 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-md shadow-sm">Free cancellation</span>
                    )}
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                    From ${tour.price.startingFrom}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-finland transition-colors duration-200">
                    {tour.title}
                  </h3>
                  {(tour.destination || tour.city) && (
                    <div className="flex items-center text-gray-500 text-sm mt-1">
                      <MapPin className="w-3.5 h-3.5 mr-1 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{tour.city ?? tour.destination}</span>
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-600 mt-2">
                    <Star className="w-4 h-4 text-finland fill-finland mr-0.5" />
                    <strong className="text-gray-900">{tour.rating}</strong>
                    <span className="ml-1">({tour.reviews})</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <Clock className="w-3.5 h-3.5 mr-0.5" />
                    {tour.duration}
                  </div>
                  {tour.tags && tour.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tour.tags.filter(t => t !== 'free-cancellation' && t !== 'bestseller').slice(0, 3).map(tagId => (
                        <span key={tagId} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {TAG_LABELS[tagId] ?? tagId}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-finland font-medium mt-3 flex items-center text-sm">
                    View details <ArrowRight className="w-4 h-4 ml-1" />
                  </p>
                </div>
              </div>
            ))}
          </div>
          )}
          {onNavigate && allListings.length > 0 && (
            <div className="text-center mt-10">
              <button
                onClick={() => onNavigate('packages')}
                className="inline-flex items-center text-finland font-semibold hover:text-finland-dark transition-colors"
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
