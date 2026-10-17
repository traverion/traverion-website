import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Tag, Percent, Check } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { parseListingExtras, materializedBookingOptions, type ListingBookingOption } from '../../types/listingExtras';
import type { ListingDiscount } from '../../data/supabase-discounts';
import {
  saveSupplierOffer,
  SUPPLIER_DISCOUNT_PERCENT_MIN,
  SUPPLIER_DISCOUNT_PERCENT_MAX,
  SUPPLIER_DISCOUNT_MAX_RANGE_DAYS,
  validateSupplierDiscountDateRange,
} from '../../data/supabase-discounts';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { fromMinorUnits } from '../../lib/commercial-money';
import {
  bestCustomerDiscount,
  estimatedSupplierEarningsMinor,
  supplierOffersOverlap,
  validateOfferDateWindow,
} from '../../lib/offer-eligibility';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { SUPPLIER_MODAL_OVERLAY_CLASS, SUPPLIER_MODAL_PANEL_CLASS } from './supplierUi';
import { partnerOfferListingIsStayUnsupported } from '../../lib/partner-offers-honesty';
import PartnerSelect from './PartnerSelect';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierActiveCommercialTerms } from '../../data/supabase-earnings';
import { optionHeadlineUnitPrice } from '../../lib/price-categories';
import { listingOptionHasSchedules, listingOptionReadySchedules } from '../../lib/listing-option-schedules';

type Props = {
  open: boolean;
  onClose: () => void;
  listings: TourPackage[];
  /** Rows updated in place. Empty when creating or duplicating. */
  editingGroup: ListingDiscount[];
  /** Prefill for duplicate. Not written over. */
  draft: ListingDiscount[] | null;
  existingOffers: ListingDiscount[];
  onSaved: () => void;
};

function optionsForTour(tour: TourPackage | undefined) {
  if (!tour) return [];
  const extras = parseListingExtras(tour.listingExtras as unknown);
  return materializedBookingOptions(extras.bookingOptions);
}

function optionPriceSpan(option: ListingBookingOption): { low: number; high: number } {
  const prices: number[] = [];
  if (listingOptionHasSchedules(option)) {
    for (const schedule of listingOptionReadySchedules(option)) {
      const n = optionHeadlineUnitPrice({ ...option, ...schedule } as ListingBookingOption);
      if (n > 0) prices.push(n);
    }
  }
  const headline = optionHeadlineUnitPrice(option);
  if (headline > 0) prices.push(headline);
  if (prices.length === 0) return { low: 0, high: 0 };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

function priceLabel(low: number, high: number, currency: string): string {
  if (!(low > 0)) return 'Price unavailable';
  if (high - low > 0.009) return `${formatMoney(low, currency)}–${formatMoney(high, currency)}`;
  return formatMoney(low, currency);
}

export default function DiscountOfferWizardModal({
  open,
  onClose,
  listings,
  editingGroup,
  draft,
  existingOffers,
  onSaved,
}: Props) {
  const { user } = useSupplierAuth();
  const editing = editingGroup[0] ?? null;
  const [step, setStep] = useState(0);
  const [listingId, setListingId] = useState('');
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [listingWide, setListingWide] = useState(false);
  const [legacyWide, setLegacyWide] = useState(false);
  const [bookFrom, setBookFrom] = useState('');
  const [bookUntil, setBookUntil] = useState('');
  const [limitActivity, setLimitActivity] = useState(false);
  const [activityFrom, setActivityFrom] = useState('');
  const [activityUntil, setActivityUntil] = useState('');
  const [percent, setPercent] = useState(15);
  const [limitBookings, setLimitBookings] = useState(false);
  const [bookingLimit, setBookingLimit] = useState('20');
  const [commissionBps, setCommissionBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeSafe = useCallback(() => {
    if (!submitting) onClose();
  }, [onClose, submitting]);
  useDialogFocus(open, panelRef, closeSafe);

  const tourListings = useMemo(
    () => listings.filter((l) => !partnerOfferListingIsStayUnsupported(l)),
    [listings]
  );
  const selectedTour = useMemo(
    () => listings.find((l) => l.id === listingId),
    [listings, listingId]
  );
  const bookingOptions = useMemo(() => optionsForTour(selectedTour), [selectedTour]);
  const currency = normalizeCurrency(selectedTour?.price?.currency);

  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    void fetchSupplierActiveCommercialTerms(user.id).then((row) => {
      if (!cancelled) setCommissionBps(row?.commission_bps ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    const source = editingGroup.length > 0 ? editingGroup : draft ?? [];
    const head = source[0];
    if (head) {
      setListingId(head.listing_id);
      const wide = source.length === 1 && !head.booking_option_id?.trim();
      setListingWide(wide);
      setLegacyWide(Boolean(editingGroup.length > 0 && wide));
      setOptionIds(wide ? [] : source.map((row) => row.booking_option_id?.trim() || '').filter(Boolean));
      setBookFrom(head.book_from ?? head.valid_from ?? '');
      setBookUntil(head.book_until ?? head.valid_until ?? '');
      const hasActivity = Boolean(head.activity_from && head.activity_until);
      setLimitActivity(hasActivity);
      setActivityFrom(head.activity_from ?? '');
      setActivityUntil(head.activity_until ?? '');
      setLimitBookings(head.booking_limit != null && head.booking_limit > 0);
      setBookingLimit(head.booking_limit != null && head.booking_limit > 0 ? String(head.booking_limit) : '20');
      if (head.type === 'percent') {
        const v = Math.round(Number(head.value));
        setPercent(
          Math.min(SUPPLIER_DISCOUNT_PERCENT_MAX, Math.max(SUPPLIER_DISCOUNT_PERCENT_MIN, v || 15))
        );
      }
      setStep(0);
    } else {
      setStep(0);
      setListingId(tourListings[0]?.id ?? '');
      setOptionIds([]);
      setListingWide(false);
      setLegacyWide(false);
      setBookFrom('');
      setBookUntil('');
      setLimitActivity(false);
      setActivityFrom('');
      setActivityUntil('');
      setLimitBookings(false);
      setBookingLimit('20');
      setPercent(15);
    }
  }, [open, editing?.id, draft, editingGroup, tourListings]);

  useEffect(() => {
    if (!open || !listingId || editing || draft) return;
    const opts = optionsForTour(listings.find((l) => l.id === listingId));
    if (opts.length === 1 && optionIds.length === 0 && !listingWide) {
      setOptionIds([opts[0].id]);
    }
  }, [open, listingId, listings, editing, draft, optionIds.length, listingWide]);

  const bookingWindowError = bookFrom && bookUntil ? validateSupplierDiscountDateRange(bookFrom, bookUntil) : null;
  const activityWindowError =
    limitActivity && (activityFrom || activityUntil)
      ? validateOfferDateWindow(activityFrom, activityUntil, 'activity period')
      : null;
  const dateRangeValid = Boolean(bookFrom && bookUntil) && !bookingWindowError && (!limitActivity || !activityWindowError) && (!limitActivity || Boolean(activityFrom && activityUntil));

  const step0NextDisabled =
    !listingId ||
    bookingOptions.length === 0 ||
    (!listingWide && optionIds.length === 0);

  const selectedOptions = bookingOptions.filter((option) => optionIds.includes(option.id));
  const overlap = useMemo(() => {
    if (!listingId || (!listingWide && optionIds.length === 0) || !bookFrom || !bookUntil) return false;
    const ignore = new Set(editingGroup.map((row) => row.id));
    return existingOffers.some((row) => {
      if (row.listing_id !== listingId || ignore.has(row.id) || row.deleted_at) return false;
      return supplierOffersOverlap(
        {
          id: editing?.id,
          type: 'percent',
          value: percent,
          book_from: bookFrom,
          book_until: bookUntil,
          activity_from: limitActivity ? activityFrom : null,
          activity_until: limitActivity ? activityUntil : null,
          optionIds: listingWide ? [] : optionIds,
        },
        row
      );
    });
  }, [
    listingId,
    listingWide,
    optionIds,
    bookFrom,
    bookUntil,
    limitActivity,
    activityFrom,
    activityUntil,
    existingOffers,
    editingGroup,
    editing?.id,
    percent,
  ]);

  const handleSubmit = async () => {
    setError(null);
    const bookErr = validateSupplierDiscountDateRange(bookFrom, bookUntil);
    if (bookErr) {
      setError(bookErr);
      return;
    }
    if (limitActivity) {
      const actErr = validateOfferDateWindow(activityFrom, activityUntil, 'activity period');
      if (actErr) {
        setError(actErr);
        return;
      }
    }
    if (!listingWide && optionIds.length === 0) {
      setError('Choose at least one booking option.');
      return;
    }
    if (!listingId) {
      setError('Choose a listing.');
      return;
    }
    if (selectedTour && partnerOfferListingIsStayUnsupported(selectedTour)) {
      setError('Stay listings cannot use percentage discounts. Offers only change the price on tour checkout.');
      return;
    }
    const p = Math.round(percent);
    const fixedEdit = editing?.type === 'fixed';
    if (!fixedEdit && (p < SUPPLIER_DISCOUNT_PERCENT_MIN || p > SUPPLIER_DISCOUNT_PERCENT_MAX)) {
      setError(`Discount must be between ${SUPPLIER_DISCOUNT_PERCENT_MIN}% and ${SUPPLIER_DISCOUNT_PERCENT_MAX}%.`);
      return;
    }
    let limit: number | null = null;
    if (limitBookings) {
      const n = Number(bookingLimit);
      if (!Number.isInteger(n) || n < 1) {
        setError('Booking limit must be a positive whole number.');
        return;
      }
      limit = n;
    }
    setSubmitting(true);
    try {
      const saved = await saveSupplierOffer({
        listingId,
        existing: editingGroup,
        optionIds,
        listingWide,
        type: fixedEdit ? 'fixed' : 'percent',
        value: fixedEdit ? Number(editing?.value) : p,
        bookFrom,
        bookUntil,
        activityFrom: limitActivity ? activityFrom : null,
        activityUntil: limitActivity ? activityUntil : null,
        bookingLimit: limit,
      });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = editing ? 'Edit offer' : draft?.length ? 'Duplicate offer' : 'New discount offer';

  const shell = (
    <div ref={panelRef} className={`${SUPPLIER_MODAL_OVERLAY_CLASS} z-[90]`}>
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeSafe} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-wizard-title"
        className={`${SUPPLIER_MODAL_PANEL_CLASS} z-[91] flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-finland/10 text-finland" aria-hidden>
              <Tag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Offers</p>
              <h2 id="discount-wizard-title" className="mt-0.5 text-xl font-semibold tracking-tight text-ink">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">Step {step + 1} of 3</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSafe}
            className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center p-2 -mr-1 text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 px-4 py-2.5 sm:px-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-finland' : 'bg-black/[0.08]'}`}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-900 ring-1 ring-red-200/80" role="alert">
              {error}
            </p>
          ) : null}

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-ink-muted">
                Choose one published tour and the booking options this offer covers. Stay listings are not included.
              </p>
              <div>
                <span id="offer-listing-label" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Listing
                </span>
                <PartnerSelect
                  id="offer-listing"
                  aria-labelledby="offer-listing-label"
                  value={listingId}
                  onChange={(next) => {
                    setListingId(next);
                    setOptionIds([]);
                    setListingWide(false);
                  }}
                  placeholder="Select a tour…"
                  options={[
                    { value: '', label: 'Select a tour…' },
                    ...(editing && selectedTour && partnerOfferListingIsStayUnsupported(selectedTour)
                      ? [{ value: selectedTour.id, label: `${selectedTour.title} (stay — unsupported)` }]
                      : []),
                    ...tourListings.map((l) => ({ value: l.id, label: l.title })),
                  ]}
                />
                {tourListings.length === 0 && !editing ? (
                  <p className="mt-2 text-sm text-amber-950">Publish a tour first. Stay listings cannot receive percentage offers yet.</p>
                ) : null}
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Booking options</p>
                {!selectedTour ? (
                  <p className="text-sm text-ink-muted">Choose a listing first.</p>
                ) : bookingOptions.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200/80">
                    This listing has no bookable options yet. Add at least one ready option, then return here.
                  </p>
                ) : (
                  <div className="space-y-2" role="group" aria-label="Booking options">
                    {legacyWide ? (
                      <button
                        type="button"
                        aria-pressed={listingWide}
                        onClick={() => {
                          setListingWide(true);
                          setOptionIds([]);
                        }}
                        className="lux-flat flex w-full items-start gap-3 rounded-xl bg-finland/10 px-3.5 py-3 text-left ring-2 ring-finland"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-finland bg-finland text-white" aria-hidden>
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-ink">All options</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">This older offer applies to every option on the listing.</span>
                        </span>
                      </button>
                    ) : null}
                    {bookingOptions.map((option) => {
                      const selected = optionIds.includes(option.id);
                      const span = optionPriceSpan(option);
                      const variable = span.high - span.low > 0.009;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setListingWide(false);
                            setOptionIds((current) =>
                              current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id]
                            );
                          }}
                          className={`lux-flat flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left ring-1 transition-colors ${
                            selected ? 'bg-finland/10 ring-2 ring-finland' : 'bg-white ring-black/[0.08] hover:bg-black/[0.02]'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                              selected ? 'border-finland bg-finland text-white' : 'border-black/20 bg-white'
                            }`}
                            aria-hidden
                          >
                            {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-semibold text-ink">{option.name.trim() || 'Option'}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                                {priceLabel(span.low, span.high, currency)}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-ink-muted">
                              {currency}
                              {variable ? ' · starting price varies by date or participant' : ' · customer price before the offer'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink">Booking period</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Customers must book during these dates to receive the offer. Dates are inclusive in the experience timezone.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="offer-book-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Booking starts
                  </label>
                  <input id="offer-book-from" type="date" value={bookFrom} onChange={(e) => setBookFrom(e.target.value)} className="tv-input" />
                </div>
                <div>
                  <label htmlFor="offer-book-until" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Booking ends
                  </label>
                  <input id="offer-book-until" type="date" value={bookUntil} onChange={(e) => setBookUntil(e.target.value)} className="tv-input" />
                </div>
              </div>
              {bookingWindowError ? <p className="text-sm text-red-800">{bookingWindowError}</p> : null}
              <p className="text-xs text-ink-muted">Maximum booking period: {SUPPLIER_DISCOUNT_MAX_RANGE_DAYS} days.</p>

              <label className="flex items-start gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-black/[0.08]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-finland"
                  checked={limitActivity}
                  onChange={(e) => setLimitActivity(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">Limit offer to specific activity dates</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                    Off when the offer should cover any available departure booked during the booking period.
                  </span>
                </span>
              </label>
              {limitActivity ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="offer-activity-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Activity starts
                    </label>
                    <input id="offer-activity-from" type="date" value={activityFrom} onChange={(e) => setActivityFrom(e.target.value)} className="tv-input" />
                  </div>
                  <div>
                    <label htmlFor="offer-activity-until" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Activity ends
                    </label>
                    <input id="offer-activity-until" type="date" value={activityUntil} onChange={(e) => setActivityUntil(e.target.value)} className="tv-input" />
                  </div>
                </div>
              ) : null}
              {activityWindowError ? <p className="text-sm text-red-800">{activityWindowError}</p> : null}
              <p className="text-sm leading-relaxed text-ink-muted">
                Example: a booking period of 1–14 March with activity dates of 10–31 March discounts a 20 March departure only when the customer books by 14 March.
              </p>
            </div>
          )}

          {step === 2 && editing?.type === 'fixed' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">Fixed amount offer</p>
              <p className="text-sm leading-relaxed text-ink-muted">
                This older promotion uses a fixed amount. You can change the dates, options, and booking limit. The amount stays{' '}
                <strong className="text-finland">{formatMoney(Number(editing.value), currency)}</strong> off.
              </p>
            </div>
          )}

          {step === 2 && (!editing || editing.type === 'percent') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-finland">
                <Percent className="h-4 w-4" aria-hidden />
                <p className="text-sm font-semibold text-ink">Discount</p>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-black/[0.06]">
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor="offer-percent" className="text-sm font-medium text-ink">
                    Percent off
                  </label>
                  <input
                    id="offer-percent"
                    type="number"
                    inputMode="numeric"
                    min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                    max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                    step={1}
                    value={percent}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      setPercent(Math.min(SUPPLIER_DISCOUNT_PERCENT_MAX, Math.max(SUPPLIER_DISCOUNT_PERCENT_MIN, n)));
                    }}
                    className="tv-input w-20 text-right tabular-nums"
                  />
                </div>
                <input
                  type="range"
                  min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                  max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="mt-3 w-full accent-finland"
                  aria-valuemin={SUPPLIER_DISCOUNT_PERCENT_MIN}
                  aria-valuemax={SUPPLIER_DISCOUNT_PERCENT_MAX}
                  aria-valuenow={percent}
                  aria-label="Discount percent"
                />
                <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-faint">
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MIN}%</span>
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MAX}%</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">Price preview</p>
                {(listingWide ? bookingOptions : selectedOptions).map((option) => {
                  const span = optionPriceSpan(option);
                  const low = bestCustomerDiscount(span.low, [{ type: 'percent', value: percent }], currency);
                  const high = bestCustomerDiscount(span.high, [{ type: 'percent', value: percent }], currency);
                  const variable = span.high - span.low > 0.009;
                  const earnings =
                    commissionBps != null && span.low > 0
                      ? estimatedSupplierEarningsMinor(span.low, percent, commissionBps)
                      : null;
                  const earningsHigh =
                    commissionBps != null && variable && span.high > 0
                      ? estimatedSupplierEarningsMinor(span.high, percent, commissionBps)
                      : null;
                  return (
                    <div key={option.id} className="rounded-xl bg-white px-3.5 py-3 text-sm ring-1 ring-black/[0.06]">
                      <p className="font-semibold text-ink">{option.name.trim() || 'Option'}</p>
                      <dl className="mt-2 space-y-1.5">
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Original customer price</dt>
                          <dd className="tabular-nums text-ink">{priceLabel(span.low, span.high, currency)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Discount</dt>
                          <dd className="tabular-nums text-ink">{percent}%</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">New customer price</dt>
                          <dd className="font-semibold tabular-nums text-ink">
                            {span.low > 0 ? priceLabel(low.price, variable ? high.price : low.price, currency) : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-muted">Estimated supplier earnings</dt>
                          <dd className="tabular-nums text-ink">
                            {earnings == null
                              ? '—'
                              : priceLabel(
                                  fromMinorUnits(earnings),
                                  earningsHigh != null ? fromMinorUnits(earningsHigh) : fromMinorUnits(earnings),
                                  currency
                                )}
                          </dd>
                        </div>
                      </dl>
                      {variable ? (
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                          This option’s price varies. The range uses the lowest and highest prices on file.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <p className="text-xs leading-relaxed text-ink-muted">
                  Estimated earnings use your current commission rate on the discounted customer price. They are not a guaranteed payout.
                </p>
                {commissionBps == null ? (
                  <p className="text-xs text-ink-muted">Estimated earnings appear when your commission terms are on file.</p>
                ) : null}
              </div>
            </div>
          )}

          {step === 2 ? (
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-black/[0.08]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-finland"
                  checked={limitBookings}
                  onChange={(e) => setLimitBookings(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">Limit number of discounted bookings</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                    Default is unlimited. A full limit does not close the tour — customers can still book at the regular price.
                  </span>
                </span>
              </label>
              {limitBookings ? (
                <div>
                  <label htmlFor="offer-booking-limit" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Maximum discounted bookings
                  </label>
                  <input
                    id="offer-booking-limit"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={bookingLimit}
                    onChange={(e) => setBookingLimit(e.target.value)}
                    className="tv-input w-28 tabular-nums"
                  />
                </div>
              ) : null}
              {overlap ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200/80" role="status">
                  Another offer already covers one of these options on overlapping dates. Traverion applies only the best customer discount. This offer will not be stacked, and the other offer is left unchanged.
                </p>
              ) : null}
              {editing ? (
                <p className="text-xs leading-relaxed text-ink-muted">
                  Bookings already confirmed keep the price they were charged.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-black/[0.06] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-5">
          <button
            type="button"
            onClick={() => {
              if (step === 0) onClose();
              else {
                setStep((s) => s - 1);
                setError(null);
              }
            }}
            disabled={submitting}
            className="tv-btn-ghost inline-flex min-h-[44px] items-center justify-center gap-1"
          >
            {step === 0 ? 'Cancel' : (<><ChevronLeft className="h-4 w-4" />Back</>)}
          </button>
          {step < 2 ? (
            <button
              type="button"
              disabled={submitting || (step === 0 && step0NextDisabled) || (step === 1 && !dateRangeValid)}
              onClick={() => {
                setError(null);
                if (step === 1) {
                  const err = validateSupplierDiscountDateRange(bookFrom, bookUntil);
                  if (err) {
                    setError(err);
                    return;
                  }
                  if (limitActivity) {
                    const actErr = validateOfferDateWindow(activityFrom, activityUntil, 'activity period');
                    if (actErr) {
                      setError(actErr);
                      return;
                    }
                  }
                }
                if (step === 0 && !listingWide && optionIds.length === 0) {
                  setError('Select a booking option.');
                  return;
                }
                setStep((s) => s + 1);
              }}
              className="tv-btn-primary inline-flex min-h-[44px] items-center justify-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="tv-btn-primary inline-flex min-h-[44px] items-center justify-center"
            >
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create offer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
