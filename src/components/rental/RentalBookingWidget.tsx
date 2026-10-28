/**
 * Traveler rental booking selector on the PDP.
 * Configuration only — review and Stripe live on the dedicated confirm step.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import type { RentalDetails, RentalVariant } from '../../types/rental';
import {
  effectiveVariantDurationLimits,
  effectiveVariantDurationMode,
  effectiveVariantPricing,
  formatMinorAsEuro,
} from '../../lib/rental-details';
import { rentalOptionRateLabel, rentalQuantityUnits } from '../../lib/rental-presentation';
import { isRentalDevPreviewId } from '../../lib/rental-dev-preview';
import { quoteRentalLine } from '../../lib/rental-quote';
import { COMMERCIAL_PLANS } from '../../lib/commercial-money';
import {
  addDaysYmd,
  buildRentalInterval,
  normalizeHm,
  rentalDayClosed,
  rentalDayTimeOptions,
  rentalScheduleIssue,
  todayLocalYmd,
} from '../../lib/rental-booking-interval';
import { evaluateRentalAvailabilityRpc } from '../../data/supabase-rental-availability';
import { fetchRentalCheckoutCapability } from '../../data/rental-checkout-capability';
import type { RentalCheckoutState } from '../../lib/rentalCheckoutUrl';
import GuestStepper from '../booking/GuestStepper';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import { TraverionTimeListField } from '../calendar/TraverionTimeListField';

export type RentalBookingSelection = {
  variantId: string;
  quantity: number;
  pickupAt: string;
  returnAt: string;
  durationCount: number;
  durationUnit: 'hour' | 'day';
  customerTotalMinor: number;
  startDate: string;
  endDate: string;
  pickupHm: string;
  returnHm: string;
};

type Props = {
  listingId: string;
  rental: RentalDetails;
  onSelectionChange?: (selection: RentalBookingSelection | null) => void;
  /** Navigate to the dedicated rental review step. */
  onContinue?: (state: RentalCheckoutState) => void;
  /** Prefill from listing URL / back-from-review. */
  initial?: Partial<
    Pick<
      RentalCheckoutState,
      'variantId' | 'quantity' | 'durationUnit' | 'startDate' | 'endDate' | 'pickupHm' | 'returnHm'
    >
  >;
  /** When set, option cards outside the sidebar own the selection. */
  variantId?: string;
  onVariantIdChange?: (variantId: string) => void;
  hideOptionPicker?: boolean;
};

function defaultUnitForVariant(rental: RentalDetails, variant: RentalVariant | undefined): 'hour' | 'day' {
  if (!variant) return rental.durationMode === 'hourly' ? 'hour' : 'day';
  return effectiveVariantDurationMode(rental, variant) === 'hourly' ? 'hour' : 'day';
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
  rental,
  onSelectionChange,
  onContinue,
  initial,
  variantId: controlledVariantId,
  onVariantIdChange,
  hideOptionPicker = false,
}: Props) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const variants = rental.variants ?? [];

  const [uncontrolledVariantId, setUncontrolledVariantId] = useState(
    initial?.variantId?.trim() || variants[0]?.id || ''
  );
  const variantId = controlledVariantId ?? uncontrolledVariantId;
  const setVariantId = (nextId: string) => {
    onVariantIdChange?.(nextId);
    if (controlledVariantId == null) setUncontrolledVariantId(nextId);
  };
  const selectedEarly: RentalVariant | undefined =
    variants.find((v) => v.id === variantId) ?? variants[0];
  const optionMode = selectedEarly
    ? effectiveVariantDurationMode(rental, selectedEarly)
    : (rental.durationMode ?? 'daily');
  const showUnitToggle = optionMode === 'both';

  const [quantity, setQuantity] = useState(() =>
    typeof initial?.quantity === 'number' && initial.quantity >= 1 ? Math.min(99, initial.quantity) : 1
  );
  const [durationUnit, setDurationUnit] = useState<'hour' | 'day'>(() => {
    if (initial?.durationUnit === 'hour' || initial?.durationUnit === 'day') return initial.durationUnit;
    return defaultUnitForVariant(rental, selectedEarly);
  });
  const [startDate, setStartDate] = useState(() => initial?.startDate || todayLocalYmd());
  const [endDate, setEndDate] = useState(() => {
    if (initial?.endDate) return initial.endDate;
    const initialUnit =
      initial?.durationUnit === 'hour' || initial?.durationUnit === 'day'
        ? initial.durationUnit
        : defaultUnitForVariant(rental, variants[0]);
    if (initialUnit === 'hour') return todayLocalYmd();
    const minDays = variants[0]
      ? effectiveVariantDurationLimits(rental, variants[0], 'day').min
      : (rental.minDurationDays ?? 1);
    return addDaysYmd(todayLocalYmd(), Math.max(1, minDays));
  });
  const [pickupHm, setPickupHm] = useState(() => initial?.pickupHm || defaultPickupHm(rental));
  const [returnHm, setReturnHm] = useState(() => initial?.returnHm || defaultReturnHm(rental));

  useEffect(() => {
    let cancelled = false;
    if (isRentalDevPreviewId(listingId)) {
      setCheckoutOpen(false);
      return;
    }
    void fetchRentalCheckoutCapability().then((open) => {
      if (!cancelled) setCheckoutOpen(open);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const [availability, setAvailability] = useState<{
    loading: boolean;
    ok: boolean | null;
    message: string | null;
    available: number | null;
  }>({ loading: false, ok: null, message: null, available: null });

  useEffect(() => {
    if (!variantId && variants[0]?.id) setVariantId(variants[0].id);
  }, [variantId, variants]);

  const selected: RentalVariant | undefined = selectedEarly;

  useEffect(() => {
    if (!selected) return;
    const mode = effectiveVariantDurationMode(rental, selected);
    const nextUnit: 'hour' | 'day' = mode === 'hourly' ? 'hour' : mode === 'daily' ? 'day' : durationUnit;
    const clamped: 'hour' | 'day' =
      mode === 'both' ? (durationUnit === 'hour' || durationUnit === 'day' ? durationUnit : 'day') : nextUnit;
    if (clamped !== durationUnit) {
      setDurationUnit(clamped);
      if (clamped === 'hour') {
        setEndDate(startDate);
      } else {
        const { min } = effectiveVariantDurationLimits(rental, selected, 'day');
        setEndDate((current) => (current < startDate ? startDate : current || addDaysYmd(startDate, Math.max(1, min))));
      }
    }
    // Only re-clamp when the selected option or its mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- option switch clamp
  }, [selected?.id, optionMode]);

  const pricing = selected ? effectiveVariantPricing(rental, selected) : null;
  const configuredQty = Math.max(1, selected?.quantity ?? 1);

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
    if (!rental || !variantId || !interval.ok) return null;
    if (scheduleIssue) return { ok: false as const, error: scheduleIssue };
    return quoteRentalLine({
      rental,
      variantId,
      quantity: Math.min(Math.max(1, quantity), configuredQty),
      durationCount: interval.durationCount,
      unit: interval.durationUnit,
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
  }, [rental, variantId, quantity, configuredQty, interval, scheduleIssue]);

  useEffect(() => {
    if (!interval.ok || !variantId || !quote?.ok) {
      onSelectionChange?.(null);
      return;
    }
    onSelectionChange?.({
      variantId,
      quantity: Math.min(Math.max(1, quantity), configuredQty),
      pickupAt: interval.pickupAt,
      returnAt: interval.returnAt,
      durationCount: interval.durationCount,
      durationUnit: interval.durationUnit,
      customerTotalMinor: quote.customerTotalMinor,
      startDate,
      endDate,
      pickupHm,
      returnHm,
    });
  }, [interval, variantId, quantity, configuredQty, quote, startDate, endDate, pickupHm, returnHm, onSelectionChange]);

  useEffect(() => {
    if (!interval.ok || !variantId || !quote?.ok) {
      setAvailability({ loading: false, ok: null, message: null, available: null });
      return;
    }
    if (isRentalDevPreviewId(listingId)) {
      setAvailability({
        loading: false,
        ok: true,
        message: null,
        available: configuredQty,
      });
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
            quantity: Math.min(Math.max(1, quantity), configuredQty),
            startsAtIso: interval.pickupAt,
            endsAtIso: interval.returnAt,
            durationUnit: interval.durationUnit,
          });
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
        } catch {
          if (cancelled) return;
          // Anon or RLS: soft-fail — still show quote; live stock confirmed at checkout.
          setAvailability({
            loading: false,
            ok: null,
            message: 'Availability could not be checked yet.',
            available: null,
          });
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [listingId, variantId, quantity, configuredQty, interval, quote]);

  const maxQty =
    typeof availability.available === 'number' && availability.available >= 0
      ? Math.max(0, Math.min(configuredQty, availability.available)) || 1
      : configuredQty;

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  const handleContinue = () => {
    if (!quote?.ok || !interval.ok || availability.ok === false || !variantId) return;
    if (isRentalDevPreviewId(listingId)) return;
    onContinue?.({
      variantId,
      quantity: Math.min(Math.max(1, quantity), maxQty),
      durationUnit: interval.durationUnit,
      startDate,
      endDate,
      pickupHm,
      returnHm,
      paymentCancelled: false,
    });
  };

  const minDate = todayLocalYmd();
  const quantityUnits = rentalQuantityUnits(rental);
  const unitPriceLabel =
    durationUnit === 'hour'
      ? formatMinorAsEuro(pricing?.pricePerHourMinor)
      : formatMinorAsEuro(pricing?.pricePerDayMinor);

  const pickupTimeOptions = useMemo(
    () =>
      rentalDayTimeOptions({
        operatingDays: rental.operatingDays,
        ymd: startDate,
        kind: 'pickup',
        stepMinutes: 30,
      }),
    [rental.operatingDays, startDate]
  );
  const returnTimeOptions = useMemo(
    () =>
      rentalDayTimeOptions({
        operatingDays: rental.operatingDays,
        ymd: endDate,
        kind: 'return',
        stepMinutes: 30,
        afterHmExclusive: endDate === startDate ? pickupHm : null,
      }),
    [rental.operatingDays, endDate, startDate, pickupHm]
  );

  const showBreakdown =
    Boolean(quote?.ok) &&
    interval.ok &&
    (interval.durationCount > 1 || Math.min(Math.max(1, quantity), maxQty) > 1);

  const continueDisabled =
    !quote?.ok || !interval.ok || availability.ok === false || availability.loading || !onContinue;

  return (
    <div className="space-y-2.5">
      <div>
        <p className="font-sans text-[1.65rem] font-bold leading-none tracking-tight text-[#111827] tabular-nums">
          {unitPriceLabel}
          <span className="ml-1.5 text-sm font-semibold text-ink-muted">
            / {durationUnit === 'hour' ? 'hour' : 'day'}
          </span>
        </p>
        {hideOptionPicker && selected ? (
          <p className="mt-1.5 text-sm text-ink-muted">
            <span className="font-semibold text-ink">{selected.name}</span>{' '}
            <a href="#rental-options" className="font-semibold text-[#0758CB]">
              Change
            </a>
          </p>
        ) : null}
      </div>

      {!hideOptionPicker && variants.length > 0 ? (
        <div role="radiogroup" aria-label="Rental option" className="space-y-1.5">
          {variants.map((item) => {
            const selectedOption = item.id === (selected?.id ?? variantId);
            const rates = rentalOptionRateLabel(rental, effectiveVariantPricing(rental, item), item);
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selectedOption}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  selectedOption
                    ? 'bg-white shadow-sm ring-2 ring-[#0758CB]'
                    : 'bg-[#F7F8FA] ring-1 ring-transparent hover:bg-white hover:ring-black/[0.08]'
                }`}
                onClick={() => {
                  setVariantId(item.id);
                  setQuantity((current) => Math.min(item.quantity || 1, Math.max(1, current)));
                  const nextMode = effectiveVariantDurationMode(rental, item);
                  if (nextMode === 'hourly') setDurationUnit('hour');
                  else if (nextMode === 'daily') setDurationUnit('day');
                  else if (durationUnit !== 'hour' && durationUnit !== 'day') setDurationUnit('day');
                }}
              >
                <span className="font-semibold text-ink">{item.name}</span>
                {rates ? <span className="shrink-0 font-semibold tabular-nums text-ink">{rates}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showUnitToggle ? (
        <div className="flex gap-1.5" role="group" aria-label="Rental pricing unit">
          {(['day', 'hour'] as const).map((u) => (
            <button
              key={u}
              type="button"
              className={`tv-btn-ghost min-h-9 flex-1 px-2 text-sm ${
                durationUnit === u ? 'bg-[#0758CB]/10 font-semibold text-[#0758CB] ring-1 ring-[#0758CB]' : ''
              }`}
              aria-pressed={durationUnit === u}
              onClick={() => setDurationUnit(u)}
            >
              {u === 'day' ? 'Daily' : 'Hourly'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <span className="mb-1 block text-sm font-medium text-ink">Pickup</span>
            <div className="tv-input tv-rental-datetime flex w-full items-center">
              <TraverionSingleDateField
                id="rental-pickup-date"
                label=""
                aria-label="Pickup date"
                value={startDate}
                minIso={minDate}
                todayIso={minDate}
                tone="premium"
                footerMode="compact"
                allowClear={false}
                hideIcon
                placeholder="Date"
                isDayDisabled={(ymd) => rentalDayClosed(rental.operatingDays, ymd)}
                onChange={(next) => {
                  setStartDate(next);
                  if (endDate < next) setEndDate(next);
                }}
                className="w-full"
              />
            </div>
          </div>
          <div className="min-w-0">
            <span className="mb-1 block text-sm font-medium text-ink">Time</span>
            <div className="tv-input tv-rental-datetime flex w-full items-center">
              <TraverionTimeListField
                id="rental-pickup-time"
                aria-label="Pickup time"
                value={pickupHm}
                options={pickupTimeOptions}
                placeholder="Time"
                hideIcon
                onChange={(hm) => setPickupHm(normalizeHm(hm, pickupHm))}
                className="w-full"
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <span className="mb-1 block text-sm font-medium text-ink">Return</span>
            <div className="tv-input tv-rental-datetime flex w-full items-center">
              <TraverionSingleDateField
                id="rental-return-date"
                label=""
                aria-label="Return date"
                value={endDate}
                minIso={startDate || minDate}
                todayIso={minDate}
                tone="premium"
                footerMode="compact"
                allowClear={false}
                hideIcon
                placeholder="Date"
                isDayDisabled={(ymd) => rentalDayClosed(rental.operatingDays, ymd)}
                onChange={setEndDate}
                className="w-full"
              />
            </div>
          </div>
          <div className="min-w-0">
            <span className="mb-1 block text-sm font-medium text-ink">Time</span>
            <div className="tv-input tv-rental-datetime flex w-full items-center">
              <TraverionTimeListField
                id="rental-return-time"
                aria-label="Return time"
                value={returnHm}
                options={returnTimeOptions}
                placeholder="Time"
                hideIcon
                onChange={(hm) => setReturnHm(normalizeHm(hm, returnHm))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <GuestStepper
        label="Quantity"
        size="compact"
        value={Math.min(Math.max(1, quantity), Math.max(1, maxQty))}
        min={1}
        max={Math.max(1, maxQty)}
        onChange={setQuantity}
        unitSingular={quantityUnits.singular}
        unitPlural={quantityUnits.plural}
        hint={null}
      />

      {!interval.ok ? (
        <p className="text-sm text-[#9f1239]" role="alert">
          {interval.error}
        </p>
      ) : null}

      {quote?.ok ? (
        <div className="border-t border-[#E8EBF0] pt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink-muted">Estimated total</span>
            <span className="font-sans text-lg font-bold tabular-nums tracking-tight text-[#111827]">
              {formatMinorAsEuro(quote.customerTotalMinor)}
            </span>
          </div>
          {showBreakdown && interval.ok ? (
            <p className="mt-0.5 text-right text-xs text-ink-muted">
              {Math.min(Math.max(1, quantity), maxQty)} × {interval.durationCount}{' '}
              {interval.durationUnit}
              {interval.durationCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : quote && !quote.ok ? (
        <p className="text-sm text-[#9f1239]" role="alert">
          {quote.error}
        </p>
      ) : null}

      <div className="min-h-[1rem] text-xs text-ink-muted" aria-live="polite">
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

      {!checkoutOpen ? (
        <p className="flex items-start gap-1.5 text-xs text-ink-muted" role="note">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0758CB]" aria-hidden />
          Online payment is not open yet. Nothing is charged.
        </p>
      ) : null}

      <button
        type="button"
        className="tv-btn-primary min-h-11 w-full font-semibold disabled:opacity-60"
        disabled={continueDisabled}
        onClick={handleContinue}
      >
        Continue
      </button>
    </div>
  );
}
