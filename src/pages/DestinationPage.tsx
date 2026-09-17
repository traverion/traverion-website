import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid, Skeleton } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { getAllListings } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { setPageMetaWithOg } from '../lib/seo';
import { TourPackage } from '../types/tour';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { isSupabaseListingId } from '../lib/discount-display';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';

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
  const { listings: supplierListings, error: listingsError, reload: reloadCatalog } = usePublishedSupplierListings({
    emptyOnFirstError: false,
  });
  const catalogLoading = isSupabaseConfigured() && supplierListings === null && !listingsError;
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const [discountsByListing, setDiscountsByListing] = useState<
    Map<string, import('../data/supabase-discounts').ListingDiscount[]>
  >(() => new Map());
  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
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
      setDiscountsByListing(new Map());
      return;
    }
    const ids = listingIdsForReviewsKey.split(',');
    let cancelled = false;
    Promise.all([fetchDiscountsByListingIds(ids), getReviewAggregatesForListingIds(ids)]).then(
      ([discounts, reviews]) => {
        if (!cancelled) {
          setDiscountsByListing(discounts);
          setReviewAggregates(reviews);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [listingIdsForReviewsKey]);

  useEffect(() => {
    if (!label) return;
    setPageMetaWithOg(
      `Tours in ${label}`,
      `Book tours in ${label}. ${listings.length} tour${listings.length !== 1 ? 's' : ''} available.`
    );
  }, [label, listings.length]);

  if (!slug) {
    if (onNavigate) onNavigate('packages');
    return null;
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 motion-safe:animate-fade-in">
        <button
          type="button"
          onClick={onBack}
          className="tv-btn-ghost mb-6 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all tours
        </button>
        <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
          <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Destination
          </div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl text-ink tracking-tight">Tours in {label}</h1>
          {catalogLoading ? (
            <Skeleton className="mt-3 h-4 w-40" />
          ) : listings.length > 0 ? (
            <p className="mt-3 text-ink-muted">
              {listings.length} {listings.length === 1 ? 'tour' : 'tours'} in this destination
            </p>
          ) : (
            <p className="mt-3 text-ink-muted">Browse when operators publish tours here.</p>
          )}
        </header>

        {listingsError && supplierListings === null ? (
          <ErrorState
            className="py-8"
            title="Tours unavailable"
            body={userFacingError(listingsError, USER_ERROR.tours)}
            retry={{ onClick: () => reloadCatalog() }}
            back={{ onClick: onBack, label: 'View all tours' }}
          />
        ) : catalogLoading ? (
          <div aria-busy="true" aria-label="Loading tours">
            <SkeletonCardGrid count={6} />
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl bg-paper-raised px-6 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-8">
            <EmptyState
              className="py-10 sm:py-12 max-w-lg"
              icon={MapPin}
              title="No tours here yet"
              body={`Nothing is published in ${label} right now. That is normal until an operator lists a tour for this place.`}
              action={
                <button type="button" onClick={onBack} className="tv-btn-primary">
                  View all tours
                </button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map((tour, index) => (
              <PublicListingBrowseCard
                key={tour.id}
                tour={tour}
                index={index}
                onSelect={() => onTourSelect(tour)}
                discountsByListing={discountsByListing}
                reviewAggregate={reviewAggregates.get(tour.id)}
                tagLabels={TAG_LABELS}
                size="default"
                showTagPills
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
