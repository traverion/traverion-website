import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MapPin, Heart, Star } from 'lucide-react';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { parseListingExtras, TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingIsFamily } from '../lib/inventory';
import { listingDetailVisibleToTraveler } from '../lib/product-workflows';
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
import GuestStepper from '../components/booking/GuestStepper';
import { ListingReviewsModal } from '../components/ListingReviewsModal';
import NoticeCallout from '../components/NoticeCallout';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { CHECKOUT_HOLD_MINUTES } from '../lib/booking-hold';
import { formatOccupiedNightRanges, formatStayNightHuman, upcomingOccupiedNights } from '../lib/stay-calendar';
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
import { isSupabaseConfigured } from '../lib/supabase';
import { isSupabaseListingId } from '../lib/discount-display';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import {
  travelerLeadGuestNameFromAuth,
  travelerLeadGuestPhoneFromAuth,
  type TravelerCheckoutAuthMetadata,
} from '../lib/traveler-checkout-autofill';
import { fetchWishlistListingIds, toggleWishlist } from '../data/supabase-wishlist';

type Props = {
  stayId: string;
  onBack: () => void;
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

export default function StayDetails({ stayId, onBack }: Props) {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [stay, setStay] = useState<TourPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(() => readStayPrefill().checkIn);
  const [checkOut, setCheckOut] = useState(() => readStayPrefill().checkOut);
  const [guests, setGuests] = useState(() => readStayPrefill().guests);
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
  const [occupancyLoaded, setOccupancyLoaded] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStay(null);
    setOccupiedRanges([]);
    setBlockedNights([]);
    setOccupancyError(null);
    setOccupancyLoaded(false);
    void getListingByIdAsync(stayId)
      .then((row) => {
        if (cancelled) return;
        const found = row ?? getListingById(stayId) ?? null;
        if (
          !found ||
          !listingDetailVisibleToTraveler({ familyMatches: listingIsFamily(found, 'stay'), status: found.status })
        ) {
          setStay(null);
          setError(USER_ERROR.stayMissing);
          return;
        }
        setStay(found);
      })
      .catch((e) => {
        if (cancelled) return;
        setStay(null);
        setError(userFacingError(e, USER_ERROR.stay));
      });
    return () => {
      cancelled = true;
    };
  }, [stayId]);

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
    if (!user) {
      requestAuth({ onSuccess: () => void run() });
      return;
    }
    void run();
  }, [stay?.id, user, requestAuth, savedToWishlist]);

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
      const name = row?.company_legal_name?.trim() || row?.display_name?.trim() || null;
      setHostName(name);
    });
  }, [stay?.supplierId]);

  const reloadStayOccupancy = useCallback(() => {
    if (!stay?.id) {
      setOccupiedRanges([]);
      setBlockedNights([]);
      setOccupancyError(null);
      setOccupancyLoaded(false);
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
        setOccupancyLoaded(true);
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
  const stayQuote = stay
    ? quoteStayNights({
        tour: stay,
        checkIn,
        checkOut,
        guests,
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
  // Phase 1512: Availability prose lists only nights still bookable against.
  const upcomingBookedNights = useMemo(
    () => upcomingOccupiedNights(bookedNights, experienceTodayIso),
    [bookedNights, experienceTodayIso]
  );
  const upcomingBlockedNights = useMemo(
    () => upcomingOccupiedNights(blockedNights, experienceTodayIso),
    [blockedNights, experienceTodayIso]
  );
  const selectionOccupied =
    checkIn && checkOut
      ? occupiedRanges.some((r) => stayDateRangesOverlap(checkIn, checkOut, r.checkIn, r.checkOut)) ||
        nightsOccupiedByStay(checkIn, checkOut).some((n) => blockedNights.includes(n))
      : false;
  const hero = stay ? listingHeroImageSrc(stay.image) : undefined;

  useEffect(() => {
    if (maxGuests == null) return;
    setGuests((g) => Math.min(maxGuests, Math.max(1, g)));
  }, [maxGuests]);

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
    if (checkoutPayBlockedByConsent(checkoutConsentAccepted)) {
      setPayError('Confirm the cancellation policy and Terms before paying.');
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
    if (isSupabaseConfigured() && !user) {
      requestAuth({
        onSuccess: () => {
          window.setTimeout(() => {
            void startStayCheckout();
          }, 0);
        },
      });
      return;
    }
    // Phase 1147: mirror checkout edge — don't open Stripe for own/team listings.
    if (isSupabaseConfigured() && user?.id) {
      try {
        const selfBook = await viewerIsListingSupplierSide(user.id, stay.supplierId);
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
      customerName: name,
      customerPhone: guestPhone.trim() || undefined,
      currency: stayQuote.currency,
      checkoutConsentAccepted: true,
      successPath: '/booking-confirmed',
      cancelPath: '/bookings?payment=cancelled',
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
            back={{ onClick: onBack, label: 'Back to stays' }}
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
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="lux-flat inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-2 rounded-full bg-paper-raised px-3.5 text-sm font-medium text-ink ring-1 ring-black/[0.06] hover:bg-black/[0.03]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Stays
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

        <div className="mb-6 sm:mb-8">
          {hero || gallery.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[26rem]">
              {hero ? (
                <div className="relative overflow-hidden rounded-2xl bg-ink/10 lg:col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto">
                  <img
                    src={hero}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              ) : null}
              {(hero ? gallery : gallery.slice(1)).slice(0, hero ? 4 : 5).map((url) => (
                <div
                  key={url}
                  className="relative hidden overflow-hidden rounded-xl bg-ink/10 aspect-[4/3] lg:block"
                >
                  <img
                    src={listingHeroImageSrc(url) ?? url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              ))}
              {gallery.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden -mx-1 px-1 snap-x snap-mandatory">
                  {gallery.slice(0, 6).map((url) => (
                    <div
                      key={`m-${url}`}
                      className="relative w-[42%] shrink-0 snap-start overflow-hidden rounded-xl aspect-[4/3]"
                    >
                      <img
                        src={listingHeroImageSrc(url) ?? url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mb-3 flex h-56 w-full items-center justify-center rounded-3xl bg-ink/[0.06] ring-1 ring-black/[0.06]">
              <p className="px-4 text-center text-sm text-ink-muted">No photos yet for this stay</p>
            </div>
          )}
        </div>

        <header className="mb-6 max-w-3xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-finland/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland ring-1 ring-finland/15">
              Stay
            </span>
            {s?.propertyType?.trim() ? (
              <span className="inline-flex items-center rounded-md bg-paper-raised px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-black/[0.06]">
                {s.propertyType.trim()}
              </span>
            ) : null}
            <p className="text-ink-muted flex items-center gap-2 text-sm m-0">
              <MapPin className="w-4 h-4 text-finland" aria-hidden />
              {[stay.city, stay.country].filter(Boolean).join(', ') || stay.destination}
            </p>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] text-ink tracking-tight mb-4 break-words [overflow-wrap:anywhere] leading-[1.15]">
            {stay.title}
          </h1>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-paper-raised/80 px-4 py-4 sm:grid-cols-4 sm:px-5 ring-1 ring-black/[0.04]">
            {typeof s?.maxGuests === 'number' ? (
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Guests</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">Up to {s.maxGuests}</dd>
              </div>
            ) : null}
            {typeof s?.bedrooms === 'number' ? (
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Bedrooms</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{s.bedrooms}</dd>
              </div>
            ) : null}
            {typeof s?.beds === 'number' ? (
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Beds</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{s.beds}</dd>
              </div>
            ) : null}
            {typeof s?.bathrooms === 'number' ? (
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Baths</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{s.bathrooms}</dd>
              </div>
            ) : null}
          </dl>
          {/* Phase 1557: dates + failed quote — do not invent catalog nightly in page hero (1546/1548). */}
          {checkIn && checkOut && stayQuote && !stayQuote.ok ? (
            <p className="mt-4 text-lg font-semibold tabular-nums text-ink">—</p>
          ) : quoteOk && stayQuote?.ok ? (
            // Phase 1563: successful quote is the page hero total (panel 1562 / sticky 1546 parity).
            <p className="mt-4 text-lg font-semibold tabular-nums text-ink">
              {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
              <span className="ml-1 text-sm font-medium text-ink-muted">total</span>
            </p>
          ) : nightly > 0 ? (
            <p className="mt-4 text-lg font-semibold tabular-nums text-ink">
              {formatMoney(nightly, currency)}
              <span className="ml-1 text-sm font-medium text-ink-muted">per night</span>
            </p>
          ) : null}
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 lg:gap-10 pb-24 lg:pb-0">
          <div className="space-y-4 text-[15px] leading-relaxed text-ink">
            {stay.description ? (
              <div className="tv-card p-4 sm:p-5">
                <h2 className="font-display text-xl mb-2">The place</h2>
                <p className="text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {stay.description}
                </p>
              </div>
            ) : null}
            <div className="tv-card p-4 sm:p-5">
              <h2 className="font-display text-xl mb-2">About this place</h2>
              <ul className="space-y-2 text-ink-muted">
              {s?.propertyType ? <li>{s.propertyType}</li> : null}
              {typeof s?.maxGuests === 'number' ? (
                <li>Up to {s.maxGuests} guests</li>
              ) : null}
              {typeof s?.bedrooms === 'number' ? (
                <li>{s.bedrooms === 1 ? '1 bedroom' : `${s.bedrooms} bedrooms`}</li>
              ) : null}
              {typeof s?.beds === 'number' ? <li>{s.beds === 1 ? '1 bed' : `${s.beds} beds`}</li> : null}
              {typeof s?.bathrooms === 'number' ? (
                <li>{s.bathrooms === 1 ? '1 bath' : `${s.bathrooms} baths`}</li>
              ) : null}
              </ul>
            </div>
            {amenities.length > 0 ? (
              <div className="rounded-2xl bg-finland/[0.06] p-5 sm:p-6 ring-1 ring-finland/15">
                <h2 className="font-display text-xl mb-2">Amenities</h2>
                <ul className="flex flex-wrap gap-2">
                  {amenities.map((a) => (
                    <li key={a} className="rounded-full bg-paper-raised px-3 py-1.5 text-sm text-ink ring-1 ring-black/[0.05] break-words [overflow-wrap:anywhere]">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <h2 className="font-display text-xl mb-2">Availability</h2>
              <p className="text-ink-muted leading-relaxed">
                Minimum stay {minNights === 1 ? '1 night' : `${minNights} nights`}
                {typeof s?.maxGuests === 'number' ? ` · up to ${s.maxGuests} guests` : ''}.
                Checkout night is not occupied. If you pick nights that are already taken, booking is refused.
              </p>
              {upcomingBookedNights.length > 0 ? (
                <p className="mt-3 text-sm text-ink">
                  Booked: {formatOccupiedNightRanges(upcomingBookedNights.slice(0, 24))}
                  {upcomingBookedNights.length > 24 ? '…' : ''}
                </p>
              ) : null}
              {upcomingBlockedNights.length > 0 ? (
                <p className={`text-sm text-ink ${upcomingBookedNights.length > 0 ? 'mt-1.5' : 'mt-3'}`}>
                  Host blocked: {formatOccupiedNightRanges(upcomingBlockedNights.slice(0, 24))}
                  {upcomingBlockedNights.length > 24 ? '…' : ''}
                </p>
              ) : null}
              {occupancyLoaded && !occupancyError && upcomingBookedNights.length === 0 && upcomingBlockedNights.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">
                  No nights are taken yet. Choose check-in and check-out on the booking panel.
                </p>
              ) : occupancyError && upcomingBookedNights.length === 0 && upcomingBlockedNights.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">
                  We could not verify which nights are taken. Use Try again in the booking panel before you pay.
                </p>
              ) : !occupancyLoaded && !occupancyError && isSupabaseConfigured() ? (
                <p className="mt-3 text-sm text-ink-muted">Checking which nights are taken…</p>
              ) : null}
            </div>
            <div>
              <h2 className="font-display text-xl mb-2">Check-in & check-out</h2>
              <ul className="space-y-2 text-ink-muted">
                {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
                {s?.checkOutTime ? <li>Check-out by {s.checkOutTime}</li> : null}
                {(() => {
                  // Phase 1587: only times / missing-time honesty here — Trips email note lives on booking panel (1585/1586).
                  const missing = stayCheckInOutMissingCopy({
                    checkInTime: s?.checkInTime,
                    checkOutTime: s?.checkOutTime,
                  });
                  return missing ? <li>{missing}</li> : null;
                })()}
              </ul>
            </div>
            {s?.houseRules ? (
              <div>
                <h2 className="font-display text-xl mb-2">House rules</h2>
                <p className="text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{s.houseRules}</p>
              </div>
            ) : null}
            <div>
              <h2 className="font-display text-xl mb-2">Cancellation</h2>
              <p className="text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                {stay.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
              </p>
            </div>
            {hostName ? (
              <div>
                <h2 className="font-display text-xl mb-2">Host</h2>
                <p className="text-ink-muted">{hostName}</p>
              </div>
            ) : null}

            <div id="stay-reviews">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-display text-xl">Reviews</h2>
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
                <button type="button" onClick={() => setShowReviewForm(true)} className="tv-btn-secondary">
                  Leave a review
                </button>
              ) : null}
              {showReviewForm && user ? (
                <div className="max-w-xl">
                  <h3 className="font-display text-lg text-ink mb-3">Write a review</h3>
                  <div className="space-y-3">
                    <div>
                      <label id="stay-review-rating-label" className="block text-sm font-medium text-ink mb-1">
                        Rating
                      </label>
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
                              size={24}
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
                        onChange={(e) => setReviewComment(e.target.value)}
                        rows={3}
                        className="tv-input"
                        placeholder="Tell others what you liked…"
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

          <aside
            id="stay-booking-panel"
            role="region"
            aria-labelledby="stay-booking-panel-title"
            className="lg:sticky lg:top-24 h-fit scroll-mt-24 rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft-lg ring-1 ring-black/[0.06]"
          >
            <p
              id="stay-booking-panel-title"
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland"
            >
              Book this stay
            </p>
            {/* Phase 1548: dates selected + failed quote — do not invent catalog nightly (1546 sticky parity). */}
            {/* Phase 1606: Price unavailable (Tour 1604 parity) instead of an em dash. */}
            {checkIn && checkOut && stayQuote && !stayQuote.ok ? (
              <p className="text-lg font-semibold tabular-nums text-ink">Price unavailable</p>
            ) : quoteOk && stayQuote?.ok ? (
              // Phase 1562: successful quote is the hero total (Tour 1561 / sticky 1546 parity — not catalog nightly).
              <p className="text-lg font-semibold tabular-nums text-ink">
                {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
              </p>
            ) : nightly > 0 ? (
              <PriceHero
                amount={nightly}
                currency={currency}
                basis={minNights === 1 ? 'per night · 1 night minimum' : `per night · ${minNights} nights minimum`}
              />
            ) : (
              <p className="text-lg font-semibold text-ink">—</p>
            )}
            <div className="mt-4">
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
            </div>
            <p className="mt-3 text-sm text-ink">
              {checkIn ? formatStayNightHuman(checkIn) : 'Check-in'}
              {' → '}
              {checkOut ? formatStayNightHuman(checkOut) : 'Check-out'}
            </p>
            <div className="mt-3">
              <GuestStepper
                id="stay-guests"
                value={guests}
                min={1}
                max={maxGuests ?? 0}
                // Phase 1320: unknown stay capacity ≠ “No seats left on this departure”.
                hint={maxGuests == null ? null : undefined}
                ariaDescribedBy={maxGuests == null ? 'stay-guest-capacity-unavailable' : undefined}
                onChange={(next) => {
                  setGuests(next);
                  setPayError(null);
                }}
                label="Guests"
              />
              {maxGuests == null ? (
                <p id="stay-guest-capacity-unavailable" className="mt-2 text-sm text-red-700">
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
            {quoteOk && stayQuote?.ok ? (
              <div className="mt-4">
                <PriceBreakdown
                  currency={stayQuote.currency}
                  lines={stayQuotePriceLines(stayQuote)}
                  total={stayQuote.totalAmount}
                  holdNote={`Nights are held for ${CHECKOUT_HOLD_MINUTES} minutes after you continue to Stripe.`}
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
                <p className="mt-3 text-xs text-ink-muted leading-relaxed">
                  Price is confirmed on the server. If checkout cannot start, you will see an error — never a fake success.
                  {!user ? ' Sign in when prompted — you are not charged until Stripe confirms payment.' : ''}
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
            <p className="mt-3 text-xs text-ink-muted leading-relaxed">
              {/* Phase 1586/1594: STAY_LISTING includes Trips disclaimer; Stripe TEST as its own clause. */}
              {STAY_LISTING_CONFIRMATION_NOTE} Checkout uses {STRIPE_TEST_UNTIL_LIVE}.
            </p>
          </aside>
        </div>
      </div>
      {createPortal(
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-black/[0.06] bg-paper-raised/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full min-w-0 max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                <span className="font-semibold tabular-nums">
                  {/* Phase 1546: never invent catalog nightly when quoteStayNights failed (Tour 1545 / Stay 1520 parity). */}
                  {/* Phase 1606: Price unavailable on sticky (Tour 1604 parity). */}
                  {quoteOk
                    ? formatMoney(total, currency)
                    : checkIn && checkOut
                      ? 'Price unavailable'
                      : nightly > 0
                        ? formatMoney(nightly, currency)
                        : '—'}
                </span>
                <span className="text-ink-muted">
                  {' '}
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
    </div>
  );
}
