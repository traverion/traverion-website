import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, MapPin, MoreHorizontal, Search } from 'lucide-react';
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
import PartnerConfirmModal from '../../components/supplier/PartnerConfirmModal';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { SUPPLIER_PAGE_CLASS, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { catalogOfferTodayIso } from '../../lib/discount-display';
import {
  findSupplierOfferConflicts,
  offerDiscountPeriod,
  offerLifecycle,
  type OfferLifecycle,
} from '../../lib/offer-eligibility';
import { localYmd } from '../../lib/local-ymd';
import { optionHeadlineUnitPrice } from '../../lib/price-categories';
import { listingOptionHasSchedules, listingOptionReadySchedules } from '../../lib/listing-option-schedules';
import type { ListingBookingOption } from '../../types/listingExtras';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { listingIsFamily } from '../../lib/inventory';
import { partnerOfferCountsAsActiveNow } from '../../lib/partner-offers-honesty';

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
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
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

function productTypeLabel(listing: TourPackage): 'Tour' | 'Stay' | 'Rental' {
  if (listingIsFamily(listing, 'stay')) return 'Stay';
  return 'Tour';
}

type OfferRow = { discount: ListingDiscount; listing: TourPackage };
type OfferGroup = { key: string; discounts: ListingDiscount[]; listing: TourPackage };
type OfferStatusFilter = 'all' | 'active' | 'upcoming' | 'paused' | 'ended';
type ProductFilter = 'all' | 'tour' | 'stay';

const OFFER_PAGE_SIZE = 20;

function parseOfferStatusFilter(raw: string | null | undefined): OfferStatusFilter {
  if (raw === 'active' || raw === 'upcoming' || raw === 'paused' || raw === 'ended') return raw;
  return 'all';
}

function statusLabelFor(st: OfferLifecycle): string {
  if (st === 'active') return 'Active';
  if (st === 'upcoming') return 'Upcoming';
  if (st === 'paused') return 'Paused';
  if (st === 'limit_reached') return 'Limit reached';
  return 'Ended';
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

function statusChipClass(label: string): string {
  if (label === 'Active') return 'tv-offers-chip tv-offers-chip--ok';
  if (label === 'Paused' || label === 'Not on checkout' || label === 'Limit reached') {
    return 'tv-offers-chip tv-offers-chip--warn';
  }
  return 'tv-offers-chip tv-offers-chip--muted';
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
  const [searchInput, setSearchInput] = useState('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [page, setPage] = useState(0);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<ListingDiscount[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [expandedOptionsKey, setExpandedOptionsKey] = useState<string | null>(null);
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
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!menuKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuKey(null);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-offer-menu]')) return;
      setMenuKey(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
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
    if (!paused) {
      // Resuming: reject if another live offer already covers the same scope + dates.
      const head = group[0];
      if (head) {
        const others = rows
          .filter((row) => row.listing.id === head.listing_id && !row.deleted_at)
          .map((row) => row.discount);
        const ignore = group.map((row) => row.id);
        const optionIds = group
          .map((row) => row.booking_option_id?.trim() || '')
          .filter(Boolean);
        const conflicts = findSupplierOfferConflicts(
          {
            type: head.type,
            value: Number(head.value),
            valid_from: offerDiscountPeriod(head).from,
            valid_until: offerDiscountPeriod(head).until,
            optionIds,
          },
          others.filter((row) => !row.paused),
          localYmd(),
          ignore
        );
        if (conflicts.length > 0) {
          setActionError(
            'Cannot resume — another offer already covers these dates. Edit the dates or end the conflicting offer first.'
          );
          return;
        }
      }
    }
    const ok = await setOfferPaused(
      group.map((row) => row.id),
      paused
    );
    if (!ok) {
      setActionError('Could not update this offer. Refresh and try again.');
      return;
    }
    void loadAll();
  };

  const handleEndOrRemove = (group: ListingDiscount[]) => {
    if (!canEdit) return;
    setMenuKey(null);
    setConfirmError(null);
    setConfirmEnd(group);
  };

  const confirmEndOffer = async () => {
    if (!confirmEnd || confirmEnd.length === 0) return;
    setConfirmBusy(true);
    setConfirmError(null);
    const ok = await softDeleteOffers(confirmEnd.map((row) => row.id));
    setConfirmBusy(false);
    if (!ok) {
      setConfirmError('Could not update this offer. Refresh and try again.');
      return;
    }
    setConfirmEnd(null);
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

  const publishedListings = useMemo(() => listings.filter((l) => l.status !== 'draft'), [listings]);
  const publishedCount = publishedListings.length;
  const groups = useMemo(() => groupOffers(rows), [rows]);
  const confirmedFor = useCallback(
    (group: OfferGroup) => group.discounts.reduce((sum, row) => sum + (stats.get(row.id)?.bookings ?? 0), 0),
    [stats]
  );

  const statusCounts = useMemo(() => {
    const counts = { all: 0, active: 0, upcoming: 0, paused: 0, ended: 0 };
    for (const group of groups) {
      counts.all += 1;
      const st = offerStatus(group.discounts[0], group.listing, confirmedFor(group));
      if (st === 'active') counts.active += 1;
      else if (st === 'upcoming') counts.upcoming += 1;
      else if (st === 'paused') counts.paused += 1;
      else counts.ended += 1; // ended + limit_reached
    }
    return counts;
  }, [groups, confirmedFor]);

  const activeOffers = useMemo(
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

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ranked = groups.filter((group) => {
      const type = productTypeLabel(group.listing);
      if (productFilter === 'tour' && type !== 'Tour') return false;
      if (productFilter === 'stay' && type !== 'Stay') return false;
      const st = offerStatus(group.discounts[0], group.listing, confirmedFor(group));
      if (statusFilter === 'ended') {
        if (st !== 'ended' && st !== 'limit_reached') return false;
      } else if (statusFilter !== 'all' && st !== statusFilter) {
        return false;
      }
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
      const af = offerDiscountPeriod(a.discounts[0]).from ?? '';
      const bf = offerDiscountPeriod(b.discounts[0]).from ?? '';
      return bf.localeCompare(af);
    });
  }, [groups, statusFilter, search, productFilter, confirmedFor]);

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / OFFER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = filteredGroups.slice(safePage * OFFER_PAGE_SIZE, safePage * OFFER_PAGE_SIZE + OFFER_PAGE_SIZE);

  const tabs = (
    [
      { id: 'all' as const, label: 'All', count: statusCounts.all },
      { id: 'active' as const, label: 'Active', count: statusCounts.active },
      { id: 'upcoming' as const, label: 'Upcoming', count: statusCounts.upcoming },
      { id: 'paused' as const, label: 'Paused', count: statusCounts.paused },
      { id: 'ended' as const, label: 'Ended', count: statusCounts.ended },
    ] as const
  );

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-offers`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tv-offers-title" role="heading" aria-level={1}>
            Offers
          </p>
          <p className="tv-offers-subtitle">
            Percentage discounts for published tours and stays.
          </p>
        </div>
        {canEdit ? (
          listings.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {/* Phase 1682: Calendar dual-CTA parity — create vs open listings. */}
              <button type="button" onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)} className="tv-btn-primary h-10 px-3 text-[13px]">
                New listing
              </button>
              <button type="button" onClick={goToListings} className="tv-btn-ghost h-10 px-3 text-[13px]">
                Your listings
              </button>
            </div>
          ) : publishedCount === 0 ? (
            <button type="button" onClick={goToListings} className="tv-btn-primary h-10 px-3 text-[13px]">
              Publish a listing
            </button>
          ) : (
            <button type="button" onClick={openNew} className="tv-btn-primary h-10 px-3 text-[13px]">
              New offer
            </button>
          )
        ) : null}
      </div>

      {!canEdit ? (
        <NoticeCallout title="View only" tone="warn">
          Your role can view offers but not create, edit, or delete them.
        </NoticeCallout>
      ) : null}

      {error ? (
        <ErrorState
          className="py-6"
          title="Offers unavailable"
          body={userFacingError(error, USER_ERROR.offers)}
          retry={{ onClick: () => void loadAll() }}
        />
      ) : null}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : listings.length > 0 || rows.length > 0 ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          {publishedCount === 0 && canEdit ? (
            <NoticeCallout title="Publish a listing first" tone="warn">
              Offers apply to published tours and stays. Publish a listing, then create an offer.
            </NoticeCallout>
          ) : null}

          <p className="text-[12px] text-[#71717a]">
            {statusCounts.all} total · {activeOffers} active
          </p>

          {rows.length > 0 ? (
            <>
              <div className="tv-offers-tabs" role="tablist" aria-label="Offer status">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.id}
                    onClick={() => setStatusFilterAndUrl(tab.id)}
                  >
                    {tab.label}
                    <span className="tv-offers-tabs__count">{tab.count}</span>
                  </button>
                ))}
              </div>

              <div className="tv-offers-filters">
                <div className="tv-offers-field">
                  <span id="offers-search-label">Search</span>
                  <span className="tv-offers-search">
                    <Search className="h-4 w-4 shrink-0 text-[#a1a1aa]" aria-hidden />
                    <input
                      className="tv-offers-search__input"
                      value={searchInput}
                      aria-labelledby="offers-search-label"
                      placeholder="Listing or booking option"
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        setPage(0);
                      }}
                    />
                  </span>
                </div>
                <div className="tv-offers-field">
                  <span id="offers-product-label">Product type</span>
                  <PartnerSelect
                    aria-labelledby="offers-product-label"
                    value={productFilter}
                    options={[
                      { value: 'all', label: 'All products' },
                      { value: 'tour', label: 'Tours' },
                      { value: 'stay', label: 'Stays' },
                    ]}
                    onChange={(v) => {
                      setProductFilter(v as ProductFilter);
                      setPage(0);
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}

          {actionError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200/80" role="alert">
              {actionError}
            </p>
          ) : null}

          {rows.length === 0 ? (
            <div className="tv-offers-empty">
              <p className="tv-offers-empty__title" role="heading" aria-level={2}>
                No offers yet
              </p>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-[#71717a]">
                {publishedCount === 0
                  ? 'Publish a tour with booking options first. Stay listings cannot use percentage discounts yet.'
                  : 'Create a timed discount on a published tour. It will appear on the public product page and checkout.'}
              </p>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {publishedCount === 0 ? (
                    <>
                      <button type="button" onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)} className="tv-btn-primary h-9 px-3 text-[13px]">
                        New listing
                      </button>
                      <button type="button" onClick={goToListings} className="tv-btn-ghost h-9 px-3 text-[13px]">
                        Your listings
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={openNew} className="tv-btn-primary h-9 px-3 text-[13px]">
                      New offer
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="tv-offers-empty">
              <p className="tv-offers-empty__title" role="heading" aria-level={2}>
                No matching offers
              </p>
              <p className="mt-1 text-[13px] text-[#71717a]">Try adjusting your search or filters.</p>
              <button
                type="button"
                className="tv-btn-secondary mt-3 h-9 px-3 text-[13px]"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setProductFilter('all');
                  setStatusFilterAndUrl('all');
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visibleGroups.map((group) => {
                const listing = group.listing;
                const head = group.discounts[0];
                const confirmed = confirmedFor(group);
                const st = offerStatus(head, listing, confirmed);
                const statusLabel = statusLabelFor(st);
                const currency = normalizeCurrency(listing.price?.currency);
                const pct =
                  head.type === 'percent'
                    ? `${Math.round(Number(head.value))}%`
                    : formatMoney(Number(head.value), currency);
                const isStay = listingIsFamily(listing, 'stay');
                const opts = materializedBookingOptions(
                  parseListingExtras(listing.listingExtras as unknown).bookingOptions
                );
                const optionRows = group.discounts.map((row) => {
                  const label = optionLabelForDiscount(listing, row);
                  const matched = row.booking_option_id
                    ? opts.find((option) => option.id === row.booking_option_id)
                    : null;
                  const span = matched ? optionPriceSpan(matched) : { low: 0, high: 0 };
                  const discounted =
                    span.low > 0 ? applyDiscount(span.low, row, currency).price : null;
                  return { id: row.id, label, original: span.low, discounted };
                });
                let origLow = Infinity;
                let discLow = Infinity;
                for (const row of optionRows) {
                  if (row.original > 0) {
                    origLow = Math.min(origLow, row.original);
                    if (row.discounted != null) discLow = Math.min(discLow, row.discounted);
                  }
                }
                const stayNightly =
                  parseListingExtras(listing.listingExtras as unknown).stay?.nightlyPriceUsd ??
                  listing.price?.startingFrom ??
                  0;
                const stayDisc =
                  isStay && stayNightly > 0 ? applyDiscount(stayNightly, head, currency).price : null;
                const customerPrice = isStay
                  ? stayDisc != null
                    ? formatMoney(stayDisc, currency)
                    : '—'
                  : Number.isFinite(discLow)
                    ? formatMoney(discLow, currency)
                    : '—';
                const originalPrice = isStay
                  ? stayNightly > 0
                    ? formatMoney(stayNightly, currency)
                    : '—'
                  : Number.isFinite(origLow)
                    ? formatMoney(origLow, currency)
                    : '—';
                const period = offerDiscountPeriod(head);
                const cardKey = `${listing.id}:${group.key}`;
                const menuOpen = menuKey === cardKey;
                const optionsExpanded = expandedOptionsKey === cardKey;
                const typeLabel = productTypeLabel(listing);
                const optionCount = isStay ? 0 : optionRows.length;
                return (
                  <li key={cardKey}>
                    <article className="tv-offers-card">
                      {listing.image?.trim() ? (
                        <img src={listing.image} alt="" className="tv-offers-card__thumb" />
                      ) : (
                        <div className="tv-offers-card__thumb tv-offers-card__thumb--empty" aria-hidden>
                          <MapPin className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="tv-offers-card__title" title={listing.title}>
                            {listing.title}
                          </p>
                          <span className="tv-offers-chip">{typeLabel}</span>
                          <span className={statusChipClass(statusLabel)}>{statusLabel}</span>
                        </div>
                        <dl className="tv-offers-card__grid">
                          <div>
                            <dt>Discount period</dt>
                            <dd>
                              {formatDate(period.from)} – {formatDate(period.until)}
                            </dd>
                          </div>
                          <div>
                            <dt>{isStay ? 'Nightly from' : 'From'}</dt>
                            <dd>
                              {customerPrice}
                              {originalPrice !== '—' && customerPrice !== originalPrice ? (
                                <span className="ml-1 font-medium text-[#a1a1aa] line-through">{originalPrice}</span>
                              ) : null}
                            </dd>
                          </div>
                          <div>
                            <dt>Usage</dt>
                            <dd>
                              {head.booking_limit
                                ? `${confirmed} / ${head.booking_limit}`
                                : `${confirmed} used`}
                            </dd>
                          </div>
                        </dl>
                        {!isStay && optionCount > 0 ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#073b83]"
                              aria-expanded={optionsExpanded}
                              onClick={() =>
                                setExpandedOptionsKey(optionsExpanded ? null : cardKey)
                              }
                            >
                              {optionCount === 1 ? '1 booking option' : `${optionCount} booking options`}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${optionsExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                            {optionsExpanded ? (
                              <ul className="mt-1.5 space-y-1 rounded-lg bg-[#f8f9fb] px-2.5 py-2 ring-1 ring-[#e5e7eb]">
                                {optionRows.map((row) => (
                                  <li
                                    key={row.id}
                                    className="flex items-baseline justify-between gap-3 text-[12px] text-[#3f3f46]"
                                  >
                                    <span className="min-w-0 truncate font-medium text-[#18181b]">{row.label}</span>
                                    <span className="shrink-0 tabular-nums">
                                      {row.discounted != null ? formatMoney(row.discounted, currency) : '—'}
                                      {row.original > 0 && row.discounted != null && row.discounted < row.original - 0.004 ? (
                                        <span className="ml-1 text-[#a1a1aa] line-through">
                                          {formatMoney(row.original, currency)}
                                        </span>
                                      ) : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="tv-offers-card__aside flex flex-col items-end gap-2">
                        <p className="tv-offers-card__pct">
                          {pct}
                          {head.type === 'percent' ? (
                            <span className="text-[11px] font-semibold text-[#71717a]"> off</span>
                          ) : null}
                        </p>
                        <div className="relative" data-offer-menu>
                          <button
                            type="button"
                            disabled={!canEdit}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label="Offer actions"
                            onClick={() => setMenuKey(menuOpen ? null : cardKey)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#71717a] ring-1 ring-[#e5e7eb] hover:text-[#18181b] disabled:opacity-40"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          {menuOpen ? (
                            <div
                              role="menu"
                              className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-sm"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-[13px] text-[#18181b] hover:bg-black/[0.03]"
                                onClick={() => openEdit(group.discounts)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-[13px] text-[#18181b] hover:bg-black/[0.03]"
                                onClick={() => void handlePause(group.discounts, !head.paused)}
                              >
                                {head.paused ? 'Resume' : 'Pause'}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-[13px] text-[#18181b] hover:bg-black/[0.03]"
                                onClick={() => openDuplicate(group.discounts)}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-2 text-left text-[13px] text-red-800 hover:bg-black/[0.03]"
                                onClick={() => handleEndOrRemove(group.discounts)}
                              >
                                End offer
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
              {pageCount > 1 ? (
                <li className="flex items-center justify-between pt-1 text-[13px]">
                  <button
                    type="button"
                    className="tv-btn-secondary h-9 px-3"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Previous
                  </button>
                  <span className="tabular-nums text-[#71717a]">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="tv-btn-secondary h-9 px-3"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : error ? null : (
        <div className="tv-offers-empty">
          <p className="tv-offers-empty__title" role="heading" aria-level={2}>
            No listings yet
          </p>
          <p className="mt-1 max-w-md text-[13px] text-[#71717a]">
            Offers attach to published tours and stays. Create a listing first.
          </p>
          <button type="button" onClick={goToListings} className="tv-btn-primary mt-3 h-9 px-3 text-[13px]">
            Open listings
          </button>
        </div>
      )}

      <DiscountOfferWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setEditingGroup([]);
          setDraftGroup(null);
        }}
        listings={publishedListings}
        editingGroup={editingGroup}
        draft={draftGroup}
        existingOffers={rows.map((row) => row.discount)}
        onSaved={() => void loadAll()}
        onOpenConflictOffer={(offerIds) => {
          const hit = rows.find((row) => offerIds.includes(row.discount.id));
          if (!hit) return;
          const groupKey = hit.discount.offer_group_id || hit.discount.id;
          const group = rows
            .filter((row) => {
              const key = row.discount.offer_group_id || row.discount.id;
              return row.listing.id === hit.listing.id && key === groupKey;
            })
            .map((row) => row.discount);
          if (group.length === 0) return;
          setDraftGroup(null);
          setEditingGroup(group);
          setWizardOpen(true);
        }}
      />

      <PartnerConfirmModal
        open={confirmEnd != null}
        title="End this offer?"
        description="It will stop applying to new bookings. Confirmed bookings keep their agreed price."
        confirmLabel="End offer"
        destructive
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => {
          if (confirmBusy) return;
          setConfirmEnd(null);
          setConfirmError(null);
        }}
        onConfirm={() => void confirmEndOffer()}
      />
    </div>
  );
}
