import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  MapPin,
  Heart,
  Star,
  Share2,
  CheckCircle,
  Users,
  BedDouble,
  Bath,
  Home,
  Clock,
  Shield,
  Building2,
  X,
} from 'lucide-react';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { stayRestrictionLines } from '../lib/stay-restrictions';
import { staySafetyConsiderationLines } from '../lib/stay-safety';
import { STAY_BED_KINDS, stayBedSummary, stayPdpBedroomCount, stayPdpSleepingAreas } from '../lib/stay-beds';
import { parseListingExtras, STAY_GUEST_CANCELLATION_POLICY } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingIsFamily } from '../lib/inventory';
import { listingDetailVisibleToTraveler } from '../lib/product-workflows';
import { reviewOnlyPackageFromListingOps } from '../lib/trip-views';
import { fetchListingOpsByIds } from '../data/supabase-listings';
import { useAuth } from '../contexts/AuthContext';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { trackListingTraffic } from '../lib/listing-traffic';
import { scrubListingBookingSelectionFromLocation } from '../lib/listing-booking-fresh';
import { quoteStayNights, stayQuotePriceLines, experienceTodayIsoForListing } from '../lib/booking-quote';
import { stayCheckInStillBookable } from '../lib/stay-cutoff';
import { fetchDiscountsByListingIds, type ListingDiscount } from '../data/supabase-discounts';
import { stayDateRangesOverlap, occupiedNightsFromStayRanges, nightsOccupiedByStay } from '../lib/stayOccupancy';
import {
  fetchPublishedStayOccupiedRanges,
  fetchPublishedStayBlockedNights,
} from '../data/supabase-bookings';
import StayBookingConfirm from './StayBookingConfirm';
import {
  buildStayCheckoutHref,
  buildStayListingHref,
  parseStayCheckoutSearch,
  type StayCheckoutState,
} from '../lib/stayCheckoutUrl';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import {
  fetchReviewsByListingId,
  getReviewAggregateForListing,
  getReviewRepliesByReviewIds,
  submitReview,
  userHasCompletedBookingForListing,
  userHasReviewedListing,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../data/supabase-reviews';
import PublicReviewCard from '../components/PublicReviewCard';
import StarRatingDisplay from '../components/StarRatingDisplay';
import ListingPdpReviewMeta from '../components/ListingPdpReviewMeta';
import ListingPdpPhotoGallery from '../components/ListingPdpPhotoGallery';
import ListingPdpQuickFacts from '../components/ListingPdpQuickFacts';
import ListingPdpCheckList from '../components/ListingPdpCheckList';
import ListingPdpPolicyBlock from '../components/ListingPdpPolicyBlock';
import ListingPdpSupplierBlock from '../components/ListingPdpSupplierBlock';
import type { TourPackage } from '../types/tour';
import ErrorState from '../components/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { setPageMetaWithOg, setStayJsonLd, clearStayJsonLd } from '../lib/seo';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown from '../components/PriceBreakdown';
import StayNightPicker from '../components/StayNightPicker';
import StayGuestPartySelector from '../components/booking/StayGuestPartySelector';
import { normalizeStayGuestPolicy, validateStayGuestParty, type StayGuestParty } from '../lib/stay-guest-party';
import { stayExtraChargeLabel, type StayExtraSelection } from '../lib/stay-price';
import { stayArrivalMethodLabel } from '../lib/stay-arrival';
import { ListingReviewsModal } from '../components/ListingReviewsModal';
import NoticeCallout from '../components/NoticeCallout';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { stayAmenityDisplayList } from '../lib/stay-amenities';
import { stayStickyBookCtaLabel } from '../lib/stay-sticky-cta';
import { stayQuoteFailureFocusTarget } from '../lib/stay-quote-failure-focus';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';
import {
  STAY_LISTING_CONFIRMATION_NOTE,
  stayCheckInOutMissingCopy,
  LISTING_REVIEWS_EMPTY_COPY,
  STRIPE_TEST_UNTIL_LIVE,
} from '../lib/booking-confirmation-copy';
import { listingShowsFreeCancellation, publicReviewLabel } from '../lib/listingTruth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { isSupabaseListingId } from '../lib/discount-display';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import {
  travelerLeadGuestNameFromAuth,
  type TravelerCheckoutAuthMetadata,
} from '../lib/traveler-checkout-autofill';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';

type Props = {
  stayId: string;
  onBack: () => void;
  /** Label for the back control — reflects where the traveler came from. */
  backLabel?: string;
};

const sectionClass = 'tv-pdp-section mt-7 border-t border-[#E8EBF0] pt-7';
const headingClass = 'tv-section-heading mb-3.5';

const STAY_DEFAULT_PARTY = { adults: 2, children: 0, infants: 0 } as const;

export default function StayDetails({ stayId, onBack, backLabel = 'Stays' }: Props) {
  const { user, requestAuth } = useAuth();
  // Phase 1704/1708: sync via effect — wishlist/auth onSuccess can fire before React `user` updates.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [locationSearch, setLocationSearch] = useState(
    () => (typeof window !== 'undefined' ? window.location.search : '')
  );
  const checkoutFromUrl = useMemo(() => parseStayCheckoutSearch(locationSearch), [locationSearch]);
  const [stay, setStay] = useState<TourPackage | null>(null);
  const [stayDiscounts, setStayDiscounts] = useState<ListingDiscount[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Phase 1731: review-only PDP when draft stay is hidden from traveler SELECT. */
  const [reviewOnlyAccess, setReviewOnlyAccess] = useState(false);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [bookingClockMs, setBookingClockMs] = useState(() => Date.now());
  const [party, setParty] = useState<StayGuestParty>(() => ({ ...STAY_DEFAULT_PARTY }));
  const [selectedExtras, setSelectedExtras] = useState<StayExtraSelection[]>([]);
  const [payError, setPayError] = useState<string | null>(null);
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [hostName, setHostName] = useState<string | null>(null);
  const [hostSupplier, setHostSupplier] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    public_description: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  } | null>(null);
  const [hostLegalModal, setHostLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [occupiedRanges, setOccupiedRanges] = useState<{ checkIn: string; checkOut: string }[]>([]);
  const [blockedNights, setBlockedNights] = useState<string[]>([]);
  const [occupancyError, setOccupancyError] = useState<string | null>(null);
  /** True after a successful occupancy fetch for the current stay — empty nights ≠ “fully open” until then. */
  /** Overlapping occupancy reloads (tab visibility, stay change) must not commit stale nights. */
  const occupancyReloadGenRef = useRef(0);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const [wishlistHeartKnown, setWishlistHeartKnown] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [reviews, setReviews] = useState<ReviewDisplay[]>([]);
  const [reviewsLoadError, setReviewsLoadError] = useState<string | null>(null);
  const [reviewReplies, setReviewReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [reviewAggregate, setReviewAggregate] = useState<{ rating: number; count: number } | null>(null);
  const [canLeaveReview, setCanLeaveReview] = useState(false);
  const [bookingIdForReview, setBookingIdForReview] = useState<string | undefined>();
  const [hasReviewed, setHasReviewed] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStay(null);
    setStayDiscounts([]);
    setReviewOnlyAccess(false);
    setOccupiedRanges([]);
    setBlockedNights([]);
    setOccupancyError(null);
    void getListingByIdAsync(stayId)
      .then(async (row) => {
        if (cancelled) return;
        const found = row ?? getListingById(stayId) ?? null;
        if (
          found &&
          listingDetailVisibleToTraveler({
            familyMatches: listingIsFamily(found, 'stay'),
            status: found.status,
          })
        ) {
          setStay(found);
          return;
        }
        // Phase 1731: draft/unpublished stay — review-only hydrate via party ops.
        const uid = user?.id;
        const email = user?.email ?? '';
        if (uid && isSupabaseConfigured()) {
          try {
            const { canReview } = await userHasCompletedBookingForListing(uid, email, stayId);
            if (cancelled) return;
            if (canReview) {
              if (found) {
                setReviewOnlyAccess(true);
                setStay(found);
                return;
              }
              const opsMap = await fetchListingOpsByIds([stayId]);
              if (cancelled) return;
              const ops = opsMap[stayId];
              if (ops) {
                setReviewOnlyAccess(true);
                setStay(reviewOnlyPackageFromListingOps(stayId, ops));
                return;
              }
            }
          } catch {
            /* fall through to missing */
          }
        }
        setStay(null);
        setError(USER_ERROR.stayMissing);
      })
      .catch((e) => {
        if (cancelled) return;
        setStay(null);
        setError(userFacingError(e, USER_ERROR.stay));
      });
    return () => {
      cancelled = true;
    };
  }, [stayId, user?.id, user?.email]);

  useEffect(() => {
    if (!stay?.id) {
      setStayDiscounts([]);
      return;
    }
    let cancelled = false;
    void fetchDiscountsByListingIds([stay.id]).then((map) => {
      if (!cancelled) setStayDiscounts(map.get(stay.id) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [stay?.id]);

  useEffect(() => {
    setShowReviewForm(false);
    setReviewTitle('');
    setReviewComment('');
  }, [stayId]);

  useEffect(() => {
    setReviewReplies({});
  }, [stayId]);

  const loadReviews = useCallback(() => {
    if (!stayId || !isSupabaseConfigured()) return;
    setReviewsLoadError(null);
    // Phase 1194: clear prior stay reviews so the previous PDP stars do not flash.
    setReviews([]);
    setReviewAggregate(null);
    void fetchReviewsByListingId(stayId)
      .then((rows) => {
        setReviews(rows);
        // Phase 1175: reply failure must not invent empty reviews.
        void getReviewRepliesByReviewIds(rows.map((r) => r.id))
          .then(setReviewReplies)
          .catch(() => {
            /* Phase 1176: keep prior replies — failure ≠ “no host response” */
          });
      })
      .catch((e) => {
        setReviews([]);
        setReviewReplies({});
        setReviewsLoadError(userFacingError(e, USER_ERROR.reviews));
      });
    void getReviewAggregateForListing(stayId)
      .then(setReviewAggregate)
      .catch(() => {
        /* keep prior — failure ≠ zero reviews */
      });
  }, [stayId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    setCanLeaveReview(false);
    setBookingIdForReview(undefined);
    setHasReviewed(false);
    if (!user?.id || !user?.email || !stayId || !isSupabaseConfigured()) {
      return;
    }
    let cancelled = false;
    void userHasCompletedBookingForListing(user.id, user.email, stayId)
      .then(({ canReview, bookingId }) => {
        if (cancelled) return;
        setCanLeaveReview(canReview);
        setBookingIdForReview(bookingId);
      })
      .catch(() => {
        // Keep canLeaveReview false — failure ≠ invent eligibility.
      });
    void userHasReviewedListing(user.id, stayId)
      .then((done) => {
        if (!cancelled) setHasReviewed(done);
      })
      .catch(() => {
        // Phase 1303: eligibility failure ≠ “not reviewed” — hide Leave review.
        if (!cancelled) setHasReviewed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, stayId]);

  useEffect(() => {
    if (!user?.id || !stay?.id || !isSupabaseListingId(stay.id) || !isSupabaseConfigured()) {
      setSavedToWishlist(false);
      // Anonymous / unconfigured: heart state is known (not saved) — do not stay aria-busy forever.
      setWishlistHeartKnown(true);
      return;
    }
    let cancelled = false;
    setWishlistHeartKnown(false);
    fetchWishlistListingIds(user.id)
      .then((ids) => {
        if (!cancelled) {
          setSavedToWishlist(ids.includes(stay.id));
          setWishlistHeartKnown(true);
        }
      })
      .catch(() => {
        // Phase 1301/1363: do not show the prior listing’s heart — hide until a successful load.
        if (!cancelled) setWishlistHeartKnown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, stay?.id]);

  const handleToggleWishlist = useCallback(() => {
    if (!stay?.id || !isSupabaseListingId(stay.id) || !isSupabaseConfigured()) return;
    const listingId = stay.id;
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
    // Phase 1708: hydrate session before resume (checkout already 1704; wishlist was still broken).
    if (!userRef.current) {
      requestAuth({
        onSuccess: () => {
          void (async () => {
            if (supabase) {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) {
                userRef.current = sessionData.session.user;
              }
            }
            void run();
          })();
        },
      });
      return;
    }
    void run();
  }, [stay?.id, requestAuth, savedToWishlist]);

  // Phase 1273: match TourDetails 1271 — do not advertise non-catalog stays.
  useEffect(() => {
    const visible =
      !!stay &&
      listingDetailVisibleToTraveler({
        familyMatches: listingIsFamily(stay, 'stay'),
        status: stay.status,
      });
    if (!visible) {
      setPageMetaWithOg('Stay', 'Apartment or room from an independent operator.');
      clearStayJsonLd();
      return;
    }
    const desc = stay.description?.trim().slice(0, 160) || `${stay.title} in ${[stay.city, stay.country].filter(Boolean).join(', ')}`;
    setPageMetaWithOg(stay.title, desc, {
      title: stay.title,
      image: stay.image,
      type: 'website',
    });
    setStayJsonLd({
      id: stay.id,
      title: stay.title,
      description: stay.description ?? desc,
      image: stay.image,
      destination: [stay.city, stay.country].filter(Boolean).join(', ') || stay.destination,
      price: stay.price?.startingFrom != null ? { startingFrom: stay.price.startingFrom, currency: stay.price.currency } : undefined,
    });
    return () => clearStayJsonLd();
  }, [stay]);

  useEffect(() => {
    if (!stay?.supplierId) {
      setHostName(null);
      setHostSupplier(null);
      return;
    }
    void fetchSupplierPublicLegal(stay.supplierId).then((row) => {
      const name = row?.display_name?.trim() || row?.company_legal_name?.trim() || null;
      setHostName(name);
      if (!name) {
        setHostSupplier(null);
        return;
      }
      setHostSupplier({
        operatorName: name,
        business_logo_url: row?.business_logo_url?.trim() || null,
        public_description: row?.public_description?.trim() || null,
        privacy_policy_text: row?.privacy_policy_text?.trim() || null,
        terms_conditions_text: row?.terms_conditions_text?.trim() || null,
      });
    });
  }, [stay?.supplierId]);

  const reloadStayOccupancy = useCallback(() => {
    if (!stay?.id) {
      setOccupiedRanges([]);
      setBlockedNights([]);
      setOccupancyError(null);
      return () => {};
    }
    const reloadGen = ++occupancyReloadGenRef.current;
    let cancelled = false;
    setOccupancyError(null);
    void Promise.all([
      fetchPublishedStayOccupiedRanges(stay.id),
      fetchPublishedStayBlockedNights(stay.id, {
        fromDate: experienceTodayIsoForListing(
          parseListingExtras(stay.listingExtras).departureTimezone
        ),
      }),
    ])
      .then(([ranges, nights]) => {
        if (cancelled || reloadGen !== occupancyReloadGenRef.current) return;
        setOccupiedRanges(ranges);
        setBlockedNights(nights);
      })
      .catch((e) => {
        if (cancelled || reloadGen !== occupancyReloadGenRef.current) return;
        // Keep prior occupancy; never flash empty as “fully open”.
        setOccupancyError(
          userFacingError(e, 'We could not check stay availability. Check your connection and try again.')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [stay?.id, stay?.listingExtras]);

  useEffect(() => {
    return reloadStayOccupancy();
  }, [reloadStayOccupancy]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') reloadStayOccupancy();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadStayOccupancy]);

  const extras = stay ? parseListingExtras(stay.listingExtras) : {};
  const s = extras.stay;
  const experienceTodayIso = experienceTodayIsoForListing(extras.departureTimezone, bookingClockMs);
  const amenities = stayAmenityDisplayList(s?.amenities);
  const gallery = (extras.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  const guestPolicy = normalizeStayGuestPolicy(s?.guestPolicy);

  useEffect(() => {
    const id = window.setInterval(() => setBookingClockMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const checkInClosed = useCallback(
    (iso: string) =>
      !stayCheckInStillBookable({
        checkInDate: iso,
        checkInTimeHm: s?.checkInTime,
        cutoffMinutes: s?.reservationCutoffMinutes,
        timeZone: extras.departureTimezone,
        nowMs: bookingClockMs,
      }),
    [s?.checkInTime, s?.reservationCutoffMinutes, extras.departureTimezone, bookingClockMs]
  );

  useEffect(() => {
    if (!checkIn || checkoutFromUrl) return;
    if (checkInClosed(checkIn)) {
      setCheckIn('');
      setCheckOut('');
      setPayError('That check-in is no longer available. Choose a new date.');
    }
  }, [checkIn, checkInClosed, checkoutFromUrl]);

  const stayQuote = stay
    ? quoteStayNights({
        tour: stay,
        checkIn,
        checkOut,
        guests: party.adults,
        party,
        selectedExtras,
        discounts: stayDiscounts,
        todayIso: experienceTodayIso,
        nowMs: bookingClockMs,
      })
    : null;
  const nightly = stayQuote?.ok ? stayQuote.nightlyPrice : s?.nightlyPriceUsd && s.nightlyPriceUsd > 0 ? s.nightlyPriceUsd : stay?.price.startingFrom ?? 0;
  const nights = stayQuote?.ok ? stayQuote.nights : null;
  const minNights = s?.minNights ?? 1;
  // Phase 1216: do not invent party max 12 when stay.maxGuests is unset (publish requires it).
  const maxGuests =
    typeof s?.maxGuests === 'number' && Number.isFinite(s.maxGuests) && s.maxGuests >= 1
      ? Math.floor(s.maxGuests)
      : null;
  const quoteOk = stayQuote?.ok === true;
  const total = stayQuote?.ok ? stayQuote.totalAmount : 0;
  const currency = normalizeCurrency(stay?.price.currency);
  const bookedNights = useMemo(() => occupiedNightsFromStayRanges(occupiedRanges), [occupiedRanges]);
  const occupiedNights = useMemo(
    () => [...new Set([...bookedNights, ...blockedNights])],
    [bookedNights, blockedNights]
  );
  const selectionOccupied =
    checkIn && checkOut
      ? occupiedRanges.some((r) => stayDateRangesOverlap(checkIn, checkOut, r.checkIn, r.checkOut)) ||
        nightsOccupiedByStay(checkIn, checkOut).some((n) => blockedNights.includes(n))
      : false;
  const hero = stay ? listingHeroImageSrc(stay.image) : undefined;
  const stayGalleryImages = useMemo(() => {
    const urls = [hero, ...gallery.map((u) => listingHeroImageSrc(u) ?? u)].filter(
      (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i
    );
    return urls;
  }, [hero, gallery]);
  const canLoadReviews = Boolean(stay?.id && isSupabaseConfigured() && isSupabaseListingId(stay.id));
  const stayPlace = (
    s?.locationDisplayName?.trim() ||
    [stay?.city, stay?.country].filter(Boolean).join(', ') ||
    stay?.destination ||
    ''
  ).trim();
  const primaryStayOption = (s?.options ?? []).find((option) => !option.archived) ?? null;
  // Prefer the bookable option's type when present — top-level can lag after option edits.
  const propertyTypeLabel =
    (primaryStayOption?.propertyType?.trim() || s?.propertyType?.trim() || '').trim();
  const staySleepAreas = stayPdpSleepingAreas({
    sleepingAreas: primaryStayOption?.sleepingAreas,
    bedMix: s?.bedMix,
  });
  const stayBedroomCount = stayPdpBedroomCount({
    bedrooms: s?.bedrooms,
    sleepingAreas: primaryStayOption?.sleepingAreas,
    bedMix: s?.bedMix,
  });
  const stayQuickFacts = (() => {
    const facts: { label: string; value: string; icon: typeof Users }[] = [];
    if (propertyTypeLabel) facts.push({ label: 'Property type', value: propertyTypeLabel, icon: Building2 });
    if (typeof s?.maxGuests === 'number') {
      facts.push({
        label: 'Guests',
        value: s.maxGuests === 1 ? '1 guest' : `Up to ${s.maxGuests}`,
        icon: Users,
      });
    }
    if (stayBedroomCount != null) {
      facts.push({
        label: 'Bedrooms',
        value: stayBedroomCount === 1 ? '1 bedroom' : `${stayBedroomCount} bedrooms`,
        icon: Home,
      });
    }
    const bedsLabel = stayBedSummary(s?.bedMix) || (typeof s?.beds === 'number'
      ? s.beds === 1
        ? '1 bed'
        : `${s.beds} beds`
      : '');
    if (bedsLabel) facts.push({ label: 'Beds', value: bedsLabel, icon: BedDouble });
    if (typeof s?.bathrooms === 'number') {
      facts.push({
        label: 'Bathrooms',
        value: s.bathrooms === 1 ? '1 bath' : `${s.bathrooms} baths`,
        icon: Bath,
      });
    }
    return facts;
  })();

  useEffect(() => {
    if (!stayQuote || stayQuote.ok || !stayQuote.error.includes('not offered') || selectedExtras.length === 0) return;
    setSelectedExtras([]);
  }, [stayQuote, selectedExtras.length]);

  useEffect(() => {
    if (maxGuests == null) return;
    setParty((current) => {
      const checked = validateStayGuestParty(current, guestPolicy, maxGuests);
      if (checked.ok) return current;
      const next = { ...current };
      while (next.children > 0 && !validateStayGuestParty(next, guestPolicy, maxGuests).ok) next.children -= 1;
      while (next.infants > 0 && !validateStayGuestParty(next, guestPolicy, maxGuests).ok) next.infants -= 1;
      while (next.adults > 1 && !validateStayGuestParty(next, guestPolicy, maxGuests).ok) next.adults -= 1;
      return next;
    });
  }, [maxGuests, guestPolicy]);

  const lastStayProfileUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastStayProfileUserIdRef.current !== null && lastStayProfileUserIdRef.current !== (user?.id ?? null)) {
      setGuestName('');
      setProfileDisplayName('');
    }
    lastStayProfileUserIdRef.current = user?.id ?? null;
    if (!user?.id || !isSupabaseConfigured()) return;
    const uid = user.id;
    const meta = user.user_metadata as TravelerCheckoutAuthMetadata | undefined;
    void fetchConsumerProfileRow(uid)
      .then((row) => {
        if (lastStayProfileUserIdRef.current !== uid) return;
        const fromProfile = (row?.display_name ?? '').trim();
        const nextName = travelerLeadGuestNameFromAuth({
          consumerDisplayName: fromProfile,
          metadata: meta,
        });
        if (fromProfile) setProfileDisplayName(fromProfile);
        if (nextName) setGuestName((prev) => prev.trim() || nextName);
      })
      .catch(() => {
        /* keep auth metadata autofill on profile load failure */
      });
  }, [user?.id]);

  // Phase 1210: surface self-book block before Reserve (BookingPage 1186 / TourDetails 1164 parity).
  useEffect(() => {
    if (!stay?.supplierId || !isSupabaseConfigured() || !user?.id) {
      setSelfBookBlocked(false);
      setSelfBookCheckFailed(false);
      return;
    }
    let cancelled = false;
    void viewerIsListingSupplierSide(user.id, stay.supplierId)
      .then((selfBook) => {
        if (cancelled) return;
        setSelfBookBlocked(selfBook);
        setSelfBookCheckFailed(false);
        if (selfBook) setPayError(LISTING_SELF_BOOK_BLOCKED);
      })
      .catch(() => {
        if (cancelled) return;
        setSelfBookBlocked(true);
        setSelfBookCheckFailed(true);
        setPayError(LISTING_SELF_BOOK_CHECK_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [stay?.supplierId, user?.id]);

  useEffect(() => {
    const onPop = () => setLocationSearch(window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Fresh visit / refresh: strip stale selection params. Edit/Back restores via closeStayBookingConfirm.
  const stayListingHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (checkoutFromUrl) return;
    if (scrubListingBookingSelectionFromLocation()) {
      setLocationSearch(window.location.search);
    }
    if (stayListingHydratedRef.current === stayId) return;
    stayListingHydratedRef.current = stayId;
    setCheckIn('');
    setCheckOut('');
    setParty({ ...STAY_DEFAULT_PARTY });
    setPayError(null);
  }, [checkoutFromUrl, stayId]);

  const stayBookingAlertDescribedBy =
    [occupancyError ? 'stay-occupancy-error' : null, payError ? 'stay-pay-error' : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const requestToBook = extras.stay?.bookingMethod === 'request';
  const stickyStayCtaLabel = stayStickyBookCtaLabel({
    selectionOccupied,
    quoteOk,
    checkIn,
    checkOut,
    quoteError: stayQuote && !stayQuote.ok ? stayQuote.error : null,
    minNights,
    occupancyUnavailable: Boolean(occupancyError),
    selfBookBlocked,
    selfBookCheckFailed,
    requestToBook,
    surface: 'listing',
  });

  const focusStayQuoteFailure = () => {
    const quoteError = stayQuote && !stayQuote.ok ? stayQuote.error : null;
    const target = stayQuoteFailureFocusTarget(quoteError);
    document.getElementById(target.scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!target.focusNightPicker) return;
    window.requestAnimationFrame(() => {
      const root = document.getElementById('stay-night-picker');
      const firstOpen = root?.querySelector('button:not([disabled])') as HTMLButtonElement | null;
      (firstOpen ?? root)?.focus();
    });
  };

  useEffect(() => {
    if (stay?.id && !reviewOnlyAccess) trackListingTraffic(stay.id, 'view');
  }, [stay?.id, reviewOnlyAccess]);

  const openStayBookingConfirm = () => {
    if (!stay || !stayQuote?.ok) {
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (reviewOnlyAccess) {
      setPayError('This stay is no longer bookable. You can still leave a review below.');
      return;
    }
    if (occupancyError) {
      setPayError('We could not verify availability. Try again before continuing.');
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const stillTaken =
      occupiedRanges.some((r) =>
        stayDateRangesOverlap(stayQuote.checkIn, stayQuote.checkOut, r.checkIn, r.checkOut)
      ) ||
      nightsOccupiedByStay(stayQuote.checkIn, stayQuote.checkOut).some((n) => blockedNights.includes(n));
    if (stillTaken) {
      setPayError('Those dates were just taken. Choose different dates to continue.');
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (selfBookCheckFailed) {
      setPayError(LISTING_SELF_BOOK_CHECK_FAILED);
      return;
    }
    if (selfBookBlocked) {
      setPayError(LISTING_SELF_BOOK_BLOCKED);
      return;
    }
    setPayError(null);
    trackListingTraffic(stay.id, 'book_start');
    const state: StayCheckoutState = {
      checkIn: stayQuote.checkIn,
      checkOut: stayQuote.checkOut,
      adults: party.adults,
      children: party.children,
      infants: party.infants,
      paymentCancelled: false,
    };
    const href = buildStayCheckoutHref(stay.id, state);
    window.history.pushState({}, '', href);
    setLocationSearch(window.location.search);
  };

  const closeStayBookingConfirm = (state: StayCheckoutState) => {
    // Clean listing URL; keep the active selection in React for Edit/Back.
    const href = buildStayListingHref(stayId);
    window.history.pushState({}, '', href);
    setLocationSearch(window.location.search);
    setCheckIn(state.checkIn);
    setCheckOut(state.checkOut);
    setParty({
      adults: state.adults,
      children: state.children,
      infants: state.infants,
    });
  };

  if (error && !stay) {
    const stayMissing = error === USER_ERROR.stayMissing;
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-lg mx-auto px-4 py-16">
          <ErrorState
            title={stayMissing ? 'Stay not found' : 'Stay unavailable'}
            body={error}
            retry={
              stayMissing
                ? undefined
                : {
                    onClick: () => {
                      setError(null);
                      void getListingByIdAsync(stayId)
                        .then((row) => {
                          const found = row ?? getListingById(stayId) ?? null;
                          if (
                            !found ||
                            !listingDetailVisibleToTraveler({
                              familyMatches: listingIsFamily(found, 'stay'),
                              status: found.status,
                            })
                          ) {
                            setStay(null);
                            setError(USER_ERROR.stayMissing);
                            return;
                          }
                          setStay(found);
                        })
                        .catch((e) => {
                          setStay(null);
                          setError(userFacingError(e, USER_ERROR.stay));
                        });
                    },
                  }
            }
            back={{
              onClick: onBack,
              label: backLabel.toLowerCase() === 'back' ? 'Go back' : `Back to ${backLabel}`,
            }}
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

  if (stay && checkoutFromUrl && !reviewOnlyAccess) {
    return (
      <StayBookingConfirm
        stay={stay}
        initial={checkoutFromUrl}
        onBackToListing={closeStayBookingConfirm}
      />
    );
  }

  if (!stay) {
    return (
      <div className="min-h-screen bg-paper tv-page px-4 py-16">
        <Skeleton className="mx-auto h-64 max-w-3xl rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page tv-stay-pdp pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="tv-shell mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="tv-icon-btn lux-flat inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{backLabel}</span>
          </button>
          <div className="flex items-center gap-1.5">
            {isSupabaseListingId(stay.id) && isSupabaseConfigured() ? (
              <button
                type="button"
                className="tv-icon-btn lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink disabled:opacity-60"
                aria-label={
                  !wishlistHeartKnown
                    ? 'Checking saved status'
                    : savedToWishlist
                      ? 'Remove from saved stays'
                      : 'Save this stay'
                }
                aria-pressed={wishlistHeartKnown ? savedToWishlist : undefined}
                aria-busy={!wishlistHeartKnown}
                disabled={wishlistBusy || !wishlistHeartKnown}
                onClick={handleToggleWishlist}
              >
                <Heart
                  size={17}
                  className={`${wishlistHeartKnown && savedToWishlist ? 'fill-finland text-finland' : ''} ${savePop ? 'tv-pop' : ''}`}
                />
              </button>
            ) : null}
            <button
              type="button"
              className="tv-icon-btn lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink"
              aria-label={shareCopied ? 'Link copied' : 'Share'}
              onClick={() => {
                const url = window.location.href;
                const title = stay.title;
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
              {shareCopied ? <CheckCircle size={17} className="tv-pop text-finland" /> : <Share2 size={17} />}
            </button>
          </div>
        </div>

        <header className="mb-3 sm:mb-3.5">
          {s?.accommodationMode === 'multi' ? (
            <p className="mb-2 text-sm text-ink-muted">Room types for this property are not open for booking yet.</p>
          ) : null}
          <h1 className="tv-tour-title font-sans font-bold tracking-tight text-[#111827] break-words [overflow-wrap:anywhere]">
            {stay.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            {(() => {
              const review = publicReviewLabel(reviewAggregate);
              return (
                <ListingPdpReviewMeta
                  score={review.score}
                  count={review.count}
                  reviewsSectionId="stay-reviews"
                />
              );
            })()}
            {stayPlace ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-ink">
                <MapPin size={14} className="shrink-0 text-[#0B397E]" aria-hidden />
                <span className="font-bold tracking-tight break-words [overflow-wrap:anywhere]">
                  {stayPlace}
                </span>
              </span>
            ) : null}
          </div>
        </header>

        <div className="tv-pdp-layout">
          <div className="tv-pdp-main">
            <ListingPdpPhotoGallery
              photos={stayGalleryImages}
              title={stay.title}
              emptyLabel="No photos yet for this stay"
            />

            {stay.subtitle?.trim() ? (
              <p className="tv-tour-subtitle mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
                {stay.subtitle.trim()}
              </p>
            ) : null}

            {stayQuickFacts.length > 0 ? (
              <div className="mt-5">
                <ListingPdpQuickFacts facts={stayQuickFacts} />
                {hostName ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    Hosted by <span className="font-semibold text-ink">{hostName}</span>
                  </p>
                ) : null}
              </div>
            ) : hostName ? (
              <p className="mt-5 text-sm text-ink-muted">
                Hosted by <span className="font-semibold text-ink">{hostName}</span>
              </p>
            ) : null}

            {stay.description ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>About this place</h2>
                <div
                  className={`overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    descriptionExpanded ? 'max-h-[80rem]' : 'max-h-[6.5rem]'
                  }`}
                >
                  <p className="max-w-prose text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {stay.description}
                  </p>
                </div>
                {stay.description.length > 280 ? (
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-finland hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland rounded"
                    onClick={() => setDescriptionExpanded((v) => !v)}
                    aria-expanded={descriptionExpanded}
                  >
                    {descriptionExpanded ? 'Show less' : 'Read more'}
                  </button>
                ) : null}
              </section>
            ) : null}

            {stay.highlights?.some((line) => line.trim()) ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Property highlights</h2>
                <ListingPdpCheckList items={stay.highlights ?? []} />
              </section>
            ) : null}

            {amenities.length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Amenities</h2>
                <ListingPdpCheckList
                  items={(amenitiesExpanded ? amenities : amenities.slice(0, 8)).map((a) =>
                    a === 'Wifi' ? 'Wi-Fi' : a,
                  )}
                />
                {amenities.length > 8 ? (
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-finland hover:underline"
                    onClick={() => setAmenitiesExpanded((v) => !v)}
                    aria-expanded={amenitiesExpanded}
                  >
                    {amenitiesExpanded ? 'Show less' : `Show all ${amenities.length} amenities`}
                  </button>
                ) : null}
              </section>
            ) : null}
            {staySleepAreas.length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Where you&apos;ll sleep</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {staySleepAreas.map((area) => {
                    const photos =
                      primaryStayOption?.roomPhotos?.find((row) => row.areaId === area.id)?.urls ?? [];
                    const cover = photos[0] ?? null;
                    const beds = area.beds
                      .map((bed) => {
                        const label = STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.label ?? 'Bed';
                        return `${bed.count} ${label.toLowerCase()}${bed.count === 1 ? '' : 's'}`;
                      })
                      .join(', ');
                    return (
                      <li
                        key={area.id}
                        className="flex min-w-0 gap-3 overflow-hidden rounded-xl ring-1 ring-[#E8EBF0]"
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="h-[5.5rem] w-[5.5rem] shrink-0 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center bg-ink/[0.04]">
                            <BedDouble className="h-5 w-5 text-ink-faint" aria-hidden />
                          </div>
                        )}
                        <div className="min-w-0 py-2.5 pr-3">
                          <p className="font-semibold text-ink text-sm leading-snug">{area.name}</p>
                          <p className="mt-0.5 text-sm text-ink-muted leading-snug">
                            {beds || 'Beds not listed yet'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className={sectionClass}>
              <h2 className={`${headingClass} flex items-center gap-2`}>
                <Clock className="h-4 w-4 text-finland" aria-hidden />
                Check-in &amp; check-out
              </h2>
              <dl className="divide-y divide-[#E8EBF0]">
                {s?.checkInTime ? (
                  <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                    <dt className="text-sm font-semibold tracking-tight text-[#111827]">Check-in</dt>
                    <dd className="text-sm leading-relaxed text-ink-muted">From {s.checkInTime}</dd>
                  </div>
                ) : null}
                {s?.checkOutTime ? (
                  <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                    <dt className="text-sm font-semibold tracking-tight text-[#111827]">Check-out</dt>
                    <dd className="text-sm leading-relaxed text-ink-muted">By {s.checkOutTime}</dd>
                  </div>
                ) : null}
                {stayArrivalMethodLabel(s?.arrivalMethod) ? (
                  <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                    <dt className="text-sm font-semibold tracking-tight text-[#111827]">Arrival</dt>
                    <dd className="text-sm leading-relaxed text-ink-muted">
                      {stayArrivalMethodLabel(s?.arrivalMethod)}
                    </dd>
                  </div>
                ) : null}
                {s?.arrivalNote ? (
                  <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                    <dt className="text-sm font-semibold tracking-tight text-[#111827]">Note</dt>
                    <dd className="text-sm leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
                      {s.arrivalNote}
                    </dd>
                  </div>
                ) : null}
                {(() => {
                  // Phase 1587: only times / missing-time honesty here — Trips email note lives on booking panel (1585/1586).
                  const missing = stayCheckInOutMissingCopy({
                    checkInTime: s?.checkInTime,
                    checkOutTime: s?.checkOutTime,
                  });
                  return missing ? (
                    <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                      <dt className="text-sm font-semibold tracking-tight text-[#111827]">Times</dt>
                      <dd className="text-sm leading-relaxed text-ink-muted">{missing}</dd>
                    </div>
                  ) : null;
                })()}
                <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                  <dt className="text-sm font-semibold tracking-tight text-[#111827]">Access</dt>
                  <dd className="text-sm leading-relaxed text-ink-faint">
                    Access codes and the private arrival address are shared with confirmed guests after payment.
                  </dd>
                </div>
              </dl>
            </section>

            {stayRestrictionLines(s?.restrictions).length > 0 || s?.houseRules ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>House rules</h2>
                {stayRestrictionLines(s?.restrictions).length > 0 ? (
                  <ul className="mb-1 divide-y divide-[#E8EBF0]">
                    {stayRestrictionLines(s?.restrictions).map((line) => (
                      <li key={line} className="py-2.5 text-sm text-ink-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s?.houseRules ? (
                  <p
                    className={`text-sm text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${
                      stayRestrictionLines(s?.restrictions).length > 0 ? 'mt-3 border-t border-[#E8EBF0] pt-3' : ''
                    }`}
                  >
                    {s.houseRules}
                  </p>
                ) : null}
              </section>
            ) : null}

            {s &&
            (s.exteriorCamera || (s.safetyConsiderations?.length ?? 0) > 0 || s.safetyNote) ? (
              <section className={sectionClass}>
                <h2 className={`${headingClass} flex items-center gap-2`}>
                  <Shield className="h-4 w-4 text-finland" aria-hidden />
                  Safety
                </h2>
                <ul className="space-y-1.5 text-sm text-ink-muted">
                  {s.exteriorCamera ? (
                    <li>
                      Exterior security camera
                      {s.cameraLocation
                        ? `: ${s.cameraLocation}`
                        : s.safetyNote && !s.cameraLocation
                          ? `: ${s.safetyNote}`
                          : ''}
                    </li>
                  ) : null}
                  {staySafetyConsiderationLines(s.safetyConsiderations).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {s.safetyNote && (!s.exteriorCamera || s.cameraLocation) ? <li>{s.safetyNote}</li> : null}
                </ul>
              </section>
            ) : null}

            <ListingPdpPolicyBlock
              className={sectionClass}
              summary={
                listingShowsFreeCancellation(stay)
                  ? 'Free cancellation up to 24 hours before check-in'
                  : null
              }
              body={STAY_GUEST_CANCELLATION_POLICY}
            />
          </div>

          <div className="tv-pdp-aside min-w-0">
          <aside
            id="stay-booking-panel"
            role="region"
            aria-labelledby="stay-booking-panel-title"
            className="tv-booking-sticky tv-booking-sticky--fit tv-booking-sticky--stay lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))] h-fit scroll-mt-28"
          >
            <p id="stay-booking-panel-title" className="tv-eyebrow mb-2">
              {requestToBook ? 'Request to book' : 'Reserve'}
            </p>
            {checkIn && checkOut && stayQuote && !stayQuote.ok ? (
              <p className="font-sans text-2xl font-bold tabular-nums tracking-tight text-ink">
                Price unavailable
              </p>
            ) : quoteOk && stayQuote?.ok ? (
              <div className="tv-quote-reveal">
                <p className="font-sans text-[1.75rem] font-bold tabular-nums tracking-tight text-ink leading-none">
                  {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
                </p>
                <p className="tv-meta mt-1">
                  Total · {stayQuote.nights} night{stayQuote.nights === 1 ? '' : 's'}
                  {nightly > 0 ? ` · ${formatMoney(nightly, currency)} / night` : ''}
                </p>
              </div>
            ) : nightly > 0 ? (
              <div>
                <p className="font-sans text-[1.75rem] font-bold tabular-nums tracking-tight text-ink leading-none">
                  {formatMoney(nightly, currency)}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  / night
                  {minNights > 1 ? ` · ${minNights} nights minimum` : ''}
                </p>
              </div>
            ) : (
              <p className="font-display text-2xl font-semibold text-ink">—</p>
            )}
            <div className="mt-3 space-y-2.5">
              <StayNightPicker
                id="stay-night-picker"
                checkIn={checkIn}
                checkOut={checkOut}
                occupiedNights={occupiedNights}
                todayIso={experienceTodayIso}
                minNights={minNights}
                checkInClosed={checkInClosed}
                onChange={(a, b) => {
                  setCheckIn(a);
                  setCheckOut(b);
                  setPayError(null);
                }}
              />
              <StayGuestPartySelector
                id="stay-guests"
                party={party}
                policy={guestPolicy}
                maxGuests={maxGuests}
                onChange={(next) => {
                  setParty(next);
                  setPayError(null);
                }}
              />
              {maxGuests == null ? (
                <p id="stay-guest-capacity-unavailable" className="text-sm text-red-700">
                  Guest capacity is unavailable for this stay.
                </p>
              ) : null}
            </div>
            {nights != null && nights < minNights ? (
              <div className="mt-2.5">
                <NoticeCallout title="Minimum stay not met" tone="warn">
                  This stay requires at least {minNights === 1 ? '1 night' : `${minNights} nights`}. Extend check-out to
                  continue.
                </NoticeCallout>
              </div>
            ) : null}
            {selectionOccupied ? (
              <div className="mt-2.5">
                <NoticeCallout title="Those nights are taken" tone="danger">
                  Another traveler already has this stay on those dates. Choose a different range.
                </NoticeCallout>
              </div>
            ) : null}
            {quoteOk && stayQuote?.ok && stayQuote.offeredExtras.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-ink">Extras</p>
                {stayQuote.offeredExtras.map((extra) => {
                  const chosen = selectedExtras.find((row) => row.id === extra.id);
                  const quantity = extra.mandatory ? Math.max(1, chosen?.quantity ?? 1) : chosen?.quantity ?? 0;
                  return (
                    <div key={extra.id} className="rounded-xl px-3 py-2 ring-1 ring-black/[0.08]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-ink">{extra.name}</p>
                          <p className="text-[12px] text-ink-muted">
                            {extra.requestOnly
                              ? 'Request only · not charged with this booking'
                              : stayExtraChargeLabel(extra.charge)}
                            {extra.mandatory ? ' · Included in the total' : ''}
                            {extra.description ? ` · ${extra.description}` : ''}
                          </p>
                        </div>
                        {extra.mandatory ? (
                          <span className="text-sm text-ink-muted">Required</span>
                        ) : (
                          <button
                            type="button"
                            className="min-h-11 text-sm font-semibold text-finland"
                            aria-pressed={quantity > 0}
                            onClick={() => {
                              setSelectedExtras((current) =>
                                quantity > 0 ? current.filter((row) => row.id !== extra.id) : [...current, { id: extra.id, quantity: 1 }]
                              );
                              setPayError(null);
                            }}
                          >
                            {quantity > 0 ? (extra.requestOnly ? 'Remove request' : 'Remove') : extra.requestOnly ? 'Request' : 'Add'}
                          </button>
                        )}
                      </div>
                      {extra.maxQuantity > 1 && (extra.mandatory || quantity > 0) ? (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            className="h-11 w-11 rounded-full text-lg text-finland ring-1 ring-black/[0.08]"
                            aria-label={`Fewer ${extra.name}`}
                            onClick={() =>
                              setSelectedExtras((current) =>
                                current.map((row) =>
                                  row.id === extra.id ? { ...row, quantity: Math.max(extra.mandatory ? 1 : 1, row.quantity - 1) } : row
                                )
                              )
                            }
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
                          <button
                            type="button"
                            className="h-11 w-11 rounded-full text-lg text-finland ring-1 ring-black/[0.08]"
                            aria-label={`More ${extra.name}`}
                            onClick={() =>
                              setSelectedExtras((current) => {
                                const existing = current.find((row) => row.id === extra.id);
                                if (!existing) return [...current, { id: extra.id, quantity: 1 }];
                                return current.map((row) =>
                                  row.id === extra.id ? { ...row, quantity: Math.min(extra.maxQuantity, row.quantity + 1) } : row
                                );
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {quoteOk && stayQuote?.ok ? (
              <details className="mt-3 tv-quote-reveal group">
                <summary className="cursor-pointer list-none text-sm font-medium text-finland marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show price details</span>
                  <span className="hidden group-open:inline">Hide price details</span>
                </summary>
                <div className="mt-2">
                  <PriceBreakdown
                    currency={stayQuote.currency}
                    lines={stayQuotePriceLines(stayQuote)}
                    total={stayQuote.totalAmount}
                    footnote={
                      stayQuote.requests.length
                        ? `Requested, not charged: ${stayQuote.requests
                            .map((row) => (row.quantity > 1 ? `${row.name} × ${row.quantity}` : row.name))
                            .join(', ')}. The host confirms these separately.`
                        : null
                    }
                  />
                </div>
              </details>
            ) : null}
            {stayQuote && !stayQuote.ok && checkIn && checkOut ? (
              <p className="mt-2.5 text-sm text-red-700">{userFacingError(stayQuote.error, USER_ERROR.checkout)}</p>
            ) : null}
            {occupancyError ? (
              <p id="stay-occupancy-error" className="mt-2.5 text-sm text-red-700">
                {occupancyError}{' '}
                <button type="button" className="font-semibold text-finland hover:underline" onClick={() => reloadStayOccupancy()}>
                  Try again
                </button>
              </p>
            ) : null}
            {payError ? (
              <p id="stay-pay-error" className="mt-2.5 text-sm text-red-700">
                {payError}
              </p>
            ) : null}
            {quoteOk ? (
              <>
                <button
                  type="button"
                  className="tv-btn-primary w-full mt-3 disabled:opacity-50"
                  disabled={selectionOccupied || selfBookBlocked || maxGuests == null}
                  aria-describedby={stayBookingAlertDescribedBy}
                  onClick={() => {
                    if (occupancyError) {
                      document.getElementById('stay-occupancy-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      return;
                    }
                    if (selectionOccupied || selfBookBlocked || maxGuests == null) return;
                    openStayBookingConfirm();
                  }}
                >
                  {stickyStayCtaLabel}
                </button>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  {listingShowsFreeCancellation(stay)
                    ? 'Free cancellation available — see policy for deadlines.'
                    : requestToBook
                      ? 'Continue to request — host accepts before capture.'
                      : 'Continue to review details, then pay securely.'}
                </p>
              </>
            ) : (
              <button
                type="button"
                className="tv-btn-primary w-full mt-3"
                onClick={() => focusStayQuoteFailure()}
              >
                {stickyStayCtaLabel}
              </button>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint" title={STAY_LISTING_CONFIRMATION_NOTE}>
              {STRIPE_TEST_UNTIL_LIVE} · confirmed stays appear in Trips
            </p>
          </aside>
          </div>
        </div>
      </div>

      {canLoadReviews || hostName ? (
        <div className="tv-shell mx-auto mt-2 px-4 sm:px-6 lg:px-8">
          {canLoadReviews ? (
            <div id="stay-reviews" className="tv-pdp-below border-t border-[#E8EBF0] pt-8 scroll-mt-28">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 className="tv-section-heading">Reviews</h2>
                {reviews.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setReviewsModalOpen(true)}
                    className="text-sm font-semibold text-finland hover:underline"
                  >
                    See all reviews
                  </button>
                ) : null}
              </div>
              {(() => {
                const review = publicReviewLabel(reviewAggregate);
                return review.score ? (
                  <div className="mb-4 flex items-center gap-3">
                    <p className="text-4xl font-bold tabular-nums leading-none tracking-tight text-[#111827]">
                      {review.score}
                    </p>
                    <div>
                      <StarRatingDisplay rating={Number(review.score) || 0} size={16} />
                      <p className="mt-1 text-sm text-ink-muted">
                        {review.count} {review.count === 1 ? 'review' : 'reviews'}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}
              {reviewsLoadError ? (
                <div className="mb-4 max-w-xl">
                  <p className="text-ink-muted leading-relaxed">{reviewsLoadError}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-finland hover:underline"
                    onClick={() => loadReviews()}
                  >
                    Try again
                  </button>
                </div>
              ) : reviews.length === 0 && !showReviewForm ? (
                <div className="mb-4 flex items-start gap-3 py-1">
                  <Star size={20} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
                  <div>
                    <p className="text-sm font-bold tracking-tight text-[#111827]">No reviews yet</p>
                    <p className="mt-0.5 max-w-md text-sm leading-relaxed text-ink-muted">
                      {LISTING_REVIEWS_EMPTY_COPY}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="mb-6 grid items-start gap-4 sm:grid-cols-2">
                {reviews.slice(0, 4).map((r) => (
                  <PublicReviewCard
                    key={r.id}
                    review={r}
                    reply={reviewReplies[r.id]}
                    replyFromLabel="host"
                  />
                ))}
              </div>
              {canLeaveReview && !hasReviewed && !showReviewForm ? (
                <div className="space-y-2">
                  {/* Phase 1656: eligibility microcopy (Tour 1655 parity). */}
                  <p className="text-sm text-ink-muted max-w-xl">
                    Reviews are for guests who completed this paid stay.
                  </p>
                  <button type="button" onClick={() => setShowReviewForm(true)} className="tv-btn-secondary">
                    Leave a review
                  </button>
                </div>
              ) : null}
              {showReviewForm && user ? (
                <div className="tv-review-compose max-w-xl">
                  <h3 className="font-display text-xl sm:text-2xl tracking-tight text-ink mb-1">Write a review</h3>
                  <p className="text-sm text-ink-muted mb-4 leading-relaxed">
                    Share what stood out — rating and a short note help other travelers.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label id="stay-review-rating-label" className="block text-sm font-medium text-ink mb-1">
                        Rating
                      </label>
                      <p className="text-xs text-ink-muted mb-1.5">Tap to rate</p>
                      <div className="flex gap-1" role="group" aria-labelledby="stay-review-rating-label">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setReviewRating(i)}
                            className="lux-tap-target min-h-11 min-w-11 inline-flex items-center justify-center p-0.5"
                            aria-label={`Rate ${i} out of 5 stars`}
                            aria-pressed={i <= reviewRating}
                          >
                            <Star
                              size={28}
                              className={i <= reviewRating ? 'text-finland fill-finland' : 'text-ink-faint'}
                              aria-hidden
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="stay-review-title" className="block text-sm font-medium text-ink mb-1">
                        Title (optional)
                      </label>
                      <input
                        id="stay-review-title"
                        type="text"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        className="tv-input"
                        placeholder="Sum up your stay"
                      />
                    </div>
                    <div>
                      <label htmlFor="stay-review-comment" className="block text-sm font-medium text-ink mb-1">
                        Your review *
                      </label>
                      <textarea
                        id="stay-review-comment"
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value.slice(0, 2000))}
                        rows={3}
                        maxLength={2000}
                        className="tv-input"
                        placeholder="Tell others what you liked…"
                        required
                        aria-describedby="stay-review-comment-hint"
                      />
                      {/* Phase 1696: live length honesty on review compose. */}
                      <p id="stay-review-comment-hint" className="mt-1.5 text-xs text-ink-faint">
                        Up to 2000 characters
                        {reviewComment.length > 0 ? ` · ${reviewComment.length} used` : ''}.
                      </p>
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
                        aria-busy={reviewSubmitting || undefined}
                        onClick={async () => {
                          if (!bookingIdForReview) {
                            setReviewError('A completed booking is required to leave a review.');
                            return;
                          }
                          setReviewSubmitting(true);
                          setReviewError(null);
                          const res = await submitReview({
                            listingId: stay.id,
                            userId: user.id,
                            guestName: travelerDisplayNameFromSources({
                              formValue: guestName,
                              profileDisplayName,
                              metadata: user.user_metadata as {
                                full_name?: string;
                                name?: string;
                                customer_first_name?: string;
                                customer_last_name?: string;
                              },
                            }),
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
                        onClick={() => {
                          setShowReviewForm(false);
                          setReviewError(null);
                        }}
                        className="tv-btn-ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {hostSupplier ? (
            <ListingPdpSupplierBlock
              className={`tv-pdp-below ${canLoadReviews ? 'mt-2' : 'border-t border-[#E8EBF0] pt-8'} mb-8`}
              heading="About the host"
              subtitle="Host on Traverion"
              supplier={hostSupplier}
              onOpenLegal={setHostLegalModal}
              privacyNote="Contact details and private arrival instructions are shared after booking confirmation."
            />
          ) : null}
        </div>
      ) : null}

      {hostLegalModal && hostSupplier ? (
        <div className="tv-gallery-lightbox" role="dialog" aria-modal="true" tabIndex={-1}>
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-paper">
            <div className="flex items-center justify-between border-b border-[#E8EBF0] px-4 py-3">
              <h2 className="font-sans text-lg font-bold text-[#111827]">
                {hostLegalModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h2>
              <button
                type="button"
                className="tv-icon-btn lux-flat h-10 w-10 rounded-full"
                onClick={() => setHostLegalModal(null)}
              >
                <X className="h-5 w-5" aria-hidden />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {hostLegalModal === 'privacy'
                  ? hostSupplier.privacy_policy_text
                  : hostSupplier.terms_conditions_text}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {createPortal(
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] tv-booking-mobile-bar">
          <div className="mx-auto flex w-full min-w-0 max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold tracking-tight text-ink">
                <span className="tabular-nums">
                  {/* Phase 1546: never invent catalog nightly when quoteStayNights failed (Tour 1545 / Stay 1520 parity). */}
                  {/* Phase 1606: Price unavailable on sticky (Tour 1604 parity). */}
                  {/* Phase 1686: no-dates without nightly uses Price unavailable — not an em dash. */}
                  {quoteOk
                    ? formatMoney(total, currency)
                    : checkIn && checkOut
                      ? 'Price unavailable'
                      : nightly > 0
                        ? formatMoney(nightly, currency)
                        : 'Select dates'}
                </span>
                <span className="ml-1 font-sans text-sm font-medium text-ink-muted">
                  {quoteOk ? 'total' : checkIn && checkOut ? '' : nightly > 0 ? 'per night' : ''}
                </span>
              </p>
              <p className="truncate text-xs text-ink-muted">
                {checkIn && checkOut && stayQuote && !stayQuote.ok
                  ? stayQuote.error?.trim().slice(0, 72) || 'Adjust your dates or guests'
                  : listingShowsFreeCancellation(stay)
                    ? `Free cancellation · ${STRIPE_TEST_UNTIL_LIVE}`
                    : `Pay via ${STRIPE_TEST_UNTIL_LIVE}`}
              </p>
            </div>
            {quoteOk ? (
              <button
                type="button"
                className="tv-btn-primary min-h-11 shrink-0 disabled:opacity-50"
                disabled={selectionOccupied || selfBookBlocked || maxGuests == null}
                aria-describedby={stayBookingAlertDescribedBy}
                onClick={() => {
                  if (occupancyError) {
                    document.getElementById('stay-occupancy-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                  }
                  if (selectionOccupied || selfBookBlocked || maxGuests == null) return;
                  openStayBookingConfirm();
                }}
              >
                {stickyStayCtaLabel}
              </button>
            ) : (
              <button
                type="button"
                className="tv-btn-primary min-h-11 shrink-0"
                onClick={() => focusStayQuoteFailure()}
              >
                {stickyStayCtaLabel}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      <ListingReviewsModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        reviews={reviews}
        replies={reviewReplies}
        listingTitle={stay.title}
      />
    </div>
  );
}
