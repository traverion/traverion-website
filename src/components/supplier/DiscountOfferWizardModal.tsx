import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Tag, Calendar, Percent } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import type { ListingDiscount } from '../../data/supabase-discounts';
import {
  insertDiscount,
  updateDiscount,
  validateSupplierDiscountDateRange,
  SUPPLIER_DISCOUNT_PERCENT_MIN,
  SUPPLIER_DISCOUNT_PERCENT_MAX,
  SUPPLIER_DISCOUNT_MAX_RANGE_DAYS,
} from '../../data/supabase-discounts';

const LISTING_WIDE_VALUE = '__listing_wide__';

type Props = {
  open: boolean;
  onClose: () => void;
  listings: TourPackage[];
  editing: ListingDiscount | null;
  onSaved: () => void;
};

function optionsForTour(tour: TourPackage | undefined) {
  if (!tour) return [];
  const extras = parseListingExtras(tour.listingExtras as unknown);
  return materializedBookingOptions(extras.bookingOptions);
}

export default function DiscountOfferWizardModal({ open, onClose, listings, editing, onSaved }: Props) {
  const [step, setStep] = useState(0);
  const [listingId, setListingId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [percent, setPercent] = useState(SUPPLIER_DISCOUNT_PERCENT_MIN);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTour = useMemo(
    () => listings.find((l) => l.id === listingId),
    [listings, listingId]
  );
  const bookingOptions = useMemo(() => optionsForTour(selectedTour), [selectedTour]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    if (editing) {
      setListingId(editing.listing_id);
      setOptionId(editing.booking_option_id?.trim() ? editing.booking_option_id : LISTING_WIDE_VALUE);
      setValidFrom(editing.valid_from ?? '');
      setValidUntil(editing.valid_until ?? '');
      if (editing.type === 'percent') {
        const v = Math.round(Number(editing.value));
        setPercent(
          Math.min(SUPPLIER_DISCOUNT_PERCENT_MAX, Math.max(SUPPLIER_DISCOUNT_PERCENT_MIN, v || SUPPLIER_DISCOUNT_PERCENT_MIN))
        );
      }
      setStep(0);
    } else {
      setStep(0);
      setListingId(listings[0]?.id ?? '');
      setOptionId('');
      setValidFrom('');
      setValidUntil('');
      setPercent(15);
    }
  }, [open, editing?.id, listings]);

  useEffect(() => {
    if (!open || !listingId || editing) return;
    const opts = optionsForTour(listings.find((l) => l.id === listingId));
    if (opts.length === 1 && !optionId) {
      setOptionId(opts[0].id);
    }
  }, [open, listingId, listings, editing, optionId]);

  const resolveBookingOptionId = (): string | null => {
    if (optionId === LISTING_WIDE_VALUE || !optionId.trim()) return null;
    return optionId.trim();
  };

  const dateRangeValid =
    Boolean(validFrom && validUntil) && validateSupplierDiscountDateRange(validFrom, validUntil) === null;

  const step0NextDisabled =
    !listingId ||
    (bookingOptions.length === 0 && !(editing && optionId === LISTING_WIDE_VALUE)) ||
    (editing ? !optionId : !optionId || optionId === LISTING_WIDE_VALUE);

  const handleSubmit = async () => {
    setError(null);
    const rangeErr = validateSupplierDiscountDateRange(validFrom, validUntil);
    if (rangeErr) {
      setError(rangeErr);
      return;
    }
    const scope = resolveBookingOptionId();
    if (!editing && !scope) {
      setError('Choose which booking option this offer applies to.');
      return;
    }
    if (!listingId) {
      setError('Choose a listing.');
      return;
    }
    const p = Math.round(percent);
    if ((!editing || editing.type === 'percent') && (p < SUPPLIER_DISCOUNT_PERCENT_MIN || p > SUPPLIER_DISCOUNT_PERCENT_MAX)) {
      setError(`Discount must be between ${SUPPLIER_DISCOUNT_PERCENT_MIN}% and ${SUPPLIER_DISCOUNT_PERCENT_MAX}%.`);
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        if (editing.type === 'fixed') {
          const updated = await updateDiscount(editing.id, {
            valid_from: validFrom,
            valid_until: validUntil,
            booking_option_id: scope,
          });
          if (!updated) {
            setError('Could not update this offer. Try again.');
            return;
          }
        } else {
          const updated = await updateDiscount(editing.id, {
            listing_id: listingId,
            type: 'percent',
            value: p,
            code: null,
            valid_from: validFrom,
            valid_until: validUntil,
            booking_option_id: scope,
          });
          if (!updated) {
            setError('Could not update this offer. Try again.');
            return;
          }
        }
      } else {
        const inserted = await insertDiscount({
          listing_id: listingId,
          type: 'percent',
          value: p,
          code: null,
          valid_from: validFrom,
          valid_until: validUntil,
          booking_option_id: scope,
        });
        if (!inserted) {
          setError('Could not create this offer. Check your connection and try again.');
          return;
        }
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const shell = (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-md"
        aria-label="Close"
        onClick={() => !submitting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-wizard-title"
        className="relative z-[91] flex w-full max-w-lg max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)),92dvh)] sm:max-h-[min(92dvh,720px)] flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden motion-safe:animate-slide-up sm:motion-safe:animate-none"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-finland/10 text-finland flex items-center justify-center shrink-0">
              <Tag className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="discount-wizard-title" className="text-base font-semibold text-gray-900 truncate">
                {editing ? 'Edit offer' : 'New discount offer'}
              </h2>
              <p className="text-[11px] text-gray-500">
                Step {step + 1} of 3 · shown on Traverion when dates are active
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="lux-tap-target p-2 rounded-lg text-gray-500 hover:bg-gray-200 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-3 py-1.5 sm:px-4 sm:py-2 border-b border-gray-100 bg-white shrink-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-finland' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4 space-y-3 sm:space-y-4">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Pick the tour and the priced option guests book. The discount applies only to that option’s price on the site.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Listing</label>
                <select
                  value={listingId}
                  onChange={(e) => {
                    setListingId(e.target.value);
                    setOptionId('');
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
                >
                  <option value="">Select a tour…</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Booking option
                </label>
                {!selectedTour ? (
                  <p className="text-sm text-gray-500">Choose a listing first.</p>
                ) : bookingOptions.length === 0 ? (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    This listing has no bookable options yet. Add options under <strong>Cost &amp; options</strong> in the listing
                    editor, then return here.
                  </p>
                ) : (
                  <select
                    value={optionId}
                    onChange={(e) => setOptionId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="">Select an option…</option>
                    {editing && (
                      <option value={LISTING_WIDE_VALUE}>All options (legacy)</option>
                    )}
                    {bookingOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name.trim() || 'Option'} · ${o.priceUsd} / person
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-finland">
                <Calendar className="w-4 h-4" aria-hidden />
                <p className="text-sm font-medium text-gray-900">When is this offer valid?</p>
              </div>
              <p className="text-sm text-gray-600">
                Use inclusive dates. Maximum span: <strong>{SUPPLIER_DISCOUNT_MAX_RANGE_DAYS} days</strong> per offer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && editing?.type === 'fixed' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-900">Fixed amount offer</p>
              <p className="text-sm text-gray-600">
                This older promotion uses a fixed dollar amount. You can change dates and which option it applies to; the amount
                stays <strong className="text-finland">${Number(editing.value)}</strong> off.
              </p>
            </div>
          )}

          {step === 2 && (!editing || editing.type === 'percent') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-finland">
                <Percent className="w-4 h-4" aria-hidden />
                <p className="text-sm font-medium text-gray-900">Discount amount</p>
              </div>
              <p className="text-sm text-gray-600">
                Between {SUPPLIER_DISCOUNT_PERCENT_MIN}% and {SUPPLIER_DISCOUNT_PERCENT_MAX}% off the option price.
              </p>
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-3xl font-bold text-finland tabular-nums">{percent}%</span>
                  <span className="text-sm text-gray-500">off</span>
                </div>
                <input
                  type="range"
                  min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                  max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="w-full accent-finland"
                />
                <div className="flex justify-between text-xs text-gray-500 tabular-nums">
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MIN}%</span>
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MAX}%</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 rounded-lg border border-gray-100 bg-white px-3 py-2 space-y-1">
                <p>
                  <span className="font-medium text-gray-700">Listing:</span> {selectedTour?.title ?? '—'}
                </p>
                <p>
                  <span className="font-medium text-gray-700">Option:</span>{' '}
                  {optionId === LISTING_WIDE_VALUE
                    ? 'All options'
                    : bookingOptions.find((o) => o.id === optionId)?.name || '—'}
                </p>
                <p>
                  <span className="font-medium text-gray-700">Dates:</span> {validFrom || '—'} → {validUntil || '—'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-t border-gray-100 bg-gray-50/90 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            className="touch-manipulation inline-flex items-center justify-center gap-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-300 text-gray-800 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {step === 0 ? (
              'Cancel'
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                Back
              </>
            )}
          </button>
          {step < 2 ? (
            <button
              type="button"
              disabled={submitting || (step === 0 && step0NextDisabled) || (step === 1 && !dateRangeValid)}
              onClick={() => {
                setError(null);
                if (step === 1) {
                  const err = validateSupplierDiscountDateRange(validFrom, validUntil);
                  if (err) {
                    setError(err);
                    return;
                  }
                }
                if (step === 0) {
                  if (!editing && !optionId) {
                    setError('Select a booking option.');
                    return;
                  }
                  if (!editing && optionId === LISTING_WIDE_VALUE) {
                    setError('Select a specific booking option for new offers.');
                    return;
                  }
                }
                setStep((s) => s + 1);
              }}
              className="touch-manipulation inline-flex items-center justify-center gap-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="touch-manipulation inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark disabled:opacity-50"
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
