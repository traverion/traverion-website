import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Home, Lock, MapPin } from 'lucide-react';
import type { TourPackage } from '../types/tour';
import { parseListingExtras } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { quoteStayNights, stayQuotePriceLines, experienceTodayIsoForListing } from '../lib/booking-quote';
import { fetchDiscountsByListingIds, type ListingDiscount } from '../data/supabase-discounts';
import {
  createBookingCheckoutSession,
  fetchPublishedStayBlockedNights,
  fetchPublishedStayOccupiedRanges,
} from '../data/supabase-bookings';
import { stayDateRangesOverlap, occupiedNightsFromStayRanges, nightsOccupiedByStay } from '../lib/stayOccupancy';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown from '../components/PriceBreakdown';
import StayNightPicker from '../components/StayNightPicker';
import StayGuestPartySelector from '../components/booking/StayGuestPartySelector';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import NoticeCallout from '../components/NoticeCallout';
import { normalizeStayGuestPolicy, type StayGuestParty } from '../lib/stay-guest-party';
import { stayArrivalMethodLabel } from '../lib/stay-arrival';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { stayCheckoutLeadGuestNameReady } from '../lib/stay-checkout-guest';
import { stayStickyBookCtaLabel } from '../lib/stay-sticky-cta';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { STAY_REQUEST_APPROVAL_HOURS } from '../lib/stay-booking-method';
import { STRIPE_TEST_UNTIL_LIVE } from '../lib/booking-confirmation-copy';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import {
  createCheckoutTiming,
  logCheckoutInitiationTiming,
  mergeCheckoutTimings,
} from '../lib/checkout-initiation-timing';
import {
  travelerLeadGuestNameFromAuth,
  travelerLeadGuestPhoneFromAuth,
  type TravelerCheckoutAuthMetadata,
} from '../lib/traveler-checkout-autofill';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import {
  buildStayCheckoutHref,
  buildStayListingHref,
  type StayCheckoutState,
} from '../lib/stayCheckoutUrl';
import { trackListingTraffic } from '../lib/listing-traffic';

type Props = {
  stay: TourPackage;
  initial: StayCheckoutState;
  onBackToListing: (state: StayCheckoutState) => void;
};

export default function StayBookingConfirm({ stay, initial, onBackToListing }: Props) {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [party, setParty] = useState<StayGuestParty>({
    adults: initial.adults,
    children: initial.children,
    infants: initial.infants,
  });
  const [editingDates, setEditingDates] = useState(false);
  const [editingGuests, setEditingGuests] = useState(false);
  const [discounts, setDiscounts] = useState<ListingDiscount[]>([]);
  const [occupiedRanges, setOccupiedRanges] = useState<{ checkIn: string; checkOut: string }[]>([]);
  const [blockedNights, setBlockedNights] = useState<string[]>([]);
  const [occupancyError, setOccupancyError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [checkoutConsentAccepted, setCheckoutConsentAccepted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentCancelledNote, setPaymentCancelledNote] = useState(
    initial.paymentCancelled
      ? 'Checkout was cancelled. Your stay details are still here — you were not charged.'
      : null
  );
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const checkoutLockRef = useRef(false);

  const extras = parseListingExtras(stay.listingExtras);
  const s = extras.stay;
  const experienceTodayIso = experienceTodayIsoForListing(extras.departureTimezone);
  const guestPolicy = normalizeStayGuestPolicy(s?.guestPolicy);
  const maxGuests =
    typeof s?.maxGuests === 'number' && Number.isFinite(s.maxGuests) && s.maxGuests >= 1
      ? Math.floor(s.maxGuests)
      : null;
  const minNights = s?.minNights ?? 1;
  const requestToBook = s?.bookingMethod === 'request';
  const hero = listingHeroImageSrc(stay.image);
  const currency = normalizeCurrency(stay.price.currency);

  const stayQuote = quoteStayNights({
    tour: stay,
    checkIn,
    checkOut,
    guests: party.adults,
    party,
    discounts,
    todayIso: experienceTodayIso,
  });
  const quoteOk = stayQuote.ok === true;

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

  const syncUrl = useCallback(
    (next: StayCheckoutState, mode: 'push' | 'replace' = 'replace') => {
      const href = buildStayCheckoutHref(stay.id, next);
      if (mode === 'push') window.history.pushState({}, '', href);
      else window.history.replaceState({}, '', href);
    },
    [stay.id]
  );

  useEffect(() => {
    syncUrl(
      {
        checkIn,
        checkOut,
        adults: party.adults,
        children: party.children,
        infants: party.infants,
        paymentCancelled: false,
      },
      'replace'
    );
  }, [checkIn, checkOut, party.adults, party.children, party.infants, syncUrl]);

  useEffect(() => {
    let cancelled = false;
    void fetchDiscountsByListingIds([stay.id]).then((map) => {
      if (!cancelled) setDiscounts(map.get(stay.id) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [stay.id]);

  const reloadOccupancy = useCallback(() => {
    let cancelled = false;
    setOccupancyError(null);
    void Promise.all([
      fetchPublishedStayOccupiedRanges(stay.id),
      fetchPublishedStayBlockedNights(stay.id),
    ])
      .then(([ranges, blocked]) => {
        if (cancelled) return;
        setOccupiedRanges(ranges);
        setBlockedNights(blocked);
      })
      .catch((e) => {
        if (cancelled) return;
        setOccupancyError(
          userFacingError(e, 'We could not check stay availability. Check your connection and try again.')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [stay.id]);

  useEffect(() => reloadOccupancy(), [reloadOccupancy]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void fetchConsumerProfileRow(user.id).then((row) => {
      if (cancelled || !row) return;
      setProfileDisplayName(row.display_name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (guestName.trim()) return;
    const meta = user?.user_metadata as TravelerCheckoutAuthMetadata | undefined;
    const name = travelerLeadGuestNameFromAuth({
      consumerDisplayName: profileDisplayName,
      metadata: meta,
    });
    if (name) setGuestName(name);
    const phone = travelerLeadGuestPhoneFromAuth({ metadata: meta });
    if (phone && !guestPhone.trim()) setGuestPhone(phone);
  }, [user, profileDisplayName, guestName, guestPhone]);

  useEffect(() => {
    let cancelled = false;
    if (!stay.supplierId || !user?.id) {
      setSelfBookBlocked(false);
      setSelfBookCheckFailed(false);
      return;
    }
    void viewerIsListingSupplierSide(user.id, stay.supplierId)
      .then((blocked) => {
        if (cancelled) return;
        setSelfBookBlocked(blocked);
        setSelfBookCheckFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSelfBookCheckFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [stay.supplierId, user?.id]);

  const ctaLabel = stayStickyBookCtaLabel({
    selectionOccupied,
    paying,
    quoteOk,
    checkIn,
    checkOut,
    quoteError: stayQuote && !stayQuote.ok ? stayQuote.error : null,
    minNights,
    occupancyUnavailable: Boolean(occupancyError),
    selfBookBlocked,
    selfBookCheckFailed,
    requestToBook,
    surface: 'confirmation',
  });

  const currentState = (): StayCheckoutState => ({
    checkIn,
    checkOut,
    adults: party.adults,
    children: party.children,
    infants: party.infants,
    paymentCancelled: false,
  });

  const startPayment = async () => {
    if (!quoteOk || !stayQuote.ok) return;
    if (checkoutPayBlockedByConsent(checkoutConsentAccepted)) {
      setPayError(null);
      document.getElementById('stay-book-consent')?.focus();
      return;
    }
    if (occupancyError) {
      setPayError('We could not verify availability. Try again before paying.');
      return;
    }
    if (selectionOccupied) {
      setPayError('Those dates were just taken. Choose different dates to continue.');
      return;
    }
    if (!stayCheckoutLeadGuestNameReady(guestName)) {
      setPayError('Enter the lead guest name so the host knows who is arriving.');
      document.getElementById('stay-book-guest-name')?.focus();
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
    if (isSupabaseConfigured() && !userRef.current) {
      requestAuth({
        intent: 'checkout',
        onSuccess: () => {
          void (async () => {
            if (supabase) {
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session?.user) userRef.current = sessionData.session.user;
            }
            void startPayment();
          })();
        },
      });
      return;
    }
    if (checkoutLockRef.current || paying) return;
    checkoutLockRef.current = true;
    setPaying(true);
    setPayError(null);
    setPaymentCancelledNote(null);
    const timing = createCheckoutTiming();
    timing.mark('client_ready');
    reloadOccupancy();
    trackListingTraffic(stay.id, 'book_start');
    const cancelPath = buildStayCheckoutHref(stay.id, {
      ...currentState(),
      paymentCancelled: true,
    });
    timing.mark('edge_invoke');
    void createBookingCheckoutSession({
      listingId: stay.id,
      listingTitle: stay.title,
      bookingDate: stayQuote.checkIn,
      checkoutDate: stayQuote.checkOut,
      guests: stayQuote.guests,
      guestBreakdown: stayQuote.guestBreakdown,
      stayParty: party,
      customerName: guestName.trim(),
      customerPhone: guestPhone.trim() || undefined,
      currency: stayQuote.currency,
      expectedTotal: stayQuote.totalAmount,
      checkoutConsentAccepted: true,
      successPath: '/booking-confirmed',
      cancelPath,
    })
      .then((res) => {
        timing.mark('edge_returned');
        logCheckoutInitiationTiming(mergeCheckoutTimings(timing.snapshot(), res.timings), {
          ok: Boolean(res.success && res.checkoutUrl),
        });
        if (!res.success || !res.checkoutUrl) {
          if (res.code === 'quote_changed' && typeof res.quotedTotal === 'number') {
            setPayError(
              `The total updated to ${formatMoney(res.quotedTotal, res.currency ?? stayQuote.currency)}. Review the new price before continuing — you were not charged.`
            );
          } else {
            setPayError(userFacingError(res.error, 'Checkout could not start. You were not charged.'));
          }
          setPaying(false);
          checkoutLockRef.current = false;
          return;
        }
        if (
          typeof res.quotedTotal === 'number' &&
          Math.round(res.quotedTotal * 100) !== Math.round(stayQuote.totalAmount * 100)
        ) {
          setPayError(
            `The total updated to ${formatMoney(res.quotedTotal, res.currency ?? stayQuote.currency)}. Review the new price before continuing — you were not charged.`
          );
          setPaying(false);
          checkoutLockRef.current = false;
          return;
        }
        try {
          timing.mark('redirect');
          window.location.assign(res.checkoutUrl);
        } catch {
          setPayError('Could not open Stripe Checkout. Try again — you were not charged.');
          setPaying(false);
          checkoutLockRef.current = false;
        }
      })
      .catch((err) => {
        timing.mark('edge_error');
        logCheckoutInitiationTiming(timing.snapshot(), { ok: false });
        setPayError(userFacingError(err, 'Checkout could not start. You were not charged.'));
        setPaying(false);
        checkoutLockRef.current = false;
      });
  };

  const destination =
    [stay.city, stay.region, stay.country].filter(Boolean).join(', ') || stay.destination || null;

  const summary = quoteOk && stayQuote.ok ? (
    <div className="space-y-4">
      <div className="flex gap-3">
        {hero ? (
          <img src={hero} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] ring-1 ring-black/[0.06]">
            <Home className="h-6 w-6 text-ink-faint" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-base font-semibold tracking-tight text-ink">{stay.title}</p>
          {destination ? <p className="mt-0.5 truncate text-sm text-ink-muted">{destination}</p> : null}
          <p className="mt-1 text-sm text-ink-muted">
            {stayQuote.nights} night{stayQuote.nights === 1 ? '' : 's'} · {stayQuote.guests}{' '}
            {stayQuote.guests === 1 ? 'guest' : 'guests'}
          </p>
        </div>
      </div>
      <PriceBreakdown
        currency={stayQuote.currency}
        lines={stayQuotePriceLines(stayQuote)}
        total={stayQuote.totalAmount}
        holdNote={
          requestToBook
            ? `Authorized at checkout · host has ${STAY_REQUEST_APPROVAL_HOURS}h to accept.`
            : 'Dates stay available until payment succeeds.'
        }
      />
      <p className="text-xs leading-relaxed text-ink-muted">
        {listingShowsFreeCancellation(stay)
          ? 'Free cancellation available — see the listing policy for deadlines.'
          : 'Cancellation terms apply as shown on this listing.'}
      </p>
    </div>
  ) : (
    <p className="text-sm text-red-700">
      {stayQuote && !stayQuote.ok ? userFacingError(stayQuote.error, USER_ERROR.checkout) : 'Price unavailable'}
    </p>
  );

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-white">
      <header className="shrink-0 border-b border-black/[0.08] bg-white pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => onBackToListing(currentState())}
            className="lux-flat inline-flex h-11 min-w-0 items-center gap-2 rounded-md pr-2 text-ink"
          >
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain" />
            <span className="font-sans text-[13px] font-bold tracking-tight">Traverion</span>
            <span className="sr-only">Back to stay</span>
          </button>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
            Secure checkout
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {paymentCancelledNote ? (
            <div className="mb-5">
              <NoticeCallout title="Checkout cancelled" tone="warn">
                {paymentCancelledNote}
              </NoticeCallout>
            </div>
          ) : null}

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-10">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onBackToListing(currentState())}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to stay
              </button>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
                Complete your reservation
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted sm:text-base">
                Review your stay details before continuing to secure payment.
              </p>

              <section className="mt-6 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-ink">Your stay</h2>
                <div className="mt-3 flex gap-3">
                  {hero ? (
                    <img
                      src={hero}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-ink">{stay.title}</p>
                    {destination ? (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {destination}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">Dates</h2>
                  <button
                    type="button"
                    className="text-sm font-semibold text-finland hover:underline"
                    onClick={() => setEditingDates((v) => !v)}
                  >
                    {editingDates ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editingDates ? (
                  <div className="mt-3">
                    <StayNightPicker
                      id="stay-book-dates"
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
                ) : (
                  <p className="mt-2 text-sm text-ink">
                    {checkIn} → {checkOut}
                    {quoteOk && stayQuote.ok
                      ? ` · ${stayQuote.nights} night${stayQuote.nights === 1 ? '' : 's'}`
                      : ''}
                  </p>
                )}
              </section>

              <section className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">Guests</h2>
                  <button
                    type="button"
                    className="text-sm font-semibold text-finland hover:underline"
                    onClick={() => setEditingGuests((v) => !v)}
                  >
                    {editingGuests ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editingGuests ? (
                  <div className="mt-3">
                    <StayGuestPartySelector
                      id="stay-book-guests"
                      party={party}
                      policy={guestPolicy}
                      maxGuests={maxGuests}
                      onChange={(next) => {
                        setParty(next);
                        setPayError(null);
                      }}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink">
                    {party.adults} adult{party.adults === 1 ? '' : 's'}
                    {party.children > 0 ? ` · ${party.children} child${party.children === 1 ? '' : 'ren'}` : ''}
                    {party.infants > 0 ? ` · ${party.infants} infant${party.infants === 1 ? '' : 's'}` : ''}
                  </p>
                )}
              </section>

              <section className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-ink">Contact information</h2>
                <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-book-guest-name">
                  Lead guest name
                </label>
                <input
                  id="stay-book-guest-name"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setPayError(null);
                  }}
                  className="tv-input mt-1 w-full"
                  placeholder="Name on the booking"
                />
                <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-book-guest-email">
                  Email
                </label>
                <input
                  id="stay-book-guest-email"
                  type="email"
                  autoComplete="email"
                  value={user?.email ?? ''}
                  readOnly
                  className="tv-input mt-1 w-full bg-black/[0.02] text-ink-muted"
                  placeholder={user ? undefined : 'Sign in to confirm your email'}
                />
                <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-book-guest-phone">
                  Phone <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input
                  id="stay-book-guest-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="tv-input mt-1 w-full"
                  placeholder="Arrival contact"
                />
              </section>

              {(s?.checkInTime || s?.checkOutTime || stayArrivalMethodLabel(s?.arrivalMethod) || s?.arrivalNote) && (
                <section className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-ink">Arrival information</h2>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
                    {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
                    {s?.checkOutTime ? <li>Checkout by {s.checkOutTime}</li> : null}
                    {stayArrivalMethodLabel(s?.arrivalMethod) ? (
                      <li>Arrival: {stayArrivalMethodLabel(s?.arrivalMethod)}</li>
                    ) : null}
                    {s?.arrivalNote ? <li>{s.arrivalNote}</li> : null}
                  </ul>
                </section>
              )}

              <section className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-ink">Cancellation & terms</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {listingShowsFreeCancellation(stay)
                    ? 'Free cancellation is available for this stay — check the listing policy for the exact deadline.'
                    : 'Review the cancellation policy on the listing before you pay.'}
                </p>
                <div className="mt-3">
                  <CheckoutConsentCheckbox
                    id="stay-book-consent"
                    checked={checkoutConsentAccepted}
                    onChange={(next) => {
                      setCheckoutConsentAccepted(next);
                      if (next) setPayError(null);
                    }}
                  />
                </div>
              </section>

              <div className="mt-4 lg:hidden rounded-2xl border border-black/[0.08] bg-white p-4">{summary}</div>

              {occupancyError ? (
                <p className="mt-4 text-sm text-red-700">
                  {occupancyError}{' '}
                  <button type="button" className="font-semibold text-finland hover:underline" onClick={() => reloadOccupancy()}>
                    Try again
                  </button>
                </p>
              ) : null}
              {payError ? <p className="mt-4 text-sm text-red-700">{payError}</p> : null}

              <button
                type="button"
                className="tv-btn-primary mt-5 w-full disabled:opacity-50"
                disabled={
                  paying ||
                  !quoteOk ||
                  selectionOccupied ||
                  selfBookBlocked ||
                  maxGuests == null ||
                  checkoutPayBlockedByConsent(checkoutConsentAccepted)
                }
                onClick={() => void startPayment()}
              >
                {checkoutPayBlockedByConsent(checkoutConsentAccepted) && quoteOk
                  ? 'Accept terms to continue'
                  : ctaLabel}
              </button>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                {STRIPE_TEST_UNTIL_LIVE} · the total is confirmed on the server before payment
              </p>
            </div>

            <aside className="mt-8 hidden lg:sticky lg:top-6 lg:mt-0 lg:block">
              <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_12px_32px_-18px_rgba(15,23,42,0.22)]">
                <p className="tv-eyebrow mb-3">Booking summary</p>
                {summary}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export function stayBookingConfirmListingHref(stayId: string, state: StayCheckoutState): string {
  return buildStayListingHref(stayId, state);
}
