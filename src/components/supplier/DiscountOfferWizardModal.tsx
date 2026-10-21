import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Tag, Check, ChevronDown } from 'lucide-react';
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
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';

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

type ProductType = 'tour' | 'stay' | 'rental';

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
  const [productType, setProductType] = useState<ProductType>('tour');
  const [listingId, setListingId] = useState('');
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [listingWide, setListingWide] = useState(false);
  const [legacyWide, setLegacyWide] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionQuery, setOptionQuery] = useState('');
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
  const optionsRef = useRef<HTMLDivElement>(null);
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
  const filteredOptions = useMemo(() => {
    const q = optionQuery.trim().toLowerCase();
    if (!q) return bookingOptions;
    return bookingOptions.filter((o) => (o.name.trim() || 'Option').toLowerCase().includes(q));
  }, [bookingOptions, optionQuery]);

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
    setOptionsOpen(false);
    setOptionQuery('');
    const source = editingGroup.length > 0 ? editingGroup : draft ?? [];
    const head = source[0];
    if (head) {
      setProductType('tour');
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
      setProductType('tour');
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

  useEffect(() => {
    if (!optionsOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (optionsRef.current?.contains(e.target as Node)) return;
      setOptionsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [optionsOpen]);

  const bookingWindowError = bookFrom && bookUntil ? validateSupplierDiscountDateRange(bookFrom, bookUntil) : null;
  const activityWindowError =
    limitActivity && (activityFrom || activityUntil)
      ? validateOfferDateWindow(activityFrom, activityUntil, 'activity period')
      : null;
  const dateRangeValid =
    Boolean(bookFrom && bookUntil) &&
    !bookingWindowError &&
    (!limitActivity || !activityWindowError) &&
    (!limitActivity || Boolean(activityFrom && activityUntil));

  const productSupported = productType === 'tour';
  const step0NextDisabled =
    !productSupported ||
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
    if (!productSupported) {
      setError('Timed percentage offers are available for tours only.');
      return;
    }
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

  const title = editing ? 'Edit offer' : draft?.length ? 'Duplicate offer' : 'New offer';
  const optionsTriggerLabel = listingWide
    ? 'All options'
    : optionIds.length === 0
      ? 'Select booking options…'
      : optionIds.length === 1
        ? selectedOptions[0]?.name.trim() || '1 option selected'
        : `${optionIds.length} options selected`;

  const shell = (
    <div ref={panelRef} className={`${SUPPLIER_MODAL_OVERLAY_CLASS} z-[90]`}>
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeSafe} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-wizard-title"
        className={`${SUPPLIER_MODAL_PANEL_CLASS} tv-offer-wizard z-[91]`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f4fa] text-[#073b83]"
              aria-hidden
            >
              <Tag className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="discount-wizard-title" className="tv-offer-wizard__title">
                {title}
              </h2>
              <p className="mt-0.5 text-[12px] text-[#71717a]">Step {step + 1} of 3</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSafe}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#71717a] hover:text-[#18181b]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 px-4 py-2 sm:px-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#073b83]' : 'bg-black/[0.08]'}`}
            />
          ))}
        </div>

        <div className="tv-offer-wizard__body space-y-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 ring-1 ring-red-200/80" role="alert">
              {error}
            </p>
          ) : null}

          {step === 0 && (
            <div className="space-y-3.5">
              <div>
                <p className="tv-offer-wizard__section-title">Product</p>
                <p className="tv-offer-wizard__hint">
                  Choose a product type, then the listing and booking options this offer covers.
                </p>
              </div>

              <div>
                <span id="offer-product-type-label" className="mb-1 block text-[11px] font-semibold text-[#71717a]">
                  Product type
                </span>
                <PartnerSelect
                  id="offer-product-type"
                  aria-labelledby="offer-product-type-label"
                  value={productType}
                  onChange={(next) => {
                    setProductType(next as ProductType);
                    setListingId('');
                    setOptionIds([]);
                    setListingWide(false);
                    setError(null);
                  }}
                  options={[
                    // Only product types with a real Offers → checkout path.
                    { value: 'tour', label: 'Tour & Activity' },
                  ]}
                />
                <p className="mt-1.5 text-[12px] text-[#71717a]">
                  Stay weekly/monthly discounts use listing pricing. Rental offers are not available yet.
                </p>
              </div>

              {productSupported ? (
                <>
                  <div>
                    <span id="offer-listing-label" className="mb-1 block text-[11px] font-semibold text-[#71717a]">
                      Select listing
                    </span>
                    <PartnerSelect
                      id="offer-listing"
                      aria-labelledby="offer-listing-label"
                      searchable="auto"
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
                      <p className="mt-2 text-[13px] text-amber-950">Publish a tour first.</p>
                    ) : null}
                  </div>

                  <div ref={optionsRef} className="tv-offer-multiselect">
                    <span id="offer-options-label" className="mb-1 block text-[11px] font-semibold text-[#71717a]">
                      Booking options
                    </span>
                    {!selectedTour ? (
                      <p className="text-[13px] text-[#71717a]">Choose a listing first.</p>
                    ) : bookingOptions.length === 0 ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-950 ring-1 ring-amber-200/80">
                        This listing has no bookable options yet.
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="tv-offer-multiselect__trigger"
                          aria-labelledby="offer-options-label"
                          aria-expanded={optionsOpen}
                          aria-haspopup="listbox"
                          onClick={() => setOptionsOpen((v) => !v)}
                        >
                          <span className="min-w-0 truncate">{optionsTriggerLabel}</span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-[#a1a1aa] ${optionsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {optionsOpen ? (
                          <div className="tv-offer-multiselect__menu" role="listbox" aria-multiselectable="true">
                            <div className="flex items-center gap-2 border-b border-[#eef0f3] px-2.5 py-2">
                              <input
                                type="search"
                                value={optionQuery}
                                onChange={(e) => setOptionQuery(e.target.value)}
                                placeholder="Search options…"
                                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                                aria-label="Search booking options"
                              />
                              <button
                                type="button"
                                className="text-[12px] font-semibold text-[#073b83]"
                                onClick={() => {
                                  setListingWide(false);
                                  setOptionIds(bookingOptions.map((o) => o.id));
                                }}
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                className="text-[12px] font-semibold text-[#71717a]"
                                onClick={() => {
                                  setListingWide(false);
                                  setOptionIds([]);
                                }}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="tv-offer-multiselect__list">
                              {legacyWide ? (
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={listingWide}
                                  aria-pressed={listingWide}
                                  className="tv-offer-multiselect__item"
                                  onClick={() => {
                                    setListingWide(true);
                                    setOptionIds([]);
                                  }}
                                >
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                      listingWide ? 'border-[#073b83] bg-[#073b83] text-white' : 'border-[#d4d4d8]'
                                    }`}
                                  >
                                    {listingWide ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                                  </span>
                                  <span>
                                    <span className="block font-semibold text-[#18181b]">All options</span>
                                    <span className="block text-[11px] text-[#71717a]">Legacy listing-wide offer</span>
                                  </span>
                                </button>
                              ) : null}
                              {filteredOptions.length === 0 ? (
                                <p className="px-3 py-2 text-[13px] text-[#71717a]">No matches</p>
                              ) : (
                                filteredOptions.map((option) => {
                                  const selected = optionIds.includes(option.id);
                                  const span = optionPriceSpan(option);
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      aria-pressed={selected}
                                      className="tv-offer-multiselect__item"
                                      onClick={() => {
                                        setListingWide(false);
                                        setOptionIds((current) =>
                                          current.includes(option.id)
                                            ? current.filter((id) => id !== option.id)
                                            : [...current, option.id]
                                        );
                                      }}
                                    >
                                      <span
                                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                          selected ? 'border-[#073b83] bg-[#073b83] text-white' : 'border-[#d4d4d8]'
                                        }`}
                                      >
                                        {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                          <span className="truncate font-semibold text-[#18181b]">
                                            {option.name.trim() || 'Option'}
                                          </span>
                                          <span className="shrink-0 tabular-nums text-[#52525b]">
                                            {priceLabel(span.low, span.high, currency)}
                                          </span>
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                        <p className="mt-1.5 text-[11px] text-[#a1a1aa]">
                          {listingWide
                            ? 'Applies to every option on this listing.'
                            : `${optionIds.length} selected · selections are kept when you move between steps.`}
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3.5">
              <div>
                <p className="tv-offer-wizard__section-title">Booking period</p>
                <p className="tv-offer-wizard__hint">
                  When the customer must book to receive the offer. Inclusive in the experience timezone. Max{' '}
                  {SUPPLIER_DISCOUNT_MAX_RANGE_DAYS} days.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Booking starts</span>
                  <div className="tv-offers-date-shell">
                    <TraverionSingleDateField
                      id="offer-book-from"
                      label=""
                      value={bookFrom}
                      minIso=""
                      placeholder="Start date"
                      onChange={setBookFrom}
                    />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Booking ends</span>
                  <div className="tv-offers-date-shell">
                    <TraverionSingleDateField
                      id="offer-book-until"
                      label=""
                      value={bookUntil}
                      minIso={bookFrom || ''}
                      placeholder="End date"
                      onChange={setBookUntil}
                    />
                  </div>
                </div>
              </div>
              {bookingWindowError ? <p className="text-[13px] text-red-800">{bookingWindowError}</p> : null}

              <label className="flex items-start gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-[#e5e7eb]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#073b83]"
                  checked={limitActivity}
                  onChange={(e) => setLimitActivity(e.target.checked)}
                />
                <span>
                  <span className="block text-[13px] font-semibold text-[#18181b]">Limit to specific activity dates</span>
                  <span className="mt-0.5 block text-[12px] text-[#71717a]">
                    Restrict which departure dates qualify once booked.
                  </span>
                </span>
              </label>
              {limitActivity ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Activity starts</span>
                    <div className="tv-offers-date-shell">
                      <TraverionSingleDateField
                        id="offer-activity-from"
                        label=""
                        value={activityFrom}
                        minIso=""
                        placeholder="Start date"
                        onChange={setActivityFrom}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Activity ends</span>
                    <div className="tv-offers-date-shell">
                      <TraverionSingleDateField
                        id="offer-activity-until"
                        label=""
                        value={activityUntil}
                        minIso={activityFrom || ''}
                        placeholder="End date"
                        onChange={setActivityUntil}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {activityWindowError ? <p className="text-[13px] text-red-800">{activityWindowError}</p> : null}
            </div>
          )}

          {step === 2 && editing?.type === 'fixed' && (
            <div className="space-y-2">
              <p className="tv-offer-wizard__section-title">Fixed amount offer</p>
              <p className="text-[13px] text-[#71717a]">
                This older promotion uses a fixed amount of{' '}
                <strong className="text-[#073b83]">{formatMoney(Number(editing.value), currency)}</strong> off. Dates,
                options, and booking limits can still be updated.
              </p>
            </div>
          )}

          {step === 2 && (!editing || editing.type === 'percent') && (
            <div className="space-y-3.5">
              <div>
                <p className="tv-offer-wizard__section-title">Discount</p>
                <p className="tv-offer-wizard__hint">
                  {SUPPLIER_DISCOUNT_PERCENT_MIN}–{SUPPLIER_DISCOUNT_PERCENT_MAX}% off the customer price.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="tv-offer-percent">
                  <input
                    id="offer-percent"
                    type="number"
                    inputMode="numeric"
                    min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                    max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                    step={1}
                    value={percent}
                    aria-label="Discount percent"
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      setPercent(
                        Math.min(SUPPLIER_DISCOUNT_PERCENT_MAX, Math.max(SUPPLIER_DISCOUNT_PERCENT_MIN, n))
                      );
                    }}
                  />
                  <span className="tv-offer-percent__suffix">%</span>
                </div>
                <input
                  type="range"
                  min={SUPPLIER_DISCOUNT_PERCENT_MIN}
                  max={SUPPLIER_DISCOUNT_PERCENT_MAX}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="min-w-[12rem] flex-1 accent-[#073b83]"
                  aria-label="Discount percent slider"
                />
              </div>

              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-[#18181b]">Price preview</p>
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
                    <div key={option.id} className="rounded-lg bg-white px-3 py-2.5 text-[13px] ring-1 ring-[#e5e7eb]">
                      <p className="font-semibold text-[#18181b]">{option.name.trim() || 'Option'}</p>
                      <dl className="mt-1.5 space-y-1">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#71717a]">Original</dt>
                          <dd className="tabular-nums">{priceLabel(span.low, span.high, currency)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#71717a]">Discounted</dt>
                          <dd className="font-semibold tabular-nums text-[#073b83]">
                            {span.low > 0 ? priceLabel(low.price, variable ? high.price : low.price, currency) : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#71717a]">Est. earnings</dt>
                          <dd className="tabular-nums">
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
                    </div>
                  );
                })}
                <p className="text-[11px] text-[#a1a1aa]">
                  Earnings use your commission on the discounted customer price and are not a guaranteed payout.
                </p>
              </div>
            </div>
          )}

          {step === 2 ? (
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-[#e5e7eb]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#073b83]"
                  checked={limitBookings}
                  onChange={(e) => setLimitBookings(e.target.checked)}
                />
                <span>
                  <span className="block text-[13px] font-semibold text-[#18181b]">Limit discounted bookings</span>
                  <span className="mt-0.5 block text-[12px] text-[#71717a]">
                    When the limit is reached, customers can still book at the regular price.
                  </span>
                </span>
              </label>
              {limitBookings ? (
                <div>
                  <label htmlFor="offer-booking-limit" className="mb-1 block text-[11px] font-semibold text-[#71717a]">
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
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-950 ring-1 ring-amber-200/80" role="status">
                  Another offer overlaps these options and dates. Traverion applies only the best customer discount —
                  offers are not stacked.
                </p>
              ) : null}
              {editing ? (
                <p className="text-[11px] text-[#a1a1aa]">Confirmed bookings keep the price they were charged.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e5e7eb] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-5">
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
            className="tv-btn-ghost inline-flex h-10 items-center justify-center gap-1 px-3 text-[13px]"
          >
            {step === 0 ? (
              'Cancel'
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
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
                if (step === 0 && !productSupported) {
                  setError('Timed percentage offers are available for tours only.');
                  return;
                }
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
              className="tv-btn-primary inline-flex h-10 items-center justify-center gap-1 px-3 text-[13px]"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="tv-btn-primary inline-flex h-10 items-center justify-center px-3 text-[13px]"
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
