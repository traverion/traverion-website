import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  MapPin,
  Users,
  Star,
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
import { checkAvailability, fetchAvailabilityByListingId, fetchPublishedTourPaidGuests } from '../data/supabase-availability';
import { optionRunsOnDate, formatOptionWeekdays } from '../lib/booking-quote';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import { listingIsOnTravelerCatalog } from '../lib/inventory';
import { listingShowsFreeCancellation, publicReviewLabel } from '../lib/listingTruth';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingTourCapacityFromOptions } from '../lib/availability-ops';
import { tourSoldOutDates } from '../lib/tour-calendar';
import BookingPage from './BookingPage';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  TOUR_LISTING_CONFIRMATION_NOTE,
} from '../lib/booking-confirmation-copy';
import {
  getPartySizeBounds,
  getPartySizeBoundsForVariant,
  guestCountValidationError,
  getTourBookingVariants,
  type TourBookingVariant,
} from '../lib/booking-flow';
import TourDatePicker from '../components/TourDatePicker';
import GuestStepper from '../components/booking/GuestStepper';
import ParticipantCategoryStepper from '../components/booking/ParticipantCategoryStepper';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  buildParticipantMixLines,
  emptyMixSelection,
  formatMixSummaryCompact,
  optionUsesAgePricing,
  optionUsesPrivateFlatPrice,
  totalGuestsFromMix,
  validateParticipantMix,
  type ParticipantMixSelection,
} from '../lib/participant-mix';
import { activePriceCategories, summarizeOptionPricing } from '../lib/price-categories';
import { quoteBooking } from '../lib/booking-quote';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { PriceHero } from '../components/PriceBreakdown';
import NoticeCallout from '../components/NoticeCallout';

function experienceLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    fi: 'Finnish',
    sv: 'Swedish',
    nl: 'Dutch',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    ru: 'Russian',
  };
  const key = code.trim().toLowerCase();
  return labels[key] ?? code.trim();
}

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
  const [participantMix, setParticipantMix] = useState<ParticipantMixSelection>({});
  const [variantChecking, setVariantChecking] = useState(false);
  const [galleryLightboxOpen, setGalleryLightboxOpen] = useState(false);
  const [optionsAttentionPulse, setOptionsAttentionPulse] = useState(false);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [soldOutDates, setSoldOutDates] = useState<ReadonlySet<string>>(() => new Set());
  const optionsSectionRef = useRef<HTMLDivElement>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const partyBounds = useMemo(() => (tour ? getPartySizeBounds(tour) : { min: 1, max: 12 }), [tour]);
  const canBook = Boolean(tour && isListingVisibleToTravelers(tour.status));
  const tourVariants = useMemo(() => (tour ? getTourBookingVariants(tour) : []), [tour]);
  const calendarOptions = useMemo(
    () => tourVariants.map((v) => v.listingOption).filter((o): o is NonNullable<typeof o> => Boolean(o)),
    [tourVariants]
  );
  const weekdayHint = useMemo(() => {
    const unique = [...new Set(tourVariants.map((v) => formatOptionWeekdays(v.listingOption?.weekdays)))];
    if (unique.length === 1) return `Runs ${unique[0]}`;
    if (unique.length > 1) return 'Each option has its own schedule';
    return undefined;
  }, [tourVariants]);

  const selectedOption = selectedBookingVariant?.listingOption ?? null;
  const usesAgePricing = optionUsesAgePricing(selectedOption);
  const usesPrivateFlat = optionUsesPrivateFlatPrice(selectedOption);

  const panelQuote = useMemo(() => {
    if (!tour || !bookingDate.trim() || !selectedBookingVariant) return null;
    const optionId =
      selectedBookingVariant.id !== '__default__' ? selectedBookingVariant.id : null;
    const guestsForQuote = usesAgePricing
      ? Math.max(1, totalGuestsFromMix(buildParticipantMixLines(selectedOption!, participantMix)))
      : guests;
    return quoteBooking({
      tour,
      discounts: discountsByListing.get(tour.id) ?? [],
      bookingDate: bookingDate.trim(),
      guests: guestsForQuote,
      bookingOptionId: optionId,
      participantMix: usesAgePricing ? participantMix : null,
    });
  }, [
    tour,
    bookingDate,
    selectedBookingVariant,
    selectedOption,
    usesAgePricing,
    participantMix,
    guests,
    discountsByListing,
  ]);

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
    if (!tour?.id) {
      setSoldOutDates(new Set());
      return;
    }
    let cancelled = false;
    void Promise.all([fetchAvailabilityByListingId(tour.id), fetchPublishedTourPaidGuests(tour.id)]).then(
      ([caps, paidByDay]) => {
        if (cancelled) return;
        const fallbackCap = listingTourCapacityFromOptions(calendarOptions.map((o) => o.maxSpotsPerSlot));
        const capByDay = new Map<string, number>();
        for (const row of caps) {
          const day = String(row.available_date ?? '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
          capByDay.set(day, row.capacity);
        }
        setSoldOutDates(tourSoldOutDates({ paidByDay, capByDay, fallbackCapacity: fallbackCap }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tour?.id, calendarOptions]);

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
    if (selectedBookingVariant && !bookingModalOpen) {
      void handleContinueToCheckout();
      return;
    }
    if (bookingVariantsOpen) {
      document.getElementById('tour-booking-variants-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    handleCheckAvailabilityToggle();
  };

  const handleSelectTourVariant = (variant: TourBookingVariant) => {
    if (!tour) return;
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      return;
    }
    if (variant.listingOption) {
      const dayErr = optionRunsOnDate(variant.listingOption, bookingDate.trim());
      if (dayErr) {
        setBookingCardError(dayErr);
        return;
      }
    }
    setBookingCardError(null);
    setSelectedBookingVariant(variant);
    setBookingVariantsOpen(false);
    if (optionUsesAgePricing(variant.listingOption)) {
      setParticipantMix(emptyMixSelection(variant.listingOption!));
    } else {
      const bounds = getPartySizeBoundsForVariant(tour, variant);
      setGuests((g) => Math.min(bounds.max, Math.max(bounds.min, g)));
    }
  };

  const handleContinueToCheckout = async () => {
    if (!tour || !selectedBookingVariant) return;
    if (!isListingVisibleToTravelers(tour.status)) {
      setBookingCardError('This tour is not available to book.');
      return;
    }
    const dateCheck = dateNotInPast(bookingDate.trim());
    if (!dateCheck.valid) {
      setBookingCardError(dateCheck.message ?? 'Please select a date');
      return;
    }
    let partySize = guests;
    if (optionUsesAgePricing(selectedBookingVariant.listingOption)) {
      const mixErr = validateParticipantMix(selectedBookingVariant.listingOption!, participantMix);
      if (mixErr) {
        setBookingCardError(mixErr);
        return;
      }
      partySize = totalGuestsFromMix(
        buildParticipantMixLines(selectedBookingVariant.listingOption!, participantMix)
      );
    } else {
      const variantBounds = getPartySizeBoundsForVariant(tour, selectedBookingVariant);
      const guestErr = guestCountValidationError(guests, variantBounds);
      if (guestErr) {
        setBookingCardError(guestErr);
        return;
      }
    }
    if (selectedBookingVariant.listingOption) {
      const dayErr = optionRunsOnDate(selectedBookingVariant.listingOption, bookingDate.trim());
      if (dayErr) {
        setBookingCardError(dayErr);
        return;
      }
    }
    setBookingCardError(null);
    setVariantChecking(true);
    try {
      const avail = await checkAvailability(tour.id, bookingDate.trim(), partySize);
      if (!avail.available) {
        setBookingCardError(
          avail.remaining !== undefined && avail.remaining === 0
            ? 'This date is fully booked. Try another date or fewer guests.'
            : 'Not enough capacity left for your party. Adjust guests or pick another date.'
        );
        return;
      }
      analytics.bookStart(tour.id);
      setBookingModalOpen(true);
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
    const mixGuests = usesAgePricing
      ? totalGuestsFromMix(buildParticipantMixLines(selectedOption!, participantMix))
      : guests;
    return (
      <BookingPage
        tour={tour}
        presentation="page"
        selectedVariant={selectedBookingVariant}
        discountsByListing={discountsByListing}
        initialDate={bookingDate.trim()}
        initialGuests={Math.max(1, mixGuests)}
        initialParticipantMix={usesAgePricing ? participantMix : undefined}
        onBack={closeBookingModal}
        onComplete={closeBookingModal}
        onModalClose={closeBookingModal}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
          <button
            type="button"
            onClick={onBack}
            className="lux-flat inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-2 rounded-full bg-paper-raised px-3.5 text-sm font-medium text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Tours
          </button>
          <div className="flex items-center gap-2">
            {isSupabaseListingId(tour.id) && isSupabaseConfigured() ? (
              <button
                type="button"
                className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03] disabled:opacity-60"
                aria-label={savedToWishlist ? 'Remove from saved tours' : 'Save this tour'}
                aria-pressed={savedToWishlist}
                disabled={wishlistBusy}
                onClick={handleToggleWishlist}
              >
                <Heart
                  size={18}
                  className={`${savedToWishlist ? 'fill-finland text-finland' : ''} ${savePop ? 'tv-pop' : ''}`}
                />
              </button>
            ) : null}
            <button
              type="button"
              className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03]"
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
              {shareCopied ? <CheckCircle size={18} className="tv-pop text-finland" /> : <Share2 size={18} />}
            </button>
          </div>
        </div>

        <header className="mb-5 sm:mb-6 max-w-3xl">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted mb-2">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} className="shrink-0 text-finland" aria-hidden />
              {tour.destination}
            </span>
            {review.score ? (
              <>
                <span className="text-ink-faint" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star size={14} className="text-finland fill-finland shrink-0" aria-hidden />
                  <strong className="text-ink tabular-nums">{review.score}</strong>
                  <span>
                    ({review.count} {review.count === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              </>
            ) : null}
            {supplierLegal?.operatorName ? (
              <>
                <span className="text-ink-faint" aria-hidden>
                  ·
                </span>
                <span>Hosted by {supplierLegal.operatorName}</span>
              </>
            ) : null}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] text-ink tracking-tight leading-[1.15]">
            {tour.title}
          </h1>
          {tour.subtitle?.trim() ? (
            <p className="mt-2 text-base sm:text-lg text-ink-muted leading-snug">{tour.subtitle.trim()}</p>
          ) : null}
        </header>

        <div className="mb-6 sm:mb-8">
          {hasGallery ? (
            <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[22rem]">
              <button
                type="button"
                onClick={() => {
                  setSelectedImage(0);
                  setGalleryLightboxOpen(true);
                }}
                className="relative overflow-hidden rounded-2xl bg-ink/10 lg:col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                aria-label={`Open gallery, photo 1 of ${images.length}`}
              >
                <img
                  src={images[0]}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                />
              </button>
              {images.slice(1, 5).map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => {
                    setSelectedImage(i + 1);
                    setGalleryLightboxOpen(true);
                  }}
                  className="relative hidden overflow-hidden rounded-xl bg-ink/10 aspect-[4/3] lg:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                  aria-label={`Open gallery, photo ${i + 2} of ${images.length}`}
                >
                  <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  {i === 3 && images.length > 5 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">
                      +{images.length - 5} more
                    </span>
                  ) : null}
                </button>
              ))}
              {images.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden -mx-1 px-1 snap-x snap-mandatory">
                  {images.map((img, index) => (
                    <button
                      key={`m-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedImage(index);
                        setGalleryLightboxOpen(true);
                      }}
                      className={`relative shrink-0 snap-start overflow-hidden rounded-xl ${
                        index === 0 ? 'hidden' : 'w-[42%] aspect-[4/3]'
                      }`}
                      aria-label={`Photo ${index + 1} of ${images.length}`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="aspect-[21/9] rounded-2xl bg-ink/10" />
          )}
          {hasGallery ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-ink-muted tabular-nums">
                {images.length} {images.length === 1 ? 'photo' : 'photos'}
              </p>
              <button
                type="button"
                onClick={() => setGalleryLightboxOpen(true)}
                className="text-xs font-semibold text-finland hover:underline"
              >
                View all photos
              </button>
            </div>
          ) : null}
        </div>

        <dl className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl bg-paper-raised px-3.5 py-3 ring-1 ring-black/[0.05]">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Duration</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatTourDurationDisplay(tour.duration)}</dd>
          </div>
          {tour.groupSize?.trim() && !/option/i.test(tour.groupSize) ? (
            <div className="rounded-xl bg-paper-raised px-3.5 py-3 ring-1 ring-black/[0.05]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Group size</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{tour.groupSize.trim()}</dd>
            </div>
          ) : null}
          {tour.experienceLanguage?.trim() ? (
            <div className="rounded-xl bg-paper-raised px-3.5 py-3 ring-1 ring-black/[0.05]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Language</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {experienceLanguageLabel(tour.experienceLanguage)}
              </dd>
            </div>
          ) : null}
          <div className="rounded-xl bg-paper-raised px-3.5 py-3 ring-1 ring-black/[0.05]">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {tour.experienceStartStyle === 'operator_pickup' ? 'Pickup' : 'Meeting'}
            </dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {tour.experienceStartStyle === 'operator_pickup'
                ? 'Included'
                : tour.experienceStartStyle === 'fixed_meeting_place'
                  ? 'Meeting point'
                  : tour.experienceStartStyle === 'either_available'
                    ? 'Pickup or meet'
                    : tour.meetingPoint?.trim()
                      ? 'See details'
                      : 'Confirmed after booking'}
            </dd>
          </div>
          {listingShowsFreeCancellation(tour) ? (
            <div className="rounded-xl bg-emerald-50/80 px-3.5 py-3 ring-1 ring-emerald-200/60 col-span-2 sm:col-span-1">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Cancellation</dt>
              <dd className="mt-1 text-sm font-medium text-emerald-950">Free within policy</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <section className="bg-paper pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="font-display text-2xl text-ink mb-3">What you’ll do</h2>
                <p className="text-ink leading-relaxed text-[15px]">{tour.description}</p>
              </div>

              <div className="space-y-8">
                {(() => {
                  const x = tour.listingExtras;
                  const scheduleLabel =
                    x?.scheduleStyle === 'fixed_slots'
                      ? 'Usually runs at set start times (see logistics on your booking in Trips).'
                      : x?.scheduleStyle === 'on_request'
                        ? 'Timing is arranged directly with the host after booking.'
                        : x?.scheduleStyle === 'flexible'
                          ? 'Timing is flexible unless your booking in Trips says otherwise.'
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
                    <div className="rounded-2xl bg-finland/[0.06] p-5 sm:p-6 ring-1 ring-finland/15">
                      <h2 className="text-[11px] uppercase tracking-[0.16em] text-finland mb-3 font-semibold">Good to know</h2>
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
                  <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
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
                  <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-5">Itinerary</h2>
                    <ol className="space-y-6">
                      {(tour.itinerary ?? [])
                        .filter(
                          (d) =>
                            String(d.title ?? '').trim() ||
                            String(d.description ?? '').trim() ||
                            (d.activities ?? []).some((a) => String(a).trim())
                        )
                        .map((day) => (
                          <li
                            key={day.day}
                            className="rounded-xl bg-finland/[0.04] p-4 ring-1 ring-finland/10"
                          >
                            <p className="text-[11px] uppercase tracking-[0.16em] text-finland font-semibold mb-1">
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
                  <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06] space-y-8">
                    {tour.includes.some((s) => String(s).trim()) ? (
                      <div className="rounded-2xl bg-emerald-50/70 p-4 sm:p-5 ring-1 ring-emerald-200/60">
                        <h2 className="font-display text-2xl text-ink mb-4">What’s included</h2>
                        <ul className="space-y-3">
                          {tour.includes
                            .map((item) => String(item).trim())
                            .filter(Boolean)
                            .map((item, index) => (
                              <li key={index} className="flex items-start gap-3 text-ink-muted">
                                <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden />
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                    {tour.excludes.some((s) => String(s).trim()) ? (
                      <div className="rounded-2xl bg-rose-50/70 p-4 sm:p-5 ring-1 ring-rose-200/60">
                        <h2 className="font-display text-2xl text-ink mb-4">Not included</h2>
                        <ul className="space-y-3">
                          {tour.excludes
                            .map((item) => String(item).trim())
                            .filter(Boolean)
                            .map((item, index) => (
                              <li key={index} className="flex items-start gap-3 text-ink-muted">
                                <XCircle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" aria-hidden />
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {(tour.meetingPoint?.trim() || tour.pickupInstructions?.trim() || tour.experienceStartStyle) ? (
                  <section className="rounded-2xl bg-finland/[0.06] p-5 sm:p-6 ring-1 ring-finland/15">
                    <h2 className="font-display text-2xl text-ink mb-4">Pickup / meeting</h2>
                    <div className="space-y-3 text-ink-muted leading-relaxed">
                      {tour.experienceStartStyle === 'operator_pickup' ? (
                        <p>The operator picks you up. Pickup details appear on your booking in Trips after you pay.</p>
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
                  <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
                    <h2 className="font-display text-2xl text-ink mb-3">Availability</h2>
                    <p className="text-ink-muted leading-relaxed">{weekdayHint}. Choose a date on the right to see live options.</p>
                  </section>
                ) : null}

                <section className="rounded-2xl bg-amber-50/70 p-5 sm:p-6 ring-1 ring-amber-200/60">
                  <h2 className="font-display text-2xl text-ink mb-3">Cancellation</h2>
                  <p className="text-ink-muted leading-relaxed">
                    {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
                  </p>
                </section>

                {(tour.difficulty === 'Challenging' ||
                  (tour.price?.importantNotes ?? []).some((n) => String(n).trim()) ||
                  tour.listingExtras?.minGuestAge?.trim()) ? (
                  <section className="rounded-2xl bg-rose-50/60 p-5 sm:p-6 ring-1 ring-rose-200/50">
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
                  <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
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
              <div id="tour-booking-panel" className="lg:sticky lg:top-24 h-fit scroll-mt-24 bg-paper-raised rounded-2xl p-5 shadow-soft-lg ring-1 ring-black/[0.06] lg:p-6">
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
                  const unit = qualifier ? `From · per ${qualifier}` : 'From · per person';
                  return (
                    <>
                      <PriceHero
                        amount={Number(price)}
                        currency={currency}
                        basis={unit}
                        originalAmount={hasDiscount ? originalPrice : null}
                        discountLabel={hasDiscount ? label : null}
                      />
                      {summary ? <p className="text-sm text-ink-muted mt-1 mb-4">{summary}</p> : <div className="mb-4" />}
                    </>
                  );
                })()}
                <div className="space-y-4">
                  <TourDatePicker
                    id="tour-booking-date-input"
                    value={bookingDate}
                    onChange={(next) => {
                      setBookingDate(next);
                      setBookingCardError(null);
                      setBookingVariantsOpen(false);
                      setSelectedBookingVariant(null);
                    }}
                    options={calendarOptions}
                    soldOutDates={soldOutDates}
                    hint={weekdayHint}
                  />
                  {!selectedBookingVariant ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={bookingVariantsOpen}
                        aria-controls="tour-booking-variants-list"
                        onClick={handleCheckAvailabilityToggle}
                        disabled={variantChecking || bookingModalOpen}
                        className="tv-btn-primary w-full disabled:opacity-60"
                      >
                        {variantChecking ? 'Checking…' : bookingVariantsOpen ? 'Hide options' : 'See available options'}
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 transition-transform duration-200 ease-out ${bookingVariantsOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {bookingVariantsOpen && (
                        <p className="mt-1.5 text-xs text-finland font-medium">
                          Select one option below — then choose participants.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-finland/[0.04] p-3 ring-1 ring-finland/20">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Selected option</p>
                          <p className="text-sm font-semibold text-ink truncate">{selectedBookingVariant.label}</p>
                          {selectedOption?.isPrivate ? (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">
                              Private experience
                              <span className="font-normal text-paper/80">· your group only</span>
                            </p>
                          ) : null}
                          {selectedOption ? (
                            <p className="text-xs text-ink-muted mt-1">
                              {summarizeOptionPricing(selectedOption, (n) => formatMoney(n, tour.price?.currency))}
                              {optionUsesPrivateFlatPrice(selectedOption)
                                ? ' · flat group price'
                                : selectedOption.isPrivate
                                  ? ' · per person'
                                  : ''}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="tv-btn-ghost text-xs shrink-0"
                          onClick={() => {
                            setSelectedBookingVariant(null);
                            setBookingVariantsOpen(true);
                            scrollToOptionsSection();
                          }}
                        >
                          Change
                        </button>
                      </div>
                      {usesAgePricing && selectedOption ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-ink">Participants</p>
                          {activePriceCategories(selectedOption).map((cat) => (
                            <ParticipantCategoryStepper
                              key={cat.id}
                              category={cat}
                              quantity={participantMix[cat.id] ?? 0}
                              currency={normalizeCurrency(tour.price?.currency)}
                              max={selectedOption.maxPersons}
                              onChange={(qty) => {
                                setParticipantMix((prev) => ({ ...prev, [cat.id]: qty }));
                                setBookingCardError(null);
                              }}
                              onBoundaryAttempt={(message) => setBookingCardError(message)}
                            />
                          ))}
                        </div>
                      ) : (
                        <GuestStepper
                          id="tour-booking-guests"
                          value={guests}
                          min={getPartySizeBoundsForVariant(tour, selectedBookingVariant).min}
                          max={getPartySizeBoundsForVariant(tour, selectedBookingVariant).max}
                          onChange={(next) => {
                            setGuests(next);
                            setBookingCardError(null);
                          }}
                          onBoundaryAttempt={(message) => setBookingCardError(message)}
                          label={usesPrivateFlat ? 'Group size' : 'Guests'}
                        />
                      )}
                      {panelQuote?.ok ? (
                        <div className="flex items-end justify-between gap-3 pt-1 border-t border-black/[0.06]">
                          <div>
                            <p className="text-xs text-ink-muted">Total</p>
                            {usesAgePricing && panelQuote.guestBreakdown ? (
                              <p className="text-xs text-ink-muted">
                                {formatMixSummaryCompact(
                                  buildParticipantMixLines(selectedOption!, participantMix)
                                )}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-lg font-semibold tabular-nums text-ink">
                            {formatMoney(panelQuote.totalAmount, panelQuote.currency)}
                          </p>
                        </div>
                      ) : panelQuote && !panelQuote.ok ? (
                        <p className="text-xs text-red-700">{panelQuote.error}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleContinueToCheckout()}
                        disabled={variantChecking || (panelQuote != null && !panelQuote.ok)}
                        className="tv-btn-primary w-full disabled:opacity-60"
                      >
                        {variantChecking ? 'Checking…' : 'Continue'}
                      </button>
                    </div>
                  )}
                  <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
                    {bookingCardError ? (
                      <NoticeCallout title="Check your selection" tone="danger">
                        {bookingCardError}
                      </NoticeCallout>
                    ) : null}
                  </div>
                  {bookingVariantsOpen || selectedBookingVariant ? (
                  <div
                    ref={optionsSectionRef}
                    id="tour-booking-variants-list"
                    role="listbox"
                    aria-label="Tour options"
                    className={`overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none ${
                      bookingVariantsOpen
                        ? `max-h-[28rem] opacity-100 ${
                            optionsAttentionPulse ? 'ring-1 ring-finland/25 rounded-2xl' : ''
                          }`
                        : 'max-h-0 opacity-0 pointer-events-none'
                    }`}
                    hidden={!bookingVariantsOpen}
                    aria-hidden={!bookingVariantsOpen}
                  >
                    <p className="px-0.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Choose your option
                    </p>
                    <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                      {tourVariants.map((v) => {
                        const dayErr =
                          v.listingOption && bookingDate.trim()
                            ? optionRunsOnDate(v.listingOption, bookingDate.trim())
                            : null;
                        const selected = selectedBookingVariant?.id === v.id;
                        const opt = v.listingOption;
                        const groupLine =
                          opt && opt.minPersons && opt.maxPersons
                            ? opt.minPersons === opt.maxPersons
                              ? `${opt.maxPersons} guests`
                              : `${opt.minPersons}–${opt.maxPersons} guests`
                            : null;
                        return (
                        <li key={v.id} role="option" aria-disabled={Boolean(dayErr)} aria-selected={selected}>
                          <button
                            type="button"
                            disabled={Boolean(dayErr)}
                            className={`w-full px-3.5 py-3.5 text-left rounded-xl ring-1 transition-all sm:py-4 ${
                              dayErr
                                ? 'opacity-50 cursor-not-allowed ring-black/[0.04]'
                                : selected
                                  ? 'bg-finland/[0.08] shadow-sm ring-2 ring-finland'
                                  : 'bg-paper ring-black/[0.08] hover:bg-finland/5 hover:ring-finland/35 active:bg-finland/10'
                            }`}
                            onClick={() => handleSelectTourVariant(v)}
                          >
                            <span className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                  selected
                                    ? 'border-finland bg-finland text-white'
                                    : 'border-black/20 bg-paper'
                                }`}
                                aria-hidden
                              >
                                {selected ? (
                                  <CheckCircle className="h-3.5 w-3.5" />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-3">
                                  <span className="min-w-0">
                                    <span className="font-semibold text-ink">{v.label}</span>
                                    {opt?.isPrivate ? (
                                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-paper">
                                          Private
                                        </span>
                                        <span className="text-[11px] text-ink-muted">Your group only</span>
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="text-sm font-semibold tabular-nums shrink-0 text-ink">
                                    {optionUsesAgePricing(opt)
                                      ? summarizeOptionPricing(opt!, (n) => formatMoney(n, tour.price?.currency))
                                      : (
                                        <>
                                          {formatMoney(v.pricePerPerson, tour.price?.currency)}
                                          <span className="block text-right text-xs font-normal text-ink-muted">
                                            {optionUsesPrivateFlatPrice(opt) ? 'private group' : 'per person'}
                                          </span>
                                        </>
                                      )}
                                  </span>
                                </span>
                                {opt ? (
                                  <span className="mt-1.5 block text-xs text-ink-muted">
                                    {[
                                      opt.duration.trim() || null,
                                      groupLine,
                                      opt.startTime.trim() ? `Starts ${opt.startTime}` : null,
                                      opt.pickupPlace.trim() || null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                ) : null}
                                {opt?.optionInfo?.trim() ? (
                                  <span className="mt-1 block text-xs leading-snug text-ink-muted">
                                    {opt.optionInfo.trim()}
                                  </span>
                                ) : v.subtitle ? (
                                  <span className="mt-1 block text-xs leading-snug text-ink-muted">
                                    {v.subtitle}
                                  </span>
                                ) : null}
                                {dayErr ? <span className="mt-1 block text-xs text-red-700">{dayErr}</span> : null}
                              </span>
                            </span>
                          </button>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                  ) : null}

                  <div className="mt-3 space-y-1.5 text-xs text-ink-muted">
                    <p className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-finland flex-shrink-0" />{' '}
                      {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
                    </p>
                    <p className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-finland flex-shrink-0" /> Pay via Stripe to confirm
                    </p>
                    <p className="leading-relaxed">
                      {TOUR_LISTING_CONFIRMATION_NOTE} {BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}
                    </p>
                  </div>
                </div>
                </>
                )}
              </div>
            </div>
          </div>
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
                {reviewError ? (
                  <NoticeCallout title="Could not submit review" tone="danger">
                    {reviewError}
                  </NoticeCallout>
                ) : null}
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
                    <span className="font-normal text-ink-muted">{qualifier ? ` per ${qualifier}` : ' per person'}</span>
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
                : selectedBookingVariant
                  ? 'Continue'
                  : !bookingDate.trim()
                    ? 'Pick a date'
                    : bookingVariantsOpen
                      ? 'Choose option'
                      : 'See options'}
            </button>
          </div>
        </div>
      ) : null}


      {galleryLightboxOpen && hasGallery ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-ink/90"
          role="dialog"
          aria-modal="true"
          aria-label="Photo gallery"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <p className="text-sm tabular-nums">
              {Math.min(selectedImage, images.length - 1) + 1} / {images.length}
            </p>
            <button
              type="button"
              className="tv-btn-ghost text-white hover:bg-white/10"
              onClick={() => setGalleryLightboxOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            <img
              src={images[Math.min(selectedImage, images.length - 1)]}
              alt=""
              className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain"
            />
          </div>
          {images.length > 1 ? (
            <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-6">
              {images.map((img, index) => (
                <button
                  key={`lb-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-label={`Photo ${index + 1}`}
                  aria-current={selectedImage === index ? 'true' : undefined}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${
                    selectedImage === index ? 'ring-white' : 'ring-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
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



