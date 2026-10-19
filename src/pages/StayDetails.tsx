import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  MapPin,
  Heart,
  Star,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  BedDouble,
  Bath,
  Home,
  Clock,
  Shield,
} from 'lucide-react';
import { stayAmenityLucideIcon, stayHighlightLucideIcon } from '../lib/stay-amenity-icons';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { stayRestrictionLines } from '../lib/stay-restrictions';
import { staySafetyConsiderationLines } from '../lib/stay-safety';
import { STAY_BED_KINDS, stayBedSummary } from '../lib/stay-beds';
import { parseListingExtras, STAY_GUEST_CANCELLATION_POLICY } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingIsFamily } from '../lib/inventory';
import { listingDetailVisibleToTraveler } from '../lib/product-workflows';
import { reviewOnlyPackageFromListingOps } from '../lib/trip-views';
import { fetchListingOpsByIds } from '../data/supabase-listings';
import { useAuth } from '../contexts/AuthContext';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { failCloseOrphanStayCheckout } from '../lib/marketplaceBrowse';
import { quoteStayNights, stayQuotePriceLines, experienceTodayIsoForListing } from '../lib/booking-quote';
import { stayDateRangesOverlap, occupiedNightsFromStayRanges, nightsOccupiedByStay } from '../lib/stayOccupancy';
import {
  createBookingCheckoutSession,
  fetchPublishedStayOccupiedRanges,
  fetchPublishedStayBlockedNights,
} from '../data/supabase-bookings';
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
import type { TourPackage } from '../types/tour';
import ErrorState from '../components/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { setPageMetaWithOg, setStayJsonLd, clearStayJsonLd } from '../lib/seo';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown, { PriceHero } from '../components/PriceBreakdown';
import StayNightPicker from '../components/StayNightPicker';
import StayGuestPartySelector from '../components/booking/StayGuestPartySelector';
import { normalizeStayGuestPolicy, validateStayGuestParty, type StayGuestParty } from '../lib/stay-guest-party';
import { stayExtraChargeLabel, type StayExtraSelection } from '../lib/stay-price';
import { stayArrivalMethodLabel } from '../lib/stay-arrival';
import { ListingReviewsModal } from '../components/ListingReviewsModal';
import NoticeCallout from '../components/NoticeCallout';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { CHECKOUT_HOLD_MINUTES } from '../lib/booking-hold';
import { STAY_REQUEST_APPROVAL_HOURS } from '../lib/stay-booking-method';
import { stayAmenityDisplayList } from '../lib/stay-amenities';
import { stayStickyBookCtaLabel } from '../lib/stay-sticky-cta';
import { stayQuoteFailureFocusTarget } from '../lib/stay-quote-failure-focus';
import { stayCheckoutLeadGuestNameReady } from '../lib/stay-checkout-guest';
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
  travelerLeadGuestPhoneFromAuth,
  type TravelerCheckoutAuthMetadata,
} from '../lib/traveler-checkout-autofill';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';
import { useDialogFocus } from '../hooks/useDialogFocus';

type Props = {
  stayId: string;
  onBack: () => void;
  /** Label for the back control — reflects where the traveler came from. */
  backLabel?: string;
};

function readStayPrefill(): { checkIn: string; checkOut: string; guests: number } {
  if (typeof window === 'undefined') return { checkIn: '', checkOut: '', guests: 2 };
  const p = new URLSearchParams(window.location.search);
  const rawIn = (p.get('date') ?? p.get('checkIn') ?? '').trim();
  const rawOut = (p.get('checkout') ?? p.get('checkOut') ?? '').trim();
  const { checkIn, checkOut } = failCloseOrphanStayCheckout(rawIn, rawOut);
  const g = Number.parseInt(p.get('guests') ?? '', 10);
  return {
    checkIn,
    checkOut,
    guests: Number.isFinite(g) && g >= 1 ? Math.min(99, Math.floor(g)) : 2,
  };
}

export default function StayDetails({ stayId, onBack, backLabel = 'Stays' }: Props) {
  const { user, requestAuth } = useAuth();
  // Phase 1704: sync via effect only — per-render `userRef = user` wiped session set in auth onSuccess
  // before React `user` caught up (modal close re-render → Pay never resumed / self-book skipped).
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [stay, setStay] = useState<TourPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Phase 1731: review-only PDP when draft stay is hidden from traveler SELECT. */
  const [reviewOnlyAccess, setReviewOnlyAccess] = useState(false);
  const [checkIn, setCheckIn] = useState(() => readStayPrefill().checkIn);
  const [checkOut, setCheckOut] = useState(() => readStayPrefill().checkOut);
  const [party, setParty] = useState<StayGuestParty>(() => ({
    adults: readStayPrefill().guests,
    children: 0,
    infants: 0,
  }));
  const [selectedExtras, setSelectedExtras] = useState<StayExtraSelection[]>([]);
  const [paying, setPaying] = useState(false);
  const [checkoutConsentAccepted, setCheckoutConsentAccepted] = useState(false);
  const checkoutLockRef = useRef(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [hostName, setHostName] = useState<string | null>(null);
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
  // Phase 1668: Tour-parity photo lightbox for stay galleries.
  const gallerySheetRef = useRef<HTMLDivElement>(null);
  const [galleryLightboxOpen, setGalleryLightboxOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const closeGalleryLightbox = useCallback(() => setGalleryLightboxOpen(false), []);
  useDialogFocus(galleryLightboxOpen, gallerySheetRef, closeGalleryLightbox);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStay(null);
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
      return;
    }
    void fetchSupplierPublicLegal(stay.supplierId).then((row) => {
      const name = row?.display_name?.trim() || row?.company_legal_name?.trim() || null;
      setHostName(name);
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
  const experienceTodayIso = experienceTodayIsoForListing(extras.departureTimezone);
  const amenities = stayAmenityDisplayList(s?.amenities);
  const gallery = (extras.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  const guestPolicy = normalizeStayGuestPolicy(s?.guestPolicy);
  const stayQuote = stay
    ? quoteStayNights({
        tour: stay,
        checkIn,
        checkOut,
        guests: party.adults,
        party,
        selectedExtras,
        todayIso: experienceTodayIso,
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
  const hasStayGallery = stayGalleryImages.length > 0;

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
      setGuestPhone('');
      setProfileDisplayName('');
    }
    lastStayProfileUserIdRef.current = user?.id ?? null;
    if (!user?.id || !isSupabaseConfigured()) return;
    const uid = user.id;
    const meta = user.user_metadata as TravelerCheckoutAuthMetadata | undefined;
    void fetchConsumerProfileRow(uid)
      .then((row) => {
        if (lastStayProfileUserIdRef.current !== uid) return;
        // Prefer traveler profile / customer_* metadata — never partner business display names
        // (localhost same-origin auth shares storage with partner sessions).
        const fromProfile = (row?.display_name ?? '').trim();
        const nextName = travelerLeadGuestNameFromAuth({
          consumerDisplayName: fromProfile,
          metadata: meta,
        });
        if (fromProfile) setProfileDisplayName(fromProfile);
        if (nextName) setGuestName((prev) => prev.trim() || nextName);
        const ph = travelerLeadGuestPhoneFromAuth({
          consumerPhone: row?.contact_phone,
          metadata: meta,
        });
        if (ph) setGuestPhone((prev) => prev.trim() || ph);
      })
      .catch(() => {
        /* keep auth metadata autofill on profile load failure */
      });
  }, [user?.id]);

  // Phase 1210: surface self-book block before Pay (BookingPage 1186 / TourDetails 1164 parity).
  useEffect(() => {
    if (!stay?.supplierId || !isSupabaseConfigured() || !userRef.current?.id) {
      setSelfBookBlocked(false);
      setSelfBookCheckFailed(false);
      return;
    }
    let cancelled = false;
    void viewerIsListingSupplierSide(userRef.current.id, stay.supplierId)
      .then((selfBook) => {
        if (cancelled) return;
        setSelfBookBlocked(selfBook);
        setSelfBookCheckFailed(false);
        if (selfBook) setPayError(LISTING_SELF_BOOK_BLOCKED);
      })
      .catch(() => {
        // Phase 1307: eligibility failure ≠ “not supplier side” — block book.
        if (cancelled) return;
        setSelfBookBlocked(true);
        setSelfBookCheckFailed(true);
        setPayError(LISTING_SELF_BOOK_CHECK_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [stay?.supplierId, user?.id]);

  const stayBookingAlertDescribedBy =
    [occupancyError ? 'stay-occupancy-error' : null, payError ? 'stay-pay-error' : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const requestToBook = extras.stay?.bookingMethod === 'request';
  const stickyStayCtaLabel = stayStickyBookCtaLabel({
    selectionOccupied,
    paying,
    quoteOk,
    leadGuestReady: stayCheckoutLeadGuestNameReady(guestName),
    checkIn,
    checkOut,
    quoteError: stayQuote && !stayQuote.ok ? stayQuote.error : null,
    minNights,
    occupancyUnavailable: Boolean(occupancyError),
    selfBookBlocked,
    selfBookCheckFailed,
    acceptTerms: quoteOk && checkoutPayBlockedByConsent(checkoutConsentAccepted),
    requestToBook,
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

  const startStayCheckout = async () => {
    if (!stay || !stayQuote?.ok) {
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Phase 1731: review-only draft hydrate must not open Stripe.
    if (reviewOnlyAccess) {
      setPayError('This stay is no longer bookable. You can still leave a review below.');
      return;
    }
    if (checkoutPayBlockedByConsent(checkoutConsentAccepted)) {
      // Phase 1662: sticky “Accept terms” should guide calmly — no red pay error flash.
      setPayError(null);
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        document.getElementById('stay-checkout-consent')?.focus();
      });
      return;
    }
    // Re-fetch inventory so a concurrent hold or fresh host block is visible before Stripe opens.
    let freshRanges: { checkIn: string; checkOut: string }[];
    let freshBlocked: string[];
    try {
      [freshRanges, freshBlocked] = await Promise.all([
        fetchPublishedStayOccupiedRanges(stay.id),
        fetchPublishedStayBlockedNights(stay.id, { fromDate: experienceTodayIso }),
      ]);
    } catch (e) {
      setPayError(userFacingError(e, 'We could not re-check availability. Try again before paying.'));
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setOccupiedRanges(freshRanges);
    setBlockedNights(freshBlocked);
    setOccupancyError(null);
    const stillTaken =
      freshRanges.some((r) => stayDateRangesOverlap(stayQuote.checkIn, stayQuote.checkOut, r.checkIn, r.checkOut)) ||
      nightsOccupiedByStay(stayQuote.checkIn, stayQuote.checkOut).some((n) => freshBlocked.includes(n));
    if (stillTaken) {
      setPayError('Those dates were just taken. Choose different dates to continue.');
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const name = guestName.trim();
    if (!stayCheckoutLeadGuestNameReady(name)) {
      setPayError('Enter the lead guest name so the host knows who is arriving.');
      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('stay-guest-name')?.focus();
      return;
    }
    // Phase 1142: tours require sign-in before Stripe; stays must match (edge rejects anon JWT).
    // Phase 1704: gate on userRef — AuthModal onSuccess can fire before React `user` state updates.
    if (isSupabaseConfigured() && !userRef.current) {
      requestAuth({
        intent: 'checkout',
        onSuccess: () => {
          void (async () => {
            if (supabase) {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) {
                userRef.current = sessionData.session.user;
              }
            }
            void startStayCheckout();
          })();
        },
      });
      return;
    }
    // Phase 1147: mirror checkout edge — don't open Stripe for own/team listings.
    if (isSupabaseConfigured() && userRef.current?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(userRef.current.id, stay.supplierId);
        if (selfBook) {
          setPayError(LISTING_SELF_BOOK_BLOCKED);
          document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      } catch {
        setPayError(LISTING_SELF_BOOK_CHECK_FAILED);
        document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    if (checkoutLockRef.current || paying) return;
    checkoutLockRef.current = true;
    setPaying(true);
    setPayError(null);
    void createBookingCheckoutSession({
      listingId: stay.id,
      listingTitle: stay.title,
      bookingDate: stayQuote.checkIn,
      checkoutDate: stayQuote.checkOut,
      guests: stayQuote.guests,
      guestBreakdown: stayQuote.guestBreakdown,
      stayParty: party,
      stayExtras: selectedExtras,
      customerName: name,
      customerPhone: guestPhone.trim() || undefined,
      currency: stayQuote.currency,
      checkoutConsentAccepted: true,
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
    }).then((res) => {
      setPaying(false);
      checkoutLockRef.current = false;
      if (!res.success || !res.checkoutUrl) {
        setPayError(userFacingError(res.error, 'Checkout could not start. You were not charged.'));
        return;
      }
      window.location.assign(res.checkoutUrl);
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

  if (!stay) {
    return (
      <div className="min-h-screen bg-paper tv-page px-4 py-16">
        <Skeleton className="mx-auto h-64 max-w-3xl rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="lux-flat inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-medium text-ink shadow-[var(--tv-shadow-rest)] transition-[box-shadow,background] duration-200 hover:shadow-[var(--tv-shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {backLabel}
          </button>
          {isSupabaseListingId(stay.id) && isSupabaseConfigured() ? (
            <button
              type="button"
              className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03] disabled:opacity-60"
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
                size={18}
                className={`${wishlistHeartKnown && savedToWishlist ? 'fill-finland text-finland' : ''} ${savePop ? 'tv-pop' : ''}`}
              />
            </button>
          ) : null}
        </div>

        <header className="mb-5 max-w-3xl lg:mb-6">
          <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            {s?.propertyType?.trim() ? (
              <span className="inline-flex items-center gap-1 font-semibold text-finland">
                <Home className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                {s.propertyType.trim()}
              </span>
            ) : null}
            {s?.propertyType?.trim() ? <span aria-hidden>·</span> : null}
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-finland" aria-hidden strokeWidth={2} />
              {s?.locationDisplayName?.trim()
                ? s.locationDisplayName.trim()
                : [stay.city, stay.country].filter(Boolean).join(', ') || stay.destination}
            </span>
          </p>
          {s?.accommodationMode === 'multi' ? (
            <p className="mb-2 text-sm text-ink-muted">Room types for this property are not open for booking yet.</p>
          ) : null}
          <h1 className="font-sans text-[1.75rem] font-bold tracking-tight text-ink sm:text-[1.85rem] lg:text-[2.05rem] break-words [overflow-wrap:anywhere] leading-[1.18]">
            {stay.title}
          </h1>
          {stay.subtitle?.trim() ? (
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted line-clamp-2">
              {stay.subtitle.trim()}
            </p>
          ) : null}
          <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
            {typeof s?.maxGuests === 'number' ? (
              <li className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 opacity-70" aria-hidden strokeWidth={2} />
                Up to {s.maxGuests} guests
              </li>
            ) : null}
            {typeof s?.bedrooms === 'number' ? (
              <li className="inline-flex items-center gap-1.5">
                <BedDouble className="h-3.5 w-3.5 opacity-70" aria-hidden strokeWidth={2} />
                {s.bedrooms === 1 ? '1 bedroom' : `${s.bedrooms} bedrooms`}
              </li>
            ) : null}
            {stayBedSummary(s?.bedMix) || typeof s?.beds === 'number' ? (
              <li className="inline-flex items-center gap-1.5">
                <BedDouble className="h-3.5 w-3.5 opacity-70" aria-hidden strokeWidth={2} />
                {stayBedSummary(s?.bedMix) ||
                  (typeof s?.beds === 'number'
                    ? s.beds === 1
                      ? '1 bed'
                      : `${s.beds} beds`
                    : null)}
              </li>
            ) : null}
            {typeof s?.bathrooms === 'number' ? (
              <li className="inline-flex items-center gap-1.5">
                <Bath className="h-3.5 w-3.5 opacity-70" aria-hidden strokeWidth={2} />
                {s.bathrooms === 1 ? '1 bath' : `${s.bathrooms} baths`}
              </li>
            ) : null}
          </ul>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.85fr)_minmax(17.5rem,22rem)] lg:gap-8 pb-24 lg:pb-0">
          <div className="min-w-0 space-y-8 text-[15px] leading-relaxed text-ink">
            <div>
              {hasStayGallery ? (
                <div
                  className={`grid grid-cols-1 gap-2 ${
                    stayGalleryImages.length > 1 ? 'lg:grid-cols-4 lg:grid-rows-2 lg:h-[22rem] lg:gap-2.5' : ''
                  }`}
                >
                  {hero ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedImage(0);
                        setGalleryLightboxOpen(true);
                      }}
                      className={`relative overflow-hidden rounded-2xl bg-ink/10 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland ${
                        stayGalleryImages.length > 1
                          ? 'lg:col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto'
                          : 'aspect-[16/10] max-h-[28rem]'
                      }`}
                      aria-label={`Open gallery, photo 1 of ${stayGalleryImages.length}`}
                    >
                      <img
                        src={hero}
                        alt=""
                        decoding="async"
                        fetchPriority="high"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:scale-[1.03]"
                      />
                    </button>
                  ) : null}
                  {(hero ? gallery : gallery.slice(1)).slice(0, hero ? 4 : 5).map((url, i) => {
                    const src = listingHeroImageSrc(url) ?? url;
                    const index = stayGalleryImages.indexOf(src);
                    const photoIndex = index >= 0 ? index : i + (hero ? 1 : 0);
                    const isLastTile = i === 3 && stayGalleryImages.length > 5;
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() => {
                          setSelectedImage(photoIndex);
                          setGalleryLightboxOpen(true);
                        }}
                        className="relative hidden overflow-hidden rounded-2xl bg-ink/10 aspect-[4/3] lg:block text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                        aria-label={`Open gallery, photo ${photoIndex + 1} of ${stayGalleryImages.length}`}
                      >
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        {isLastTile ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">
                            +{stayGalleryImages.length - 5} more
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {gallery.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden -mx-1 px-1 snap-x snap-mandatory">
                      {gallery.slice(0, 6).map((url, index) => {
                        const src = listingHeroImageSrc(url) ?? url;
                        const photoIndex = stayGalleryImages.indexOf(src);
                        const safeIndex = photoIndex >= 0 ? photoIndex : index + (hero ? 1 : 0);
                        return (
                          <button
                            key={`m-${url}`}
                            type="button"
                            onClick={() => {
                              setSelectedImage(safeIndex);
                              setGalleryLightboxOpen(true);
                            }}
                            className="relative w-[42%] shrink-0 snap-start overflow-hidden rounded-2xl aspect-[4/3] text-left"
                            aria-label={`Photo ${safeIndex + 1} of ${stayGalleryImages.length}`}
                          >
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex aspect-[21/9] items-center justify-center rounded-2xl bg-ink/[0.06] ring-1 ring-black/[0.04]">
                  <p className="px-4 text-center text-sm text-ink-muted">No photos yet for this stay</p>
                </div>
              )}
              {hasStayGallery ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-muted tabular-nums">
                    {stayGalleryImages.length} {stayGalleryImages.length === 1 ? 'photo' : 'photos'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImage(0);
                      setGalleryLightboxOpen(true);
                    }}
                    className="tv-section-cta lux-flat text-xs"
                  >
                    View all photos
                  </button>
                </div>
              ) : null}
            </div>

            {stay.description ? (
              <section>
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-2">About this place</h2>
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
              <section>
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3">Highlights</h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {stay.highlights
                    .filter((line) => line.trim())
                    .map((line) => {
                      const Icon = stayHighlightLucideIcon(line);
                      return (
                        <li
                          key={line}
                          className="flex items-start gap-2.5 rounded-xl bg-finland/[0.04] px-3.5 py-2.5 text-sm font-medium text-ink"
                        >
                          {Icon ? (
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-finland" aria-hidden strokeWidth={1.75} />
                          ) : null}
                          <span className="min-w-0 leading-snug">{line}</span>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ) : null}

            {amenities.length > 0 ? (
              <section>
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3">Amenities</h2>
                <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                  {amenities.map((a) => {
                    const Icon = stayAmenityLucideIcon(a);
                    return (
                      <li key={a} className="flex items-center gap-2.5 text-sm text-ink break-words [overflow-wrap:anywhere]">
                        {Icon ? (
                          <Icon className="h-4 w-4 shrink-0 text-finland" aria-hidden strokeWidth={1.75} />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full bg-finland/15" aria-hidden />
                        )}
                        <span>{a === 'Wifi' ? 'Wi-Fi' : a}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {(() => {
              const primary = (s?.options ?? []).find((option) => !option.archived);
              const areas = (primary?.sleepingAreas ?? []).filter((area) => area.beds.length > 0);
              if (areas.length === 0) return null;
              return (
                <section>
                  <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3">Where you&apos;ll sleep</h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {areas.map((area) => {
                      const photos = primary?.roomPhotos?.find((row) => row.areaId === area.id)?.urls ?? [];
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
                          className="flex gap-3 overflow-hidden rounded-xl ring-1 ring-black/[0.08]"
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
                            <p className="mt-0.5 text-sm text-ink-muted leading-snug">{beds}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            <section className="border-t border-black/[0.08] pt-8">
              <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-finland" aria-hidden strokeWidth={2} />
                Check-in &amp; check-out
              </h2>
              <ul className="space-y-2 text-sm text-ink-muted">
                {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
                {s?.checkOutTime ? <li>Check-out by {s.checkOutTime}</li> : null}
                {stayArrivalMethodLabel(s?.arrivalMethod) ? (
                  <li>Arrival: {stayArrivalMethodLabel(s?.arrivalMethod)}</li>
                ) : null}
                {s?.arrivalNote ? <li>{s.arrivalNote}</li> : null}
                {(() => {
                  // Phase 1587: only times / missing-time honesty here — Trips email note lives on booking panel (1585/1586).
                  const missing = stayCheckInOutMissingCopy({
                    checkInTime: s?.checkInTime,
                    checkOutTime: s?.checkOutTime,
                  });
                  return missing ? <li>{missing}</li> : null;
                })()}
                <li className="text-ink-faint">
                  Access codes and the private arrival address are shared with confirmed guests after payment.
                </li>
              </ul>
            </section>

            {stayRestrictionLines(s?.restrictions).length > 0 || s?.houseRules ? (
              <section className="border-t border-black/[0.08] pt-8">
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3">House rules</h2>
                {stayRestrictionLines(s?.restrictions).length > 0 ? (
                  <ul className="mb-3 grid gap-2 sm:grid-cols-2">
                    {stayRestrictionLines(s?.restrictions).map((line) => (
                      <li
                        key={line}
                        className="rounded-lg px-3 py-2 text-sm text-ink-muted ring-1 ring-black/[0.06]"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s?.houseRules ? (
                  <p className="text-sm text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {s.houseRules}
                  </p>
                ) : null}
              </section>
            ) : null}

            {s?.exteriorCamera || (s?.safetyConsiderations?.length ?? 0) > 0 || s?.safetyNote ? (
              <section className="border-t border-black/[0.08] pt-8">
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-finland" aria-hidden strokeWidth={2} />
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

            <section className="border-t border-black/[0.08] pt-8">
              <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-2">Cancellation</h2>
              <p className="text-sm text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                {STAY_GUEST_CANCELLATION_POLICY}
              </p>
            </section>

            {hostName ? (
              <section className="border-t border-black/[0.08] pt-8">
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink mb-2">Host</h2>
                <p className="text-sm text-ink-muted">{hostName}</p>
              </section>
            ) : null}

            <div id="stay-reviews" className="border-t border-black/[0.08] pt-8">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-sans text-lg font-bold tracking-tight text-ink">Reviews</h2>
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
                  <p className="text-sm text-ink-muted mb-4">
                    <strong className="text-ink tabular-nums">{review.score}</strong>
                    <span className="text-ink-muted">
                      {' '}
                      ({review.count} {review.count === 1 ? 'review' : 'reviews'})
                    </span>
                  </p>
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
                <p className="text-ink-muted mb-4 max-w-xl leading-relaxed">
                  {LISTING_REVIEWS_EMPTY_COPY}
                </p>
              ) : null}
              <div className="space-y-6 mb-6">
                {reviews.slice(0, 3).map((r) => (
                  <div key={r.id} className="border-b border-black/[0.06] pb-6 last:border-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-ink">{r.guest_name}</span>
                      {r.verified ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Verified</span>
                      ) : null}
                      <span className="text-sm text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {/* Phase 1620: announce rating to assistive tech (Tour / reviews modal parity). */}
                    <div className="flex gap-1 mb-1" aria-label={`${r.rating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          size={16}
                          aria-hidden
                          className={i <= r.rating ? 'text-finland fill-finland' : 'text-ink-faint'}
                        />
                      ))}
                    </div>
                    {r.title ? (
                      <p className="font-medium text-ink mb-1 break-words [overflow-wrap:anywhere]">{r.title}</p>
                    ) : null}
                    <p className="text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.comment}</p>
                    {reviewReplies[r.id]?.reply_text ? (
                      <div className="mt-3 rounded-xl bg-finland/[0.04] px-3.5 py-3 ring-1 ring-finland/10">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland mb-1">
                          Response from the host
                        </p>
                        <p className="text-sm text-ink leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{reviewReplies[r.id]!.reply_text}</p>
                      </div>
                    ) : null}
                  </div>
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
          </div>

          <div className="min-w-0">
          <aside
            id="stay-booking-panel"
            role="region"
            aria-labelledby="stay-booking-panel-title"
            className="tv-booking-sticky tv-booking-sticky--fit lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))] h-fit scroll-mt-28"
          >
            <p
              id="stay-booking-panel-title"
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland"
            >
              {requestToBook ? 'Request to book' : 'Reserve'}
            </p>
            {/* Phase 1548: dates selected + failed quote — do not invent catalog nightly (1546 sticky parity). */}
            {/* Phase 1606: Price unavailable (Tour 1604 parity) instead of an em dash. */}
            {checkIn && checkOut && stayQuote && !stayQuote.ok ? (
              <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
                Price unavailable
              </p>
            ) : quoteOk && stayQuote?.ok ? (
              // Phase 1562: successful quote is the hero total (Tour 1561 / sticky 1546 parity — not catalog nightly).
              <div className="tv-quote-reveal">
                <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink leading-none">
                  {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
                </p>
                <p className="mt-1.5 text-sm text-ink-muted">
                  Total · {stayQuote.nights} night{stayQuote.nights === 1 ? '' : 's'}
                </p>
              </div>
            ) : nightly > 0 ? (
              <PriceHero
                amount={nightly}
                currency={currency}
                basis={minNights === 1 ? 'per night · 1 night minimum' : `per night · ${minNights} nights minimum`}
              />
            ) : (
              <p className="font-display text-2xl font-semibold text-ink">—</p>
            )}
            <div className="mt-4 space-y-3">
              <StayNightPicker
                id="stay-night-picker"
                checkIn={checkIn}
                checkOut={checkOut}
                occupiedNights={occupiedNights}
                todayIso={experienceTodayIso}
                minNights={minNights}
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
              <div className="mt-3">
                <NoticeCallout title="Minimum stay not met" tone="warn">
                  This stay requires at least {minNights === 1 ? '1 night' : `${minNights} nights`}. Extend check-out to
                  continue.
                </NoticeCallout>
              </div>
            ) : null}
            {selectionOccupied ? (
              <div className="mt-3">
                <NoticeCallout title="Those nights are taken" tone="danger">
                  Another traveler already has this stay on those dates. Choose a different range.
                </NoticeCallout>
              </div>
            ) : null}
            {quoteOk && stayQuote?.ok && stayQuote.offeredExtras.length > 0 ? (
              <div className="mt-4 space-y-2">
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
              <div className="mt-4 tv-quote-reveal">
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
                  // Phase 1657: release-on-expiry parity with tour checkout hold note.
                  holdNote={
                    requestToBook
                      ? `Authorized at checkout · host has ${STAY_REQUEST_APPROVAL_HOURS}h to accept before capture.`
                      : `Dates held ${CHECKOUT_HOLD_MINUTES} min after you continue to checkout.`
                  }
                />
              </div>
            ) : null}
            {stayQuote && !stayQuote.ok && checkIn && checkOut ? (
              <p className="mt-3 text-sm text-red-700">{userFacingError(stayQuote.error, USER_ERROR.checkout)}</p>
            ) : null}
            {quoteOk ? (
              <>
                <label className="mt-4 block text-sm font-medium text-ink" htmlFor="stay-guest-name">
                  Lead guest name
                </label>
                <input
                  id="stay-guest-name"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setPayError(null);
                  }}
                  className="tv-input mt-1 w-full"
                  placeholder="Name on the booking"
                />
                <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-guest-phone">
                  Phone <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input
                  id="stay-guest-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  enterKeyHint="done"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="tv-input mt-1 w-full"
                  placeholder="Arrival contact"
                />
                {occupancyError ? (
                  <p id="stay-occupancy-error" className="mt-3 text-sm text-red-700">
                    {occupancyError}{' '}
                    <button type="button" className="font-semibold text-finland hover:underline" onClick={() => reloadStayOccupancy()}>
                      Try again
                    </button>
                  </p>
                ) : null}
                {payError ? (
                  <p id="stay-pay-error" className="mt-3 text-sm text-red-700">
                    {payError}
                  </p>
                ) : null}
                <div className="mt-4">
                  <CheckoutConsentCheckbox
                    id="stay-checkout-consent"
                    checked={checkoutConsentAccepted}
                    onChange={(next) => {
                      setCheckoutConsentAccepted(next);
                      if (next) setPayError(null);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="tv-btn-primary w-full mt-4 disabled:opacity-50"
                  disabled={
                    paying ||
                    selectionOccupied ||
                    selfBookBlocked ||
                    maxGuests == null
                  }
                  aria-describedby={stayBookingAlertDescribedBy}
                  onClick={() => {
                    if (occupancyError) {
                      document.getElementById('stay-occupancy-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      return;
                    }
                    if (selectionOccupied || selfBookBlocked || maxGuests == null) return;
                    void startStayCheckout();
                  }}
                >
                  {stickyStayCtaLabel}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  {requestToBook
                    ? 'Authorized only until the host accepts — not confirmed or charged yet.'
                    : 'Totals are confirmed on the server before payment.'}
                  {!user ? (requestToBook ? ' Sign in to send your request.' : ' Sign in when prompted.') : ''}
                </p>
              </>
            ) : (
              <button
                type="button"
                className="tv-btn-primary w-full mt-4"
                onClick={() => focusStayQuoteFailure()}
              >
                {stickyStayCtaLabel}
              </button>
            )}
            <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint" title={STAY_LISTING_CONFIRMATION_NOTE}>
              {/* Phase 1586/1594: discreet TEST notice; full Trips copy in title for hover/screen readers. */}
              Checkout uses {STRIPE_TEST_UNTIL_LIVE}. Confirmed stays appear in Trips.
            </p>
          </aside>
          </div>
        </div>
      </div>
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
                        : 'Price unavailable'}
                </span>
                <span className="ml-1 font-sans text-sm font-medium text-ink-muted">
                  {quoteOk ? 'total' : checkIn && checkOut ? '' : 'per night'}
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
                disabled={
                  paying ||
                  selectionOccupied ||
                  selfBookBlocked ||
                  maxGuests == null
                }
                aria-describedby={stayBookingAlertDescribedBy}
                onClick={() => {
                  if (occupancyError) {
                    document.getElementById('stay-occupancy-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                  }
                  if (selectionOccupied || selfBookBlocked || maxGuests == null) return;
                  void startStayCheckout();
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

      {galleryLightboxOpen && hasStayGallery ? (
        <div
          ref={gallerySheetRef}
          className="tv-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Photo gallery"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (stayGalleryImages.length < 2) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setSelectedImage((i) => (i >= stayGalleryImages.length - 1 ? 0 : i + 1));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setSelectedImage((i) => (i <= 0 ? stayGalleryImages.length - 1 : i - 1));
            }
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <p className="text-sm font-medium tabular-nums">
              {Math.min(selectedImage, stayGalleryImages.length - 1) + 1} / {stayGalleryImages.length}
            </p>
            <button
              type="button"
              className="tv-gallery-lightbox__close"
              aria-label="Close"
              onClick={closeGalleryLightbox}
            >
              <X className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            {stayGalleryImages.length > 1 ? (
              <button
                type="button"
                className="tv-gallery-lightbox__nav absolute left-3 sm:left-6 z-10"
                aria-label="Previous photo"
                onClick={() =>
                  setSelectedImage((i) => (i <= 0 ? stayGalleryImages.length - 1 : i - 1))
                }
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <img
              src={stayGalleryImages[Math.min(selectedImage, stayGalleryImages.length - 1)]}
              alt=""
              className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {stayGalleryImages.length > 1 ? (
              <button
                type="button"
                className="tv-gallery-lightbox__nav absolute right-3 sm:right-6 z-10"
                aria-label="Next photo"
                onClick={() =>
                  setSelectedImage((i) => (i >= stayGalleryImages.length - 1 ? 0 : i + 1))
                }
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
          {stayGalleryImages.length > 1 ? (
            <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-6">
              {stayGalleryImages.map((img, index) => (
                <button
                  key={`lb-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-label={`Photo ${index + 1}`}
                  aria-current={selectedImage === index ? 'true' : undefined}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition-opacity ${
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
    </div>
  );
}
