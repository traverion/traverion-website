/**
 * Traveler rental booking selector.
 * Quotes and availability preview; checkout CTA stays disabled until release approval.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Loader2, Shield } from 'lucide-react';
import type { RentalDetails, RentalVariant } from '../../types/rental';
import { effectiveVariantPricing, formatMinorAsEuro } from '../../lib/rental-details';
import { quoteRentalLine } from '../../lib/rental-quote';
import { COMMERCIAL_PLANS } from '../../lib/commercial-money';
import {
  addDaysYmd,
  buildRentalInterval,
  normalizeHm,
  todayLocalYmd,
} from '../../lib/rental-booking-interval';
import { evaluateRentalAvailabilityRpc } from '../../data/supabase-rental-availability';
import { fetchRentalCheckoutCapability } from '../../data/rental-checkout-capability';
import { createBookingCheckoutSession } from '../../data/supabase-bookings';
import { useAuth } from '../../contexts/AuthContext';
import { rentalCancellationCustomerText } from '../../lib/rental-cancellation';
import { rentalDepositCustomerText } from '../../lib/rental-presentation';

export type RentalBookingSelection = {
  variantId: string;
  quantity: number;
  pickupAt: string;
  returnAt: string;
  durationCount: number;
  durationUnit: 'hour' | 'day';
  customerTotalMinor: number;
};

type Props = {
  listingId: string;
  listingTitle: string;
  rental: RentalDetails;
  onSelectionChange?: (selection: RentalBookingSelection | null) => void;
};

function defaultUnit(rental: RentalDetails): 'hour' | 'day' {
  return rental.durationMode === 'hourly' ? 'hour' : 'day';
}

function defaultPickupHm(rental: RentalDetails): string {
  const open = (rental.operatingDays ?? []).find((d) => d.open && d.earliestPickupHm);
  return normalizeHm(open?.earliestPickupHm ?? '10:00');
}

function defaultReturnHm(rental: RentalDetails): string {
  const open = (rental.operatingDays ?? []).find((d) => d.open && d.latestReturnHm);
  return normalizeHm(open?.latestReturnHm ?? '18:00');
}

export default function RentalBookingWidget({
  listingId,
  listingTitle,
  rental,
  onSelectionChange,
}: Props) {
  const { user, requestAuth } = useAuth();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const variants = rental.variants ?? [];
  const unit = defaultUnit(rental);
  const showUnitToggle = rental.durationMode === 'both';

  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [durationUnit, setDurationUnit] = useState<'hour' | 'day'>(unit);
  const [startDate, setStartDate] = useState(() => todayLocalYmd());
  const [endDate, setEndDate] = useState(() =>
    unit === 'hour' ? todayLocalYmd() : addDaysYmd(todayLocalYmd(), Math.max(1, rental.minDurationDays ?? 1))
  );
  const [pickupHm, setPickupHm] = useState(() => defaultPickupHm(rental));
  const [returnHm, setReturnHm] = useState(() => defaultReturnHm(rental));
  useEffect(() => {
    let cancelled = false;
    void fetchRentalCheckoutCapability().then((open) => {
      if (!cancelled) setCheckoutOpen(open);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [availability, setAvailability] = useState<{
    loading: boolean;
    ok: boolean | null;
    message: string | null;
    available: number | null;
  }>({ loading: false, ok: null, message: null, available: null });

  useEffect(() => {
    if (!variantId && variants[0]?.id) setVariantId(variants[0].id);
  }, [variantId, variants]);

  const selected: RentalVariant | undefined =
    variants.find((v) => v.id === variantId) ?? variants[0];
  const pricing = selected ? effectiveVariantPricing(rental, selected) : null;
  const maxQty = selected?.quantity ?? 1;

  const interval = useMemo(
    () =>
      buildRentalInterval({
        startDate,
        endDate,
        pickupHm,
        returnHm,
        durationUnit,
      }),
    [startDate, endDate, pickupHm, returnHm, durationUnit]
  );

  const quote = useMemo(() => {
    if (!rental || !variantId || !interval.ok) return null;
    return quoteRentalLine({
      rental,
      variantId,
      quantity: Math.min(Math.max(1, quantity), maxQty),
      durationCount: interval.durationCount,
      unit: interval.durationUnit,
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
  }, [rental, variantId, quantity, maxQty, interval]);

  useEffect(() => {
    if (!interval.ok || !variantId || !quote?.ok) {
      onSelectionChange?.(null);
      return;
    }
    onSelectionChange?.({
      variantId,
      quantity: Math.min(Math.max(1, quantity), maxQty),
      pickupAt: interval.pickupAt,
      returnAt: interval.returnAt,
      durationCount: interval.durationCount,
      durationUnit: interval.durationUnit,
      customerTotalMinor: quote.customerTotalMinor,
    });
  }, [interval, variantId, quantity, maxQty, quote, onSelectionChange]);

  useEffect(() => {
    if (!interval.ok || !variantId) {
      setAvailability({ loading: false, ok: null, message: null, available: null });
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setAvailability((s) => ({ ...s, loading: true, message: null }));
      void (async () => {
        try {
          const result = await evaluateRentalAvailabilityRpc({
            listingId,
            variantId,
            quantity: Math.min(Math.max(1, quantity), maxQty),
            startsAtIso: interval.pickupAt,
            endsAtIso: interval.returnAt,
          });
          if (cancelled) return;
          if (result.ok) {
            setAvailability({
              loading: false,
              ok: true,
              message:
                typeof result.available === 'number'
                  ? `${result.available} available for this window`
                  : 'Available for this window',
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
        } catch {
          if (cancelled) return;
          // Anon or RLS: soft-fail — still show quote; live stock confirmed at checkout.
          setAvailability({
            loading: false,
            ok: null,
            message: 'Availability will be confirmed at checkout.',
            available: null,
          });
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [listingId, variantId, quantity, maxQty, interval]);

  const continueToCheckout = async () => {
    if (!checkoutOpen || !quote?.ok || !interval.ok || availability.ok === false || !consent) return;
    if (!user) {
      requestAuth({ intent: 'checkout', onSuccess: () => void continueToCheckout() });
      return;
    }
    setPaying(true);
    setPayError(null);
    const qty = Math.min(Math.max(1, quantity), maxQty);
    const result = await createBookingCheckoutSession({
      listingId,
      listingTitle,
      bookingDate: startDate,
      guests: qty,
      checkoutConsentAccepted: true,
      expectedTotal: Number((quote.customerTotalMinor / 100).toFixed(2)),
      successPath: '/booking-confirmed',
      cancelPath: `/rentals/${listingId}`,
      rental: {
        variantId,
        quantity: qty,
        pickupAt: interval.pickupAt,
        returnAt: interval.returnAt,
        durationCount: interval.durationCount,
        durationUnit: interval.durationUnit,
      },
    });
    setPaying(false);
    if (!result.success || !result.checkoutUrl) {
      setPayError(result.error || 'Checkout could not be opened.');
      return;
    }
    window.location.assign(result.checkoutUrl);
  };

  const minDate = todayLocalYmd();
  const unitPriceLabel =
    durationUnit === 'hour'
      ? formatMinorAsEuro(pricing?.pricePerHourMinor)
      : formatMinorAsEuro(pricing?.pricePerDayMinor);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">From</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">
          {unitPriceLabel}
          <span className="ml-1 text-sm font-medium text-ink-muted">
            / {durationUnit === 'hour' ? 'hour' : 'day'} · per unit
          </span>
        </p>
      </div>

      {variants.length > 0 ? (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink">Option</span>
          <select
            className="tv-input w-full"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.quantity} available
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showUnitToggle ? (
        <div className="flex gap-2" role="group" aria-label="Rental pricing unit">
          {(['day', 'hour'] as const).map((u) => (
            <button
              key={u}
              type="button"
              className={`tv-btn-ghost min-h-10 flex-1 text-sm ${
                durationUnit === u ? 'bg-[#073b83]/10 font-semibold text-[#073b83] ring-1 ring-[#073b83]' : ''
              }`}
              aria-pressed={durationUnit === u}
              onClick={() => setDurationUnit(u)}
            >
              {u === 'day' ? 'Daily' : 'Hourly'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink">Pickup date</span>
          <input
            type="date"
            className="tv-input w-full"
            min={minDate}
            value={startDate}
            onChange={(e) => {
              const next = e.target.value;
              setStartDate(next);
              if (endDate < next) setEndDate(next);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink">Return date</span>
          <input
            type="date"
            className="tv-input w-full"
            min={startDate || minDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1.5 flex items-center gap-1 font-medium text-ink">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Pickup time
          </span>
          <input
            type="time"
            className="tv-input w-full"
            value={pickupHm}
            onChange={(e) => setPickupHm(normalizeHm(e.target.value, pickupHm))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 flex items-center gap-1 font-medium text-ink">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Return time
          </span>
          <input
            type="time"
            className="tv-input w-full"
            value={returnHm}
            onChange={(e) => setReturnHm(normalizeHm(e.target.value, returnHm))}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-ink">Quantity</span>
        <input
          type="number"
          min={1}
          max={maxQty}
          className="tv-input w-full"
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)))
          }
        />
      </label>

      {!interval.ok ? (
        <p className="text-sm text-[#9f1239]" role="alert">
          {interval.error}
        </p>
      ) : null}

      {interval.ok ? (
        <p className="text-sm text-ink-muted">
          Duration{' '}
          <span className="font-medium text-ink">
            {interval.durationCount} {interval.durationUnit}
            {interval.durationCount === 1 ? '' : 's'}
          </span>
        </p>
      ) : null}

      {quote?.ok ? (
        <p className="text-sm text-ink">
          Total <span className="font-semibold">{formatMinorAsEuro(quote.customerTotalMinor)}</span>
          <span className="text-ink-muted">
            {checkoutOpen ? ' · confirmed again at checkout' : ' · estimate, nothing is charged'}
          </span>
        </p>
      ) : quote && !quote.ok ? (
        <p className="text-sm text-[#9f1239]" role="alert">
          {quote.error}
        </p>
      ) : null}

      <div className="min-h-[1.25rem] text-sm text-ink-muted" aria-live="polite">
        {availability.loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking availability…
          </span>
        ) : availability.message ? (
          <span className={availability.ok === false ? 'text-[#9f1239]' : undefined}>
            {availability.message}
          </span>
        ) : null}
      </div>

      <p className="rounded-xl bg-[#F4F6F8] px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
        {rentalDepositCustomerText(rental)}
      </p>
      <p className="text-xs leading-relaxed text-ink-muted">{rentalCancellationCustomerText(rental.cancellationPreset)}</p>
      {rental.pickupAddress ? (
        <p className="text-xs leading-relaxed text-ink-muted">Pickup: {rental.pickupAddress}</p>
      ) : null}

      {checkoutOpen ? (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>I accept this cancellation window and Traverion’s terms. Rental refunds are not automatic.</span>
        </label>
      ) : (
        <div className="rounded-xl bg-[#F4F6F8] px-3.5 py-3 text-sm text-ink-muted" role="note">
          <p className="flex items-start gap-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
            Online payment for rentals is not open yet. You can review dates, times, and the price. Nothing is charged.
          </p>
        </div>
      )}

      {payError ? (
        <p className="text-sm text-[#9f1239]" role="alert">
          {payError}
        </p>
      ) : null}

      <button
        type="button"
        className="tv-btn-primary min-h-12 w-full font-semibold disabled:opacity-60"
        disabled={!checkoutOpen || paying || !consent || !quote?.ok || !interval.ok || availability.ok === false}
        onClick={() => void continueToCheckout()}
      >
        {paying ? 'Opening checkout…' : checkoutOpen ? 'Continue to checkout' : 'Payment not open yet'}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        {checkoutOpen
          ? 'Checkout uses Traverion’s secure payment page.'
          : 'The price above is for review only.'}
      </p>
    </div>
  );
}
