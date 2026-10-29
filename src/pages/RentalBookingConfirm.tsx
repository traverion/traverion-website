/**
 * Dedicated rental booking review — Tour checkout chrome, rental payload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Lock, Mail, MapPin, Package, Phone, User } from 'lucide-react';
import type { TourPackage } from '../types/tour';
import type { RentalDetails } from '../types/rental';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown from '../components/PriceBreakdown';
import CheckoutConsentCheckbox from '../components/booking/CheckoutConsentCheckbox';
import CheckoutSecureHeader from '../components/checkout/CheckoutSecureHeader';
import NoticeCallout from '../components/NoticeCallout';
import { checkoutPayBlockedByConsent } from '../lib/checkout-consent';
import { LISTING_SELF_BOOK_BLOCKED, LISTING_SELF_BOOK_CHECK_FAILED, viewerIsListingSupplierSide } from '../lib/listing-self-book';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { STRIPE_TEST_UNTIL_LIVE } from '../lib/booking-confirmation-copy';
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
import {
  rentalCancellationCustomerText,
  rentalCancellationShortSummary,
} from '../lib/rental-cancellation';
import {
  rentalDepositCustomerText,
  rentalDepositShortSummary,
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
  const [editingContact, setEditingContact] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
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
    if (!stayCheckoutLeadGuestNameReady(guestName)) setEditingContact(true);
  }, [guestName]);

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
    // Server claim re-validates inventory atomically — do not fire a competing
    // availability RPC on the click path (adds latency and lock contention).
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
  const totalLabel =
    quoteOk && quote?.ok ? formatMinorAsEuro(quote.customerTotalMinor) : '—';
  const cancellationFull = rentalCancellationCustomerText(rental.cancellationPreset);
  const cancellationShort = rentalCancellationShortSummary(rental.cancellationPreset);
  const depositFull = rentalDepositCustomerText(rental);
  const depositShort = rentalDepositShortSummary(rental);
  const showDepositCue = rental.depositRequired === true;
  const pickupPlace =
    rental.pickupAddress?.trim() ||
    destination ||
    'Operator confirms pickup place after booking';
  const returnPlace = returnPoint.sameAsPickup
    ? returnPoint.address?.trim()
      ? `Same as pickup · ${returnPoint.address.trim()}`
      : 'Same as pickup'
    : returnPoint.address?.trim() || 'Operator confirms return place after booking';
  const pickupAtLabel = `${formatStayNightHuman(startDate)} · ${pickupHm}`;
  const returnAtLabel = `${formatStayNightHuman(endDate)} · ${returnHm}`;
  const optionQtyLine = [selected?.name, qtyLabel].filter(Boolean).join(' · ');
  const hasInstructions = Boolean(
    rental.pickupInstructions?.trim() || rental.returnInstructions?.trim()
  );

  const payDisabled =
    paying ||
    !quoteOk ||
    !checkoutOpen ||
    availability.ok === false ||
    availability.loading ||
    selfBookBlocked ||
    checkoutPayBlockedByConsent(checkoutConsentAccepted);

  const payButtonLabel = paying
    ? 'Preparing secure checkout…'
    : !checkoutOpen
      ? 'Payment not open yet'
      : !quoteOk
        ? 'Price unavailable'
        : availability.ok === false
          ? 'Not available'
          : checkoutPayBlockedByConsent(checkoutConsentAccepted)
            ? 'Accept terms to pay'
            : isSupabaseConfigured()
              ? 'Continue to secure payment'
              : 'Continue to payment';

  const paymentButton = (
    <button
      type="button"
      className="tv-btn-primary w-full whitespace-normal text-center text-sm leading-snug motion-safe:transition-opacity duration-200 disabled:opacity-50"
      disabled={payDisabled}
      aria-busy={paying || undefined}
      onClick={() => void startPayment()}
    >
      {payButtonLabel}
    </button>
  );

  const priceLines =
    quoteOk && quote?.ok && interval.ok
      ? rentalQuotePriceLines(quote, interval.durationUnit)
      : [];

  const fact = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium tabular-nums leading-snug text-ink break-words">{value}</dd>
    </div>
  );

  const summaryBody = (
    <>
      <div className="flex gap-2.5">
        {hero ? (
          <img
            src={hero}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] ring-1 ring-black/[0.06]">
            <Package className="h-5 w-5 text-ink-faint" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-sans text-[15px] font-semibold leading-snug tracking-tight text-ink line-clamp-2">
            {listing.title}
          </p>
          {optionQtyLine ? (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{optionQtyLine}</p>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/[0.06] pt-3">
        {fact('Pickup', pickupAtLabel)}
        {fact('Return', returnAtLabel)}
        {durationLabel ? fact('Duration', durationLabel) : null}
        {fact('Quantity', qtyLabel)}
      </dl>
      {quoteOk && quote?.ok ? (
        <div className="mt-3 border-t border-black/[0.06] pt-3">
          <PriceBreakdown
            currency={currency}
            lines={priceLines}
            total={Number((quote.customerTotalMinor / 100).toFixed(2))}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-white">
      <CheckoutSecureHeader
        onBrandClick={() => onBackToListing(currentState())}
        srBackLabel="Back to rental"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          {paymentCancelledNote ? (
            <div className="mb-3">
              <NoticeCallout title="Checkout cancelled" tone="warn">
                {paymentCancelledNote}
              </NoticeCallout>
            </div>
          ) : null}

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-7">
            <div className="min-w-0 space-y-3">
              <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white lg:hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-3 text-left motion-safe:transition-colors duration-150 hover:bg-black/[0.02]"
                  aria-expanded={summaryOpen}
                  onClick={() => setSummaryOpen((open) => !open)}
                >
                  {hero ? (
                    <img
                      src={hero}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/[0.04]">
                      <Package className="h-4 w-4 text-ink-faint" aria-hidden />
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{listing.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {pickupAtLabel}
                      {durationLabel ? ` · ${durationLabel}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-ink">{totalLabel}</span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 text-ink-muted motion-safe:transition-transform duration-200 ${
                        summaryOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden
                    />
                  </span>
                </button>
                <div
                  className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${
                    summaryOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-black/[0.06] px-3 py-3">{summaryBody}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-black/[0.08] bg-white p-3.5 sm:p-4">
                <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
                  Review & payment
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  Confirm details, then continue to secure payment.
                </p>

                <section className="mt-3 border-t border-black/[0.06] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-ink">Rental details</h3>
                    <button
                      type="button"
                      onClick={() => onBackToListing(currentState())}
                      className="text-[13px] font-semibold text-finland motion-safe:transition-opacity duration-150 hover:opacity-80"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-sm font-semibold leading-snug text-ink">{listing.title}</p>
                  {optionQtyLine ? (
                    <p className="mt-0.5 text-[13px] text-ink-muted">{optionQtyLine}</p>
                  ) : null}
                  {destination ? (
                    <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {destination}
                    </p>
                  ) : null}
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    {fact('Pickup', pickupAtLabel)}
                    {fact('Return', returnAtLabel)}
                    {fact('Pickup place', pickupPlace)}
                    {fact('Return place', returnPlace)}
                    {pickupHandover ? fact('Pickup handover', pickupHandover) : null}
                    {returnHandover ? fact('Return handover', returnHandover) : null}
                  </dl>
                  {hasInstructions ? (
                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-[13px] font-semibold text-finland">
                        Pickup & return notes
                      </summary>
                      <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-muted">
                        {rental.pickupInstructions?.trim() ? (
                          <p className="whitespace-pre-wrap">{rental.pickupInstructions.trim()}</p>
                        ) : null}
                        {rental.returnInstructions?.trim() ? (
                          <p className="whitespace-pre-wrap">{rental.returnInstructions.trim()}</p>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </section>

                <section className="mt-3 border-t border-black/[0.06] pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-ink">Contact</h3>
                    <button
                      type="button"
                      onClick={() => setEditingContact((v) => !v)}
                      className="text-[13px] font-semibold text-finland motion-safe:transition-opacity duration-150 hover:opacity-80"
                    >
                      {editingContact ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editingContact ? (
                    <div className="grid gap-2.5 sm:grid-cols-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                      <div className="relative sm:col-span-2">
                        <User
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                          aria-hidden
                        />
                        <label className="sr-only" htmlFor="rental-book-guest-name">
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
                          className="tv-checkout-input pl-10"
                          placeholder="Name on the booking"
                        />
                      </div>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                          aria-hidden
                        />
                        <label className="sr-only" htmlFor="rental-book-guest-email">
                          Email
                        </label>
                        <input
                          id="rental-book-guest-email"
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
                        <label className="sr-only" htmlFor="rental-book-guest-phone">
                          Phone
                        </label>
                        <input
                          id="rental-book-guest-phone"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          className="tv-checkout-input pl-10"
                          placeholder="Phone (optional)"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
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

                <section className="mt-3 border-t border-black/[0.06] pt-3">
                  <h3 className="text-[13px] font-semibold text-ink">Payment</h3>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    Total payable
                  </p>
                  <p className="mt-1 font-sans text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-ink">
                    {totalLabel}
                  </p>
                  {!quoteOk ? (
                    <p className="mt-2 text-sm text-red-700">
                      {quote && !quote.ok
                        ? userFacingError(quote.error, USER_ERROR.checkout)
                        : !interval.ok
                          ? interval.error
                          : 'Price unavailable'}
                    </p>
                  ) : null}
                  <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink">
                    {cancellationShort}
                  </p>
                  {showDepositCue ? (
                    <p className="mt-1 text-[13px] leading-snug text-ink-muted">{depositShort}</p>
                  ) : null}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[13px] font-semibold text-finland">
                      Full cancellation & deposit terms
                    </summary>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{cancellationFull}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{depositFull}</p>
                    {rental.insuranceDisclosure?.trim() || rental.insuranceCoverageNotes?.trim() ? (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                        {rental.insuranceCoverageNotes?.trim() || rental.insuranceDisclosure?.trim()}
                      </p>
                    ) : null}
                  </details>
                  <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
                    Secure payment · inventory reserved after payment succeeds
                  </p>

                  <div className="mt-3">
                    <CheckoutConsentCheckbox
                      id="rental-book-consent"
                      checked={checkoutConsentAccepted}
                      onChange={(next) => {
                        setCheckoutConsentAccepted(next);
                        if (next) setPayError(null);
                      }}
                    />
                  </div>

                  {availability.loading ? (
                    <div className="mt-3">
                      <NoticeCallout title="Checking availability" tone="warn">
                        Confirming this rental is still free for your pickup and return.
                      </NoticeCallout>
                    </div>
                  ) : availability.message ? (
                    <div className="mt-3">
                      <NoticeCallout
                        title={availability.ok === false ? 'Not available' : 'Availability check'}
                        tone={availability.ok === false ? 'danger' : 'warn'}
                      >
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
                      </NoticeCallout>
                    </div>
                  ) : null}
                  {payError ? (
                    <div className="mt-3">
                      <NoticeCallout title="Payment could not start" tone="danger">
                        {payError}
                      </NoticeCallout>
                    </div>
                  ) : null}

                  <div className="mt-3 hidden lg:block">
                    {paymentButton}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onBackToListing(currentState())}
                        className="text-[13px] font-semibold text-ink-muted hover:text-ink"
                      >
                        Back to rental
                      </button>
                      <p className="text-[11px] leading-relaxed text-ink-faint">{STRIPE_TEST_UNTIL_LIVE}</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <aside className="mt-4 hidden lg:sticky lg:top-4 lg:mt-0 lg:block lg:self-start">
              <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)]">
                <p className="tv-eyebrow mb-2.5">Booking summary</p>
                {summaryBody}
              </div>
            </aside>
          </div>

          <footer className="mt-6 border-t border-black/[0.06] py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>© {new Date().getFullYear()} Traverion</span>
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-ink hover:underline"
              >
                Privacy
              </a>
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-ink hover:underline"
              >
                Terms
              </a>
            </div>
          </footer>
        </div>
      </div>

      <div className="lg:hidden shrink-0 border-t border-black/[0.08] bg-white/96 px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1.5">
          {quoteOk && quote?.ok ? (
            <p className="text-center text-[13px] text-ink-muted">
              Total <strong className="font-semibold tabular-nums text-ink">{totalLabel}</strong>
            </p>
          ) : null}
          {paymentButton}
        </div>
      </div>
    </div>
  );
}
