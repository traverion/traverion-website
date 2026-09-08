import { useState, useEffect, useMemo, useCallback } from 'react';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR } from '../../lib/userFacingError';
import { CalendarDays } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import {
  fetchCancellationRequestsForBookings,
} from '../../data/supabase-booking-ops';
import { listingPickupCopyIncomplete, bookingIsStayNight } from '../../lib/pickup-completeness';
import { isPaidPaymentStatus } from '../../lib/payment-states';
import type { TourPackage } from '../../types/tour';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney } from '../../lib/money';
import { bookingOccupiesInventory } from '../../lib/booking-hold';
import { partnerBookingIsOperatingTrip } from '../../lib/trip-views';

interface SupplierDashboardProps {
  onNavigateToBookings?: () => void;
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SupplierDashboard({ onNavigateToBookings }: SupplierDashboardProps) {
  const { user, isSupabase } = useSupplierAuth();
  /** Published / live on Traverion only — drafts excluded (see My listings for all rows). */
  const [publishedListingsCount, setPublishedListingsCount] = useState<number | null>(null);
  const [draftListingsCount, setDraftListingsCount] = useState(0);
  const [listingTitlesById, setListingTitlesById] = useState<Record<string, string>>({});
  const [listingsById, setListingsById] = useState<Record<string, TourPackage>>({});
  const [openCancels, setOpenCancels] = useState<
    Awaited<ReturnType<typeof fetchCancellationRequestsForBookings>>
  >([]);
  const [supplierBookings, setSupplierBookings] = useState<BookingRow[]>([]);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>> | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const reloadDashboard = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setPublishedListingsCount(0);
      setDraftListingsCount(0);
      setListingTitlesById({});
      setListingsById({});
      setSupplierBookings([]);
      setOpenCancels([]);
      setProfile(null);
      setDashboardError(null);
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    const settled = await Promise.allSettled([
      fetchMyListings(uid),
      fetchBookingsForSupplier(uid),
      fetchSupplierProfile(uid),
    ]);
    const failures: string[] = [];
    const noteFailure = (key: string) => {
      failures.push(key);
    };
    if (settled[0].status === 'fulfilled') {
      const listings = settled[0].value;
      setPublishedListingsCount(listings.filter((t) => t.status === 'published').length);
      setDraftListingsCount(listings.filter((t) => t.status === 'draft').length);
      setListingTitlesById(Object.fromEntries(listings.map((t) => [t.id, t.title])));
      setListingsById(Object.fromEntries(listings.map((t) => [t.id, t])));
    } else {
      noteFailure('listings');
      setPublishedListingsCount(0);
      setDraftListingsCount(0);
      setListingTitlesById({});
      setListingsById({});
    }
    if (settled[1].status === 'fulfilled') {
      setSupplierBookings(settled[1].value);
      const ids = settled[1].value.map((b) => b.id);
      const reqs = await fetchCancellationRequestsForBookings(ids);
      setOpenCancels(reqs.filter((r) => r.status === 'requested'));
    } else {
      noteFailure('bookings');
      setSupplierBookings([]);
      setOpenCancels([]);
    }
    if (settled[2].status === 'fulfilled') {
      setProfile(settled[2].value);
    } else {
      noteFailure('profile');
      setProfile(null);
    }
    if (failures.length > 0) {
      const critical = failures.includes('bookings');
      setDashboardError(critical ? USER_ERROR.bookings : USER_ERROR.today);
    }
    setDashboardLoading(false);
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void reloadDashboard();
  }, [reloadDashboard]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void reloadDashboard();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDashboard]);

  const now = new Date();
  const todayYmd = localYmd(now);

  const todayScheduleRows = useMemo(() => {
    const active = supplierBookings.filter(
      (b) => b.booking_date === todayYmd && bookingOccupiesInventory(b)
    );
    const byListing = new Map<string, { bookings: number; guests: number }>();
    for (const b of active) {
      const cur = byListing.get(b.listing_id) ?? { bookings: 0, guests: 0 };
      cur.bookings += 1;
      cur.guests += b.guests ?? 0;
      byListing.set(b.listing_id, cur);
    }
    return [...byListing.entries()].map(([listingId, v]) => ({
      listingId,
      title: listingTitlesById[listingId] ?? 'Tour',
      bookings: v.bookings,
      guests: v.guests,
    }));
  }, [supplierBookings, listingTitlesById, todayYmd]);

  const pendingBookings = useMemo(
    () =>
      supplierBookings.filter(
        (b) =>
          b.status !== 'cancelled' && (b.payment_status ?? 'pending').trim().toLowerCase() === 'pending'
      ),
    [supplierBookings]
  );

  const verificationNeedsAction = useMemo(() => {
    const v = (profile?.verification_status ?? '').trim().toLowerCase();
    if (v === 'verified') return false;
    return true;
  }, [profile?.verification_status]);

  const pickupGaps = useMemo(
    () =>
      supplierBookings.filter((b) => {
        if (!bookingOccupiesInventory(b) || !isPaidPaymentStatus(b.payment_status)) return false;
        if (!b.booking_date || b.booking_date < todayYmd) return false;
        if (bookingIsStayNight(b)) return false;
        if (b.pickup_time) return false;
        const listing = listingsById[b.listing_id];
        return listingPickupCopyIncomplete(listing?.meetingPoint, listing?.pickupInstructions);
      }),
    [supplierBookings, listingsById, todayYmd]
  );

  const openCancelCount = openCancels.length;
  const overdueCancelCount = openCancels.filter(
    (r) => r.expires_at && new Date(r.expires_at).getTime() < Date.now()
  ).length;

  const attentionCount =
    pendingBookings.length + draftListingsCount + (verificationNeedsAction ? 1 : 0) + pickupGaps.length + openCancelCount;

  const recentBookings = useMemo(
    () =>
      [...supplierBookings]
        .filter((b) => partnerBookingIsOperatingTrip(b))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 3),
    [supplierBookings]
  );

  const firstName =
    (profile?.display_name || profile?.company_legal_name || '').trim().split(/\s+/)[0] || null;
  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const upcoming = supplierBookings
    .filter((b) => bookingOccupiesInventory(b) && b.booking_date && b.booking_date > todayYmd)
    .sort((a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? ''))
    .slice(0, 4);

  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} motion-safe:animate-fade-in`}>
      <header className="pt-2 sm:pt-8 mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted mb-2">{dateLabel}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink">
            {firstName ? `${hello}, ${firstName}.` : hello}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
          className={`${attentionCount > 0 ? 'tv-btn-ghost' : 'tv-btn-primary'} self-start`}
        >
          New listing
        </button>
      </header>

      {dashboardError && (
        <ErrorState
          className="py-6"
          title="Today unavailable"
          body={dashboardError}
          retry={{ onClick: () => void reloadDashboard() }}
        />
      )}

      <section className="mb-12">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Today</h2>
        {dashboardLoading && publishedListingsCount === null ? (
          <SupplierListSkeleton rows={3} />
        ) : todayScheduleRows.length === 0 ? (
          <SupplierEmptyState
            icon={CalendarDays}
            className="py-4"
            title="You're set for today"
            body="Nothing needs you right now. Guests and stay arrivals appear here when they are booked for today."
            action={
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                className="tv-btn-primary"
              >
                Open calendar
              </button>
            }
          />
        ) : (
          <ul className="space-y-4">
            {todayScheduleRows.map((row) => (
              <li key={row.listingId}>
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                  className="lux-flat text-left"
                >
                  <p className="font-sans text-lg font-semibold text-ink">{row.title}</p>
                  <p className="text-sm text-ink-muted">
                    {row.guests} guests · {row.bookings} booking{row.bookings === 1 ? '' : 's'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
      <section className="mb-12">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Upcoming</h2>
          <ul className="space-y-4">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                  className="lux-flat text-left font-semibold text-ink"
                >
                  {listingTitlesById[b.listing_id] ?? 'Tour'}
                </button>
                <p className="text-sm text-ink-muted">
                  {new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {b.guests} guest{b.guests === 1 ? '' : 's'}
                </p>
              </li>
            ))}
          </ul>
      </section>
      )}

            {attentionCount > 0 && (
      <section className="mb-12">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Needs attention</h2>
        <ul className="space-y-2 text-sm">
            {openCancelCount > 0 && (
              <li>
                <button type="button" onClick={() => onNavigateToBookings?.()} className="lux-flat min-h-11 w-full text-left py-2 text-finland font-medium">
                  {openCancelCount} cancellation request{openCancelCount === 1 ? '' : 's'} waiting for the traveler
                  {overdueCancelCount > 0
                    ? ` · ${overdueCancelCount} past the review window (Traverion does not auto-cancel)`
                    : ''}
                </button>
              </li>
            )}
            {pickupGaps.length > 0 && (
              <li>
                <button type="button" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/pickup`)} className="lux-flat min-h-11 w-full text-left py-2 text-finland font-medium">
                  {pickupGaps.length} paid booking{pickupGaps.length === 1 ? '' : 's'} missing pickup details
                </button>
              </li>
            )}
            {pendingBookings.length > 0 && (
              <li>
                <button type="button" onClick={() => onNavigateToBookings?.()} className="lux-flat min-h-11 w-full text-left py-2 text-finland font-medium">
                  {pendingBookings.length} unpaid checkout{pendingBookings.length === 1 ? '' : 's'} still open
                </button>
              </li>
            )}
            {draftListingsCount > 0 && (
              <li>
                <button type="button" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)} className="lux-flat min-h-11 w-full text-left py-2 text-finland font-medium">
                  {draftListingsCount} draft listing{draftListingsCount === 1 ? '' : 's'}
                </button>
              </li>
            )}
            {verificationNeedsAction && (
              <li>
                <button type="button" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)} className="lux-flat min-h-11 w-full text-left py-2 text-finland font-medium">
                  Finish business and payout setup
                </button>
              </li>
            )}
          </ul>
      </section>
      )}

      {attentionCount === 0 && !dashboardLoading && (
        <section className="mb-12">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Needs attention</h2>
          <p className="text-ink-muted max-w-lg leading-relaxed">
            Nothing needs you right now. Pickup gaps, cancellation requests, drafts, and verification will show up here when they do.
          </p>
        </section>
      )}

      {recentBookings.length > 0 && (
        <section className="mb-12">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Recent</h2>
          <ul className="space-y-4">
            {recentBookings.map((b) => {
              const paid =
                b.amount_paid != null &&
                Number.isFinite(Number(b.amount_paid)) &&
                (b.payment_status ?? '').trim().toLowerCase() === 'paid'
                  ? Number(b.amount_paid)
                  : null;
              const money = paid == null ? null : formatMoney(paid, b.currency);
              return (
                <li key={b.id} className="flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                    className="lux-flat text-left font-semibold text-ink"
                  >
                    {b.guest_name?.trim() || listingTitlesById[b.listing_id] || 'New booking'}
                  </button>
                  {money ? <p className="text-sm tabular-nums text-ink-muted">{money}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isSupabase && user && <SupplierPortalNoticePanel userId={user.id} />}
    </div>
  );
}
