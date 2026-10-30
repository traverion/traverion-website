import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Mail, MapPin, Phone, User } from 'lucide-react';
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
import CheckoutPageShell, { CHECKOUT_TWO_COL } from '../components/checkout/CheckoutPageShell';
import NoticeCallout from '../components/NoticeCallout';
import { normalizeStayGuestPolicy, type StayGuestParty } from '../lib/stay-guest-party';
import { stayArrivalMethodLabel } from '../lib/stay-arrival';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { stayCheckoutLeadGuestNameReady } from '../lib/stay-checkout-guest';
import { stayStickyBookCtaLabel } from '../lib/stay-sticky-cta';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { STAY_REQUEST_APPROVAL_HOURS } from '../lib/stay-booking-method';
import { stripeTestPaymentDisclosure } from '../lib/traveler-env-presentation';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
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
import { formatStayNightHuman } from '../lib/stay-calendar';
import { stayCheckInHmForDate, stayFreeCancelDeadlineCopy } from '../lib/stay-free-cancel-deadline';

type Props = {
  stay: TourPackage;
  initial: StayCheckoutState;
  onBackToListing: (state: StayCheckoutState) => void;
};

const sectionClass = 'tv-checkout-panel p-3.5 sm:p-4';
const sectionTitleClass = 'font-display text-[0.9375rem] font-semibold tracking-tight text-ink';

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
  const [editingContact, setEditingContact] = useState(false);
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

  const checkInHm = stayCheckInHmForDate(s, checkIn);
  const freeCancelCopy = stayFreeCancelDeadlineCopy({
    stay,
    checkIn,
    checkInHm,
    departureTimezone: extras.departureTimezone,
  });

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
    totalAmount: quoteOk && stayQuote.ok ? stayQuote.totalAmount : undefined,
    currency: quoteOk && stayQuote.ok ? stayQuote.currency : currency,
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
    // Phase 1704: hydrate session into userRef before resume — auth onSuccess can
    // fire before React `user` updates, so do not rely on stale closure alone.
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

  const guestsLine = `${party.adults} adult${party.adults === 1 ? '' : 's'}${
    party.children > 0 ? ` · ${party.children} child${party.children === 1 ? '' : 'ren'}` : ''
  }${party.infants > 0 ? ` · ${party.infants} infant${party.infants === 1 ? '' : 's'}` : ''}`;

  const payDisabled =
    paying ||
    !quoteOk ||
    selectionOccupied ||
    selfBookBlocked ||
    maxGuests == null ||
    checkoutPayBlockedByConsent(checkoutConsentAccepted);

  const payButtonLabel =
    checkoutPayBlockedByConsent(checkoutConsentAccepted) && quoteOk
      ? 'Accept terms to continue'
      : ctaLabel;

  const summary = quoteOk && stayQuote.ok ? (
    <div className="space-y-3">
      <div className="flex gap-2.5">
        {hero ? (
          <img src={hero} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] ring-1 ring-black/[0.06]">
            <Home className="h-5 w-5 text-ink-faint" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-[0.9375rem] font-semibold leading-snug tracking-tight text-ink">
            {stay.title}
          </p>
          {destination ? <p className="mt-0.5 truncate text-xs text-ink-muted">{destination}</p> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/[0.06] pt-3 text-sm">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Check-in</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">{formatStayNightHuman(checkIn)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Checkout</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">{formatStayNightHuman(checkOut)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Guests</dt>
          <dd className="mt-0.5 text-ink">
            {guestsLine}
            <span className="text-ink-muted">
              {' '}
              · {stayQuote.nights} night{stayQuote.nights === 1 ? '' : 's'}
            </span>
          </dd>
        </div>
      </dl>
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
      {freeCancelCopy ? (
        <p className="text-xs leading-relaxed text-ink-muted">{freeCancelCopy}</p>
      ) : (
        <p className="text-xs leading-relaxed text-ink-muted">
          Cancellation terms apply as shown on this listing.
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-red-700">
      {stayQuote && !stayQuote.ok ? userFacingError(stayQuote.error, USER_ERROR.checkout) : 'Price unavailable'}
    </p>
  );

  const paymentButton = (
    <button
      type="button"
      className="tv-btn-primary w-full text-sm leading-snug disabled:opacity-50"
      disabled={payDisabled}
      onClick={() => void startPayment()}
    >
      {payButtonLabel}
    </button>
  );

  const mobileDock = (
    <>
      {quoteOk && stayQuote.ok ? (
        <p className="text-center text-xs text-ink-muted">
          Total{' '}
          <span className="font-semibold tabular-nums text-ink">
            {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
          </span>
        </p>
      ) : null}
      {paymentButton}
    </>
  );

  return (
    <CheckoutPageShell
      onBrandClick={() => onBackToListing(currentState())}
      srBackLabel="Back to stay"
      mobileDock={mobileDock}
    >
          {paymentCancelledNote ? (
            <div className="mb-3">
              <NoticeCallout title="Checkout cancelled" tone="warn">
                {paymentCancelledNote}
              </NoticeCallout>
            </div>
          ) : null}

          <div className={CHECKOUT_TWO_COL}>
            <div className="min-w-0 space-y-3">
              <div>
                <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-[1.375rem]">
                  Complete your reservation
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Review your stay details before continuing to secure payment.
                </p>
              </div>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Your stay</h2>
                <div className="mt-2.5 flex gap-2.5">
                  {hero ? (
                    <img
                      src={hero}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-display text-[0.9375rem] font-semibold leading-snug tracking-tight text-ink">
                      {stay.title}
                    </p>
                    {destination ? (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {destination}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Booking details</h2>

                <div className="mt-2.5 border-t border-black/[0.06] pt-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Dates</p>
                      {!editingDates ? (
                        <p className="mt-0.5 text-sm font-medium tabular-nums text-ink">
                          {formatStayNightHuman(checkIn)} → {formatStayNightHuman(checkOut)}
                          {quoteOk && stayQuote.ok
                            ? ` · ${stayQuote.nights} night${stayQuote.nights === 1 ? '' : 's'}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-sm font-semibold text-finland hover:underline"
                      onClick={() => setEditingDates((v) => !v)}
                    >
                      {editingDates ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editingDates ? (
                    <div className="mt-2.5">
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
                  ) : null}
                </div>

                <div className="mt-2.5 border-t border-black/[0.06] pt-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Guests</p>
                      {!editingGuests ? (
                        <p className="mt-0.5 text-sm font-medium text-ink">{guestsLine}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-sm font-semibold text-finland hover:underline"
                      onClick={() => setEditingGuests((v) => !v)}
                    >
                      {editingGuests ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editingGuests ? (
                    <div className="mt-2.5">
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
                  ) : null}
                </div>
              </section>

              <section className={sectionClass}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className={sectionTitleClass}>Contact</h2>
                  <button
                    type="button"
                    onClick={() => setEditingContact((v) => !v)}
                    className="text-[13px] font-semibold text-finland hover:underline"
                  >
                    {editingContact ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editingContact ? (
                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                    <div className="relative sm:col-span-2">
                      <User
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                        aria-hidden
                      />
                      <label className="sr-only" htmlFor="stay-book-guest-name">
                        Lead guest name
                      </label>
                      <input
                        id="stay-book-guest-name"
                        type="text"
                        autoComplete="name"
                        autoCapitalize="words"
                        required
                        aria-required="true"
                        value={guestName}
                        onChange={(e) => {
                          setGuestName(e.target.value);
                          setPayError(null);
                        }}
                        className="tv-checkout-input pl-10"
                        placeholder="Name on the booking"
                      />
                    </div>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                        aria-hidden
                      />
                      <label className="sr-only" htmlFor="stay-book-guest-email">
                        Email
                      </label>
                      <input
                        id="stay-book-guest-email"
                        type="email"
                        autoComplete="email"
                        value={user?.email ?? ''}
                        readOnly
                        className="tv-checkout-input bg-black/[0.02] pl-10 text-ink-muted"
                        placeholder={user ? undefined : 'Sign in to confirm your email'}
                      />
                    </div>
                    <div className="relative">
                      <Phone
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                        aria-hidden
                      />
                      <label className="sr-only" htmlFor="stay-book-guest-phone">
                        Phone
                      </label>
                      <input
                        id="stay-book-guest-phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="tv-checkout-input pl-10"
                        placeholder="Arrival contact (optional)"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-sm font-medium text-ink break-words">
                      {guestName.trim() || 'Name missing'}
                    </p>
                    <p className="text-[13px] text-ink-muted break-all">
                      {user?.email || 'Sign in to confirm email'}
                    </p>
                    {guestPhone.trim() ? (
                      <p className="text-[13px] text-ink-muted">{guestPhone.trim()}</p>
                    ) : null}
                  </div>
                )}
              </section>

              {(s?.checkInTime || s?.checkOutTime || stayArrivalMethodLabel(s?.arrivalMethod) || s?.arrivalNote) && (
                <section className={sectionClass}>
                  <h2 className={sectionTitleClass}>Arrival</h2>
                  <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                    {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
                    {s?.checkOutTime ? <li>Checkout by {s.checkOutTime}</li> : null}
                    {stayArrivalMethodLabel(s?.arrivalMethod) ? (
                      <li>Arrival: {stayArrivalMethodLabel(s?.arrivalMethod)}</li>
                    ) : null}
                    {s?.arrivalNote ? <li>{s.arrivalNote}</li> : null}
                  </ul>
                </section>
              )}

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Cancellation & terms</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {freeCancelCopy ??
                    (listingShowsFreeCancellation(stay)
                      ? 'Free cancellation up to 24 hours before check-in (property local time).'
                      : 'Review the cancellation policy on the listing before you pay.')}
                </p>
                <div className="mt-2.5">
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

              <div className="lg:hidden">
                <div className={`${sectionClass} shadow-[0_8px_24px_-16px_rgba(15,23,42,0.2)]`}>
                  <p className="tv-eyebrow mb-2.5">Booking summary</p>
                  {summary}
                </div>
              </div>

              {occupancyError ? (
                <p className="text-sm text-red-700">
                  {occupancyError}{' '}
                  <button
                    type="button"
                    className="font-semibold text-finland hover:underline"
                    onClick={() => reloadOccupancy()}
                  >
                    Try again
                  </button>
                </p>
              ) : null}
              {payError ? <p className="text-sm text-red-700">{payError}</p> : null}

              <div className="hidden lg:block">
                {paymentButton}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  {(() => {
                    const testDisclosure = stripeTestPaymentDisclosure();
                    return testDisclosure
                      ? `${testDisclosure} · total confirmed on the server before payment`
                      : 'Total confirmed on the server before payment';
                  })()}
                </p>
              </div>
            </div>

            <aside className="mt-4 hidden lg:sticky lg:top-4 lg:mt-0 lg:block lg:self-start">
              <div className="tv-checkout-panel p-3.5 sm:p-4">
                <p className="tv-eyebrow mb-2.5">Booking summary</p>
                {summary}
                {quoteOk && stayQuote.ok ? (
                  <p className="mt-3 border-t border-black/[0.06] pt-3 font-display text-xl font-semibold tabular-nums tracking-tight text-ink">
                    {formatMoney(stayQuote.totalAmount, stayQuote.currency)}
                    <span className="ml-1.5 font-sans text-sm font-medium text-ink-muted">total</span>
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
    </CheckoutPageShell>
  );
}

export function stayBookingConfirmListingHref(stayId: string, state: StayCheckoutState): string {
  return buildStayListingHref(stayId, state);
}
