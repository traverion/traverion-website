import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tag, Plus, MapPin, Pencil, Trash2, Percent } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { TourPackage } from '../../types/tour';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import {
  fetchDiscountsByListingIds,
  deleteDiscount,
  type ListingDiscount,
} from '../../data/supabase-discounts';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import DiscountOfferWizardModal from '../../components/supplier/DiscountOfferWizardModal';
import {
  SUPPLIER_PAGE_CLASS,
  SUPPLIER_SECTION_HEADER_CLASS,
  SupplierListSkeleton,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';

function optionLabelForDiscount(tour: TourPackage, d: ListingDiscount): string {
  if (!d.booking_option_id?.trim()) return 'All options';
  const opts = materializedBookingOptions(parseListingExtras(tour.listingExtras as unknown).bookingOptions);
  const o = opts.find((x) => x.id === d.booking_option_id);
  return o ? (o.name.trim() || 'Bookable option') : 'Bookable option';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, day] = iso.split('-').map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function offerStatus(d: ListingDiscount): 'upcoming' | 'active' | 'ended' {
  const t = new Date().toISOString().slice(0, 10);
  if (d.valid_until && t > d.valid_until) return 'ended';
  if (d.valid_from && t < d.valid_from) return 'upcoming';
  return 'active';
}

type OfferRow = { discount: ListingDiscount; listing: TourPackage };

export default function SupplierDiscountsOffers() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<ListingDiscount | null>(null);

  const loadAll = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setListings([]);
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyListings(uid);
      setListings(data);
      const ids = data.map((l) => l.id);
      const map = await fetchDiscountsByListingIds(ids);
      const flat: OfferRow[] = [];
      for (const listing of data) {
        const discounts = map.get(listing.id) ?? [];
        for (const discount of discounts) {
          flat.push({ discount, listing });
        }
      }
      flat.sort((a, b) => {
        const af = a.discount.valid_from ?? '';
        const bf = b.discount.valid_from ?? '';
        return bf.localeCompare(af);
      });
      setRows(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data');
      setListings([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const goToListings = () => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`);

  const openNew = () => {
    setEditingDiscount(null);
    setWizardOpen(true);
  };

  const openEdit = (d: ListingDiscount) => {
    setEditingDiscount(d);
    setWizardOpen(true);
  };

  const handleDelete = async (d: ListingDiscount) => {
    if (!canEdit) return;
    if (!window.confirm('Remove this offer? It will disappear from the public site.')) return;
    const ok = await deleteDiscount(d.id);
    if (ok) void loadAll();
  };

  const publishedCount = useMemo(() => listings.filter((l) => l.status !== 'draft').length, [listings]);

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        icon={Tag}
        title="Discounts & offers"
        description="Time-limited percentage promotions on a booking option (up to 30 days)."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={openNew}
              disabled={listings.length === 0}
              title={listings.length === 0 ? 'Add a listing first' : undefined}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark min-h-[48px] touch-manipulation shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-5 h-5 shrink-0" />
              New discount offer
            </button>
          ) : undefined
        }
      />

      {!canEdit && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Your role can view offers but not create, edit, or delete them.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm animate-scale-in">
          <p className="text-gray-700 font-medium">No tours yet</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Add and publish a listing with at least one bookable option, then you can attach timed discounts here.
          </p>
          <button
            type="button"
            onClick={goToListings}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
          >
            Go to My listings
          </button>
        </div>
      ) : (
        <>
          {publishedCount === 0 && canEdit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
              Publish at least one listing to create offers that appear on the public site.
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className={`${SUPPLIER_SECTION_HEADER_CLASS} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
              <h2 className="text-base font-semibold text-gray-900">Your offers</h2>
              <p className="text-xs text-gray-500">
                {rows.length} total · {rows.filter((r) => offerStatus(r.discount) === 'active').length} active now
              </p>
            </div>

            {rows.length === 0 ? (
              <div className="p-8 sm:p-10 text-center">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-finland/10 text-finland items-center justify-center mb-4">
                  <Percent className="w-6 h-6" aria-hidden />
                </div>
                <p className="text-gray-800 font-medium">No offers yet</p>
                <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                  Create a promotion for one of your bookable options. It will show on tour cards and the booking panel when the
                  dates are in range.
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={openNew}
                    className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
                  >
                    <Plus className="w-5 h-5" />
                    New discount offer
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {rows.map(({ discount: d, listing }) => {
                  const st = offerStatus(d);
                  const tone =
                    st === 'active'
                      ? 'bg-green-100 text-green-800'
                      : st === 'upcoming'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-gray-100 text-gray-600';
                  const pct = d.type === 'percent' ? `${Math.round(Number(d.value))}%` : `$${d.value}`;
                  return (
                    <article key={d.id} className="p-4 sm:px-5 sm:py-4 w-full min-w-0 max-w-full space-y-3 transition-colors duration-200 hover:bg-slate-50/60">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                        <div className="flex gap-3 min-w-0 flex-1">
                          {listing.image?.trim() ? (
                            <img
                              src={listing.image}
                              alt=""
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover shrink-0 border border-gray-100 bg-gray-100"
                            />
                          ) : (
                            <div
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg shrink-0 border border-gray-100 bg-gray-100 flex items-center justify-center text-gray-400"
                              aria-hidden
                            >
                              <MapPin className="w-6 h-6 sm:w-7 sm:h-7" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 break-words">{listing.title}</p>
                            <p className="text-sm text-gray-600 mt-1 break-words">{optionLabelForDiscount(listing, d)}</p>
                          </div>
                        </div>
                        <span className={`inline-flex shrink-0 self-start px-2 py-0.5 rounded-full text-xs font-semibold ${tone}`}>
                          {st === 'active' ? 'Active' : st === 'upcoming' ? 'Upcoming' : 'Ended'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-gray-700">
                        <p>
                          <span className="text-gray-500">Runs </span>
                          <span className="tabular-nums font-medium text-gray-900">
                            {formatDate(d.valid_from)} – {formatDate(d.valid_until)}
                          </span>
                        </p>
                        <p>
                          <span className="text-gray-500">Discount </span>
                          <span className="font-semibold text-finland tabular-nums">{pct}</span>
                          {d.type === 'percent' ? <span className="text-gray-500"> off</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => openEdit(d)}
                          disabled={!canEdit}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-finland disabled:opacity-40"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(d)}
                          disabled={!canEdit}
                          className="p-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <DiscountOfferWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setEditingDiscount(null);
        }}
        listings={listings}
        editing={editingDiscount}
        onSaved={() => void loadAll()}
      />
    </div>
  );
}
