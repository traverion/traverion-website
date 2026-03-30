import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, MapPin, Calendar, Users, Star, Clock, Plane, Shield, Share2, CheckCircle, XCircle, ShoppingCart } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { useAuth } from '../contexts/AuthContext';
import LuxuryButton from '../components/ui/LuxuryButton';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getDisplayPrice, isSupabaseListingId } from '../lib/discount-display';
import {
  fetchReviewsByListingId,
  getReviewAggregateForListing,
  submitReview,
  userHasCompletedBookingForListing,
  userHasReviewedListing,
  type ReviewDisplay,
} from '../data/supabase-reviews';
import { addToCart } from '../data/supabase-cart';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import { setPageMetaWithOg, setTourJsonLd, clearTourJsonLd } from '../lib/seo';
import { Skeleton } from '../components/ui/Skeleton';

interface TourDetailsProps {
  tourId: string;
  onBack: () => void;
  onBook: (tour: TourPackage) => void;
}

export default function TourDetails({ tourId, onBack, onBook }: TourDetailsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tour, setTour] = useState<TourPackage | null>(null);
  const [tourLoadError, setTourLoadError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [reviews, setReviews] = useState<ReviewDisplay[]>([]);
  const [reviewAggregate, setReviewAggregate] = useState<{ rating: number; count: number } | null>(null);
  const [canLeaveReview, setCanLeaveReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [bookingIdForReview, setBookingIdForReview] = useState<string | undefined>();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [addToCartMessage, setAddToCartMessage] = useState<'success' | 'error' | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [supplierLegal, setSupplierLegal] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  } | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    setTourLoadError(null);
    if (isSupabaseConfigured()) {
      getListingByIdAsync(tourId)
        .then((found) => { setTour(found ?? null); })
        .catch((e) => {
          setTour(null);
          setTourLoadError(e instanceof Error ? e.message : 'Failed to load tour');
        });
    } else {
      setTour(getListingById(tourId) ?? null);
    }
  }, [tourId]);

  useEffect(() => {
    if (!tour?.id || !isSupabaseListingId(tour.id)) return;
    fetchDiscountsByListingIds([tour.id]).then(setDiscountsByListing);
  }, [tour?.id]);

  useEffect(() => {
    if (!tour?.supplierId || !isSupabaseConfigured()) {
      setSupplierLegal(null);
      return;
    }
    fetchSupplierPublicLegal(tour.supplierId).then((row) => {
      if (!row) {
        setSupplierLegal(null);
        return;
      }
      const operatorName =
        row.company_legal_name?.trim() || row.display_name?.trim() || 'Operator';
      setSupplierLegal({
        operatorName,
        business_logo_url: row.business_logo_url?.trim() || null,
        privacy_policy_text: row.privacy_policy_text,
        terms_conditions_text: row.terms_conditions_text,
      });
    });
  }, [tour?.supplierId]);

  const loadReviews = useCallback(() => {
    if (!tourId || !isSupabaseConfigured()) return;
    fetchReviewsByListingId(tourId).then(setReviews);
    getReviewAggregateForListing(tourId).then(setReviewAggregate);
  }, [tourId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (!user?.id || !user?.email || !tourId || !isSupabaseConfigured()) return;
    userHasCompletedBookingForListing(user.email, tourId).then(({ canReview, bookingId }) => {
      setCanLeaveReview(canReview);
      setBookingIdForReview(bookingId);
    });
    userHasReviewedListing(user.id, tourId).then(setHasReviewed);
  }, [user?.id, user?.email, tourId]);

  // SEO: tour-specific title, description, OG image, and JSON-LD
  useEffect(() => {
    if (!tour) {
      clearTourJsonLd();
      return;
    }
    const desc = (tour.description || '').slice(0, 160);
    setPageMetaWithOg(tour.title, desc, {
      title: tour.title,
      description: desc,
      image: tour.image,
      type: 'article',
    });
    setTourJsonLd({
      id: tour.id,
      title: tour.title,
      description: tour.description ?? '',
      image: tour.image,
      destination: tour.destination,
      duration: tour.duration,
      rating: tour.rating,
      reviews: tour.reviews,
      price: tour.price ? { startingFrom: tour.price.startingFrom, currency: tour.price.currency } : undefined,
    });
    return () => clearTourJsonLd();
  }, [tour]);

  if (!tour) {
    const isLoading = isSupabaseConfigured() && !tourLoadError;
    if (isLoading) {
      return (
        <div className="min-h-screen bg-white pt-20 animate-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Skeleton className="h-10 w-48 mb-8" />
            <Skeleton className="h-80 w-full rounded-xl mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-white pt-20 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {tourLoadError ? 'Something went wrong' : 'Tour not found'}
          </h1>
          {tourLoadError && <p className="text-gray-600 mb-4">{tourLoadError}</p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {tourLoadError && (
              <LuxuryButton
                variant="primary"
                onClick={() => {
                  setTourLoadError(null);
                  getListingByIdAsync(tourId)
                    .then((found) => setTour(found ?? null))
                    .catch((e) => setTourLoadError(e instanceof Error ? e.message : 'Failed to load tour'));
                }}
              >
                Try again
              </LuxuryButton>
            )}
            <LuxuryButton variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back to Tours
            </LuxuryButton>
          </div>
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
              <ArrowLeft className="mr-2 w-4 h-4 transition-transform duration-200 ease-smooth group-hover:-translate-x-0.5" />
              Back to Tours
            </LuxuryButton>
            
            <div className="flex items-center space-x-4">
              <button className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-finland/10 hover:text-finland transition-all duration-300">
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
                    <span className="bg-finland text-white px-3 py-1 rounded-full text-sm font-medium">Popular</span>
                  )}
                  {tour.discount && (
                    <span className="bg-finland text-white px-3 py-1 rounded-full text-sm font-medium">{tour.discount} OFF</span>
                  )}
                  {(tour.tags?.includes('free-cancellation') || !tour.tags?.length) && (
                    <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm">Free cancellation</span>
                  )}
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">{tour.title}</h1>
                <div className="flex items-center text-gray-600 mb-4">
                  <MapPin size={20} className="mr-2 text-finland" />
                  <span>{tour.destination}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-6">
                  <span className="flex items-center">
                    <Star size={18} className="text-finland fill-finland mr-1" />
                    <strong className="text-gray-900">
                      {reviewAggregate != null
                        ? reviewAggregate.count > 0
                          ? reviewAggregate.rating.toFixed(1)
                          : '0.0'
                        : tour.rating}
                    </strong>{' '}
                    ({reviewAggregate != null ? reviewAggregate.count : tour.reviews}{' '}
                    {(reviewAggregate != null ? reviewAggregate.count : tour.reviews) === 1 ? 'review' : 'reviews'})
                  </span>
                  <span className="flex items-center"><Clock size={18} className="mr-1" />{tour.duration}</span>
                  <span className="flex items-center"><Users size={18} className="mr-1" />{tour.groupSize}</span>
                  <span className="flex items-center"><Plane size={18} className="mr-1" />{tour.difficulty}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{tour.description}</p>

                {supplierLegal && (
                  <div className="mt-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    {supplierLegal.business_logo_url ? (
                      <img
                        src={supplierLegal.business_logo_url}
                        alt={`${supplierLegal.operatorName} logo`}
                        className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl object-cover border border-gray-100 flex-shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl bg-finland/10 flex items-center justify-center flex-shrink-0 border border-finland/15">
                        <Users className="w-8 h-8 text-finland" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run by</p>
                      <p className="text-lg font-semibold text-gray-900 truncate">{supplierLegal.operatorName}</p>
                    </div>
                  </div>
                )}
              </div>

              {supplierLegal &&
                (supplierLegal.privacy_policy_text?.trim() || supplierLegal.terms_conditions_text?.trim()) && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3 mb-1">
                      {supplierLegal.business_logo_url ? (
                        <img
                          src={supplierLegal.business_logo_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0 hidden sm:block"
                          aria-hidden
                        />
                      ) : null}
                      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-900">
                        Policies from {supplierLegal.operatorName}
                      </h2>
                    </div>
                    <p className="text-sm text-gray-600 mt-1.5 mb-4">
                      Privacy and booking terms for this experience provider.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {supplierLegal.privacy_policy_text?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setLegalModal('privacy')}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
                        >
                          Privacy policy
                        </button>
                      ) : null}
                      {supplierLegal.terms_conditions_text?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setLegalModal('terms')}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
                        >
                          Terms & conditions
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
            </div>

            {/* Right: Sticky booking card */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                {(() => {
                  const { price, originalPrice, label } = getDisplayPrice(tour.id, tour.price.startingFrom, discountsByListing);
                  const hasDiscount = label && price < originalPrice;
                  return (
                    <>
                      <div className="text-2xl font-bold text-gray-900 mb-1">
                        From ${(hasDiscount ? price : tour.price.startingFrom).toFixed(0)}
                        {hasDiscount && <span className="text-base font-normal text-gray-500 ml-1 line-through">was ${originalPrice}</span>}
                      </div>
                      {hasDiscount && <p className="text-sm text-green-600 mb-1">{label}</p>}
                      <p className="text-sm text-gray-500 mb-4">per person</p>
                    </>
                  );
                })()}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                    <select
                      value={guests}
                      onChange={(e) => setGuests(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (isSupabaseConfigured() && !user) {
                        window.location.href = '/auth?tab=signup&next=packages';
                        return;
                      }
                      analytics.bookStart(tour.id);
                      onBook(tour);
                    }}
                    className="w-full bg-finland text-white py-3 px-4 rounded-lg font-semibold hover:bg-finland-dark transition-all"
                  >
                    Check availability
                  </button>
                  {isSupabaseConfigured() && user && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!bookingDate.trim()) {
                          setAddToCartMessage('error');
                          return;
                        }
                        const res = await addToCart(user.id, tour.id, bookingDate, guests);
                        setAddToCartMessage(res.success ? 'success' : 'error');
                        if (res.success) setTimeout(() => setAddToCartMessage(null), 2000);
                      }}
                      className="w-full border border-finland text-finland py-2.5 px-4 rounded-lg font-medium hover:bg-finland/5 transition-all flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Add to cart
                    </button>
                  )}
                  {addToCartMessage === 'success' && <p className="text-sm text-green-600">Added to cart.</p>}
                  {addToCartMessage === 'error' && <p className="text-sm text-red-600">Select a date first or try again.</p>}
                  <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                    {(tour.cancellationPolicy || tour.tags?.includes('free-cancellation')) && (
                      <p className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> {tour.cancellationPolicy || 'Free cancellation up to 24 hours before'}</p>
                    )}
                    <p className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-finland flex-shrink-0" /> Best price guarantee</p>
                    <p className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" /> Reserve now, pay later</p>
                  </div>
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
                <CheckCircle size={20} className="mr-3 text-finland flex-shrink-0" />
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
                    <CheckCircle size={20} className="mr-3 text-finland flex-shrink-0" />
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

      {/* Reviews */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-6">Reviews</h2>
          {reviews.length === 0 && !showReviewForm && (
            <p className="text-gray-600 mb-6">No reviews yet. Be the first to leave one after your experience.</p>
          )}
          <div className="space-y-6 mb-8">
            {reviews.map((r) => (
              <div key={r.id} className="border-b border-gray-100 pb-6 last:border-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium text-gray-900">{r.guest_name}</span>
                  {r.verified && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                  )}
                  <span className="text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
                    />
                  ))}
                </div>
                {r.title && <p className="font-medium text-gray-900 mb-1">{r.title}</p>}
                <p className="text-gray-700">{r.comment}</p>
              </div>
            ))}
          </div>

          {canLeaveReview && !hasReviewed && !showReviewForm && (
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              className="px-4 py-2 rounded-lg border border-finland text-finland font-medium hover:bg-finland/5"
            >
              Leave a review
            </button>
          )}

          {showReviewForm && user && (
            <div className="bg-gray-50 rounded-xl p-6 max-w-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Write a review</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReviewRating(i)}
                        className="p-1"
                      >
                        <Star
                          size={28}
                          className={i <= reviewRating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    placeholder="Sum up your experience"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your review *</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    placeholder="Tell others what you liked..."
                    required
                  />
                </div>
                {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={reviewSubmitting || !reviewComment.trim()}
                    onClick={async () => {
                      setReviewSubmitting(true);
                      setReviewError(null);
                      const res = await submitReview({
                        listingId: tour.id,
                        userId: user.id,
                        guestName: user.email?.split('@')[0] ?? 'Guest',
                        rating: reviewRating,
                        title: reviewTitle.trim() || undefined,
                        comment: reviewComment.trim(),
                        bookingId: bookingIdForReview,
                      });
                      setReviewSubmitting(false);
                      if (res.success) {
                        setShowReviewForm(false);
                        setReviewTitle('');
                        setReviewComment('');
                        setHasReviewed(true);
                        loadReviews();
                      } else {
                        setReviewError(res.error ?? 'Failed to submit');
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Submitting…' : 'Submit review'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {legalModal && supplierLegal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setLegalModal(null)}
          />
          <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col z-[71]">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {legalModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 text-sm font-medium"
              >
                Close
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {legalModal === 'privacy'
                ? supplierLegal.privacy_policy_text
                : supplierLegal.terms_conditions_text}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}



