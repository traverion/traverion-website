import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  MapPin,
  Users,
  Star,
  Clock,
  Shield,
  Share2,
  CheckCircle,
  XCircle,
  ChevronDown,
  Heart,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../contexts/AuthContext';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { isSupabaseConfigured } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import { TourPackage } from '../types/tour';
import {
  TRAVERION_STANDARD_CANCELLATION_POLICY,
  formatTourDurationDisplay,
} from '../types/listingExtras';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getDisplayPriceForTour, isSupabaseListingId } from '../lib/discount-display';
import {
  fetchReviewsByListingId,
  getReviewAggregateForListing,
  submitReview,
  userHasCompletedBookingForListing,
  userHasReviewedListing,
  type ReviewDisplay,
} from '../data/supabase-reviews';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import { setPageMetaWithOg, setTourJsonLd, clearTourJsonLd } from '../lib/seo';
import { Skeleton } from '../components/ui/Skeleton';
import { dateNotInPast } from '../lib/validation';
import { checkAvailability } from '../data/supabase-availability';
import { optionRunsOnDate, formatOptionWeekdays } from '../lib/booking-quote';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import { listingIsOnTravelerCatalog } from '../lib/inventory';
import { listingShowsFreeCancellation, publicReviewLabel } from '../lib/listingTruth';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import BookingPage from './BookingPage';
import {
  getPartySizeBounds,
  getPartySizeBoundsForVariant,
  guestCountValidationError,
  getTourBookingVariants,
  type TourBookingVariant,
} from '../lib/booking-flow';
import BookingDateField from '../components/booking/BookingDateField';
import { useDialogFocus } from '../hooks/useDialogFocus';

function readSearchPrefill(): { date: string; guests: number } {
  if (typeof window === 'undefined') return { date: '', guests: 1 };
  const p = new URLSearchParams(window.location.search);
  const date = (p.get('date') ?? '').trim();
  const g = Number.parseInt(p.get('guests') ?? '', 10);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    guests: Number.isFinite(g) && g >= 1 ? Math.min(99, Math.floor(g)) : 1,
  };
}
import GuestStepper from '../components/booking/GuestStepper';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { formatMoney, normalizeCurrency } from '../lib/money';

interface TourDetailsProps {
  tourId: string;
  onBack: () => void;
}

export default function TourDetails({ tourId, onBack }: TourDetailsProps) {
  const { user, requestAuth } = useAuth();
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
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [bookingDate, setBookingDate] = useState(() => readSearchPrefill().date);
  const [guests, setGuests] = useState(() => readSearchPrefill().guests);
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [supplierLegal, setSupplierLegal] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  } | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const legalSheetRef = useRef<HTMLDivElement>(null);
  const closeLegalModal = useCallback(() => setLegalModal(null), []);
  useDialogFocus(legalModal !== null, legalSheetRef, closeLegalModal);
  const [bookingCardError, setBookingCardError] = useState<string | null>(null);
  const [bookingVariantsOpen, setBookingVariantsOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedBookingVariant, setSelectedBookingVariant] = useState<TourBookingVariant | null>(null);
  const [variantChecking, setVariantChecking] = useState(false);
  const [optionsAttentionPulse, setOptionsAttentionPulse] = useState(false);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const optionsSectionRef = useRef<HTMLDivElement>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const partyBounds = useMemo(() => (tour ? getPartySizeBounds(tour) : { min: 1, max: 12 }), [tour]);
  const canBook = Boolean(tour && isListingVisibleToTravelers(tour.status));
  const tourVariants = useMemo(() => (tour ? getTourBookingVariants(tour) : []), [tour]);
  const weekdayHint = useMemo(() => {
    const unique = [...new Set(tourVariants.map((v) => formatOptionWeekdays(v.listingOption?.weekdays)))];
    if (unique.length === 1) return `Runs ${unique[0]}`;
    if (unique.length > 1) return 'Each option has its own days — Adult and Child can differ.';
    return undefined;
  }, [tourVariants]);

  const scrollToOptionsSection = useCallback(() => {
    window.setTimeout(() => {
      const el = optionsSectionRef.current;
      if (!el) return;
      const headerOffset = window.innerWidth >= 1024 ? 120 : 88;
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 40);
  }, []);

  useEffect(() => {
    if (!bookingVariantsOpen) return;
    setOptionsAttentionPulse(true);
    const t = window.setTimeout(() => setOptionsAttentionPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [bookingVariantsOpen]);

  useEffect(() => {
    if (!tour?.id) return;
    setGuests((g) => Math.min(partyBounds.max, Math.max(partyBounds.min, g)));
  }, [tour?.id, partyBounds.min, partyBounds.max]);

  useEffect(() => {
    if (!user?.id || !tour?.id || !isSupabaseListingId(tour.id) || !isSupabaseConfigured()) {
      setSavedToWishlist(false);
      return;
    }
    let cancelled = false;
    fetchWishlistListingIds(user.id)
      .then((ids) => {
        if (!cancelled) setSavedToWishlist(ids.includes(tour.id));
      })
      .catch(() => {
        if (!cancelled) setSavedToWishlist(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, tour?.id]);

  const handleToggleWishlist = useCallback(() => {
    if (!tour?.id || !isSupabaseListingId(tour.id) || !isSupabaseConfigured()) return;
    const listingId = tour.id;
    const run = async () => {
      const uid = userRef.current?.id;
      if (!uid) return;
      const previous = savedToWishlist;
      const next = !previous;
      setSavedToWishlist(next);
      if (next) {
        setSavePop(true);
        window.setTimeout(() => setSavePop(false), 280);
      }
      setWishlistBusy(true);
      try {
        const res = await toggleWishlist(uid, listingId);
        if (res.error) {
          setSavedToWishlist(previous);
        } else {
          setSavedToWishlist(res.inWishlist);
        }
      } catch {
        setSavedToWishlist(previous);
      } finally {
        setWishlistBusy(false);
      }
    };
    if (!user) {
      requestAuth({ onSuccess: () => void run() });
      return;
    }
    void run();
  }, [tour?.id, user, requestAuth, savedToWishlist]);

  useEffect(() => {
    setTourLoadError(null);
    if (isSupabaseConfigured()) {
      getListingByIdAsync(tourId)
        .then((found) => { setTour(found ?? null); })
        .catch((e) => {
          setTour(null);
          setTourLoadError(userFacingError(e, USER_ERROR.tour));
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
      setPageMetaWithOg('Tour', 'Book this tour from an independent operator.');
      return;
    }
    const desc = (tour.description || '').slice(0, 160);
    const ogImage = listingHeroImageSrc(tour.image) ?? undefined;
    setPageMetaWithOg(tour.title, desc, {
      title: tour.title,
      description: desc,
      image: ogImage,
      type: 'article',
    });
    const review = publicReviewLabel(reviewAggregate);
    setTourJsonLd({
      id: tour.id,
      title: tour.title,
      description: tour.description ?? '',
      image: ogImage,
      destination: tour.destination,
      duration: tour.duration,
      rating: review.score != null ? Number(review.score) : undefined,
      reviews: review.count > 0 ? review.count : undefined,
      price: tour.price
        ? { startingFrom: getDisplayPriceForTour(tour, discountsByListing).price, currency: tour.price.currency }
        : undefined,
    });
    return () => clearTourJsonLd();
  }, [tour, reviewAggregate, discountsByListing]);

  const closeBookingModal = () => {
    setBookingModalOpen(false);
    setSelectedBookingVariant(null);
  };

  const handleCheckAvailabilityToggle = () => {
    if (!tour || variantChecking) return;
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      setBookingVariantsOpen(false);
      return;
    }
    const dateCheck = dateNotInPast(bookingDate.trim());
    if (!dateCheck.valid) {
      setBookingCardError(dateCheck.message ?? 'Please select a date');
      setBookingVariantsOpen(false);
      return;
    }
    const guestErr = guestCountValidationError(guests, partyBounds);
    if (guestErr) {
      setBookingCardError(guestErr);
      setBookingVariantsOpen(false);
      return;
    }
    setBookingCardError(null);
    setBookingVariantsOpen((open) => {
      const next = !open;
      if (next) scrollToOptionsSection();
      return next;
    });
  };

  const handleStickyBookCta = () => {
    if (!bookingDate.trim()) {
      document.getElementById('tour-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        document.getElementById('tour-booking-date-input')?.focus();
      });
      return;
    }
    if (bookingVariantsOpen) {
      document.getElementById('tour-booking-variants-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    handleCheckAvailabilityToggle();
  };

  const handlePickTourVariant = async (variant: TourBookingVariant) => {
    if (!tour) return;
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      setBookingVariantsOpen(false);
      return;
    }
    setBookingVariantsOpen(false);
    setVariantChecking(true);
    const variantBounds = getPartySizeBoundsForVariant(tour, variant);
    const guestErr = guestCountValidationError(guests, variantBounds);
    if (guestErr) {
      setBookingCardError(guestErr);
      setVariantChecking(false);
      return;
    }
    if (variant.listingOption) {
      const dayErr = optionRunsOnDate(variant.listingOption, bookingDate.trim());
      if (dayErr) {
        setBookingCardError(dayErr);
        setVariantChecking(false);
        return;
      }
    }
    setBookingCardError(null);
    try {
      const avail = await checkAvailability(tour.id, bookingDate.trim(), guests);
      if (!avail.available) {
        setBookingCardError(
          avail.remaining !== undefined && avail.remaining === 0
            ? 'This date is fully booked. Try another date or fewer guests.'
            : 'Not enough capacity left for your party. Adjust guests or pick another date.'
        );
        return;
      }
      const openBooking = () => {
        analytics.bookStart(tour.id);
        setSelectedBookingVariant(variant);
        setBookingModalOpen(true);
      };
      if (isSupabaseConfigured() && !user) {
        requestAuth({ onSuccess: openBooking });
        return;
      }
      openBooking();
    } catch {
      setBookingCardError('Could not verify availability. Check your connection and try again.');
    } finally {
      setVariantChecking(false);
    }
  };

  if (!tour || !listingIsOnTravelerCatalog(tour)) {
    const isLoading = isSupabaseConfigured() && !tourLoadError && !tour;
    if (isLoading) {
      return (
        <div className="min-h-screen bg-paper tv-page animate-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Skeleton className="h-10 w-48 mb-8" />
            <Skeleton className="h-80 w-full rounded-3xl mb-8" />
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
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-lg mx-auto px-4 py-16">
          <ErrorState
            title={tourLoadError ? 'Tour unavailable' : 'Tour not found'}
            body={
              tourLoadError
                ? userFacingError(tourLoadError, USER_ERROR.tour)
                : USER_ERROR.tourMissing
            }
            retry={
              tourLoadError
                ? {
                    onClick: () => {
                      setTourLoadError(null);
                      getListingByIdAsync(tourId)
                        .then((found) => setTour(found ?? null))
                        .catch((e) => setTourLoadError(userFacingError(e, USER_ERROR.tour)));
                    },
                  }
                : undefined
            }
            back={{ onClick: onBack, label: 'Back to tours' }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        </div>
      </div>
    );
  }

  const galleryExtras = (tour.listingExtras?.galleryImageUrls ?? [])
    .map((u) => listingHeroImageSrc(u))
    .filter((u): u is string => Boolean(u))
    .slice(0, 3);
  const hero = listingHeroImageSrc(tour.image);
  const uniqueGallery = [hero, ...galleryExtras].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);
  const images = uniqueGallery;
  const hasGallery = images.length > 0;
  const review = publicReviewLabel(reviewAggregate);

  if (bookingModalOpen && selectedBookingVariant && canBook) {
    return (
      <BookingPage
        tour={tour}
        presentation="page"
        selectedVariant={selectedBookingVariant}
        discountsByListing={discountsByListing}
        initialDate={bookingDate.trim()}
        initialGuests={guests}
        onBack={closeBookingModal}
        onComplete={closeBookingModal}
        onModalClose={closeBookingModal}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <section className="relative">
        <div className="relative h-[28rem] lg:h-[70vh]">
            <div
              className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${hasGallery ? '' : 'bg-ink/20'}`}
              style={hasGallery ? { backgroundImage: `url(${images[Math.min(selectedImage, images.length - 1)]})` } : undefined}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
              <button
                type="button"
                onClick={onBack}
                    className="lux-flat inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-2 rounded-full bg-black/35 px-3.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/50"
              >
                <ArrowLeft className="w-4 h-4" />
                Tours
              </button>
              <div className="flex items-center gap-2">
                {isSupabaseListingId(tour.id) && isSupabaseConfigured() ? (
                  <button
                    type="button"
                    className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 disabled:opacity-60"
                    aria-label={savedToWishlist ? 'Remove from saved tours' : 'Save this tour'}
                    aria-pressed={savedToWishlist}
                    disabled={wishlistBusy}
                    onClick={handleToggleWishlist}
                  >
                    <Heart
                      size={18}
                      className={`${savedToWishlist ? 'fill-white' : ''} ${savePop ? 'tv-pop' : ''}`}
                    />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
                  aria-label={shareCopied ? 'Link copied' : 'Share'}
                  onClick={() => {
                    const url = window.location.href;
                    const title = tour.title;
                    const done = () => {
                      setShareCopied(true);
                      window.setTimeout(() => setShareCopied(false), 1400);
                    };
                    if (navigator.share) {
                      void navigator.share({ title, url }).then(done).catch(() => {});
                    } else if (navigator.clipboard?.writeText) {
                      void navigator.clipboard.writeText(url).then(done);
                    }
                  }}
                >
                  {shareCopied ? <CheckCircle size={18} className="tv-pop" /> : <Share2 size={18} />}
                </button>
              </div>
            </div>
            
            {images.length > 1 ? (
            <div className="absolute bottom-4 left-4 right-4 flex space-x-2 overflow-x-auto">
              {images.map((img, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-label={`Photo ${index + 1} of ${images.length}`}
                  aria-current={selectedImage === index ? 'true' : undefined}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-[transform,border-color,box-shadow] duration-200 ${
                    selectedImage === index
                      ? 'border-white shadow-lg scale-105'
                      : 'border-white/50 hover:border-white/80'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            ) : null}
        </div>
      </section>

      {/* Content + Sticky booking widget */}
      <section className="bg-paper py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Title + description + stats (no pricing/CTA here on desktop; they're in sidebar) */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="font-display text-3xl lg:text-5xl text-ink tracking-tight mb-3">{tour.title}</h1>
                {tour.subtitle?.trim() && (
                  <p className="text-lg text-ink-muted mb-4 leading-snug">{tour.subtitle.trim()}</p>
                )}
                <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted mb-8">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={16} className="text-finland shrink-0" aria-hidden />
                    {tour.destination}
                  </span>
                  {review.score ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Star size={16} className="text-finland fill-finland shrink-0" aria-hidden />
                      <strong className="text-ink">{review.score}</strong>
                      <span>
                        {review.count} {review.count === 1 ? 'review' : 'reviews'}
                      </span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={16} className="shrink-0" aria-hidden />
                    {formatTourDurationDisplay(tour.duration)}
                  </span>
                  {tour.groupSize?.trim() ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={16} className="shrink-0" aria-hidden />
                      {tour.groupSize}
                    </span>
                  ) : null}
                  {(() => {
                    const { price, qualifier, summary } = getDisplayPriceForTour(tour, discountsByListing);
                    const currency = normalizeCurrency(tour.price?.currency);
                    const unit = qualifier ? `/ ${qualifier}` : '';
                    return (
                      <span className="text-ink font-semibold tabular-nums">
                        From {formatMoney(Number(price), currency)}
                        {unit ? <span className="font-medium text-ink-muted"> {unit}</span> : null}
                        {summary ? (
                          <span className="ml-2 font-medium text-ink-muted">{summary}</span>
                        ) : null}
                      </span>
                    );
                  })()}
                </p>
                <h2 className="font-display text-2xl text-ink mb-3">What you’ll do</h2>
                <p className="text-ink leading-relaxed text-[15px]">{tour.description}</p>

                {(() => {
                  const x = tour.listingExtras;
                  const scheduleLabel =
                    x?.scheduleStyle === 'fixed_slots'
                      ? 'Usually runs at set start times (see logistics in your confirmation).'
                      : x?.scheduleStyle === 'on_request'
                        ? 'Timing is arranged directly with the host after booking.'
                        : x?.scheduleStyle === 'flexible'
                          ? 'Timing is flexible unless your confirmation says otherwise.'
                          : null;
                  const venueLabel =
                    x?.venueSetting === 'indoor'
                      ? 'Mostly indoor'
                      : x?.venueSetting === 'outdoor'
                        ? 'Mostly outdoor'
                        : x?.venueSetting === 'mixed'
                          ? 'Indoor and outdoor'
                          : null;
                  const langExtra = (x?.additionalLanguages ?? [])
                    .map((code) => {
                      const labels: Record<string, string> = {
                        en: 'English',
                        es: 'Spanish',
                        fr: 'French',
                        de: 'German',
                        it: 'Italian',
                        pt: 'Portuguese',
                        nl: 'Dutch',
                        ja: 'Japanese',
                        zh: 'Chinese',
                        ko: 'Korean',
                        ar: 'Arabic',
                        hi: 'Hindi',
                        ru: 'Russian',
                      };
                      return labels[code] ?? code;
                    })
                    .filter(Boolean);
                  const hasGoodToKnow =
                    Boolean(x?.accessibilitySummary?.trim()) ||
                    Boolean(x?.minGuestAge?.trim()) ||
                    Boolean(venueLabel) ||
                    langExtra.length > 0 ||
                    Boolean(scheduleLabel) ||
                    Boolean(x?.typicalTimelineNotes?.trim());
                  if (!hasGoodToKnow) return null;
                  return (
                    <div className="mt-8">
                      <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-3">Good to know</h2>
                      <ul className="space-y-2 text-sm text-ink-muted">
                        {scheduleLabel && (
                          <li>
                            <span className="font-medium text-ink">Timing: </span>
                            {scheduleLabel}
                          </li>
                        )}
                        {x?.typicalTimelineNotes?.trim() && (
                          <li>
                            <span className="font-medium text-ink">Typical flow: </span>
                            {x.typicalTimelineNotes.trim()}
                          </li>
                        )}
                        {venueLabel && (
                          <li>
                            <span className="font-medium text-ink">Setting: </span>
                            {venueLabel}
                          </li>
                        )}
                        {x?.minGuestAge?.trim() && (
                          <li>
                            <span className="font-medium text-ink">Minimum age: </span>
                            {x.minGuestAge.trim()}
                          </li>
                        )}
                        {langExtra.length > 0 && (
                          <li>
                            <span className="font-medium text-ink">Also offered in: </span>
                            {langExtra.join(', ')}
                          </li>
                        )}
                        {x?.accessibilitySummary?.trim() && (
                          <li>
                            <span className="font-medium text-ink">Accessibility &amp; mobility: </span>
                            {x.accessibilitySummary.trim()}
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })()}

                {tour.highlights.filter((h) => String(h).trim()).length > 0 ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-5">Highlights</h2>
                    <ul className="space-y-3">
                      {tour.highlights
                        .map((h) => String(h).trim())
                        .filter(Boolean)
                        .map((highlight, index) => (
                          <li key={index} className="flex items-start gap-3 text-ink-muted">
                            <CheckCircle size={18} className="text-finland flex-shrink-0 mt-0.5" aria-hidden />
                            <span>{highlight}</span>
                          </li>
                        ))}
                    </ul>
                  </section>
                ) : null}

                {(tour.itinerary ?? []).some(
                  (d) =>
                    String(d.title ?? '').trim() ||
                    String(d.description ?? '').trim() ||
                    (d.activities ?? []).some((a) => String(a).trim())
                ) ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-5">Itinerary</h2>
                    <ol className="space-y-8">
                      {(tour.itinerary ?? [])
                        .filter(
                          (d) =>
                            String(d.title ?? '').trim() ||
                            String(d.description ?? '').trim() ||
                            (d.activities ?? []).some((a) => String(a).trim())
                        )
                        .map((day) => (
                          <li key={day.day}>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-1">
                              Day {day.day}
                              {day.location?.trim() ? ` · ${day.location.trim()}` : ''}
                            </p>
                            {day.title?.trim() ? (
                              <h3 className="font-semibold text-ink mb-2">{day.title.trim()}</h3>
                            ) : null}
                            {day.description?.trim() ? (
                              <p className="text-ink-muted leading-relaxed">{day.description.trim()}</p>
                            ) : null}
                            {(day.activities ?? []).filter((a) => String(a).trim()).length > 0 ? (
                              <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                                {(day.activities ?? [])
                                  .map((a) => String(a).trim())
                                  .filter(Boolean)
                                  .map((a) => (
                                    <li key={a}>{a}</li>
                                  ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                    </ol>
                  </section>
                ) : null}

                {(tour.includes.some((s) => String(s).trim()) || tour.excludes.some((s) => String(s).trim())) ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    {tour.includes.some((s) => String(s).trim()) ? (
                      <div className={tour.excludes.some((s) => String(s).trim()) ? 'mb-10' : ''}>
                        <h2 className="font-display text-2xl text-ink mb-4">What’s included</h2>
                        <ul className="space-y-3">
                          {tour.includes
                            .map((item) => String(item).trim())
                            .filter(Boolean)
                            .map((item, index) => (
                              <li key={index} className="flex items-start gap-3 text-ink-muted">
                                <CheckCircle size={18} className="text-finland flex-shrink-0 mt-0.5" aria-hidden />
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                    {tour.excludes.some((s) => String(s).trim()) ? (
                      <div>
                        <h2 className="font-display text-2xl text-ink mb-4">Not included</h2>
                        <ul className="space-y-3">
                          {tour.excludes
                            .map((item) => String(item).trim())
                            .filter(Boolean)
                            .map((item, index) => (
                              <li key={index} className="flex items-start gap-3 text-ink-muted">
                                <XCircle size={18} className="text-ink-faint flex-shrink-0 mt-0.5" aria-hidden />
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {(tour.meetingPoint?.trim() || tour.pickupInstructions?.trim() || tour.experienceStartStyle) ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-4">Pickup / meeting</h2>
                    <div className="space-y-3 text-ink-muted leading-relaxed">
                      {tour.experienceStartStyle === 'operator_pickup' ? (
                        <p>The operator picks you up. Details arrive with your confirmation.</p>
                      ) : tour.experienceStartStyle === 'fixed_meeting_place' ? (
                        <p>Meet at the place given below. Arrive a few minutes early.</p>
                      ) : tour.experienceStartStyle === 'either_available' ? (
                        <p>Pickup or meeting point — the operator confirms which applies to your booking.</p>
                      ) : null}
                      {tour.meetingPoint?.trim() ? <p>{tour.meetingPoint.trim()}</p> : null}
                      {tour.pickupInstructions?.trim() ? <p>{tour.pickupInstructions.trim()}</p> : null}
                    </div>
                  </section>
                ) : null}

                {weekdayHint ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-3">Availability</h2>
                    <p className="text-ink-muted leading-relaxed">{weekdayHint}. Choose a date on the right to see live options.</p>
                  </section>
                ) : null}

                <section className="mt-12 pt-12 border-t border-black/[0.06]">
                  <h2 className="font-display text-2xl text-ink mb-3">Cancellation</h2>
                  <p className="text-ink-muted leading-relaxed">
                    {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
                  </p>
                </section>

                {(tour.difficulty === 'Challenging' ||
                  (tour.price?.importantNotes ?? []).some((n) => String(n).trim()) ||
                  tour.listingExtras?.minGuestAge?.trim()) ? (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-4">Important information</h2>
                    <ul className="space-y-2 text-ink-muted">
                      {tour.difficulty === 'Challenging' ? <li>This tour is marked challenging.</li> : null}
                      {tour.listingExtras?.minGuestAge?.trim() ? (
                        <li>Minimum age: {tour.listingExtras.minGuestAge.trim()}</li>
                      ) : null}
                      {(tour.price?.importantNotes ?? [])
                        .map((n) => String(n).trim())
                        .filter(Boolean)
                        .map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                    </ul>
                  </section>
                ) : null}

                {supplierLegal && (
                  <section className="mt-12 pt-12 border-t border-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-4">Operator</h2>
                    <div className="flex items-center gap-4">
                    {supplierLegal.business_logo_url ? (
                      <img
                        src={supplierLegal.business_logo_url}
                        alt={`${supplierLegal.operatorName} logo`}
                        className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl object-cover border border-black/[0.06] flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl bg-finland/10 flex items-center justify-center flex-shrink-0 border border-finland/15">
                        <Users className="w-8 h-8 text-finland" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-ink truncate">{supplierLegal.operatorName}</p>
                      <p className="text-sm text-ink-muted">Runs this tour on Traverion</p>
                    </div>
                    </div>
                  </section>
                )}
              </div>

              {supplierLegal &&
                (supplierLegal.privacy_policy_text?.trim() || supplierLegal.terms_conditions_text?.trim()) && (
                  <div className="mt-8 pt-8 border-t border-black/[0.06]">
                    <div className="flex items-start gap-3 mb-1">
                      {supplierLegal.business_logo_url ? (
                        <img
                          src={supplierLegal.business_logo_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-black/[0.06] flex-shrink-0 hidden sm:block"
                          aria-hidden
                        />
                      ) : null}
                      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ink">
                        Policies from {supplierLegal.operatorName}
                      </h2>
                    </div>
                    <p className="text-sm text-ink-muted mt-1.5 mb-4">
                      Privacy and booking terms for this tour operator.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {supplierLegal.privacy_policy_text?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setLegalModal('privacy')}
                          className="tv-btn-ghost"
                        >
                          Privacy policy
                        </button>
                      ) : null}
                      {supplierLegal.terms_conditions_text?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setLegalModal('terms')}
                          className="tv-btn-ghost"
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
              <div id="tour-booking-panel" className="lg:sticky lg:top-24 bg-paper-raised rounded-2xl p-5 ring-1 ring-black/[0.06] lg:p-6">
                {!canBook ? (
                  <div>
                    <p className="text-lg font-semibold text-ink">Not bookable yet</p>
                    <p className="mt-2 text-sm text-ink-muted">
                      This tour is a draft. Travelers will see a booking option once the operator publishes it.
                    </p>
                  </div>
                ) : (
                <>
                {(() => {
                  const { price, originalPrice, label, qualifier, summary } = getDisplayPriceForTour(tour, discountsByListing);
                  const hasDiscount = label && price < originalPrice;
                  const currency = normalizeCurrency(tour.price?.currency);
                  const unit = qualifier ? `/ ${qualifier}` : 'per person';
                  return (
                    <>
                      <div className="text-2xl font-bold text-ink mb-1">
                        From {formatMoney(Number(price), currency)}
                        {hasDiscount && (
                          <span className="text-base font-normal text-ink-faint ml-1 line-through">
                            {formatMoney(originalPrice, currency)}
                          </span>
                        )}
                      </div>
                      {hasDiscount && <p className="text-sm text-finland mb-1">{label}</p>}
                      <p className="text-sm text-ink-muted mb-1">{unit}</p>
                      {summary ? <p className="text-sm text-ink-muted mb-4">{summary}</p> : <div className="mb-4" />}
                    </>
                  );
                })()}
                <div className="space-y-4">
                  <BookingDateField
                    id="tour-booking-date-input"
                    value={bookingDate}
                    onChange={(next) => {
                      setBookingDate(next);
                      setBookingCardError(null);
                      setBookingVariantsOpen(false);
                    }}
                    hint={weekdayHint}
                  />
                  <GuestStepper
                    id="tour-booking-guests"
                    value={guests}
                    min={partyBounds.min}
                    max={partyBounds.max}
                    onChange={(next) => {
                      setGuests(next);
                      setBookingCardError(null);
                      setBookingVariantsOpen(false);
                    }}
                    onBoundaryAttempt={(message) => setBookingCardError(message)}
                  />
                  <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
                    {bookingCardError && <p className="text-sm text-red-600">{bookingCardError}</p>}
                  </div>
                  <button
                    type="button"
                    aria-expanded={bookingVariantsOpen}
                    aria-controls="tour-booking-variants-list"
                    onClick={handleCheckAvailabilityToggle}
                    disabled={variantChecking || bookingModalOpen}
                    className="tv-btn-primary w-full disabled:opacity-60"
                  >
                    {variantChecking ? 'Checking…' : 'See options'}
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 transition-transform duration-200 ease-out ${bookingVariantsOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {bookingVariantsOpen && (
                    <p className="mt-1.5 text-xs text-finland font-medium">
                      Select one option below to continue.
                    </p>
                  )}
                  <div className="mt-3 space-y-1.5 text-xs text-ink-muted">
                    <p className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-finland flex-shrink-0" />{' '}
                      {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
                    </p>
                    <p className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-finland flex-shrink-0" /> Pay via Stripe to confirm
                    </p>
                  </div>
                </div>
                </>
                )}
              </div>
            </div>
          </div>
          {canBook ? (
          <div
            ref={optionsSectionRef}
            id="tour-booking-variants-list"
            role="listbox"
            aria-label="Tour options"
            className={`mt-4 lg:mt-6 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none ${
              bookingVariantsOpen
                ? `max-h-[28rem] opacity-100 translate-y-0 ${
                    optionsAttentionPulse ? 'ring-1 ring-finland/25 rounded-2xl' : ''
                  }`
                : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
            }`}
          >
            <div className="px-1 pt-2 pb-1 text-[11px] uppercase tracking-[0.16em] text-ink-faint">Choose your option</div>
            <ul className="max-h-[24rem] overflow-y-auto overscroll-contain py-1 [scrollbar-gutter:stable]">
              {tourVariants.map((v) => {
                const dayErr =
                  v.listingOption && bookingDate.trim()
                    ? optionRunsOnDate(v.listingOption, bookingDate.trim())
                    : null;
                return (
                <li key={v.id} role="option" aria-disabled={Boolean(dayErr)}>
                  <button
                    type="button"
                    disabled={Boolean(dayErr)}
                    className={`w-full px-4 py-3.5 text-left rounded-xl ring-1 transition-colors sm:py-4 ${
                      dayErr
                        ? 'opacity-50 cursor-not-allowed ring-black/[0.04]'
                        : 'ring-black/[0.08] hover:bg-finland/5 hover:ring-finland/30 active:bg-finland/10'
                    }`}
                    onClick={() => void handlePickTourVariant(v)}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">{v.label}</span>
                      <span className="text-sm font-semibold text-ink tabular-nums shrink-0">
                        {formatMoney(v.pricePerPerson, tour.price?.currency)}
                        <span className="block text-right text-xs font-normal text-ink-muted">per person</span>
                      </span>
                    </span>
                    {v.listingOption ? (
                      <span className="mt-1.5 block text-xs text-ink-muted">
                        {[
                          v.listingOption.duration.trim() || null,
                          v.listingOption.startTime.trim() ? `Starts ${v.listingOption.startTime}` : null,
                          v.listingOption.pickupPlace.trim() || null,
                          `Runs ${formatOptionWeekdays(v.listingOption.weekdays)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                    {v.listingOption?.optionInfo?.trim() ? (
                      <span className="mt-1 block text-xs leading-snug text-ink-muted">{v.listingOption.optionInfo.trim()}</span>
                    ) : v.subtitle ? (
                      <span className="mt-1 block text-xs leading-snug text-ink-muted">{v.subtitle}</span>
                    ) : null}
                    {dayErr ? <span className="mt-1 block text-xs text-red-600">{dayErr}</span> : null}
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
          ) : null}
        </div>
      </section>

      <section className="py-12 bg-paper border-t border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl text-ink mb-6">Reviews</h2>
          {reviews.length === 0 && !showReviewForm && (
            <p className="text-ink-muted mb-6 max-w-xl leading-relaxed">
              No reviews yet. Guests can write one after a completed booking.
            </p>
          )}
          <div className="space-y-6 mb-8">
            {reviews.map((r) => (
              <div key={r.id} className="border-b border-black/[0.06] pb-6 last:border-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium text-ink">{r.guest_name}</span>
                  {r.verified && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                  )}
                  <span className="text-sm text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i <= r.rating ? 'text-finland fill-finland' : 'text-ink-faint'}
                    />
                  ))}
                </div>
                {r.title && <p className="font-medium text-ink mb-1">{r.title}</p>}
                <p className="text-ink">{r.comment}</p>
              </div>
            ))}
          </div>

          {canLeaveReview && !hasReviewed && !showReviewForm && (
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              className="tv-btn-secondary"
            >
              Leave a review
            </button>
          )}

          {showReviewForm && user && (
            <div className="max-w-xl">
              <h3 className="font-display text-xl text-ink mb-4">Write a review</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Rating</label>
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
                          className={i <= reviewRating ? 'text-finland fill-finland' : 'text-ink-faint'}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Title (optional)</label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="tv-input"
                    placeholder="Sum up your tour"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Your review *</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={4}
                    className="tv-input"
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
                        setReviewError(userFacingError(res.error, USER_ERROR.review));
                      }
                    }}
                    className="tv-btn-primary disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Submitting…' : 'Submit review'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                    className="tv-btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {canBook && !bookingModalOpen ? (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-paper-raised/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] motion-safe:animate-slide-up">
          <div className="flex items-center justify-between gap-3">
            {(() => {
              const { price, qualifier } = getDisplayPriceForTour(tour, discountsByListing);
              const currency = normalizeCurrency(tour.price?.currency);
              return (
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    From {formatMoney(Number(price), currency)}
                    <span className="font-normal text-ink-muted">{qualifier ? ` / ${qualifier}` : ' · per person'}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {listingShowsFreeCancellation(tour) ? 'Free cancellation' : 'Pay via Stripe to confirm'}
                  </p>
                </div>
              );
            })()}
            <button
              type="button"
              onClick={handleStickyBookCta}
              disabled={variantChecking}
              className="tv-btn-primary shrink-0"
            >
              {variantChecking
                ? 'Checking…'
                : !bookingDate.trim()
                  ? 'Pick a date'
                  : bookingVariantsOpen
                    ? 'Choose option'
                    : 'See options'}
            </button>
          </div>
        </div>
      ) : null}

      {legalModal && supplierLegal && (
        <div
          ref={legalSheetRef}
          className="tv-sheet-overlay z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-legal-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            tabIndex={-1}
            onClick={closeLegalModal}
          />
          <div className="tv-sheet-panel relative z-[71] max-w-2xl flex flex-col motion-safe:animate-slide-up">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 id="tour-legal-title" className="font-display text-2xl text-ink">
                {legalModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h3>
              <button
                type="button"
                onClick={closeLegalModal}
                className="tv-btn-ghost shrink-0"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto text-sm text-ink leading-relaxed whitespace-pre-wrap">
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



