import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Tag, Calendar, Percent, Check } from 'lucide-react';
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
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { SUPPLIER_MODAL_OVERLAY_CLASS, SUPPLIER_MODAL_PANEL_CLASS } from './supplierUi';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const closeSafe = useCallback(() => {
    if (!submitting) onClose();
  }, [onClose, submitting]);
  useDialogFocus(open, panelRef, closeSafe);

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

  const optionLabel =
    optionId === LISTING_WIDE_VALUE
      ? 'All options'
      : bookingOptions.find((o) => o.id === optionId)?.name?.trim() || '—';

  const shell = (
    <div ref={panelRef} className={`${SUPPLIER_MODAL_OVERLAY_CLASS} z-[90]`}>
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeSafe} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-wizard-title"
        className={`${SUPPLIER_MODAL_PANEL_CLASS} z-[91] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-finland/10 text-finland" aria-hidden>
              <Tag className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Offers</p>
              <h2 id="discount-wizard-title" className="font-display text-xl text-ink tracking-tight mt-0.5">
                {editing ? 'Edit offer' : 'New discount offer'}
              </h2>
              <p className="text-sm text-ink-muted mt-0.5">
                Step {step + 1} of 3 · live on Traverion while dates are active
              </p>
            </div>
          </div>
          <button type="button" onClick={closeSafe} className="lux-tap-target p-2 -mr-1 text-ink-muted hover:text-ink" aria-label="Close">
            <X className="w-5 h-5" />
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
              <p className="text-sm text-ink-muted leading-relaxed">
                Choose the listing and the booking option travelers select. The discount applies only to that option’s price.
              </p>
              <div>
                <label htmlFor="offer-listing" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Listing
                </label>
                <select
                  id="offer-listing"
                  value={listingId}
                  onChange={(e) => {
                    setListingId(e.target.value);
                    setOptionId('');
                  }}
                  className="tv-input"
                >
                  <option value="">Select a listing…</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Booking option</p>
                {!selectedTour ? (
                  <p className="text-sm text-ink-muted">Choose a listing first.</p>
                ) : bookingOptions.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200/80">
                    This listing has no bookable options yet. Add options under Cost &amp; options in the listing editor, then return here.
                  </p>
                ) : (
                  <div className="space-y-2" role="radiogroup" aria-label="Booking option">
                    {editing ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={optionId === LISTING_WIDE_VALUE}
                        onClick={() => setOptionId(LISTING_WIDE_VALUE)}
                        className={`lux-flat flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ring-1 ${
                          optionId === LISTING_WIDE_VALUE
                            ? 'bg-finland/10 ring-2 ring-finland shadow-sm'
                            : 'bg-paper-raised ring-black/[0.08] hover:bg-black/[0.03]'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            optionId === LISTING_WIDE_VALUE ? 'border-finland bg-finland text-white' : 'border-black/20'
                          }`}
                          aria-hidden
                        >
                          {optionId === LISTING_WIDE_VALUE ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">All options (legacy)</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">Keep only if editing an older listing-wide offer.</span>
                        </span>
                      </button>
                    ) : null}
                    {bookingOptions.map((o) => {
                      const selected = optionId === o.id;
                      const price = formatMoney(o.priceUsd, normalizeCurrency(selectedTour.price?.currency));
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setOptionId(o.id)}
                          className={`lux-flat flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ring-1 ${
                            selected
                              ? 'bg-finland/10 ring-2 ring-finland shadow-sm'
                              : 'bg-paper-raised ring-black/[0.08] hover:bg-black/[0.03]'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              selected ? 'border-finland bg-finland text-white' : 'border-black/20'
                            }`}
                            aria-hidden
                          >
                            {selected ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-semibold text-ink">{o.name.trim() || 'Option'}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{price}</span>
                            </span>
                            <span className="mt-0.5 block text-xs text-ink-muted">Per person · travelers see this discounted price</span>
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
              <div className="flex items-center gap-2 text-finland">
                <Calendar className="w-4 h-4" aria-hidden />
                <p className="text-sm font-semibold text-ink">When is this offer valid?</p>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Inclusive dates. Maximum span: <strong className="text-ink font-semibold">{SUPPLIER_DISCOUNT_MAX_RANGE_DAYS} days</strong> per
                offer.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="offer-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    From
                  </label>
                  <input
                    id="offer-from"
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="tv-input"
                  />
                </div>
                <div>
                  <label htmlFor="offer-until" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Until
                  </label>
                  <input
                    id="offer-until"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="tv-input"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && editing?.type === 'fixed' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">Fixed amount offer</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                This older promotion uses a fixed amount. You can change dates and which option it applies to; the amount stays{' '}
                <strong className="text-finland">${Number(editing.value)}</strong> off.
              </p>
            </div>
          )}

          {step === 2 && (!editing || editing.type === 'percent') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-finland">
                <Percent className="w-4 h-4" aria-hidden />
                <p className="text-sm font-semibold text-ink">Discount amount</p>
              </div>
              <p className="text-sm text-ink-muted">
                Between {SUPPLIER_DISCOUNT_PERCENT_MIN}% and {SUPPLIER_DISCOUNT_PERCENT_MAX}% off the option price.
              </p>
              <div className="space-y-3 rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/[0.06]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-4xl tracking-tight text-finland tabular-nums">{percent}%</span>
                  <span className="text-sm text-ink-muted">off</span>
                </div>
                <input
                  type="range"
                  min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                  max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="w-full accent-finland"
                  aria-label="Discount percent"
                />
                <div className="flex justify-between text-xs text-ink-faint tabular-nums">
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MIN}%</span>
                  <span>{SUPPLIER_DISCOUNT_PERCENT_MAX}%</span>
                </div>
              </div>
              <div className="space-y-1.5 rounded-xl bg-paper-raised px-3.5 py-3 text-sm ring-1 ring-black/[0.06]">
                <p>
                  <span className="text-ink-muted">Listing</span>
                  <span className="mt-0.5 block font-medium text-ink">{selectedTour?.title ?? '—'}</span>
                </p>
                <p>
                  <span className="text-ink-muted">Option</span>
                  <span className="mt-0.5 block font-medium text-ink">{optionLabel}</span>
                </p>
                <p>
                  <span className="text-ink-muted">Dates</span>
                  <span className="mt-0.5 block font-medium text-ink tabular-nums">
                    {validFrom || '—'} → {validUntil || '—'}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-black/[0.06] bg-paper px-4 py-3 sm:flex-row sm:justify-between sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
              className="tv-btn-primary inline-flex min-h-[44px] items-center justify-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
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
