/**
 * Dedicated rental booking review — same chrome as StayBookingConfirm,
 * rental-specific details and createBookingCheckoutSession rental payload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Lock, MapPin, Package } from 'lucide-react';
import type { TourPackage } from '../types/tour';
import type { RentalDetails } from '../types/rental';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown from '../components/PriceBreakdown';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import NoticeCallout from '../components/NoticeCallout';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { STRIPE_TEST_UNTIL_LIVE } from '../lib/booking-confirmation-copy';
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
import { createBookingCheckoutSession } from '../data/supabase-bookings';
import { evaluateRentalAvailabilityRpc } from '../data/supabase-rental-availability';
import { fetchRentalCheckoutCapability } from '../data/rental-checkout-capability';
import { isRentalDevPreviewId } from '../lib/rental-dev-preview';
import { quoteRentalLine, rentalQuotePriceLines } from '../lib/rental-quote';
import { COMMERCIAL_PLANS } from '../lib/commercial-money';
import {
  buildRentalInterval,
  rentalScheduleIssue,
} from '../lib/rental-booking-interval';
import { formatMinorAsEuro } from '../lib/rental-details';
import { rentalCancellationCustomerText } from '../lib/rental-cancellation';
import {
  rentalDepositCustomerText,
  rentalPickupHandoverLabel,
  rentalQuantityUnits,
  rentalReturnHandoverLabel,
  rentalReturnPoint,
} from '../lib/rental-presentation';
import { formatStayNightHuman } from '../lib/stay-calendar';
import { stayCheckoutLeadGuestNameReady } from '../lib/stay-checkout-guest';
import {
  buildRentalCheckoutHref,
  type RentalCheckoutState,
} from '../lib/rentalCheckoutUrl';
import { trackListingTraffic } from '../lib/listing-traffic';

type Props = {
  listing: TourPackage;
  rental: RentalDetails;
  initial: RentalCheckoutState;
  onBackToListing: (state: RentalCheckoutState) => void;
};

const sectionClass = 'rounded-xl border border-black/[0.08] bg-white p-3.5 sm:p-4';
const sectionTitleClass = 'font-display text-[0.9375rem] font-semibold tracking-tight text-ink';

export default function RentalBookingConfirm({ listing, rental, initial, onBackToListing }: Props) {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [variantId] = useState(initial.variantId);
  const [quantity] = useState(initial.quantity);
  const [durationUnit] = useState(initial.durationUnit);
  const [startDate] = useState(initial.startDate);
  const [endDate] = useState(initial.endDate);
  const [pickupHm] = useState(initial.pickupHm);
  const [returnHm] = useState(initial.returnHm);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [checkoutConsentAccepted, setCheckoutConsentAccepted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentCancelledNote, setPaymentCancelledNote] = useState(
    initial.paymentCancelled
      ? 'Checkout was cancelled. Your rental details are still here — you were not charged.'
      : null
  );
  const [selfBookBlocked, setSelfBookBlocked] = useState(false);
  const [selfBookCheckFailed, setSelfBookCheckFailed] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [availability, setAvailability] = useState<{
    loading: boolean;
    ok: boolean | null;
    message: string | null;
    available: number | null;
  }>({ loading: true, ok: null, message: null, available: null });
  const checkoutLockRef = useRef(false);

  const hero = listingHeroImageSrc(listing.image);
  const currency = normalizeCurrency(listing.price?.currency ?? 'EUR');
  const selected = (rental.variants ?? []).find((v) => v.id === variantId) ?? rental.variants?.[0];
  const quantityUnits = rentalQuantityUnits(rental);
  const destination =
    [listing.city, listing.region, listing.country].filter(Boolean).join(', ') || listing.destination || null;
  const returnPoint = rentalReturnPoint(rental);
  const pickupHandover = rentalPickupHandoverLabel(rental);
  const returnHandover = rentalReturnHandoverLabel(rental);

  const interval = useMemo(
    () =>
      buildRentalInterval({
        startDate,
        endDate,
        pickupHm,
        returnHm,
        durationUnit,
        timeZone: listing.listingExtras?.departureTimezone,
      }),
    [startDate, endDate, pickupHm, returnHm, durationUnit, listing.listingExtras?.departureTimezone]
  );

  const scheduleIssue = useMemo(() => {
    if (!interval.ok) return null;
    return rentalScheduleIssue({
      operatingDays: rental.operatingDays,
      bookingNoticeHours: rental.bookingNoticeHours,
      startDate,
      endDate,
      pickupHm,
      returnHm,
      pickupAtIso: interval.pickupAt,
    });
  }, [interval, rental.operatingDays, rental.bookingNoticeHours, startDate, endDate, pickupHm, returnHm]);

  const quote = useMemo(() => {
    if (!interval.ok || !variantId) return null;
    if (scheduleIssue) return { ok: false as const, error: scheduleIssue };
    return quoteRentalLine({
      rental,
      variantId,
      quantity: Math.max(1, quantity),
      durationCount: interval.durationCount,
      unit: interval.durationUnit,
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
  }, [rental, variantId, quantity, interval, scheduleIssue]);

  const quoteOk = Boolean(quote?.ok && interval.ok);

  const currentState = (): RentalCheckoutState => ({
    variantId,
    quantity,
    durationUnit,
    startDate,
    endDate,
    pickupHm,
    returnHm,
    paymentCancelled: false,
  });

  const syncUrl = useCallback(
    (next: RentalCheckoutState, mode: 'push' | 'replace' = 'replace') => {
      const href = buildRentalCheckoutHref(listing.id, next);
      if (mode === 'push') window.history.pushState({}, '', href);
      else window.history.replaceState({}, '', href);
    },
    [listing.id]
  );

  useEffect(() => {
    syncUrl(currentState(), 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror Stay: keep URL in sync with fixed selection
  }, [variantId, quantity, durationUnit, startDate, endDate, pickupHm, returnHm, syncUrl]);

  useEffect(() => {
    let cancelled = false;
    if (isRentalDevPreviewId(listing.id)) {
      setCheckoutOpen(false);
      return;
    }
    void fetchRentalCheckoutCapability().then((open) => {
      if (!cancelled) setCheckoutOpen(open);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

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
    if (!listing.supplierId || !user?.id) {
      setSelfBookBlocked(false);
      setSelfBookCheckFailed(false);
      return;
    }
    void viewerIsListingSupplierSide(user.id, listing.supplierId)
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
  }, [listing.supplierId, user?.id]);

  const revalidateAvailability = useCallback(() => {
    if (!interval.ok || !variantId || !quote?.ok) {
      setAvailability({ loading: false, ok: null, message: null, available: null });
      return;
    }
    if (isRentalDevPreviewId(listing.id)) {
      setAvailability({ loading: false, ok: true, message: null, available: quantity });
      return;
    }
    let cancelled = false;
    setAvailability((s) => ({ ...s, loading: true, message: null }));
    void evaluateRentalAvailabilityRpc({
      listingId: listing.id,
      variantId,
      quantity: Math.max(1, quantity),
      startsAtIso: interval.pickupAt,
      endsAtIso: interval.returnAt,
      durationUnit: interval.durationUnit,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setAvailability({
            loading: false,
            ok: true,
            message: null,
            available: result.available ?? null,
          });
        } else {
          setAvailability({
            loading: false,
            ok: false,
            message: result.error?.replace(/_/g, ' ') || 'Not available for these dates',
            available: result.available ?? 0,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability({
          loading: false,
          ok: null,
          message: 'Availability could not be verified. Try again before paying.',
          available: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [listing.id, variantId, quantity, interval, quote]);

  useEffect(() => {
    const cleanup = revalidateAvailability();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [revalidateAvailability]);

  const startPayment = async () => {
    if (!quoteOk || !quote?.ok || !interval.ok) return;
    if (isRentalDevPreviewId(listing.id)) {
      setPayError('Development preview rentals cannot be booked.');
      return;
    }
    if (!checkoutOpen) {
      setPayError('Online payment is not open yet for rentals.');
      return;
    }
    if (checkoutPayBlockedByConsent(checkoutConsentAccepted)) {
      setPayError(null);
      document.getElementById('rental-book-consent')?.focus();
      return;
    }
    if (availability.ok === false) {
      setPayError(availability.message || 'This rental is not available for the selected period.');
      return;
    }
    if (availability.message && availability.ok === null) {
      setPayError('We could not verify availability. Try again before paying.');
      return;
    }
    if (!stayCheckoutLeadGuestNameReady(guestName)) {
      setPayError('Enter the lead guest name so the provider knows who is collecting.');
      document.getElementById('rental-book-guest-name')?.focus();
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
    revalidateAvailability();
    trackListingTraffic(listing.id, 'book_start');
    const cancelPath = buildRentalCheckoutHref(listing.id, {
      ...currentState(),
      paymentCancelled: true,
    });
    const expectedTotal = Number((quote.customerTotalMinor / 100).toFixed(2));
    timing.mark('edge_invoke');
    void createBookingCheckoutSession({
      listingId: listing.id,
      listingTitle: listing.title,
      bookingDate: startDate,
      guests: Math.max(1, quantity),
      customerName: guestName.trim(),
      customerPhone: guestPhone.trim() || undefined,
      currency,
      expectedTotal,
      checkoutConsentAccepted: true,
      successPath: '/booking-confirmed',
      cancelPath,
      rental: {
        variantId,
        quantity: Math.max(1, quantity),
        pickupAt: interval.pickupAt,
        returnAt: interval.returnAt,
        durationCount: interval.durationCount,
        durationUnit: interval.durationUnit,
      },
    })
      .then((res) => {
        timing.mark('edge_returned');
        logCheckoutInitiationTiming(mergeCheckoutTimings(timing.snapshot(), res.timings), {
          ok: Boolean(res.success && res.checkoutUrl),
        });
        if (!res.success || !res.checkoutUrl) {
          if (res.code === 'quote_changed' && typeof res.quotedTotal === 'number') {
            setPayError(
              `The total updated to ${formatMoney(res.quotedTotal, res.currency ?? currency)}. Review the new price before continuing — you were not charged.`
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
          Math.round(res.quotedTotal * 100) !== Math.round(expectedTotal * 100)
        ) {
          setPayError(
            `The total updated to ${formatMoney(res.quotedTotal, res.currency ?? currency)}. Review the new price before continuing — you were not charged.`
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

  const durationLabel =
    quoteOk && quote?.ok && interval.ok
      ? `${interval.durationCount} ${interval.durationUnit}${interval.durationCount === 1 ? '' : 's'}`
      : null;

  const qtyLabel = `${quantity} ${quantity === 1 ? quantityUnits.singular : quantityUnits.plural}`;

  const payDisabled =
    paying ||
    !quoteOk ||
    !checkoutOpen ||
    availability.ok === false ||
    availability.loading ||
    selfBookBlocked ||
    checkoutPayBlockedByConsent(checkoutConsentAccepted);

  const payButtonLabel = checkoutPayBlockedByConsent(checkoutConsentAccepted) && quoteOk
    ? 'Accept terms to continue'
    : paying
      ? 'Opening checkout…'
      : !checkoutOpen
        ? 'Payment not open yet'
        : quoteOk && quote?.ok
          ? `Continue to payment · ${formatMinorAsEuro(quote.customerTotalMinor)}`
          : 'Continue to payment';

  const summary =
    quoteOk && quote?.ok && interval.ok ? (
      <div className="space-y-3">
        <div className="flex gap-2.5">
          {hero ? (
            <img
              src={hero}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] ring-1 ring-black/[0.06]">
              <Package className="h-5 w-5 text-ink-faint" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-semibold leading-snug tracking-tight text-ink">
              {listing.title}
            </p>
            {destination ? <p className="mt-0.5 truncate text-xs text-ink-muted">{destination}</p> : null}
            {selected ? (
              <p className="mt-0.5 text-xs font-medium text-ink">{selected.name}</p>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/[0.06] pt-3 text-sm">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Pickup</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink">
              {formatStayNightHuman(startDate)} · {pickupHm}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Return</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink">
              {formatStayNightHuman(endDate)} · {returnHm}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Rental</dt>
            <dd className="mt-0.5 text-ink">
              {qtyLabel}
              {durationLabel ? (
                <span className="text-ink-muted">
                  {' '}
                  · {durationLabel} · {durationUnit === 'hour' ? 'Hourly' : 'Daily'}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
        <PriceBreakdown
          currency={currency}
          lines={rentalQuotePriceLines(quote, interval.durationUnit)}
          total={Number((quote.customerTotalMinor / 100).toFixed(2))}
          holdNote="Inventory is held only after payment starts successfully."
        />
        <p className="text-xs leading-relaxed text-ink-muted">
          {rentalCancellationCustomerText(rental.cancellationPreset)}
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">{rentalDepositCustomerText(rental)}</p>
      </div>
    ) : (
      <p className="text-sm text-red-700">
        {quote && !quote.ok
          ? userFacingError(quote.error, USER_ERROR.checkout)
          : !interval.ok
            ? interval.error
            : 'Price unavailable'}
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

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-paper">
      <header className="shrink-0 border-b border-black/[0.08] bg-white pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => onBackToListing(currentState())}
            className="lux-flat inline-flex h-10 min-w-0 items-center gap-2 rounded-md pr-2 text-ink"
          >
            <img src={BRAND_LOGO_SRC} alt="" className="h-7 w-7 object-contain" />
            <span className="font-sans text-[13px] font-bold tracking-tight">Traverion</span>
            <span className="sr-only">Back to rental</span>
          </button>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
            Secure checkout
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          {paymentCancelledNote ? (
            <div className="mb-4">
              <NoticeCallout title="Checkout cancelled" tone="warn">
                {paymentCancelledNote}
              </NoticeCallout>
            </div>
          ) : null}

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-8">
            <div className="min-w-0 space-y-3">
              <div>
                <button
                  type="button"
                  onClick={() => onBackToListing(currentState())}
                  className="mb-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back to rental
                </button>
                <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-[1.375rem]">
                  Complete your reservation
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Review your rental details before continuing to secure payment.
                </p>
              </div>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Your rental</h2>
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
                      {listing.title}
                    </p>
                    {destination ? (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {destination}
                      </p>
                    ) : null}
                    {selected ? (
                      <p className="mt-1 text-sm font-medium text-ink">Option: {selected.name}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Booking details</h2>
                <dl className="mt-2.5 space-y-2.5 border-t border-black/[0.06] pt-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Pickup</dt>
                    <dd className="text-right font-medium tabular-nums text-ink">
                      {formatStayNightHuman(startDate)} · {pickupHm}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Return</dt>
                    <dd className="text-right font-medium tabular-nums text-ink">
                      {formatStayNightHuman(endDate)} · {returnHm}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Duration</dt>
                    <dd className="text-right font-medium text-ink">
                      {durationLabel ?? '—'} · {durationUnit === 'hour' ? 'Hourly' : 'Daily'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Quantity</dt>
                    <dd className="text-right font-medium text-ink">{qtyLabel}</dd>
                  </div>
                </dl>
              </section>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Pickup & return</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
                  <li>
                    <span className="font-medium text-ink">Pickup: </span>
                    {rental.pickupAddress?.trim() ||
                      destination ||
                      'The operator shares the pickup place after booking.'}
                  </li>
                  <li>
                    <span className="font-medium text-ink">Return: </span>
                    {returnPoint.sameAsPickup
                      ? returnPoint.address
                        ? `Same place as pickup · ${returnPoint.address}`
                        : 'Same place as pickup'
                      : returnPoint.address || 'The operator shares the return place after booking.'}
                  </li>
                  {pickupHandover ? <li>{pickupHandover}</li> : null}
                  {returnHandover ? <li>{returnHandover}</li> : null}
                  {rental.pickupInstructions?.trim() ? (
                    <li className="whitespace-pre-wrap">{rental.pickupInstructions.trim()}</li>
                  ) : null}
                  {rental.returnInstructions?.trim() ? (
                    <li className="whitespace-pre-wrap">{rental.returnInstructions.trim()}</li>
                  ) : null}
                </ul>
              </section>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Contact</h2>
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-ink" htmlFor="rental-book-guest-name">
                      Lead guest name
                    </label>
                    <input
                      id="rental-book-guest-name"
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
                      className="tv-input mt-1 min-h-11 w-full"
                      placeholder="Name on the booking"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink" htmlFor="rental-book-guest-email">
                      Email
                    </label>
                    <input
                      id="rental-book-guest-email"
                      type="email"
                      autoComplete="email"
                      value={user?.email ?? ''}
                      readOnly
                      className="tv-input mt-1 min-h-11 w-full bg-black/[0.02] text-ink-muted"
                      placeholder={user ? undefined : 'Sign in to confirm your email'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink" htmlFor="rental-book-guest-phone">
                      Phone <span className="font-normal text-ink-muted">(optional)</span>
                    </label>
                    <input
                      id="rental-book-guest-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="tv-input mt-1 min-h-11 w-full"
                      placeholder="Pickup contact"
                    />
                  </div>
                </div>
              </section>

              <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Cancellation & terms</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {rentalCancellationCustomerText(rental.cancellationPreset)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {rentalDepositCustomerText(rental)}
                </p>
                {rental.insuranceDisclosure?.trim() || rental.insuranceCoverageNotes?.trim() ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                    {rental.insuranceCoverageNotes?.trim() || rental.insuranceDisclosure?.trim()}
                  </p>
                ) : null}
                <div className="mt-2.5">
                  <CheckoutConsentCheckbox
                    id="rental-book-consent"
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

              {availability.loading ? (
                <p className="text-sm text-ink-muted">Checking availability…</p>
              ) : availability.message ? (
                <p className={`text-sm ${availability.ok === false ? 'text-red-700' : 'text-ink-muted'}`}>
                  {availability.message}{' '}
                  {availability.ok !== true ? (
                    <button
                      type="button"
                      className="font-semibold text-finland hover:underline"
                      onClick={() => revalidateAvailability()}
                    >
                      Try again
                    </button>
                  ) : null}
                </p>
              ) : null}
              {payError ? <p className="text-sm text-red-700">{payError}</p> : null}

              <div className="hidden lg:block">
                {paymentButton}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  {STRIPE_TEST_UNTIL_LIVE} · total confirmed on the server before payment
                </p>
              </div>
            </div>

            <aside className="mt-6 hidden lg:sticky lg:top-5 lg:mt-0 lg:block">
              <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)]">
                <p className="tv-eyebrow mb-2.5">Booking summary</p>
                {summary}
                {quoteOk && quote?.ok ? (
                  <p className="mt-3 border-t border-black/[0.06] pt-3 font-display text-xl font-semibold tabular-nums tracking-tight text-ink">
                    {formatMinorAsEuro(quote.customerTotalMinor)}
                    <span className="ml-1.5 font-sans text-sm font-medium text-ink-muted">total</span>
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-[10001] border-t border-black/[0.08] bg-white/96 backdrop-blur-md px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-18px_rgba(15,23,42,0.35)]">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
                {quoteOk && quote?.ok ? (
                  <p className="text-center text-xs text-ink-muted">
                    Total{' '}
                    <span className="font-semibold tabular-nums text-ink">
                      {formatMinorAsEuro(quote.customerTotalMinor)}
                    </span>
                  </p>
                ) : null}
                {paymentButton}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
