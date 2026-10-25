/**
 * Partner rental availability calendar — blocks + stock per variant.
 * Public booking remains closed; holds shown are operational inventory only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, KeyRound } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { fetchMyListings } from '../../data/supabase-listings';
import type { TourPackage } from '../../types/tour';
import { filterRentalAvailabilityListings } from '../../lib/partner-calendar-desk-path';
import { buildMonthCells } from '../../lib/availability-ops';
import { PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import { TraverionSingleDateField } from '../../components/calendar/TraverionSingleDateField';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  createRentalAvailabilityBlock,
  deleteRentalAvailabilityBlock,
  fetchRentalAvailabilityBlocks,
  fetchRentalInventoryHolds,
  fetchRentalVariantReservedQuantity,
  previewDayAvailability,
  rentalDetailsFromListingExtras,
  rentalVariantsFromListingExtras,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../../data/supabase-rental-availability';
import type { RentalVariant } from '../../types/rental';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatMonthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function dayBoundsUtc(iso: string): { startMs: number; endMs: number } {
  const startMs = Date.parse(`${iso}T00:00:00.000Z`);
  const endMs = Date.parse(`${iso}T24:00:00.000Z`);
  return { startMs, endMs };
}

function monthRangeIso(year: number, monthIndex0: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, monthIndex0, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 1)).toISOString();
  return { start, end };
}

export default function SupplierRentalCalendar() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
  const today = new Date();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [monthIndex0, setMonthIndex0] = useState(today.getUTCMonth());
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [listingId, setListingId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
  });
  const [variantFilter, setVariantFilter] = useState<string>('all');
  const [blocks, setBlocks] = useState<RentalAvailabilityBlockRow[]>([]);
  const [holds, setHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [reservedByVariant, setReservedByVariant] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [blockFrom, setBlockFrom] = useState('');
  const [blockTo, setBlockTo] = useState('');
  const [blockVariant, setBlockVariant] = useState<string>('all');
  const [blockNote, setBlockNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const rentalListings = useMemo(() => filterRentalAvailabilityListings(listings), [listings]);
  const listing = useMemo(
    () => rentalListings.find((l) => l.id === listingId) ?? null,
    [rentalListings, listingId]
  );
  const rental = useMemo(
    () => (listing ? rentalDetailsFromListingExtras(listing.listingExtras) : undefined),
    [listing]
  );
  const variants: RentalVariant[] = useMemo(
    () => (listing ? rentalVariantsFromListingExtras(listing.listingExtras) : []),
    [listing]
  );
  const variantIdsKey = variants.map((v) => v.id).join(',');
  const bufferMinutes = Number(rental?.bufferMinutes ?? 0);

  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);

  const loadListings = useCallback(async () => {
    if (!user?.id || !isSupabase) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const mine = await fetchMyListings(user.id);
      const rentals = filterRentalAvailabilityListings(mine);
      setListings(mine);
      setListingId((prev) => {
        if (prev && rentals.some((l) => l.id === prev)) return prev;
        const fromUrl =
          typeof window !== 'undefined'
            ? (new URLSearchParams(window.location.search).get('listing') ?? '').trim()
            : '';
        if (fromUrl && rentals.some((l) => l.id === fromUrl)) return fromUrl;
        return rentals[0]?.id ?? '';
      });
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.calendar));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSupabase]);

  const loadAvailability = useCallback(async () => {
    if (!listingId) {
      setBlocks([]);
      setHolds([]);
      setReservedByVariant({});
      return;
    }
    const { start, end } = monthRangeIso(year, monthIndex0);
    try {
      const [b, h] = await Promise.all([
        fetchRentalAvailabilityBlocks(listingId, start, end),
        fetchRentalInventoryHolds(listingId, start, end),
      ]);
      setBlocks(b);
      setHolds(h);
      const ids = variantIdsKey ? variantIdsKey.split(',').filter(Boolean) : [];
      const reserved: Record<string, number> = {};
      await Promise.all(
        ids.map(async (id) => {
          reserved[id] = await fetchRentalVariantReservedQuantity(listingId, id);
        })
      );
      setReservedByVariant(reserved);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.calendar));
    }
  }, [listingId, year, monthIndex0, variantIdsKey]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (typeof window === 'undefined' || !listingId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('listing', listingId);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  }, [listingId]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex0(d.getUTCMonth());
  };

  const dayPreview = (iso: string, variant: RentalVariant) => {
    const bounds = dayBoundsUtc(iso);
    return previewDayAvailability({
      variantId: variant.id,
      stock: variant.quantity,
      dayStartMs: bounds.startMs,
      dayEndMs: bounds.endMs,
      bufferMinutes,
      bookingNoticeHours: 0,
      nowMs: Date.now(),
      blocks,
      holds,
    });
  };

  const onBlock = async () => {
    if (!canEdit || !listingId || !blockFrom) return;
    const to = blockTo || blockFrom;
    if (to < blockFrom) {
      setNote('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    setNote(null);
    setError(null);
    try {
      const startsAtIso = `${blockFrom}T00:00:00.000Z`;
      const endExclusive = new Date(`${to}T00:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      await createRentalAvailabilityBlock({
        listingId,
        variantId: blockVariant === 'all' ? null : blockVariant,
        startsAtIso,
        endsAtIso: endExclusive.toISOString(),
        note: blockNote,
        createdBy: user?.id ?? null,
      });
      setBlockNote('');
      setNote('Dates blocked. Availability updates immediately.');
      await loadAvailability();
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteBlock = async (id: string) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await deleteRentalAvailabilityBlock(id);
      setConfirmDeleteId(null);
      setNote('Block removed.');
      await loadAvailability();
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(false);
    }
  };

  const visibleVariants =
    variantFilter === 'all' ? variants : variants.filter((v) => v.id === variantFilter);

  if (!isSupabase) {
    return (
      <div className={SUPPLIER_PAGE_CLASS}>
        <ErrorState title="Unavailable" body="Rental calendar requires a connected account." />
      </div>
    );
  }

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Rentals"
        title="Rental calendar"
        description="Block dates and review stock per option. Traveler booking stays closed until Rentals launches."
      />

      {error ? (
        <ErrorState
          title="Could not load"
          body={error}
          retry={{ onClick: () => void loadListings() }}
        />
      ) : null}
      {note ? <NoticeCallout title={note} tone="info" /> : null}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading rental listings…</p>
      ) : rentalListings.length === 0 ? (
        <SupplierEmptyState
          icon={KeyRound}
          title="No rental listings yet"
          body="Create a rental draft to manage availability and inventory here."
          action={
            <button
              type="button"
              className="tv-btn-primary inline-flex min-h-11 items-center px-4 text-sm font-semibold"
              onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
            >
              Create listing
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <p className="mb-1 text-sm font-medium text-ink">Rental listing</p>
              <PartnerSelect
                aria-label="Rental listing"
                value={listingId}
                onChange={setListingId}
                options={rentalListings.map((l) => ({
                  value: l.id,
                  label: l.title || 'Untitled rental',
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="tv-btn-secondary inline-flex min-h-11 items-center gap-1 px-3"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">
                {formatMonthLabel(year, monthIndex0)}
              </p>
              <button
                type="button"
                className="tv-btn-secondary inline-flex min-h-11 items-center gap-1 px-3"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]" aria-label="Inventory">
            <div className="border-b border-[#E6EAF0] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Options & stock
              </p>
            </div>
            {variants.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">Add rental options in the listing creator.</p>
            ) : (
              <ul className="divide-y divide-[#E6EAF0]">
                {variants.map((v) => {
                  const reserved = reservedByVariant[v.id] ?? 0;
                  const available = Math.max(0, v.quantity - reserved);
                  return (
                    <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{v.name || 'Option'}</p>
                        <p className="text-xs text-ink-muted">
                          Total {v.quantity} · Reserved {reserved} · Available {available}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                          variantFilter === v.id
                            ? 'bg-[#073b83]/[0.08] text-[#073b83]'
                            : 'text-ink-muted hover:bg-[#F4F6F8]'
                        }`}
                        onClick={() => setVariantFilter((prev) => (prev === v.id ? 'all' : v.id))}
                      >
                        {variantFilter === v.id ? 'Showing' : 'Focus'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]" aria-label="Month">
            <div className="grid grid-cols-7 border-b border-[#E6EAF0] bg-[#F8FAFC] text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-1 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell) => {
                if (!cell.inMonth) {
                  return (
                    <div
                      key={`${cell.iso}-pad`}
                      className="min-h-[4.5rem] border-b border-r border-[#E6EAF0] bg-[#FCFCFD]"
                    />
                  );
                }
                const focus = visibleVariants[0] ?? variants[0];
                const preview = focus
                  ? dayPreview(cell.iso, focus)
                  : { available: 0, reserved: 0, blocked: false };
                const blocked =
                  preview.blocked ||
                  blocks.some((b) => {
                    if (variantFilter !== 'all' && b.variant_id && b.variant_id !== variantFilter) {
                      return false;
                    }
                    const start = Date.parse(b.starts_at);
                    const end = Date.parse(b.ends_at);
                    const day = dayBoundsUtc(cell.iso);
                    return start < day.endMs && day.startMs < end;
                  });
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={`min-h-[4.5rem] border-b border-r border-[#E6EAF0] p-1.5 text-left transition hover:bg-[#F4F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#073b83] ${
                      blocked ? 'bg-[#FFF5F5]' : ''
                    }`}
                    onClick={() => {
                      setBlockFrom(cell.iso);
                      setBlockTo(cell.iso);
                    }}
                  >
                    <span className="text-xs font-semibold text-ink">{cell.day}</span>
                    {focus ? (
                      <span
                        className={`mt-1 block text-[10px] font-medium ${
                          blocked
                            ? 'text-[#9f1239]'
                            : preview.available > 0
                              ? 'text-[#073b83]'
                              : 'text-ink-muted'
                        }`}
                      >
                        {blocked ? 'Blocked' : `${preview.available} free`}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[#E6EAF0]" aria-label="Block dates">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#073b83]" aria-hidden />
              <h3 className="text-sm font-semibold text-ink">Block dates</h3>
            </div>
            {!canEdit ? (
              <p className="text-sm text-ink-muted">Your role can view the calendar but not change blocks.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TraverionSingleDateField
                    id="rental-block-from"
                    label="From"
                    value={blockFrom}
                    onChange={setBlockFrom}
                    minIso=""
                    tone="premium"
                  />
                  <TraverionSingleDateField
                    id="rental-block-to"
                    label="To (optional)"
                    value={blockTo}
                    onChange={setBlockTo}
                    minIso=""
                    tone="premium"
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-ink">Applies to</p>
                  <PartnerSelect
                    aria-label="Block applies to"
                    value={blockVariant}
                    onChange={setBlockVariant}
                    options={[
                      { value: 'all', label: 'Entire listing (all options)' },
                      ...variants.map((v) => ({ value: v.id, label: v.name || 'Option' })),
                    ]}
                  />
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink-muted">Reason (optional)</span>
                  <input
                    className="tv-input w-full"
                    maxLength={240}
                    value={blockNote}
                    onChange={(e) => setBlockNote(e.target.value)}
                    placeholder="Maintenance, private use…"
                  />
                </label>
                <button
                  type="button"
                  className="tv-btn-primary min-h-11 px-4 text-sm font-semibold disabled:opacity-50"
                  disabled={saving || !blockFrom}
                  onClick={() => void onBlock()}
                >
                  {saving ? 'Saving…' : 'Block dates'}
                </button>
              </>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]" aria-label="Current blocks">
            <div className="border-b border-[#E6EAF0] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Current blocks
              </p>
            </div>
            {blocks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No blocked periods this month.</p>
            ) : (
              <ul className="divide-y divide-[#E6EAF0]">
                {blocks.map((b) => {
                  const label = !b.variant_id
                    ? 'All options'
                    : variants.find((v) => v.id === b.variant_id)?.name || b.variant_id;
                  return (
                    <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {b.starts_at.slice(0, 10)} →{' '}
                          {new Date(Date.parse(b.ends_at) - 1).toISOString().slice(0, 10)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {label}
                          {b.note ? ` · ${b.note}` : ''}
                        </p>
                      </div>
                      {canEdit ? (
                        confirmDeleteId === b.id ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="lc-btn-danger min-h-9 rounded-lg px-3 text-xs font-semibold"
                              disabled={saving}
                              onClick={() => void onDeleteBlock(b.id)}
                            >
                              Confirm remove
                            </button>
                            <button
                              type="button"
                              className="min-h-9 text-xs font-semibold text-ink-muted"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="min-h-9 text-xs font-semibold text-[#9f1239]"
                            onClick={() => setConfirmDeleteId(b.id)}
                          >
                            Remove
                          </button>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {holds.length > 0 ? (
            <section
              className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]"
              aria-label="Active holds"
            >
              <div className="border-b border-[#E6EAF0] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Active holds ({holds.length})
                </p>
              </div>
              <ul className="divide-y divide-[#E6EAF0]">
                {holds.map((h) => (
                  <li key={h.id} className="px-4 py-3 text-sm">
                    <p className="font-semibold text-ink">
                      {variants.find((v) => v.id === h.variant_id)?.name || h.variant_id} ·{' '}
                      {h.quantity} unit{h.quantity === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {h.status} · {h.starts_at.slice(0, 16)} → {h.ends_at.slice(0, 16)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
