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
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierListSkeleton,
  SupplierPageHero,
  SupplierEmptyState,
} from '../../components/supplier/supplierUi';
import { formatMoney } from '../../lib/money';
import { localYmd } from '../../lib/local-ymd';
import { catalogOfferTodayIso } from '../../lib/discount-display';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import { listingIsFamily } from '../../lib/inventory';
import {
  partnerOfferCountsAsActiveNow,
  partnerOfferListingIsStayUnsupported,
} from '../../lib/partner-offers-honesty';

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

function offerStatus(d: ListingDiscount, listing?: TourPackage): 'upcoming' | 'active' | 'ended' {
  const t = listing
    ? catalogOfferTodayIso(listing)
    : localYmd();
  if (d.valid_until && t > d.valid_until) return 'ended';
  if (d.valid_from && t < d.valid_from) return 'upcoming';
  return 'active';
}

type OfferRow = { discount: ListingDiscount; listing: TourPackage };

type OfferStatusFilter = 'all' | 'active' | 'upcoming' | 'ended' | 'unsupported';

function parseOfferStatusFilter(raw: string | null | undefined): OfferStatusFilter {
  if (raw === 'active' || raw === 'upcoming' || raw === 'ended' || raw === 'unsupported') return raw;
  return 'all';
}

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
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return parseOfferStatusFilter(new URLSearchParams(window.location.search).get('status'));
  });

  const setStatusFilterAndUrl = useCallback((next: OfferStatusFilter) => {
    setStatusFilter(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      setStatusFilter(parseOfferStatusFilter(new URLSearchParams(window.location.search).get('status')));
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

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
      try {
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
        setError(null);
      } catch (offerErr) {
        // Keep prior offer rows — failure must not look like zero offers.
        setError(userFacingError(offerErr, USER_ERROR.offers));
      }
    } catch (e) {
      // Phase 1305: keep prior listings/offers — load failure ≠ zero offers.
      setError(userFacingError(e, USER_ERROR.offers));
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
    const listing = listings.find((l) => l.id === d.listing_id);
    const stayUnsupported = listing ? partnerOfferListingIsStayUnsupported(listing) : false;
    if (
      !window.confirm(
        stayUnsupported
          ? 'Remove this stay discount? It never appeared on traveler stay checkout.'
          : 'Remove this offer? It will disappear from the public site.'
      )
    )
      return;
    const ok = await deleteDiscount(d.id);
    if (ok) void loadAll();
  };

  const offerableListings = useMemo(
    () => listings.filter((l) => l.status !== 'draft' && !listingIsFamily(l, 'stay')),
    [listings]
  );
  const publishedCount = offerableListings.length;
  const activeTourOffers = useMemo(
    () =>
      rows.filter((r) =>
        partnerOfferCountsAsActiveNow({ listing: r.listing, status: offerStatus(r.discount, r.listing) })
      ).length,
    [rows]
  );
  const unsupportedStayOffers = useMemo(
    () => rows.filter((r) => partnerOfferListingIsStayUnsupported(r.listing)).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter(({ discount, listing }) => {
      const stayUnsupported = partnerOfferListingIsStayUnsupported(listing);
      if (statusFilter === 'unsupported') return stayUnsupported;
      if (stayUnsupported) return statusFilter === 'all';
      const st = offerStatus(discount, listing);
      if (statusFilter === 'all') return true;
      return st === statusFilter;
    });
  }, [rows, statusFilter]);

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Operations"
        icon={Tag}
        title="Offers"
        description="Limited-time percentage discounts on a tour booking option. Travelers see the lower price on Traverion tour checkout. Stay (accommodation) discounts are not supported yet."
        actions={
          canEdit ? (
            listings.length === 0 ? (
              <button type="button" onClick={goToListings} className="tv-btn-primary">
                Create a listing
              </button>
            ) : publishedCount === 0 ? (
              <button type="button" onClick={goToListings} className="tv-btn-primary">
                Publish a tour
              </button>
            ) : (
              <button type="button" onClick={openNew} className="tv-btn-primary">
                New offer
              </button>
            )
          ) : undefined
        }
      />

      {!canEdit ? (
        <NoticeCallout title="View only" tone="warn">
          Your role can view offers but not create, edit, or delete them.
        </NoticeCallout>
      ) : null}

      {error && (
        <ErrorState
          className="py-6"
          title="Offers unavailable"
          body={userFacingError(error, USER_ERROR.offers)}
          retry={{ onClick: () => void loadAll() }}
        />
      )}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : listings.length > 0 || rows.length > 0 ? (
        <>
          {publishedCount === 0 && canEdit ? (
            <NoticeCallout title="Publish a tour first" tone="warn">
              Offers apply to tour booking options on the public site. Stays do not support percentage discounts yet —
              publish at least one tour with options to create an offer.
            </NoticeCallout>
          ) : null}

          <div>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <h2 className="font-display text-2xl text-ink tracking-tight">Your offers</h2>
              <p className="text-sm text-ink-muted">
                {rows.length} total · {activeTourOffers} active on tours
                {unsupportedStayOffers > 0
                  ? ` · ${unsupportedStayOffers} stay (not on checkout)`
                  : ''}
              </p>
            </div>

            {rows.length > 0 ? (
              <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Offer status">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'active', label: 'Active' },
                    { id: 'upcoming', label: 'Upcoming' },
                    { id: 'ended', label: 'Ended' },
                    ...(unsupportedStayOffers > 0
                      ? ([{ id: 'unsupported', label: 'Not on checkout' }] as const)
                      : []),
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.id}
                    onClick={() => setStatusFilterAndUrl(tab.id)}
                    className={`lux-flat rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                      statusFilter === tab.id
                        ? 'bg-finland text-white ring-finland'
                        : 'bg-transparent text-ink-muted ring-black/[0.08] hover:text-ink hover:ring-black/[0.14]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}

            {rows.length === 0 ? (
              <SupplierEmptyState
                icon={Tag}
                title="No offers yet"
                body={
                  publishedCount === 0
                    ? 'Offers only apply to published tours with booking options. Publish a tour first — stay listings cannot use percentage discounts yet.'
                    : 'You have listings, but no timed discounts. That is normal. Create one on a published tour and it will show on the public product page.'
                }
                action={
                  canEdit ? (
                    publishedCount === 0 ? (
                      <button type="button" onClick={goToListings} className="tv-btn-primary">
                        Open listings
                      </button>
                    ) : (
                      <button type="button" onClick={openNew} className="tv-btn-primary">
                        New offer
                      </button>
                    )
                  ) : undefined
                }
              />
            ) : filteredRows.length === 0 ? (
              <SupplierEmptyState
                icon={Tag}
                title="Nothing in this view"
                body="No offers match this status filter."
                action={
                  <button type="button" onClick={() => setStatusFilterAndUrl('all')} className="tv-btn-secondary">
                    Show all offers
                  </button>
                }
              />
            ) : (
              <div className="space-y-2">
                {filteredRows.map(({ discount: d, listing }) => {
                  const stayUnsupported = partnerOfferListingIsStayUnsupported(listing);
                  const st = offerStatus(d, listing);
                  const statusLabel = stayUnsupported
                    ? 'Not on checkout'
                    : st === 'active'
                      ? 'Active'
                      : st === 'upcoming'
                        ? 'Upcoming'
                        : 'Ended';
                  const statusTone = stayUnsupported
                    ? 'warn'
                    : st === 'active'
                      ? 'good'
                      : st === 'upcoming'
                        ? 'info'
                        : 'neutral';
                  const pct =
                    d.type === 'percent'
                      ? `${Math.round(Number(d.value))}%`
                      : formatMoney(Number(d.value), listing.price?.currency);
                  return (
                    <article
                      key={d.id}
                      className={`rounded-lg border border-black/[0.06] bg-paper p-3 w-full min-w-0 max-w-full space-y-2 ${
                        stayUnsupported ? 'border-l-[3px] border-l-amber-500' : ''
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                        <div className="flex gap-2.5 min-w-0 flex-1">
                          {listing.image?.trim() ? (
                            <img
                              src={listing.image}
                              alt=""
                              className="w-12 h-12 rounded-lg object-cover shrink-0 ring-1 ring-black/[0.06]"
                            />
                          ) : (
                            <div
                              className="w-12 h-12 rounded-lg shrink-0 bg-finland/10 flex items-center justify-center text-finland ring-1 ring-finland/15"
                              aria-hidden
                            >
                              <MapPin className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink break-words">{listing.title}</p>
                            <p className="text-xs text-ink-muted mt-0.5 break-words">
                              {stayUnsupported
                                ? 'Stay · not applied on traveler checkout'
                                : optionLabelForDiscount(listing, d)}
                            </p>
                          </div>
                        </div>
                        <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
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
                        {stayUnsupported ? (
                          <p className="text-xs text-amber-900">
                            Traverion does not lower stay nightly prices with this offer. Remove it or keep it only as
                            a record — travelers never see it at checkout.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-1">
                        {!stayUnsupported ? (
                          <button
                            type="button"
                            onClick={() => openEdit(d)}
                            disabled={!canEdit}
                            className="lux-flat inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-ink-muted hover:text-ink disabled:opacity-40"
                            title="Edit"
                            aria-label="Edit offer"
                          >
                            <Pencil className="w-4 h-4" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDelete(d)}
                          disabled={!canEdit}
                          className="lux-flat inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-ink-muted hover:text-red-700 disabled:opacity-40"
                          title="Delete"
                          aria-label="Delete offer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : error ? null : (
        <SupplierEmptyState
          icon={MapPin}
          title="No listings yet"
          body="Offers attach to a published tour with booking options. You have no listings yet, so this page is empty. That is expected until you create one."
          action={
            <button type="button" onClick={goToListings} className="tv-btn-primary">
              Open listings
            </button>
          }
        />
      )}

      <DiscountOfferWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setEditingDiscount(null);
        }}
        listings={offerableListings}
        editing={editingDiscount}
        onSaved={() => void loadAll()}
      />
    </div>
  );
}
