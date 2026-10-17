import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Tag, MapPin, MoreHorizontal } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { TourPackage } from '../../types/tour';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import {
  fetchDiscountsByListingIds,
  applyDiscount,
  fetchOfferRedemptionStats,
  setOfferPaused,
  softDeleteOffers,
  type ListingDiscount,
  type OfferRedemptionStats,
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
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { fromMinorUnits } from '../../lib/commercial-money';
import { catalogOfferTodayIso } from '../../lib/discount-display';
import { offerLifecycle, type OfferLifecycle } from '../../lib/offer-eligibility';
import { optionHeadlineUnitPrice } from '../../lib/price-categories';
import { listingOptionHasSchedules, listingOptionReadySchedules } from '../../lib/listing-option-schedules';
import type { ListingBookingOption } from '../../types/listingExtras';
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

function offerStatus(d: ListingDiscount, listing: TourPackage | undefined, confirmed: number): OfferLifecycle {
  const t = listing ? catalogOfferTodayIso(listing) : '';
  return offerLifecycle(d, t, confirmed);
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

type OfferRow = { discount: ListingDiscount; listing: TourPackage };
type OfferGroup = { key: string; discounts: ListingDiscount[]; listing: TourPackage };

type OfferStatusFilter = 'all' | 'active' | 'upcoming' | 'paused' | 'ended' | 'unsupported';

const OFFER_PAGE_SIZE = 20;

function parseOfferStatusFilter(raw: string | null | undefined): OfferStatusFilter {
  if (raw === 'active' || raw === 'upcoming' || raw === 'paused' || raw === 'ended' || raw === 'unsupported') return raw;
  return 'all';
}

function groupOffers(rows: OfferRow[]): OfferGroup[] {
  const groups: OfferGroup[] = [];
  const index = new Map<string, OfferGroup>();
  for (const row of rows) {
    if (row.discount.deleted_at) continue;
    const key = row.discount.offer_group_id || row.discount.id;
    const existing = index.get(`${row.listing.id}:${key}`);
    if (existing) existing.discounts.push(row.discount);
    else {
      const group = { key, discounts: [row.discount], listing: row.listing };
      index.set(`${row.listing.id}:${key}`, group);
      groups.push(group);
    }
  }
  return groups;
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
  const [editingGroup, setEditingGroup] = useState<ListingDiscount[]>([]);
  const [draftGroup, setDraftGroup] = useState<ListingDiscount[] | null>(null);
  const [stats, setStats] = useState<Map<string, OfferRedemptionStats>>(new Map());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return parseOfferStatusFilter(new URLSearchParams(window.location.search).get('status'));
  });
  const loadGenRef = useRef(0);
  const offersHubUserIdRef = useRef<string | null>(null);

  const setStatusFilterAndUrl = useCallback((next: OfferStatusFilter) => {
    setStatusFilter(next);
    setPage(0);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    if (!menuKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuKey]);

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
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyListings(uid);
      if (gen !== loadGenRef.current) return;
      try {
        const ids = data.map((l) => l.id);
        const map = await fetchDiscountsByListingIds(ids);
        if (gen !== loadGenRef.current) return;
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
        // Phase 1376: commit listings + rows together — discount failure must not refresh listings alone.
        setListings(data);
        setRows(flat);
        setError(null);
      } catch (offerErr) {
        if (gen !== loadGenRef.current) return;
        // Keep prior listings/offer rows — partial reload must not mix new listings with stale discounts.
        setError(userFacingError(offerErr, USER_ERROR.offers));
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Phase 1305: keep prior listings/offers — load failure ≠ zero offers.
      setError(userFacingError(e, USER_ERROR.offers));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    const clearOffersPartnerWorkspace = () => {
      setListings([]);
      setRows([]);
      setError(null);
      setWizardOpen(false);
      setEditingGroup([]);
      setDraftGroup(null);
    };
    if (!user?.id) {
      offersHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearOffersPartnerWorkspace();
      setLoading(false);
      return;
    }
    // Phase 1401: clear prior partner offers before loading the next account (Listings 1389 parity).
    if (offersHubUserIdRef.current !== user.id) {
      offersHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearOffersPartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const goToListings = () => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`);

  const openNew = () => {
    setEditingGroup([]);
    setDraftGroup(null);
    setMenuKey(null);
    setWizardOpen(true);
  };

  const openEdit = (group: ListingDiscount[]) => {
    setEditingGroup(group);
    setDraftGroup(null);
    setMenuKey(null);
    setWizardOpen(true);
  };

  const openDuplicate = (group: ListingDiscount[]) => {
    setEditingGroup([]);
    setDraftGroup(group);
    setMenuKey(null);
    setWizardOpen(true);
  };

  const handlePause = async (group: ListingDiscount[], paused: boolean) => {
    if (!canEdit) return;
    setMenuKey(null);
    setActionError(null);
    const ok = await setOfferPaused(group.map((row) => row.id), paused);
    if (!ok) {
      setActionError('Could not update this offer. Refresh and try again.');
      return;
    }
    void loadAll();
  };

  const handleDelete = async (group: ListingDiscount[], stayUnsupported: boolean) => {
    if (!canEdit) return;
    setMenuKey(null);
    if (
      !window.confirm(
        stayUnsupported
          ? 'Remove this stay discount? It never appeared on traveler stay checkout.'
          : 'Delete this offer? It will stop applying to new bookings. Bookings already confirmed keep their price.'
      )
    )
      return;
    setActionError(null);
    const ok = await softDeleteOffers(group.map((row) => row.id));
    if (!ok) {
      setActionError('Could not delete this offer. Refresh and try again.');
      return;
    }
    void loadAll();
  };

  useEffect(() => {
    const ids = rows.map((row) => row.discount.id).filter(Boolean);
    if (ids.length === 0) {
      setStats(new Map());
      return;
    }
    let cancelled = false;
    void fetchOfferRedemptionStats(ids).then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const offerableListings = useMemo(
    () => listings.filter((l) => l.status !== 'draft' && !listingIsFamily(l, 'stay')),
    [listings]
  );
  const publishedCount = offerableListings.length;
  const groups = useMemo(() => groupOffers(rows), [rows]);
  const confirmedFor = useCallback(
    (group: OfferGroup) => group.discounts.reduce((sum, row) => sum + (stats.get(row.id)?.bookings ?? 0), 0),
    [stats]
  );
  const activeTourOffers = useMemo(
    () =>
      groups.filter((group) => {
        const status = offerStatus(group.discounts[0], group.listing, confirmedFor(group));
        return partnerOfferCountsAsActiveNow({
          listing: group.listing,
          status: status === 'active' ? 'active' : status === 'upcoming' ? 'upcoming' : 'ended',
        });
      }).length,
    [groups, confirmedFor]
  );
  const unsupportedStayOffers = useMemo(
    () => rows.filter((r) => partnerOfferListingIsStayUnsupported(r.listing)).length,
    [rows]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ranked = groups.filter((group) => {
      const stayUnsupported = partnerOfferListingIsStayUnsupported(group.listing);
      if (statusFilter === 'unsupported') return stayUnsupported;
      if (stayUnsupported) return statusFilter === 'all';
      const st = offerStatus(group.discounts[0], group.listing, confirmedFor(group));
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!q) return true;
      const optionText = group.discounts.map((row) => optionLabelForDiscount(group.listing, row)).join(' ');
      return `${group.listing.title} ${optionText}`.toLowerCase().includes(q);
    });
    const rank: Record<OfferLifecycle, number> = {
      active: 0,
      upcoming: 1,
      paused: 2,
      limit_reached: 3,
      ended: 4,
    };
    return ranked.sort((a, b) => {
      const as = offerStatus(a.discounts[0], a.listing, confirmedFor(a));
      const bs = offerStatus(b.discounts[0], b.listing, confirmedFor(b));
      if (rank[as] !== rank[bs]) return rank[as] - rank[bs];
      const af = a.discounts[0].book_from ?? a.discounts[0].valid_from ?? '';
      const bf = b.discounts[0].book_from ?? b.discounts[0].valid_from ?? '';
      return bf.localeCompare(af);
    });
  }, [groups, statusFilter, search, confirmedFor]);

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / OFFER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = filteredGroups.slice(safePage * OFFER_PAGE_SIZE, safePage * OFFER_PAGE_SIZE + OFFER_PAGE_SIZE);

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
              <div className="flex flex-wrap gap-2">
                {/* Phase 1682: Calendar dual-CTA parity — create vs open listings. */}
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
                  className="tv-btn-primary"
                >
                  New listing
                </button>
                <button type="button" onClick={goToListings} className="tv-btn-ghost">
                  Your listings
                </button>
              </div>
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
              <h2 className="text-lg font-semibold tracking-tight text-ink">Your offers</h2>
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
                    { id: 'paused', label: 'Paused' },
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

            {rows.length > 0 ? (
              <label className="mb-4 block">
                <span className="sr-only">Search offers</span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search product or booking option"
                  className="tv-input w-full max-w-sm"
                />
              </label>
            ) : null}

            {actionError ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200/80" role="alert">
                {actionError}
              </p>
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
                          className="tv-btn-primary"
                        >
                          New listing
                        </button>
                        <button type="button" onClick={goToListings} className="tv-btn-ghost">
                          Your listings
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={openNew} className="tv-btn-primary">
                        New offer
                      </button>
                    )
                  ) : undefined
                }
              />
            ) : filteredGroups.length === 0 ? (
              <SupplierEmptyState
                icon={Tag}
                title="Nothing in this view"
                body={search.trim() ? 'No offers match this search.' : 'No offers match this status filter.'}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setStatusFilterAndUrl('all');
                    }}
                    className="tv-btn-secondary"
                  >
                    Show all offers
                  </button>
                }
              />
            ) : (
              <div className="space-y-2">
                {visibleGroups.map((group) => {
                  const listing = group.listing;
                  const head = group.discounts[0];
                  const stayUnsupported = partnerOfferListingIsStayUnsupported(listing);
                  const confirmed = confirmedFor(group);
                  const st = offerStatus(head, listing, confirmed);
                  const statusLabel = stayUnsupported
                    ? 'Not on checkout'
                    : st === 'active'
                      ? 'Active'
                      : st === 'upcoming'
                        ? 'Upcoming'
                        : st === 'paused'
                          ? 'Paused'
                          : st === 'limit_reached'
                            ? 'Limit reached'
                            : 'Ended';
                  const currency = normalizeCurrency(listing.price?.currency);
                  const pct =
                    head.type === 'percent'
                      ? `${Math.round(Number(head.value))}%`
                      : formatMoney(Number(head.value), currency);
                  const optionNames = group.discounts.map((row) => optionLabelForDiscount(listing, row));
                  const optionLine =
                    optionNames.length > 1 ? `${optionNames.length} booking options` : optionNames[0];
                  const opts = materializedBookingOptions(parseListingExtras(listing.listingExtras as unknown).bookingOptions);
                  let low = Infinity;
                  let high = 0;
                  for (const row of group.discounts) {
                    const matched = row.booking_option_id ? opts.filter((option) => option.id === row.booking_option_id) : opts;
                    for (const option of matched.length ? matched : []) {
                      const span = optionPriceSpan(option);
                      if (!(span.low > 0)) continue;
                      low = Math.min(low, applyDiscount(span.low, row, currency).price);
                      high = Math.max(high, applyDiscount(span.high, row, currency).price);
                    }
                  }
                  const customerPrice = Number.isFinite(low)
                    ? high - low > 0.009
                      ? `${formatMoney(low, currency)}–${formatMoney(high, currency)}`
                      : formatMoney(low, currency)
                    : '—';
                  const redemption = group.discounts.reduce(
                    (sum, row) => {
                      const stat = stats.get(row.id);
                      return {
                        bookings: sum.bookings + (stat?.bookings ?? 0),
                        guests: sum.guests + (stat?.guests ?? 0),
                        net: stat?.supplierNetMinor == null ? sum.net : (sum.net ?? 0) + stat.supplierNetMinor,
                      };
                    },
                    { bookings: 0, guests: 0, net: null as number | null }
                  );
                  const bookFrom = head.book_from ?? head.valid_from;
                  const bookUntil = head.book_until ?? head.valid_until;
                  const menuOpen = menuKey === `${listing.id}:${group.key}`;
                  return (
                    <article
                      key={`${listing.id}:${group.key}`}
                      className="w-full min-w-0 max-w-full rounded-lg border border-black/[0.06] bg-white px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        {listing.image?.trim() ? (
                          <img src={listing.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/[0.03] text-ink-muted" aria-hidden>
                            <MapPin className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{listing.title}</p>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-black/[0.08]">
                              {statusLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">
                            {stayUnsupported ? 'Stay · not applied on traveler checkout' : optionLine}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-muted">
                            <span className="font-semibold tabular-nums text-finland">{pct}{head.type === 'percent' ? ' off' : ''}</span>
                            <span className="tabular-nums text-ink">{customerPrice}</span>
                            <span className="tabular-nums">Book {formatDate(bookFrom)} – {formatDate(bookUntil)}</span>
                            {head.activity_from && head.activity_until ? (
                              <span className="tabular-nums">Activity {formatDate(head.activity_from)} – {formatDate(head.activity_until)}</span>
                            ) : null}
                            {head.booking_limit ? (
                              <span className="tabular-nums">{confirmed} / {head.booking_limit} bookings</span>
                            ) : (
                              <span className="tabular-nums">{confirmed} confirmed</span>
                            )}
                            {redemption.guests > 0 ? <span className="tabular-nums">{redemption.guests} participants</span> : null}
                            {redemption.net != null ? (
                              <span className="tabular-nums text-ink">
                                Earnings {formatMoney(fromMinorUnits(redemption.net), currency)}
                              </span>
                            ) : null}
                          </div>
                          {stayUnsupported ? (
                            <p className="mt-1 text-xs text-amber-900">
                              Traverion does not lower stay nightly prices with this offer.
                            </p>
                          ) : null}
                        </div>
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            disabled={!canEdit}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label="Offer actions"
                            onClick={() => setMenuKey(menuOpen ? null : `${listing.id}:${group.key}`)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted ring-1 ring-black/[0.08] hover:text-ink disabled:opacity-40"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          {menuOpen ? (
                            <div role="menu" className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-black/[0.08] bg-white py-1 shadow-sm">
                              {!stayUnsupported ? (
                                <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-black/[0.03]" onClick={() => openEdit(group.discounts)}>
                                  Edit
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-black/[0.03]"
                                onClick={() => void handlePause(group.discounts, !head.paused)}
                              >
                                {head.paused ? 'Resume' : 'Pause'}
                              </button>
                              {!stayUnsupported ? (
                                <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-black/[0.03]" onClick={() => openDuplicate(group.discounts)}>
                                  Duplicate
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-sm text-red-800 hover:bg-black/[0.03]"
                                onClick={() => void handleDelete(group.discounts, stayUnsupported)}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {pageCount > 1 ? (
                  <div className="flex items-center justify-between pt-2 text-sm">
                    <button type="button" className="tv-btn-ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                      Previous
                    </button>
                    <span className="tabular-nums text-ink-muted">{safePage + 1} / {pageCount}</span>
                    <button type="button" className="tv-btn-ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                      Next
                    </button>
                  </div>
                ) : null}
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
          setEditingGroup([]);
          setDraftGroup(null);
        }}
        listings={offerableListings}
        editingGroup={editingGroup}
        draft={draftGroup}
        existingOffers={rows.map((row) => row.discount)}
        onSaved={() => void loadAll()}
      />
    </div>
  );
}
