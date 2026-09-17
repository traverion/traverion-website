import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR } from '../../lib/userFacingError';
import { CalendarDays, ChevronRight } from 'lucide-react';
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

  const todayScheduleRows = useMemo(() => {
    const active = supplierBookings.filter((b) => partnerBookingIsTodaySchedule(b, todayYmd));
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

      <section className="mb-10 rounded-3xl bg-finland/[0.04] p-5 sm:p-6 ring-1 ring-finland/10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-finland/70 mb-4">Today</h2>
        {dashboardLoading && publishedListingsCount === null ? (
          <SupplierListSkeleton rows={3} />
        ) : todayScheduleRows.length === 0 ? (
          <SupplierEmptyState
            icon={CalendarDays}
            className="py-4"
            title={todayEmptyCopy.title}
            body={todayEmptyCopy.body}
            action={
              attentionCount > 0 ? undefined : (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                  className="tv-btn-primary"
                >
                  Open calendar
                </button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {todayScheduleRows.map((row) => (
              <li key={row.listingId}>
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                  className="lux-flat group flex w-full items-center justify-between gap-3 rounded-2xl bg-paper-raised p-4 text-left shadow-soft ring-1 ring-black/[0.06] transition-shadow hover:ring-finland/25"
                >
                  <div className="min-w-0">
                    <p className="font-sans text-base sm:text-lg font-semibold text-ink truncate">{row.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {row.guests} guests · {row.bookings} booking{row.bookings === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/80">
                    Today
                    <ChevronRight className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
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
                    · {b.guests} guest{b.guests === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attentionCount === 0 && !dashboardLoading && (
        <section className="mb-10 rounded-3xl bg-emerald-50/50 p-5 sm:p-6 ring-1 ring-emerald-100/80">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-emerald-800/70 mb-3">Needs attention</h2>
          <p className="text-sm text-emerald-950/80 max-w-lg leading-relaxed">
            Nothing needs you right now. Pickup gaps, cancellation requests, Refund due, drafts, and verification will
            show up here when they do.
          </p>
        </section>
      )}

      {recentBookings.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">Recent</h2>
          <ul className="divide-y divide-black/[0.05] overflow-hidden rounded-2xl bg-paper-raised ring-1 ring-black/[0.05]">
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
                    className="lux-flat flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02]"
                  >
                    <span className="font-semibold text-ink truncate">
                      {b.guest_name?.trim() || listingTitlesById[b.listing_id] || 'New booking'}
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
