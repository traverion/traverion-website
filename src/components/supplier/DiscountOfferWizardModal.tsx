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
  findSupplierOfferConflicts,
  offerDiscountPeriod,
} from '../../lib/offer-eligibility';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { SUPPLIER_MODAL_OVERLAY_CLASS, SUPPLIER_MODAL_PANEL_CLASS } from './supplierUi';
import PartnerSelect from './PartnerSelect';
import PartnerConfirmModal from './PartnerConfirmModal';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierActiveCommercialTerms } from '../../data/supabase-earnings';
import { optionHeadlineUnitPrice } from '../../lib/price-categories';
import { listingOptionHasSchedules, listingOptionReadySchedules } from '../../lib/listing-option-schedules';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import { listingIsFamily } from '../../lib/inventory';
import { localYmd } from '../../lib/local-ymd';

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
  /** Open the conflicting offer group for edit (hub wires this). */
  onOpenConflictOffer?: (offerIds: string[]) => void;
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
  onOpenConflictOffer,
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
  const [optionsMenuBox, setOptionsMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [discountFrom, setDiscountFrom] = useState('');
  const [discountUntil, setDiscountUntil] = useState('');
  const [percent, setPercent] = useState(15);
  const [limitBookings, setLimitBookings] = useState(false);
  const [bookingLimit, setBookingLimit] = useState('20');
  const [commissionBps, setCommissionBps] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictOfferIds, setConflictOfferIds] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = Boolean(
    listingId ||
      optionIds.length > 0 ||
      discountFrom ||
      discountUntil ||
      (percent !== 15 && !editing) ||
      limitBookings
  );
  const closeSafe = useCallback(() => {
    if (submitting) return;
    if (dirty && !editing) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }, [onClose, submitting, dirty, editing]);
  useDialogFocus(open, panelRef, closeSafe);

  const publishedListings = useMemo(
    () => listings.filter((l) => l.status !== 'draft'),
    [listings]
  );
  const tourListings = useMemo(
    () => publishedListings.filter((l) => !listingIsFamily(l, 'stay')),
    [publishedListings]
  );
  const stayListings = useMemo(
    () => publishedListings.filter((l) => listingIsFamily(l, 'stay')),
    [publishedListings]
  );
  const listingsForType = productType === 'stay' ? stayListings : productType === 'tour' ? tourListings : [];
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
      const host = listings.find((l) => l.id === head.listing_id);
      setProductType(host && listingIsFamily(host, 'stay') ? 'stay' : 'tour');
      setListingId(head.listing_id);
      const wide = source.length === 1 && !head.booking_option_id?.trim();
      setListingWide(wide);
      setLegacyWide(Boolean(editingGroup.length > 0 && wide));
      setOptionIds(wide ? [] : source.map((row) => row.booking_option_id?.trim() || '').filter(Boolean));
      const period = offerDiscountPeriod(head);
      setDiscountFrom(period.from ?? '');
      setDiscountUntil(period.until ?? '');
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
      setDiscountFrom('');
      setDiscountUntil('');
      setLimitBookings(false);
      setBookingLimit('20');
      setPercent(15);
      setConflictOfferIds([]);
    }
  }, [open, editing?.id, draft, editingGroup, listings]);

  useEffect(() => {
    if (!open || !listingId || editing || draft) return;
    if (productType !== 'tour') return;
    const opts = optionsForTour(listings.find((l) => l.id === listingId));
    if (opts.length === 1 && optionIds.length === 0 && !listingWide) {
      setOptionIds([opts[0].id]);
    }
  }, [open, listingId, listings, editing, draft, optionIds.length, listingWide, productType]);

  useEffect(() => {
    if (!optionsOpen) {
      setOptionsMenuBox(null);
      return;
    }
    const place = () => {
      const btn = optionsTriggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const gap = 6;
      const edge = 8;
      const footerReserve = 72;
      const width = Math.min(rect.width, window.innerWidth - edge * 2);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - edge - footerReserve);
      const spaceAbove = Math.max(0, rect.top - gap - edge);
      const listCap = 240;
      const openUp = spaceBelow < Math.min(listCap, 140) && spaceAbove > spaceBelow + 40;
      const room = openUp ? spaceAbove : Math.max(spaceBelow, 96);
      const maxHeight = Math.max(120, Math.min(listCap, room));
      const top = openUp ? Math.max(edge, rect.top - gap - maxHeight) : rect.bottom + gap;
      let left = rect.left;
      if (left + width > window.innerWidth - edge) {
        left = Math.max(edge, window.innerWidth - width - edge);
      }
      setOptionsMenuBox({ top, left, width, maxHeight });
    };
    place();
    const onWin = () => place();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (optionsRef.current?.contains(t) || optionsMenuRef.current?.contains(t)) return;
      setOptionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [optionsOpen]);

  const periodError =
    discountFrom && discountUntil ? validateSupplierDiscountDateRange(discountFrom, discountUntil) : null;
  const dateRangeValid = Boolean(discountFrom && discountUntil) && !periodError;

  /** Tours and stays persist. Rentals are not a live booking family yet. */
  const canPersistProduct = productType === 'tour' || productType === 'stay';
  const step0CanAdvance =
    productType === 'tour'
      ? Boolean(listingId) && bookingOptions.length > 0 && (listingWide || optionIds.length > 0)
      : productType === 'stay'
        ? Boolean(listingId)
        : false;

  const selectedOptions = bookingOptions.filter((option) => optionIds.includes(option.id));
  const ignoreConflictIds = useMemo(() => editingGroup.map((row) => row.id), [editingGroup]);
  const conflicts = useMemo(() => {
    if (!listingId || !discountFrom || !discountUntil) return [];
    if (productType === 'rental') return [];
    if (productType === 'tour' && !listingWide && optionIds.length === 0) return [];
    const onListing = existingOffers.filter((row) => row.listing_id === listingId && !row.deleted_at);
    return findSupplierOfferConflicts(
      {
        type: 'percent',
        value: percent,
        valid_from: discountFrom,
        valid_until: discountUntil,
        optionIds: productType === 'stay' ? [] : listingWide ? [] : optionIds,
      },
      onListing,
      localYmd(),
      ignoreConflictIds
    );
  }, [
    listingId,
    listingWide,
    optionIds,
    discountFrom,
    discountUntil,
    existingOffers,
    ignoreConflictIds,
    percent,
    productType,
  ]);

  useEffect(() => {
    setConflictOfferIds(conflicts.map((c) => c.other.id).filter((id): id is string => Boolean(id)));
  }, [conflicts]);

  const handleSubmit = async () => {
    setError(null);
    if (!canPersistProduct) {
      setError('Rental Offers are not available yet — there is no rental booking engine.');
      return;
    }
    if (conflicts.length > 0) {
      setError(
        productType === 'stay'
          ? 'An offer already exists for this stay during the selected dates. Adjust the dates or edit the existing offer.'
          : 'An offer already exists for this booking option during the selected dates. Adjust the dates or edit the existing offer.'
      );
      return;
    }
    const periodErr = validateSupplierDiscountDateRange(discountFrom, discountUntil);
    if (periodErr) {
      setError(periodErr);
      return;
    }
    const stayListingWide = productType === 'stay';
    if (!stayListingWide && !listingWide && optionIds.length === 0) {
      setError('Choose at least one booking option.');
      return;
    }
    if (!listingId) {
      setError('Choose a listing.');
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
        optionIds: stayListingWide ? [] : optionIds,
        listingWide: stayListingWide ? true : listingWide,
        type: fixedEdit ? 'fixed' : 'percent',
        value: fixedEdit ? Number(editing?.value) : p,
        discountFrom,
        discountUntil,
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
        ? '1 option selected'
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
            <div className="space-y-1">
              <div className="tv-offer-wizard__section">
                <p className="tv-offer-wizard__section-title">Product</p>
                <p className="tv-offer-wizard__hint">
                  Choose a product type, then the listing. Tours also require booking options.
                </p>
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
                    { value: 'tour', label: 'Tour & Activity' },
                    { value: 'stay', label: 'Stay' },
                    { value: 'rental', label: 'Rental' },
                  ]}
                />
              </div>

              {productType === 'rental' ? (
                <div className="tv-offer-wizard__section">
                  <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950 ring-1 ring-amber-200/80">
                    Rental listings and checkout are not available yet. Offer creation for rentals stays disabled until
                    the rental booking engine ships.
                  </p>
                </div>
              ) : (
                <div className="tv-offer-wizard__section">
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
                    placeholder={productType === 'stay' ? 'Select a stay…' : 'Select a tour…'}
                    options={[
                      { value: '', label: productType === 'stay' ? 'Select a stay…' : 'Select a tour…' },
                      ...listingsForType.map((l) => ({ value: l.id, label: l.title })),
                    ]}
                  />
                  {listingsForType.length === 0 ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-950 ring-1 ring-amber-200/80">
                      {productType === 'stay'
                        ? 'No published stays are available. Publish a stay listing first.'
                        : 'No published tours are available. Publish a tour with booking options first.'}
                    </p>
                  ) : null}
                  {productType === 'stay' && listingId ? (
                    <p className="mt-2 text-[12px] text-[#71717a]">
                      Applies to nights inside the Discount period. Weekly/monthly length discounts stay in the listing
                      editor — travelers get the better of the two, never both.
                    </p>
                  ) : null}
                </div>
              )}

              {productType === 'tour' ? (
                <div className="tv-offer-wizard__section" ref={optionsRef}>
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
                    <div className="tv-offer-multiselect">
                      <button
                        ref={optionsTriggerRef}
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
                      {optionsOpen && optionsMenuBox
                        ? createPortal(
                            <div
                              ref={optionsMenuRef}
                              className="tv-offer-multiselect__menu"
                              role="listbox"
                              aria-multiselectable="true"
                              style={{
                                position: 'fixed',
                                top: optionsMenuBox.top,
                                left: optionsMenuBox.left,
                                width: optionsMenuBox.width,
                                zIndex: 130,
                              }}
                            >
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
                              <div className="tv-offer-multiselect__list" style={{ maxHeight: optionsMenuBox.maxHeight }}>
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
                            </div>,
                            document.body
                          )
                        : null}
                      <p className="mt-1.5 text-[11px] text-[#a1a1aa]">
                        {listingWide
                          ? 'Applies to every option on this listing.'
                          : `${optionIds.length} selected · kept when you move between steps.`}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {step === 1 && (
            <div className="tv-offer-wizard__section">
              <p className="tv-offer-wizard__section-title">Discount period</p>
              <p className="tv-offer-wizard__hint">
                {productType === 'stay'
                  ? 'Nights in this range receive the discount, regardless of when the guest books.'
                  : productType === 'rental'
                    ? 'Rental days in this range receive the discount, regardless of when the customer books.'
                    : 'Tour departures in this range receive the discount, regardless of when the customer books.'}{' '}
                Inclusive calendar days (max {SUPPLIER_DISCOUNT_MAX_RANGE_DAYS}).
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Start date</span>
                  <div className="tv-offers-date-shell">
                    <TraverionSingleDateField
                      id="offer-discount-from"
                      label=""
                      value={discountFrom}
                      minIso=""
                      placeholder="Start date"
                      onChange={setDiscountFrom}
                    />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">End date</span>
                  <div className="tv-offers-date-shell">
                    <TraverionSingleDateField
                      id="offer-discount-until"
                      label=""
                      value={discountUntil}
                      minIso={discountFrom || ''}
                      placeholder="End date"
                      onChange={setDiscountUntil}
                    />
                  </div>
                </div>
              </div>
              {periodError ? <p className="mt-2 text-[13px] text-red-800">{periodError}</p> : null}
              {conflicts.length > 0 ? (
                <div
                  className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-900 ring-1 ring-red-200/80"
                  role="alert"
                >
                  <p>
                    An offer already exists for this booking option during the selected dates. Adjust the dates or edit
                    the existing offer.
                  </p>
                  {conflictOfferIds.length > 0 && onOpenConflictOffer ? (
                    <button
                      type="button"
                      className="mt-2 text-[12px] font-semibold text-[#073b83]"
                      onClick={() => onOpenConflictOffer(conflictOfferIds)}
                    >
                      Open conflicting offer
                    </button>
                  ) : null}
                </div>
              ) : null}
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
              {conflicts.length > 0 ? (
                <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-900 ring-1 ring-red-200/80" role="alert">
                  <p>
                    An offer already exists for this booking option during the selected dates. Adjust the dates or edit
                    the existing offer.
                  </p>
                  {conflictOfferIds.length > 0 && onOpenConflictOffer ? (
                    <button
                      type="button"
                      className="mt-2 text-[12px] font-semibold text-[#073b83]"
                      onClick={() => onOpenConflictOffer(conflictOfferIds)}
                    >
                      Open conflicting offer
                    </button>
                  ) : null}
                </div>
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
              disabled={
                submitting ||
                (step === 0 && !step0CanAdvance) ||
                (step === 1 && (!dateRangeValid || conflicts.length > 0))
              }
              onClick={() => {
                setError(null);
                if (step === 0 && productType === 'rental') {
                  setError('Rental Offers are not available yet.');
                  return;
                }
                if (step === 1) {
                  const err = validateSupplierDiscountDateRange(discountFrom, discountUntil);
                  if (err) {
                    setError(err);
                    return;
                  }
                  if (conflicts.length > 0) {
                    setError(
                      'An offer already exists for this booking option during the selected dates. Adjust the dates or edit the existing offer.'
                    );
                    return;
                  }
                }
                if (step === 0 && productType === 'tour' && !listingWide && optionIds.length === 0) {
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
              disabled={submitting || !canPersistProduct || conflicts.length > 0}
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

  return (
    <>
      {createPortal(shell, document.body)}
      <PartnerConfirmModal
        open={discardOpen}
        title="Discard this offer?"
        description="Your unsaved changes will be lost."
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}
