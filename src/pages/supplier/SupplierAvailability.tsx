import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import {
  deleteAvailability,
  fetchAvailabilityByListingId,
  upsertAvailability,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import { materializedBookingOptions } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';
import { optionRunsOnDate } from '../../lib/booking-quote';
import {
  buildMonthCells,
  defaultCapacityForOpenDay,
  remainingCapacity,
} from '../../lib/availability-ops';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultSpots(listing: TourPackage | null): number {
  const opts = listing ? materializedBookingOptions(listing.listingExtras?.bookingOptions) : [];
  const max = opts.length > 0 ? Math.max(...opts.map((o) => o.maxSpotsPerSlot || o.maxPersons || 8)) : 8;
  return defaultCapacityForOpenDay(max);
}

export default function SupplierAvailability() {
  const { user, isSupabase } = useSupplierAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(today.getMonth());
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [listingId, setListingId] = useState<string>('');
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIso, setSavingIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ iso: string; capacity: string } | null>(null);

  const listing = listings.find((l) => l.id === listingId) ?? null;
  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const rowByDate = useMemo(() => new Map(rows.map((r) => [r.available_date, r])), [rows]);

  const loadListings = useCallback(async () => {
    if (!isSupabase || !user?.id) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const mine = await fetchMyListings(user.id);
      setListings(mine);
      setListingId((prev) => prev || mine[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  const loadCaps = useCallback(async (id: string) => {
    if (!id) {
      setRows([]);
      return;
    }
    const data = await fetchAvailabilityByListingId(id);
    setRows(data);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (listingId) void loadCaps(listingId);
  }, [listingId, loadCaps]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex0(d.getUTCMonth());
  };

  const weekdayOpen = (iso: string) => {
    if (!listing) return false;
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    if (opts.length === 0) return true;
    return opts.some((o) => optionRunsOnDate(o, iso) === null);
  };

  const saveCap = async (iso: string, capacity: number) => {
    if (!listingId) return;
    setSavingIso(iso);
    setError(null);
    const res = await upsertAvailability(listingId, [{ available_date: iso, capacity }]);
    setSavingIso(null);
    if (!res.success) {
      setError(res.error ?? 'Could not save that date');
      return;
    }
    setEditing(null);
    await loadCaps(listingId);
  };

  const clearCap = async (iso: string) => {
    if (!listingId) return;
    setSavingIso(iso);
    setError(null);
    const res = await deleteAvailability(listingId, iso);
    setSavingIso(null);
    if (!res.success) {
      setError(res.error ?? 'Could not clear that date');
      return;
    }
    setEditing(null);
    await loadCaps(listingId);
  };

  const monthLabel = new Date(Date.UTC(year, monthIndex0, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        icon={CalendarDays}
        title="Availability"
        description="Weekdays come from each product option. Set a daily cap only when you need one — otherwise travelers can book any open weekday."
      />

      {!isSupabase || !user ? (
        <p className="text-sm text-gray-600">Sign in to manage availability.</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading products…</p>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Create a product first. Then you can cap specific dates here.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <label className="block text-sm font-medium text-gray-800 mb-2" htmlFor="availability-listing">
            Product
          </label>
          <select
            id="availability-listing"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="w-full max-w-lg rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
          >
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.status === 'draft' ? ' (draft)' : ''}
              </option>
            ))}
          </select>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="text-base font-semibold text-gray-900">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-500">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const open = cell.inMonth && weekdayOpen(cell.iso);
              const cap = rowByDate.get(cell.iso);
              const remaining = cap ? remainingCapacity(cap.capacity, cap.booked) : null;
              const isEditing = editing?.iso === cell.iso;
              const busy = savingIso === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || busy}
                  onClick={() => {
                    if (!open && !cap) return;
                    setEditing({
                      iso: cell.iso,
                      capacity: String(cap?.capacity ?? defaultSpots(listing)),
                    });
                  }}
                  className={`min-h-[4.25rem] rounded-xl p-1.5 text-left transition-colors disabled:opacity-40 ${
                    !cell.inMonth
                      ? 'bg-transparent text-gray-300'
                      : isEditing
                        ? 'bg-white border border-finland ring-2 ring-finland/20'
                        : cap
                        ? remaining === 0
                          ? 'bg-rose-50 border border-rose-100'
                          : 'bg-finland/8 border border-finland/20'
                        : open
                          ? 'bg-gray-50 border border-gray-100 hover:border-finland/30'
                          : 'bg-white border border-transparent text-gray-400'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{cell.day}</span>
                  {cell.inMonth && cap ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-gray-600">
                      {remaining}/{cap.capacity} left
                    </span>
                  ) : cell.inMonth && open ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">Open</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {editing ? (
            <div className="mt-5 rounded-xl border border-gray-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-gray-900">{editing.iso}</p>
              <p className="mt-1 text-xs text-gray-600">
                Daily cap is optional. Clearing it returns the date to weekday rules on the product option.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="text-sm text-gray-700" htmlFor="day-capacity">
                  Spots
                </label>
                <input
                  id="day-capacity"
                  type="number"
                  min={0}
                  max={99}
                  value={editing.capacity}
                  onChange={(e) => setEditing({ ...editing, capacity: e.target.value })}
                  className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void saveCap(editing.iso, Math.max(0, Math.floor(Number(editing.capacity) || 0)))}
                  className="rounded-lg bg-finland px-4 py-2 text-sm font-medium text-white hover:bg-finland-dark"
                >
                  Save cap
                </button>
                <button
                  type="button"
                  onClick={() => void clearCap(editing.iso)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear cap
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-sm text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-500">Tap a date to add or change a daily cap.</p>
          )}
        </div>
      )}
    </div>
  );
}
