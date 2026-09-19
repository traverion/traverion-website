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
  fetchBookingMessages,
} from '../../data/supabase-booking-ops';
import { bookingNeedsPickupCopy, bookingIsStayNight, resolveBookingPickupCopy } from '../../lib/pickup-completeness';
import { bookingPaymentWasCollected, isRefundDueBooking } from '../../lib/payment-states';
import type { TourPackage } from '../../types/tour';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';
import { navigateSupplierUrl, openSupplierInbox, openSupplierPickup } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney } from '../../lib/money';
import { bookingOccupiesInventory } from '../../lib/booking-hold';
import { partnerBookingIsOperatingTrip, partnerBookingIsTodaySchedule, partnerBookingIsUpcomingSchedule } from '../../lib/trip-views';
import { partnerTodayEmptyScheduleCopy } from '../../lib/partner-today-copy';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { pgTimeToHm } from '../../data/supabase-listings';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';
import { PARTNER_INBOX_MESSAGE_FETCH_CAP } from '../../lib/partner-inbox-cap';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';

type AttentionTone = 'danger' | 'warn' | 'info';

const ATTENTION_ACCENT: Record<AttentionTone, string> = {
  danger: 'bg-rose-500',
  warn: 'bg-amber-500',
  info: 'bg-slate-300',
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
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="partner-row-interact lux-flat group flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ATTENTION_ACCENT[tone]}`} aria-hidden />
        <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-slate-800">{children}</span>
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500"
          aria-hidden
        />
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

export default function SupplierDashboard() {
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
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [firstUnreadBookingId, setFirstUnreadBookingId] = useState<string | null>(null);
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
      setUnreadMessageCount(0);
      setFirstUnreadBookingId(null);
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
    let bookingsForUnread: BookingRow[] = [];
    if (settled[1].status === 'fulfilled') {
      setSupplierBookings(settled[1].value);
      bookingsForUnread = settled[1].value;
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

    // Unread traveler messages on paid bookings (same depth Inbox uses).
    const paidForMsgs = bookingsForUnread
      .filter((b) => bookingPaymentWasCollected(b.payment_status))
      .slice(0, PARTNER_INBOX_MESSAGE_FETCH_CAP);
    const unreadFlags = await Promise.all(
      paidForMsgs.map(async (b) => {
        const msgs = await fetchBookingMessages(b.id);
        const last = msgs[msgs.length - 1];
        return Boolean(last && last.sender_role === 'traveler' && !last.read_by_supplier_at);
      })
    );
    const unread = unreadFlags.filter(Boolean).length;
    const firstUnread = paidForMsgs.find((_, i) => unreadFlags[i])?.id ?? null;
    setUnreadMessageCount(unread);
    setFirstUnreadBookingId(firstUnread);

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

  /**
   * profile starts null (before the first fetch resolves, or if that one fetch in the
   * Promise.allSettled batch fails while bookings/listings still succeed) — defaulting to
   * "needs action" in that case falsely tells an already-verified supplier to finish
   * onboarding. Only flag this once we actually have profile data saying otherwise.
   */
  const verificationNeedsAction = useMemo(() => {
    if (!profile) return false;
    const v = (profile.verification_status ?? '').trim().toLowerCase();
    return v !== 'verified';
  }, [profile]);

  const pickupGaps = useMemo(
    () =>
      supplierBookings.filter((b) => {
        if (!bookingOccupiesInventory(b) || !bookingPaymentWasCollected(b.payment_status)) return false;
        if (!b.booking_date || b.booking_date < todayYmd) return false;
        const listing = listingsById[b.listing_id];
        const opts = materializedBookingOptions(
          parseListingExtras(listing?.listingExtras as unknown).bookingOptions
        );
        const copy = resolveBookingPickupCopy({
          bookingOptionId: b.booking_option_id,
          listingMeetingPoint: listing?.meetingPoint,
          listingPickupInstructions: listing?.pickupInstructions,
          bookingOptions: opts,
        });
        return bookingNeedsPickupCopy(b, copy.meetingPoint, copy.pickupInstructions);
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
    refundDueCount +
    unreadMessageCount;

  const todayEmptyCopy = partnerTodayEmptyScheduleCopy(attentionCount);

  const recentBookings = useMemo(
    () =>
      [...supplierBookings]
        .filter((b) => partnerBookingIsOperatingTrip(b))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 4),
    [supplierBookings]
  );

  const firstName =
    (profile?.display_name || profile?.company_legal_name || '').trim().split(/\s+/)[0] || null;
  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const weekAhead = useMemo(() => {
    const [y, m, d] = todayYmd.split('-').map(Number);
    const end = new Date(y!, m! - 1, d!);
    end.setDate(end.getDate() + 7);
    const endYmd = localYmd(end);
    return supplierBookings
      .filter((b) => {
        if (!partnerBookingIsUpcomingSchedule(b, todayYmd)) return false;
        const bd = b.booking_date ?? '';
        return bd > todayYmd && bd <= endYmd;
      })
      .sort((a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? ''))
      .slice(0, 8);
  }, [supplierBookings, todayYmd]);

  const upcoming = weekAhead.slice(0, 6);

  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const todayGuestTotal = todayScheduleRows.reduce((s, r) => s + r.guests, 0);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} motion-safe:animate-fade-in`}>
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-1">{dateLabel}</p>
          <h1 className="font-display text-[1.625rem] sm:text-[1.875rem] font-semibold leading-tight tracking-tight text-slate-900">
            {firstName ? `${hello}, ${firstName}` : hello}
          </h1>
          <p className="mt-1.5 text-[14px] text-slate-500 max-w-xl leading-relaxed">
            {attentionCount > 0
              ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need your attention.`
              : todayDepartures.length > 0
                ? `${todayDepartures.length} on today’s schedule · ${todayGuestTotal} guest${todayGuestTotal === 1 ? '' : 's'}.`
                : 'Your operational starting point for today.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-end">
          <button
            type="button"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
            className="partner-nav-item lux-flat inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
            className={`partner-nav-item lux-flat inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-medium ${
              attentionCount > 0
                ? 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                : 'bg-finland text-white hover:bg-finland-dark'
            }`}
          >
            New listing
          </button>
        </div>
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
        <section className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2">Needs attention</h2>
          <ul className="partner-surface-panel overflow-hidden">
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
              <AttentionRow tone="warn" onClick={() => openSupplierPickup(pickupGaps[0]?.id)}>
                {pickupGaps.length} paid booking{pickupGaps.length === 1 ? '' : 's'} missing pickup details
              </AttentionRow>
            )}
            {unreadMessageCount > 0 && (
              <AttentionRow tone="info" onClick={() => openSupplierInbox(firstUnreadBookingId ?? undefined)}>
                {unreadMessageCount} unread traveler message{unreadMessageCount === 1 ? '' : 's'}
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

      <section className="mb-9">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Today’s schedule</h2>
          {todayDepartures.length > 0 ? (
            <span className="text-[13px] text-slate-500 tabular-nums">
              {todayDepartures.length} booking{todayDepartures.length === 1 ? '' : 's'} · {todayGuestTotal} guests
            </span>
          ) : null}
        </div>
        {dashboardLoading && publishedListingsCount === null ? (
          <SupplierListSkeleton rows={3} />
        ) : todayDepartures.length === 0 ? (
          <div className="partner-surface-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-slate-800">{todayEmptyCopy.title}</p>
              <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{todayEmptyCopy.body}</p>
            </div>
            {attentionCount === 0 ? (
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/calendar`)}
                className="partner-nav-item lux-flat shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Calendar
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="partner-surface-panel overflow-hidden divide-y divide-slate-100">
            {todayDepartures.map((b) => {
              const isStay = bookingIsStayNight(b);
              const stay = isStay ? stayRangeFromBooking(b) : null;
              const startHm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time) || null;
              const pickupMissing = pickupGaps.some((g) => g.id === b.id);
              const timeLabel = isStay
                ? stay && stay.checkIn === todayYmd
                  ? 'In'
                  : 'Stay'
                : (startHm ?? '—');
              const fallbackTitle = isStay ? 'Stay' : 'Tour';
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                    className="partner-row-interact lux-flat group grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-3.5 py-3 text-left sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
                  >
                    <span className="pt-0.5 text-[15px] font-semibold tabular-nums tracking-tight text-finland">
                      {timeLabel}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-slate-900 truncate">
                        {listingTitlesById[b.listing_id] ?? fallbackTitle}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-slate-500">
                        {typeof b.booking_number === 'number' && b.booking_number > 0 ? (
                          <span className="font-mono text-finland/90">#{b.booking_number}</span>
                        ) : null}
                        {typeof b.booking_number === 'number' && b.booking_number > 0 ? ' · ' : null}
                        {formatBookingParticipantsLabel(b)}
                        {b.guest_name ? ` · ${b.guest_name}` : ''}
                        {isStay && stay ? ` · ${stay.checkIn} → ${stay.checkOut}` : ''}
                      </span>
                      {pickupMissing ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                          <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                          Pickup details missing
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-8">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Next 7 days</h2>
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
              className="partner-nav-item text-[12px] font-medium text-finland hover:text-finland-dark"
            >
              All bookings
            </button>
          </div>
          <ul className="partner-surface-panel overflow-hidden divide-y divide-slate-100">
            {upcoming.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                  className="partner-row-interact lux-flat flex w-full flex-col gap-0.5 px-3.5 py-3 text-left sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="text-[14px] font-medium text-slate-900 min-w-0 truncate">
                    {listingTitlesById[b.listing_id] ?? 'Tour'}
                    {b.guest_name?.trim() ? (
                      <span className="font-normal text-slate-500"> · {b.guest_name.trim()}</span>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-slate-500 shrink-0">
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
        <p className="mb-8 text-[14px] text-slate-500 leading-snug">Nothing needs your attention right now.</p>
      )}

      {recentBookings.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2.5">Recent bookings</h2>
          <ul className="partner-surface-panel overflow-hidden divide-y divide-slate-100">
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
                    className="partner-row-interact lux-flat flex w-full flex-col gap-0.5 px-3.5 py-3 text-left sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="text-[14px] font-medium text-slate-900 block truncate">
                        {b.guest_name?.trim() || listingTitlesById[b.listing_id] || 'New booking'}
                      </span>
                      <span className="text-[13px] text-slate-500 mt-0.5 block">
                        {listingTitlesById[b.listing_id] && b.guest_name?.trim()
                          ? listingTitlesById[b.listing_id]
                          : null}
                        {listingTitlesById[b.listing_id] && b.guest_name?.trim() ? ' · ' : null}
                        {formatBookingParticipantsLabel(b)}
                      </span>
                    </span>
                    {money ? (
                      <span className="text-[13px] tabular-nums text-slate-500 shrink-0">{money}</span>
                    ) : null}
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
