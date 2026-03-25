import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { getAllListings, getAllListingsAsync, SHOW_SEED_LISTINGS } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { setPageMetaWithOg } from '../lib/seo';
import { activities } from '../data/activities';
import { TourPackage } from '../types/tour';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { ListingCardRating } from '../components/ListingCardRating';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

function slugToLabel(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface DestinationPageProps {
  slug: string | null;
  onTourSelect: (tour: TourPackage) => void;
  onBack: () => void;
  onNavigate?: (page: string) => void;
}

export default function DestinationPage({ slug, onTourSelect, onBack, onNavigate }: DestinationPageProps) {
  const [supplierListings, setSupplierListings] = useState<TourPackage[] | null>(null);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false })
      .then(setSupplierListings)
      .catch(() => {});
  }, []);
  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    if (SHOW_SEED_LISTINGS) return [...base, ...activities];
    return base;
  }, [supplierListings]);

  const { label, listings } = useMemo(() => {
    if (!slug) return { label: '', listings: [] as TourPackage[] };
    const labelFromSlug = slugToLabel(slug);
    const list = allListings.filter(t => {
      const countryMatch = (t.country ?? '').toLowerCase().replace(/\s+/g, '-') === slug;
      const cityMatch = (t.city ?? '').toLowerCase().replace(/\s+/g, '-') === slug;
      return countryMatch || cityMatch;
    });
    const label = list[0]?.country === labelFromSlug ? labelFromSlug : (list[0]?.city ?? labelFromSlug);
    return { label: label || labelFromSlug, listings: list };
  }, [slug, allListings]);

  const listingIdsForReviews = useMemo(
    () => listings.map((t) => t.id).filter(isSupabaseListingId),
    [listings]
  );
  const listingIdsForReviewsKey = useMemo(() => listingIdsForReviews.join(','), [listingIdsForReviews]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !listingIdsForReviewsKey) {
      setReviewAggregates(new Map());
      return;
    }
    const ids = listingIdsForReviewsKey.split(',');
    let cancelled = false;
    getReviewAggregatesForListingIds(ids).then((m) => {
      if (!cancelled) setReviewAggregates(m);
    });
    return () => {
      cancelled = true;
    };
  }, [listingIdsForReviewsKey]);

  useEffect(() => {
    if (!label) return;
    setPageMetaWithOg(
      `Tours in ${label}`,
      `Book tours and activities in ${label}. ${listings.length} experience${listings.length !== 1 ? 's' : ''} available.`
    );
  }, [label, listings.length]);

  if (!slug) {
    if (onNavigate) onNavigate('packages');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-finland mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all tours
        </button>
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Tours & activities in {label}</h1>
        <p className="text-gray-600 mb-8">
          {listings.length} {listings.length === 1 ? 'tour' : 'tours'} in this destination
        </p>

        {listings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-500">No tours in this destination yet.</p>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 text-finland font-semibold hover:text-finland-dark"
            >
              View all tours
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map(tour => (
              <div
                key={tour.id}
                onClick={() => onTourSelect(tour)}
                className="stagger-item listing-card bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group"
              >
                <div className="relative h-52 overflow-hidden">
                  <img src={tour.image} alt={tour.title} className="listing-card-image w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {tour.tags?.includes('free-cancellation') && (
                      <span className="bg-white/95 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-md shadow-sm">
                        Free cancellation
                      </span>
                    )}
                    {tour.tags?.includes('bestseller') && (
                      <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">Bestseller</span>
                    )}
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm font-semibold px-2.5 py-1 rounded-md">
                    From ${tour.price.startingFrom}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1.5 line-clamp-2 group-hover:text-finland transition-colors">
                    {tour.title}
                  </h3>
                  <div className="flex items-center text-gray-500 text-sm mb-2">
                    <MapPin className="w-4 h-4 mr-1 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{tour.city ?? tour.destination}</span>
                  </div>
                  <ListingCardRating tour={tour} aggregate={reviewAggregates.get(tour.id)} />
                  {tour.tags && tour.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tour.tags.filter(t => t !== 'free-cancellation' && t !== 'bestseller').map(tagId => (
                        <span key={tagId} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {TAG_LABELS[tagId] ?? tagId}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-lg font-bold text-finland">From ${tour.price.startingFrom}</span>
                    <span className="text-sm text-gray-500 ml-1">/ person</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
