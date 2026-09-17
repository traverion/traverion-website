import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { SUPPLIER_PAGE_CLASS, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR } from '../../lib/userFacingError';
import { ChevronRight } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import {
  fetchCancellationRequestsForBookings,
} from '../../data/supabase-booking-ops';
import { listingPickupCopyIncomplete, bookingIsStayNight } from '../../lib/pickup-completeness';
import { isPaidPaymentStatus, isRefundDueBooking } from '../../lib/payment-states';
import type { TourPackage } from '../../types/tour';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney } from '../../lib/money';
import { bookingOccupiesInventory } from '../../lib/booking-hold';
import { partnerBookingIsOperatingTrip, partnerBookingIsTodaySchedule, partnerBookingIsUpcomingSchedule } from '../../lib/trip-views';
import { partnerTodayEmptyScheduleCopy } from '../../lib/partner-today-copy';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { pgTimeToHm } from '../../data/supabase-listings';

interface SupplierDashboardProps {
  onNavigateToBookings?: () => void;
}

type AttentionTone = 'danger' | 'warn' | 'info';

const ATTENTION_TONE: Record<AttentionTone, string> = {
  danger: 'bg-rose-50 ring-1 ring-rose-200/80 text-rose-950 hover:bg-rose-100/90',
  warn: 'bg-amber-50 ring-1 ring-amber-200/80 text-amber-950 hover:bg-amber-100/90',
  info: 'bg-finland/[0.07] ring-1 ring-finland/20 text-ink hover:bg-finland/[0.11]',
};

function AttentionRow({
  tone,
  onClick,
  children,
}: {
  tone: AttentionTone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`lux-flat group flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium ${ATTENTION_TONE[tone]}`}
      >
        <span className="min-w-0 leading-snug">{children}</span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
    </li>
  );
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SupplierDashboard({ onNavigateToBookings: _onNavigateToBookings }: SupplierDashboardProps) {
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

  const todayDepartures = useMemo(() => {
    return supplierBookings
      .filter((b) => partnerBookingIsTodaySchedule(b, todayYmd))
      .sort((a, b) => {
        const ta = (a.start_time ?? a.pickup_time ?? '').toString();
        const tb = (b.start_time ?? b.pickup_time ?? '').toString();
        return ta.localeCompare(tb) || (a.created_at ?? '').localeCompare(b.created_at ?? '');
      });
  }, [supplierBookings, todayYmd]);

  const todayScheduleRows = useMemo(() => {
    const byListing = new Map<string, { bookings: number; guests: number }>();
    for (const b of todayDepartures) {
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
  }, [todayDepartures, listingTitlesById]);

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

  const refundDueCount = useMemo(
    () => supplierBookings.filter(isRefundDueBooking).length,
    [supplierBookings]
  );

  const attentionCount =
    pendingBookings.length +
    draftListingsCount +
    (verificationNeedsAction ? 1 : 0) +
    pickupGaps.length +
    openCancelCount +
    refundDueCount;

  const todayEmptyCopy = partnerTodayEmptyScheduleCopy(attentionCount);

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
    .filter((b) => partnerBookingIsUpcomingSchedule(b, todayYmd))
    .sort((a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? ''))
    .slice(0, 4);

  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} motion-safe:animate-fade-in`}>
      <header className="mb-10 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
            Today
          </div>
          <p className="text-sm text-ink-muted mb-2">{dateLabel}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">
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

      {attentionCount > 0 && (
        <section className="mb-10 rounded-3xl bg-rose-50/40 p-5 sm:p-6 ring-1 ring-rose-100/80">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-rose-800/70 mb-4">Needs attention</h2>
          <ul className="space-y-2.5">
            {openCancelCount > 0 && (
              <AttentionRow
                tone="danger"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=cancel`)}
              >
                {openCancelCount} cancellation request{openCancelCount === 1 ? '' : 's'} waiting for the traveler
                {overdueCancelCount > 0
                  ? ` · ${overdueCancelCount} past the review window (Traverion does not auto-cancel)`
                  : ''}
              </AttentionRow>
            )}
            {refundDueCount > 0 && (
              <AttentionRow
                tone="danger"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=refund_due`)}
              >
                {refundDueCount} booking{refundDueCount === 1 ? '' : 's'} still Refund due (manual Stripe refund)
              </AttentionRow>
            )}
            {pickupGaps.length > 0 && (
              <AttentionRow tone="warn" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/pickup`)}>
                {pickupGaps.length} paid booking{pickupGaps.length === 1 ? '' : 's'} missing pickup details
              </AttentionRow>
            )}
            {pendingBookings.length > 0 && (
              <AttentionRow
                tone="warn"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=unpaid`)}
              >
                {pendingBookings.length} unpaid checkout{pendingBookings.length === 1 ? '' : 's'} still open
              </AttentionRow>
            )}
            {draftListingsCount > 0 && (
              <AttentionRow tone="info" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}>
                {draftListingsCount} draft listing{draftListingsCount === 1 ? '' : 's'}
              </AttentionRow>
            )}
            {verificationNeedsAction && (
              <AttentionRow tone="warn" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}>
                Finish business and payout setup
              </AttentionRow>
            )}
          </ul>
        </section>
      )}

      <section className="mb-8 rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">Today’s departures</h2>
          {todayDepartures.length > 0 ? (
            <span className="text-xs text-ink-muted tabular-nums">
              {todayDepartures.length} booking{todayDepartures.length === 1 ? '' : 's'} ·{' '}
              {todayScheduleRows.reduce((s, r) => s + r.guests, 0)} guests
            </span>
          ) : null}
        </div>
        {dashboardLoading && publishedListingsCount === null ? (
          <SupplierListSkeleton rows={3} />
        ) : todayDepartures.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-finland/[0.04] px-3.5 py-3 ring-1 ring-finland/10">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{todayEmptyCopy.title}</p>
              <p className="text-xs text-ink-muted mt-0.5 leading-snug">{todayEmptyCopy.body}</p>
            </div>
            {attentionCount === 0 ? (
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                className="tv-btn-ghost text-xs shrink-0"
              >
                Calendar
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {todayDepartures.map((b) => {
              const startHm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time) || null;
              const pickupMissing = pickupGaps.some((g) => g.id === b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                    className="lux-flat group flex w-full items-start justify-between gap-3 py-3.5 text-left hover:bg-finland/[0.03] -mx-1 px-1 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {startHm ? (
                          <span className="text-sm font-semibold tabular-nums text-finland">{startHm}</span>
                        ) : (
                          <span className="text-xs font-medium text-ink-faint">Time TBD</span>
                        )}
                        <span className="font-semibold text-ink truncate">
                          {listingTitlesById[b.listing_id] ?? 'Tour'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {typeof b.booking_number === 'number' && b.booking_number > 0 ? (
                          <span className="font-mono text-finland">#{b.booking_number}</span>
                        ) : null}
                        {typeof b.booking_number === 'number' && b.booking_number > 0 ? ' · ' : null}
                        {formatBookingParticipantsLabel(b)}
                        {b.guest_name ? ` · ${b.guest_name}` : ''}
                      </p>
                      {pickupMissing ? (
                        <p className="mt-1 text-xs font-medium text-amber-800">Pickup missing</p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint mt-1 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Upcoming</h2>
          <ul className="space-y-2.5">
            {upcoming.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                  className="lux-flat flex w-full flex-col gap-1 rounded-2xl bg-paper-raised px-4 py-3.5 text-left shadow-soft ring-1 ring-black/[0.05] sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-semibold text-ink">{listingTitlesById[b.listing_id] ?? 'Tour'}</span>
                  <span className="text-sm text-ink-muted">
                    {new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {formatBookingParticipantsLabel(b)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attentionCount === 0 && !dashboardLoading && (
        <p className="mb-8 text-sm text-ink-muted leading-snug">
          ✓ Nothing needs your attention right now.
        </p>
      )}

      {recentBookings.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Recent</h2>
          <ul className="space-y-2">
            {recentBookings.map((b) => {
              const paid =
                b.amount_paid != null &&
                Number.isFinite(Number(b.amount_paid)) &&
                (b.payment_status ?? '').trim().toLowerCase() === 'paid'
                  ? Number(b.amount_paid)
                  : null;
              const money = paid == null ? null : formatMoney(paid, b.currency);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                    className="lux-flat flex w-full flex-col gap-1 rounded-2xl bg-paper-raised px-4 py-3.5 text-left shadow-soft ring-1 ring-black/[0.05] hover:ring-finland/20 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-ink block truncate">
                        {b.guest_name?.trim() || listingTitlesById[b.listing_id] || 'New booking'}
                      </span>
                      <span className="text-xs text-ink-muted mt-0.5 block">
                        {listingTitlesById[b.listing_id] && b.guest_name?.trim()
                          ? listingTitlesById[b.listing_id]
                          : null}
                        {listingTitlesById[b.listing_id] && b.guest_name?.trim() ? ' · ' : null}
                        {formatBookingParticipantsLabel(b)}
                      </span>
                    </span>
                    {money ? <span className="text-sm tabular-nums text-ink-muted shrink-0">{money}</span> : null}
                  </button>
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
