import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tag, MapPin, Pencil, Trash2 } from 'lucide-react';
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
  SupplierListSkeleton,
  SupplierPageHero,
  SupplierEmptyState,
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
        title="Offers"
        description="Time-limited percentage promotions on a listing option."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={openNew}
              disabled={listings.length === 0}
              title={listings.length === 0 ? 'Add a listing first' : undefined}
              className="tv-btn-primary"
            >
              {publishedCount > 0 ? 'New offer' : 'New discount offer'}
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
        <SupplierEmptyState
          icon={MapPin}
          title="No listings yet"
          body="Offers attach to a published tour. You have no listings yet, so this page is empty. That is expected until you create one."
          action={
            <button type="button" onClick={goToListings} className="tv-btn-primary">
              Open listings
            </button>
          }
        />
      ) : (
        <>
          {publishedCount === 0 && canEdit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
              Publish at least one listing to create offers that appear on the public site.
            </div>
          )}

          <div>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <h2 className="font-display text-2xl text-ink tracking-tight">Your offers</h2>
              <p className="text-sm text-ink-muted">
                {rows.length} total · {rows.filter((r) => offerStatus(r.discount) === 'active').length} active now
              </p>
            </div>

            {rows.length === 0 ? (
              <SupplierEmptyState
                icon={Tag}
                title="No offers yet"
                body="You have listings, but no timed discounts. That is normal. Create one on a published tour and it will show on the public tour page."
                action={
                  canEdit ? (
                    <button type="button" onClick={openNew} className="tv-btn-primary">
                      New offer
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {rows.map(({ discount: d, listing }) => {
                  const st = offerStatus(d);
                  const pct = d.type === 'percent' ? `${Math.round(Number(d.value))}%` : `$${d.value}`;
                  return (
                    <article key={d.id} className="py-4 w-full min-w-0 max-w-full space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                        <div className="flex gap-3 min-w-0 flex-1">
                          {listing.image?.trim() ? (
                            <img
                              src={listing.image}
                              alt=""
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl shrink-0 bg-black/[0.04] flex items-center justify-center text-ink-faint"
                              aria-hidden
                            >
                              <MapPin className="w-6 h-6 sm:w-7 sm:h-7" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-ink break-words">{listing.title}</p>
                            <p className="text-sm text-ink-muted mt-1 break-words">{optionLabelForDiscount(listing, d)}</p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-ink-muted shrink-0 self-start capitalize">
                          {st === 'active' ? 'Active' : st === 'upcoming' ? 'Upcoming' : 'Ended'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-ink-muted">
                        <p>
                          Runs{' '}
                          <span className="tabular-nums font-medium text-ink">
                            {formatDate(d.valid_from)} – {formatDate(d.valid_until)}
                          </span>
                        </p>
                        <p>
                          Discount{' '}
                          <span className="font-semibold text-finland tabular-nums">{pct}</span>
                          {d.type === 'percent' ? ' off' : null}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => openEdit(d)}
                          disabled={!canEdit}
                          className="lux-flat p-2 rounded-full text-ink-muted hover:text-ink disabled:opacity-40"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(d)}
                          disabled={!canEdit}
                          className="lux-flat p-2 rounded-full text-ink-muted hover:text-red-700 disabled:opacity-40"
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
