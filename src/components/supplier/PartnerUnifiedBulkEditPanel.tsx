/**
 * Mission 05.4 / 05.6 — Bulk availability edit drawer for Unified Partner Calendar.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TourPackage } from '../../types/tour';
import type { BookingRow } from '../../data/supabase-bookings';
import {
  fetchAvailabilityByListingId,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import AvailabilityCutoffField from './AvailabilityCutoffField';
import PartnerSelect from './PartnerSelect';
import PartnerUnifiedCalendarDrawer from './PartnerUnifiedCalendarDrawer';
import NoticeCallout from '../NoticeCallout';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import {
  applyPartnerUnifiedBulk,
  partnerUnifiedBulkActionsForFamily,
  partnerUnifiedBulkFamilyFromListing,
  partnerUnifiedBulkTourOptionChoices,
  previewPartnerUnifiedBulk,
  type PartnerUnifiedBulkAction,
  type PartnerUnifiedBulkFamily,
} from '../../lib/partner-unified-bulk-edits';
import {
  listingsForUnifiedCategoryFilter,
  type PartnerUnifiedCategoryFilter,
} from '../../lib/partner-unified-calendar';
import { rentalVariantsFromListingExtras } from '../../data/supabase-rental-availability';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

type Props = {
  open: boolean;
  onClose: () => void;
  listings: TourPackage[];
  bookings: BookingRow[];
  initialCategory?: PartnerUnifiedCategoryFilter;
  initialListingId?: string;
  initialFromIso?: string;
  canEdit: boolean;
  userId?: string | null;
  onListingsChange: (next: TourPackage[]) => void;
  onApplied: () => void;
};

const CATEGORY_OPTIONS: Array<{ value: PartnerUnifiedCategoryFilter; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'tour', label: 'Tours' },
  { value: 'stay', label: 'Stays' },
  { value: 'rental', label: 'Rentals' },
];

function pickListingId(
  pool: TourPackage[],
  preferredId: string
): string {
  if (preferredId && pool.some((l) => l.id === preferredId)) return preferredId;
  return pool[0]?.id ?? '';
}

function syncRentalOptionDefaults(
  listing: TourPackage,
  nextAction: PartnerUnifiedBulkAction,
  setOptionId: (id: string) => void,
  setStock: (v: string) => void
) {
  if (partnerUnifiedBulkFamilyFromListing(listing) !== 'rental') return;
  const variants = rentalVariantsFromListingExtras(listing.listingExtras);
  const first = variants[0];
  if (first) setStock(String(first.quantity));
  if (nextAction === 'adjust_stock' && first) setOptionId(first.id);
}

export default function PartnerUnifiedBulkEditPanel({
  open,
  onClose,
  listings,
  bookings,
  initialCategory = 'all',
  initialListingId = '',
  initialFromIso = '',
  canEdit,
  userId,
  onListingsChange,
  onApplied,
}: Props) {
  const [category, setCategory] = useState<PartnerUnifiedCategoryFilter>(initialCategory);
  const [listingId, setListingId] = useState(initialListingId);
  const [action, setAction] = useState<PartnerUnifiedBulkAction>('close');
  const [fromIso, setFromIso] = useState(initialFromIso);
  const [toIso, setToIso] = useState(initialFromIso);
  const [optionId, setOptionId] = useState('');
  const [capacity, setCapacity] = useState('8');
  const [cutoffHours, setCutoffHours] = useState('0');
  const [stock, setStock] = useState('1');
  const [caps, setCaps] = useState<AvailabilityRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const filteredListings = useMemo(
    () => listingsForUnifiedCategoryFilter(listings, category),
    [listings, category]
  );

  const listing = useMemo(
    () => filteredListings.find((l) => l.id === listingId) ?? null,
    [filteredListings, listingId]
  );
  const family: PartnerUnifiedBulkFamily | null = listing
    ? partnerUnifiedBulkFamilyFromListing(listing)
    : null;

  useEffect(() => {
    if (!open) return;
    setCategory(initialCategory);
    const pool = listingsForUnifiedCategoryFilter(listings, initialCategory);
    const id = pickListingId(pool, initialListingId);
    setListingId(id);
    setFromIso(initialFromIso);
    setToIso(initialFromIso);
    setOptionId('');
    setError(null);
    setNote(null);
    const first = pool.find((l) => l.id === id);
    if (first) {
      const f = partnerUnifiedBulkFamilyFromListing(first);
      const actions = partnerUnifiedBulkActionsForFamily(f);
      const nextAction = actions[0]?.value ?? 'close';
      setAction(nextAction);
      syncRentalOptionDefaults(first, nextAction, setOptionId, setStock);
    }
  }, [open, initialCategory, initialListingId, initialFromIso, listings]);

  useEffect(() => {
    if (!listing || !family) return;
    const actions = partnerUnifiedBulkActionsForFamily(family);
    if (!actions.some((a) => a.value === action)) {
      const next = actions[0]?.value ?? 'close';
      setAction(next);
      syncRentalOptionDefaults(listing, next, setOptionId, setStock);
    }
  }, [listing, family, action]);

  useEffect(() => {
    if (!filteredListings.some((l) => l.id === listingId)) {
      setListingId(filteredListings[0]?.id ?? '');
      setOptionId('');
    }
  }, [filteredListings, listingId]);

  useEffect(() => {
    if (!open || !listingId || family !== 'stay') {
      setCaps([]);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchAvailabilityByListingId(listingId, {
          fromDate: fromIso,
          toDate: toIso,
        });
        if (!cancelled) setCaps(rows);
      } catch {
        if (!cancelled) setCaps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listingId, family, fromIso, toIso]);

  const optionChoices = useMemo(() => {
    if (!listing || !family) return [{ value: '', label: 'All options' }];
    if (family === 'tour') {
      return [
        { value: '', label: 'All options' },
        ...partnerUnifiedBulkTourOptionChoices(listing),
      ];
    }
    if (family === 'rental') {
      const variants = rentalVariantsFromListingExtras(listing.listingExtras);
      const base =
        action === 'adjust_stock'
          ? []
          : [{ value: '', label: 'All options' }];
      return [
        ...base,
        ...variants.map((v) => ({ value: v.id, label: v.name?.trim() || 'Option' })),
      ];
    }
    return [{ value: '', label: '—' }];
  }, [listing, family, action]);

  const actionChoices = useMemo(
    () => (family ? partnerUnifiedBulkActionsForFamily(family) : []),
    [family]
  );

  const preview = useMemo(() => {
    if (!listing || !family) return null;
    return previewPartnerUnifiedBulk({
      listing,
      action,
      fromIso,
      toIso,
      optionId: optionId || null,
      capacity: Number(capacity),
      cutoffHours: Number(cutoffHours),
      stock: Number(stock),
      bookings,
      caps: caps.map((c) => ({
        listing_id: c.listing_id,
        available_date: c.available_date,
        capacity: c.capacity,
      })),
    });
  }, [
    listing,
    family,
    action,
    fromIso,
    toIso,
    optionId,
    capacity,
    cutoffHours,
    stock,
    bookings,
    caps,
  ]);

  if (!open) return null;

  const showOption =
    family === 'tour' || family === 'rental';
  const showCapacity = family === 'tour' && action === 'change_capacity';
  const showCutoff = family === 'tour' && action === 'change_cutoff';
  const showStock = family === 'rental' && action === 'adjust_stock';
  const showDates = !(family === 'rental' && action === 'adjust_stock');

  const onApply = async () => {
    if (!canEdit || !listing || !preview?.canApply) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await applyPartnerUnifiedBulk({
        listing,
        action,
        fromIso,
        toIso: showDates ? toIso : fromIso || toIso,
        optionId: optionId || null,
        capacity: Number(capacity),
        cutoffHours: Number(cutoffHours),
        stock: Number(stock),
        bookings,
        caps: caps.map((c) => ({
          listing_id: c.listing_id,
          available_date: c.available_date,
          capacity: c.capacity,
        })),
        createdBy: userId,
      });
      if (res.listing) {
        onListingsChange(listings.map((l) => (l.id === res.listing!.id ? res.listing! : l)));
      }
      if (!res.ok) {
        setError(res.message);
        if (res.failed.length) {
          setNote(res.failed.map((f) => f.error).slice(0, 3).join(' · '));
        }
        return;
      }
      setNote(res.message);
      onApplied();
      if (res.failed.length === 0 && res.skipped.length === 0) {
        onClose();
      }
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PartnerUnifiedCalendarDrawer
      open={open}
      onClose={onClose}
      title="Bulk edit"
      subtitle="Availability"
      size="wide"
      aria-label="Bulk edit"
      footer={
        <>
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tv-btn-primary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
            disabled={!canEdit || saving || !preview?.canApply}
            onClick={() => void onApply()}
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </>
      }
    >
      <div className="partner-unified-bulk">
        {error ? <NoticeCallout title={error} tone="danger" /> : null}
        {note && !error ? <NoticeCallout title={note} tone="success" /> : null}

        <div className="partner-unified-bulk__fields">
          <div className="partner-unified-bulk__field">
            <label htmlFor="bulk-category">Category</label>
            <PartnerSelect
              id="bulk-category"
              aria-label="Category"
              value={category}
              onChange={(v) => {
                setCategory(v as PartnerUnifiedCategoryFilter);
                setOptionId('');
              }}
              options={CATEGORY_OPTIONS}
            />
          </div>

          <div className="partner-unified-bulk__field">
            <label htmlFor="bulk-listing">Listing</label>
            <PartnerSelect
              id="bulk-listing"
              aria-label="Listing"
              value={listingId}
              onChange={(id) => {
                setListingId(id);
                setOptionId('');
                const next = filteredListings.find((l) => l.id === id);
                if (next) {
                  const f = partnerUnifiedBulkFamilyFromListing(next);
                  const actions = partnerUnifiedBulkActionsForFamily(f);
                  const nextAction = actions.some((a) => a.value === action)
                    ? action
                    : (actions[0]?.value ?? 'close');
                  if (nextAction !== action) setAction(nextAction);
                  syncRentalOptionDefaults(next, nextAction, setOptionId, setStock);
                }
              }}
              options={filteredListings.map((l) => ({
                value: l.id,
                label: l.title || 'Untitled',
              }))}
              disabled={filteredListings.length === 0}
            />
          </div>

          <div className="partner-unified-bulk__field">
            <label htmlFor="bulk-action">Action</label>
            <PartnerSelect
              id="bulk-action"
              aria-label="Action"
              value={action}
              onChange={(v) => {
                const next = v as PartnerUnifiedBulkAction;
                setAction(next);
                if (listing) syncRentalOptionDefaults(listing, next, setOptionId, setStock);
              }}
              options={actionChoices}
            />
          </div>

          {showOption ? (
            <div className="partner-unified-bulk__field">
              <label htmlFor="bulk-option">Option</label>
              <PartnerSelect
                id="bulk-option"
                aria-label="Option"
                value={optionId}
                onChange={setOptionId}
                options={optionChoices}
                disabled={optionChoices.length === 0}
              />
            </div>
          ) : null}

          {showDates ? (
            <div className="partner-unified-bulk__dates">
              <TraverionSingleDateField
                id="bulk-from"
                label="From"
                value={fromIso}
                onChange={setFromIso}
                minIso=""
                tone="premium"
              />
              <TraverionSingleDateField
                id="bulk-to"
                label="To"
                value={toIso}
                onChange={setToIso}
                minIso=""
                tone="premium"
              />
            </div>
          ) : null}

          {showCapacity ? (
            <div className="partner-unified-bulk__field">
              <label htmlFor="bulk-capacity">Capacity</label>
              <input
                id="bulk-capacity"
                type="number"
                className="tv-input"
                min={1}
                max={99}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          ) : null}

          {showCutoff ? (
            <AvailabilityCutoffField
              id="bulk-cutoff"
              value={cutoffHours}
              onChange={setCutoffHours}
            />
          ) : null}

          {showStock ? (
            <div className="partner-unified-bulk__field">
              <label htmlFor="bulk-stock">Available stock</label>
              <input
                id="bulk-stock"
                type="number"
                className="tv-input"
                min={1}
                max={999}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        {preview ? (
          <div className="partner-unified-bulk__preview">
            <p className="partner-unified-bulk__section-label">Preview</p>
            <p className="partner-unified-bulk__summary">{preview.summary}</p>
            {preview.warnings.map((w) => (
              <p key={w} className="partner-unified-bulk__hint">
                {w}
              </p>
            ))}
            {preview.blockReason ? (
              <p className="partner-unified-bulk__hint partner-unified-bulk__hint--warn">
                {preview.blockReason}
              </p>
            ) : null}
            {preview.skipped.length > 0 ? (
              <p className="partner-unified-bulk__hint">
                Skipping {preview.skipped.length}: {preview.skipped[0]?.reason}
                {preview.skipped.length > 1 ? '…' : ''}
              </p>
            ) : null}
            {preview.applyDates.length > 0 && preview.applyDates.length <= 14 ? (
              <p className="partner-unified-bulk__dates-list">
                {preview.applyDates.join(', ')}
              </p>
            ) : preview.dates.length > 0 && showDates ? (
              <p className="partner-unified-bulk__dates-list">
                {preview.dates[0]} → {preview.dates[preview.dates.length - 1]} (
                {preview.applyDates.length || preview.dates.length} days)
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </PartnerUnifiedCalendarDrawer>
  );
}
