import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { SUPPLIER_PAGE_CLASS, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import { USER_ERROR } from '../../lib/userFacingError';
import { ChevronRight, Star } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import {
  fetchCancellationRequestsForBookings,
  fetchBookingMessages,
} from '../../data/supabase-booking-ops';
import {
  countUnrepliedWrittenReviewsForSupplier,
  getReviewAggregatesForListingIds,
} from '../../data/supabase-reviews';
import { bookingNeedsPickupCopy, bookingIsStayNight, resolvePartnerPickupCopy } from '../../lib/pickup-completeness';
import { bookingPaymentWasCollected, isCollectedBooking, isRefundDueBooking } from '../../lib/payment-states';
import type { TourPackage } from '../../types/tour';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';
import { navigateSupplierUrl, openSupplierCalendar, openSupplierInbox, openSupplierPickup, openSupplierReviews } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import {
  partnerBookingIsOperatingTrip,
  partnerBookingIsTodaySchedule,
  partnerBookingIsUpcomingSchedule,
  partnerBookingIsActiveUnpaidCheckout,
  partnerTourMatchesExperienceDayOffset,
  pickupMissingIsUrgentSoon,
  scheduleTodayIsoForBooking,
} from '../../lib/trip-views';
import { partnerTodayEmptyScheduleCopy } from '../../lib/partner-today-copy';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { pgTimeToHm } from '../../data/supabase-listings';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { wallHourInTimeZone } from '../../lib/tour-departure-cutoff';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { PARTNER_INBOX_MESSAGE_FETCH_CAP } from '../../lib/partner-inbox-cap';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import {
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  displayFulfillmentFromPurchase,
  partnerOpsDepartureDisplay,
  isPurchaseSnapshot,
} from '../../lib/purchase-snapshot';

type AttentionTone = 'danger' | 'warn' | 'info';

const ATTENTION_DOT: Record<AttentionTone, string> = {
  danger: 'bg-rose-500',
  warn: 'bg-amber-500',
  info: 'bg-finland',
};

const ATTENTION_ROW: Record<AttentionTone, string> = {
  danger: 'partner-attention-row--danger',
  warn: 'partner-attention-row--warn',
  info: '',
};

function AttentionItem({
  tone,
  title,
  detail,
  onClick,
}: {
  tone: AttentionTone;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`partner-row-interact lux-flat group flex w-full items-start gap-3 px-4 py-3 text-left ${ATTENTION_ROW[tone]}`}
      >
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ATTENTION_DOT[tone]}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-slate-900">{title}</span>
          {detail ? (
            <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{detail}</span>
          ) : null}
        </span>
        <ChevronRight
          className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-finland"
          aria-hidden
        />
      </button>
    </li>
  );
}

function SectionHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {meta ? <span className="text-[13px] text-slate-500 tabular-nums">{meta}</span> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="partner-nav-item lux-flat text-[13px] font-medium text-finland hover:text-finland-dark"
    >
      {children}
    </button>
  );
}

function bookingLabel(b: BookingRow | undefined, titles: Record<string, string>): string {
  if (!b) return '';
  return displayListingTitleFromPurchase(
    b.purchase_snapshot,
    titles[b.listing_id],
    bookingIsStayNight(b) ? 'Stay' : 'Tour'
  );
}

export default function SupplierDashboard() {
  const { user, isSupabase } = useSupplierAuth();
  /** Published / live on Traverion only — drafts excluded (see My listings for all rows). */
  const [publishedListingsCount, setPublishedListingsCount] = useState<number | null>(null);
  const [draftListingsCount, setDraftListingsCount] = useState<number | null>(null);
  const [listingTitlesById, setListingTitlesById] = useState<Record<string, string>>({});
  const [listingsById, setListingsById] = useState<Record<string, TourPackage>>({});
  const [openCancels, setOpenCancels] = useState<
    Awaited<ReturnType<typeof fetchCancellationRequestsForBookings>>
  >([]);
  const [supplierBookings, setSupplierBookings] = useState<BookingRow[]>([]);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>> | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState<number | null>(0);
  const [firstUnreadBookingId, setFirstUnreadBookingId] = useState<string | null>(null);
  const [unrepliedReviewCount, setUnrepliedReviewCount] = useState<number | null>(0);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const supplierBookingsRef = useRef(supplierBookings);
  supplierBookingsRef.current = supplierBookings;
  const listingsByIdRef = useRef(listingsById);
  listingsByIdRef.current = listingsById;
  const dashboardHubUserIdRef = useRef<string | null>(null);
  const dashboardLoadGenRef = useRef(0);

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
      setUnrepliedReviewCount(0);
      setRatingAvg(null);
      setRatingCount(0);
      setDashboardError(null);
      setCancelRequestsError(null);
      setDashboardLoading(false);
      return;
    }
    const gen = ++dashboardLoadGenRef.current;
    setDashboardLoading(true);
    setDashboardError(null);
    setCancelRequestsError(null);
    try {
    const settled = await Promise.allSettled([
      fetchMyListings(uid),
      fetchBookingsForSupplier(uid),
      fetchSupplierProfile(uid),
      countUnrepliedWrittenReviewsForSupplier(uid),
    ]);
    if (gen !== dashboardLoadGenRef.current) return;
    const failures: string[] = [];
    const noteFailure = (key: string) => {
      failures.push(key);
    };
    let listingIds: string[] = [];
    if (settled[0].status === 'fulfilled') {
      const listings = settled[0].value;
      setPublishedListingsCount(listings.filter((t) => t.status === 'published').length);
      setDraftListingsCount(listings.filter((t) => t.status === 'draft').length);
      setListingTitlesById(Object.fromEntries(listings.map((t) => [t.id, t.title])));
      setListingsById(Object.fromEntries(listings.map((t) => [t.id, t])));
      listingIds = listings.map((t) => t.id);
    } else {
      // Phase 1306: keep prior listing maps — failure ≠ zero live listings.
      noteFailure('listings');
      listingIds = Object.keys(listingsByIdRef.current);
    }
    let bookingsForUnread: BookingRow[] = [];
    if (settled[1].status === 'fulfilled') {
      setSupplierBookings(settled[1].value);
      bookingsForUnread = settled[1].value;
      const ids = settled[1].value.map((b) => b.id);
      try {
        const reqs = await fetchCancellationRequestsForBookings(ids);
        if (gen !== dashboardLoadGenRef.current) return;
        const bookingById = Object.fromEntries(settled[1].value.map((b) => [b.id, b]));
        setOpenCancels(
          reqs.filter((r) => {
            if (r.status !== 'requested') return false;
            const booking = bookingById[r.booking_id];
            if (!booking) return true;
            return (booking.status ?? '').trim().toLowerCase() !== 'cancelled';
          })
        );
      } catch {
        // Keep prior openCancels — failure must not look like zero open cancels.
        setCancelRequestsError(USER_ERROR.bookings);
      }
    } else {
      // Phase 1306: keep prior bookings — failure ≠ empty Today schedule.
      noteFailure('bookings');
      bookingsForUnread = supplierBookingsRef.current;
    }
    if (settled[2].status === 'fulfilled') {
      setProfile(settled[2].value);
    } else {
      noteFailure('profile');
      setProfile(null);
    }
    if (settled[3].status === 'fulfilled') {
      setUnrepliedReviewCount(settled[3].value);
    } else {
      noteFailure('review_replies');
      setUnrepliedReviewCount(null);
    }

    if (listingIds.length > 0) {
      try {
        const aggs = await getReviewAggregatesForListingIds(listingIds);
        if (gen !== dashboardLoadGenRef.current) return;
        let sum = 0;
        let count = 0;
        for (const v of aggs.values()) {
          sum += v.rating * v.count;
          count += v.count;
        }
        if (count > 0) {
          setRatingAvg(Math.round((sum / count) * 10) / 10);
          setRatingCount(count);
        } else {
          setRatingAvg(null);
          setRatingCount(0);
        }
      } catch {
        // Phase 1097: aggregate load failure ≠ invent a clean partner rating.
        noteFailure('review_aggregates');
      }
    } else {
      setRatingAvg(null);
      setRatingCount(0);
    }

    // Unread traveler messages on paid bookings (same depth Inbox uses).
    const paidForMsgs = bookingsForUnread
      .filter((b) => bookingPaymentWasCollected(b.payment_status))
      .slice(0, PARTNER_INBOX_MESSAGE_FETCH_CAP);
    let messagesLoadFailed = false;
    const unreadFlags = await Promise.all(
      paidForMsgs.map(async (b) => {
        try {
          const msgs = await fetchBookingMessages(b.id);
          const last = msgs[msgs.length - 1];
          return Boolean(last && last.sender_role === 'traveler' && !last.read_by_supplier_at);
        } catch {
          // Phase 1099: message load failure ≠ “no unread”.
          messagesLoadFailed = true;
          return false;
        }
      })
    );
    if (gen !== dashboardLoadGenRef.current) return;
    if (messagesLoadFailed) {
      noteFailure('messages');
      setUnreadMessageCount(null);
      setFirstUnreadBookingId(null);
    } else {
      const unread = unreadFlags.filter(Boolean).length;
      const firstUnread = paidForMsgs.find((_, i) => unreadFlags[i])?.id ?? null;
      setUnreadMessageCount(unread);
      setFirstUnreadBookingId(firstUnread);
    }

    if (failures.length > 0) {
      const critical = failures.includes('bookings');
      setDashboardError(critical ? USER_ERROR.bookings : USER_ERROR.today);
    }
    } finally {
      if (gen === dashboardLoadGenRef.current) setDashboardLoading(false);
    }
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    const clearDashboardPartnerWorkspace = () => {
      setPublishedListingsCount(null);
      setDraftListingsCount(null);
      setListingTitlesById({});
      setListingsById({});
      setSupplierBookings([]);
      setOpenCancels([]);
      setProfile(null);
      setUnreadMessageCount(0);
      setFirstUnreadBookingId(null);
      setUnrepliedReviewCount(0);
      setRatingAvg(null);
      setRatingCount(0);
      setDashboardError(null);
      setCancelRequestsError(null);
    };
    if (!user?.id) {
      dashboardHubUserIdRef.current = null;
      dashboardLoadGenRef.current += 1;
      clearDashboardPartnerWorkspace();
      setDashboardLoading(false);
      return;
    }
    // Phase 1383: clear prior partner bookings/listings before loading the next account (Account hub 1378 parity).
    if (dashboardHubUserIdRef.current !== user.id) {
      dashboardHubUserIdRef.current = user.id;
      dashboardLoadGenRef.current += 1;
      clearDashboardPartnerWorkspace();
    }
  }, [user?.id]);

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

  const todayDepartures = useMemo(() => {
    const nowMs = Date.now();
    return supplierBookings
      .filter((b) => partnerBookingIsTodaySchedule(b, scheduleTodayIsoForBooking(b, nowMs), nowMs))
      .sort((a, b) => {
        const ta = (a.start_time ?? a.pickup_time ?? '').toString();
        const tb = (b.start_time ?? b.pickup_time ?? '').toString();
        return ta.localeCompare(tb) || (a.created_at ?? '').localeCompare(b.created_at ?? '');
      });
  }, [supplierBookings]);

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

  /** When today’s work is on one listing, Calendar opens that listing ready to edit. */
  const calendarFocusListingId = useMemo(() => {
    if (todayScheduleRows.length === 1) return todayScheduleRows[0].listingId;
    return undefined;
  }, [todayScheduleRows]);

  const pendingBookings = useMemo(
    () => supplierBookings.filter((b) => partnerBookingIsActiveUnpaidCheckout(b)),
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

  const pickupGaps = useMemo(() => {
    const nowMs = Date.now();
    return supplierBookings.filter((b) => {
      if (!partnerBookingIsOperatingTrip(b)) return false;
      const listing = listingsById[b.listing_id];
      const opts = isPurchaseSnapshot(b.purchase_snapshot)
        ? null
        : materializedBookingOptions(
            parseListingExtras(listing?.listingExtras as unknown).bookingOptions
          );
      const copy = resolvePartnerPickupCopy({
        purchaseSnapshot: b.purchase_snapshot,
        bookingOptionId: b.booking_option_id,
        specialRequests: b.special_requests,
        listingMeetingPoint: listing?.meetingPoint,
        listingPickupInstructions: listing?.pickupInstructions,
        bookingOptions: opts,
      });
      const missing = bookingNeedsPickupCopy(b, copy.meetingPoint, copy.pickupInstructions);
      // Today attention + Pickup deep link use day=today|tomorrow — not all future departures.
      return pickupMissingIsUrgentSoon(b, missing, nowMs);
    });
  }, [supplierBookings, listingsById]);

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
    (draftListingsCount ?? 0) +
    (verificationNeedsAction ? 1 : 0) +
    pickupGaps.length +
    openCancelCount +
    refundDueCount +
    (unreadMessageCount ?? 0) +
    (unrepliedReviewCount ?? 0);

  const todayEmptyCopy = partnerTodayEmptyScheduleCopy(attentionCount);

  const recentBookings = useMemo(
    () =>
      [...supplierBookings]
        .filter((b) => partnerBookingIsOperatingTrip(b))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 5),
    [supplierBookings]
  );

  const firstName =
    (profile?.display_name || profile?.company_legal_name || '').trim().split(/\s+/)[0] || null;
  // Phase 1314: date strip uses platform experience today (Helsinki default), not browser-local
  // calendar — aligns with default tour “Today” when partners travel across zones.
  const partnerOpsTodayIso = experienceTodayIsoForListing(undefined);
  const dateLabel = new Date(`${partnerOpsTodayIso}T12:00:00Z`)
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    .toUpperCase();

  const weekAhead = useMemo(() => {
    const nowMs = Date.now();
    return supplierBookings
      .filter((b) => {
        // Phase 1302: week window from experience-local today (+7 calendar days),
        // not browser-local Date math (SupplierBookings tomorrow parity).
        const todayLocal = scheduleTodayIsoForBooking(b, nowMs);
        if (!partnerBookingIsUpcomingSchedule(b, todayLocal, nowMs)) return false;
        const bd = b.booking_date ?? '';
        const endYmd = addCalendarDaysYmd(todayLocal, 7);
        if (!endYmd) return false;
        return bd > todayLocal && bd <= endYmd;
      })
      .sort((a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? ''))
      .slice(0, 8);
  }, [supplierBookings]);

  const upcoming = weekAhead.slice(0, 6);

  const upcomingByDate = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const b of upcoming) {
      const key = b.booking_date ?? '';
      if (!key) continue;
      const cur = map.get(key) ?? [];
      cur.push(b);
      map.set(key, cur);
    }
    return [...map.entries()];
  }, [upcoming]);

  // Phase 1321/1322: greeting hour matches platform experience TZ (date strip parity).
  const hour = wallHourInTimeZone();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const todayGuestTotal = todayDepartures.reduce((s, b) => s + (b.guests ?? 0), 0);
  /** Bookings batch failed — empty schedule metrics must not look like a quiet day (Trips 659 parity). */
  const bookingsLoadFailed = dashboardError === USER_ERROR.bookings;

  const performance30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const collected = supplierBookings.filter((b) => {
      if (!isCollectedBooking(b)) return false;
      const createdAt = b.created_at ? new Date(b.created_at).getTime() : NaN;
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });
    const byCurrency = new Map<string, { revenue: number; count: number }>();
    for (const b of collected) {
      const code = normalizeCurrency(b.currency);
      const cur = byCurrency.get(code) ?? { revenue: 0, count: 0 };
      cur.revenue += Number(b.amount_paid ?? 0);
      cur.count += 1;
      byCurrency.set(code, cur);
    }
    const currencies = [...byCurrency.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    return {
      bookings: collected.length,
      currencies,
      primary: currencies[0] ?? null,
    };
  }, [supplierBookings]);

  const bookingsById = useMemo(
    () => Object.fromEntries(supplierBookings.map((b) => [b.id, b])),
    [supplierBookings]
  );

  const firstCancelBooking = openCancels[0] ? bookingsById[openCancels[0].booking_id] : undefined;
  const firstUnreadBooking = firstUnreadBookingId ? bookingsById[firstUnreadBookingId] : undefined;
  const firstPickup = pickupGaps[0];
  const firstRefund = supplierBookings.find(isRefundDueBooking);
  const firstPending = pendingBookings[0];

  const greetingSub = bookingsLoadFailed
    ? 'Bookings could not load — retry when your connection is back.'
    : attentionCount > 0
      ? `Here's what needs your attention today.`
      : todayDepartures.length > 0
        ? `${todayDepartures.length} booking${todayDepartures.length === 1 ? '' : 's'} · ${todayGuestTotal} guest${todayGuestTotal === 1 ? '' : 's'} on the schedule.`
        : 'Your operational starting point for today.';

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} partner-home motion-safe:animate-fade-in`}>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium tracking-[0.16em] text-slate-400">{dateLabel}</p>
          <h1 className="font-display text-[1.5rem] sm:text-[1.625rem] font-semibold leading-tight tracking-tight text-slate-900">
            {firstName ? `${hello}, ${firstName}` : hello}
          </h1>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-slate-500">{greetingSub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-end">
          <button
            type="button"
            onClick={() => openSupplierCalendar(calendarFocusListingId)}
            className="partner-btn-secondary lux-flat inline-flex h-8 items-center rounded-md border border-slate-200/90 bg-white px-3 text-[13px] font-medium text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            Availability
          </button>
          <button
            type="button"
            onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
            className="partner-btn-primary lux-flat inline-flex h-8 items-center rounded-md bg-finland px-3 text-[13px] font-semibold text-white hover:bg-finland-dark md:hidden"
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
          extra={
            <a href="/contact" className="tv-btn-ghost inline-flex">
              Contact support
            </a>
          }
        />
      )}
      {!dashboardError && cancelRequestsError ? (
        <div className="mb-5 max-w-lg">
          <NoticeCallout title="Cancellation status unavailable" tone="warn">
            <p>{cancelRequestsError}</p>
            <button type="button" onClick={() => void reloadDashboard()} className="tv-btn-ghost mt-3 -ml-2">
              Retry
            </button>
          </NoticeCallout>
        </div>
      ) : null}

      <section className="partner-metric-grid mb-6">
        <div className="partner-surface-panel px-4 py-3">
          <p className="text-[12px] font-medium text-slate-500">Today’s bookings</p>
          <p className="mt-1 text-[1.375rem] font-semibold tabular-nums tracking-tight text-slate-900">
            {dashboardLoading && publishedListingsCount === null
              ? '—'
              : bookingsLoadFailed
                ? '—'
                : todayDepartures.length}
          </p>
        </div>
        <div className="partner-surface-panel px-4 py-3">
          <p className="text-[12px] font-medium text-slate-500">Today’s guests</p>
          <p className="mt-1 text-[1.375rem] font-semibold tabular-nums tracking-tight text-slate-900">
            {dashboardLoading && publishedListingsCount === null
              ? '—'
              : bookingsLoadFailed
                ? '—'
                : todayGuestTotal}
          </p>
        </div>
        <div className="partner-surface-panel px-4 py-3">
          <p className="text-[12px] font-medium text-slate-500">Unread messages</p>
          <p
            className={`mt-1 text-[1.375rem] font-semibold tabular-nums tracking-tight ${
              (unreadMessageCount ?? 0) > 0 ? 'text-finland' : 'text-slate-900'
            }`}
          >
            {dashboardLoading && publishedListingsCount === null
              ? '—'
              : unreadMessageCount === null
                ? '—'
                : unreadMessageCount}
          </p>
        </div>
        <div className="partner-surface-panel px-4 py-3">
          <p className="text-[12px] font-medium text-slate-500">Needs attention</p>
          <p
            className={`mt-1 text-[1.375rem] font-semibold tabular-nums tracking-tight ${
              attentionCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {dashboardLoading && publishedListingsCount === null ? '—' : attentionCount}
          </p>
        </div>
      </section>

      {attentionCount > 0 && (
        <section className="mb-6">
          <SectionHead
            title="Needs attention"
            meta={`${attentionCount}`}
          />
          <ul className="partner-surface-panel overflow-hidden divide-y divide-slate-100">
            {openCancelCount > 0 && (
              <AttentionItem
                tone="danger"
                title={
                  openCancelCount === 1
                    ? 'Cancellation request'
                    : `${openCancelCount} cancellation requests`
                }
                detail={
                  openCancelCount === 1 && firstCancelBooking
                    ? `${bookingLabel(firstCancelBooking, listingTitlesById)}${
                        firstCancelBooking.guest_name?.trim()
                          ? ` · ${firstCancelBooking.guest_name.trim()}`
                          : ''
                      } · Waiting for traveler response${
                        overdueCancelCount > 0
                          ? ' · Past review window (Traverion does not auto-cancel)'
                          : ''
                      }`
                    : `Waiting for traveler response${
                        overdueCancelCount > 0
                          ? ` · ${overdueCancelCount} past the review window`
                          : ''
                      }`
                }
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=cancel`)}
              />
            )}
            {refundDueCount > 0 && (
              <AttentionItem
                tone="danger"
                title={refundDueCount === 1 ? 'Refund due' : `${refundDueCount} refunds due`}
                detail={
                  firstRefund
                    ? `${bookingLabel(firstRefund, listingTitlesById)} · Manual Stripe refund required`
                    : 'Manual Stripe refund required'
                }
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=refund_due`)}
              />
            )}
            {pickupGaps.length > 0 && (
              <AttentionItem
                tone="warn"
                title={
                  pickupGaps.length === 1
                    ? 'Pickup details missing'
                    : `${pickupGaps.length} bookings missing pickup details`
                }
                detail={
                  firstPickup
                    ? `${bookingLabel(firstPickup, listingTitlesById)}${
                        firstPickup.guest_name?.trim() ? ` · ${firstPickup.guest_name.trim()}` : ''
                      }`
                    : 'Paid bookings need meeting point or pickup copy'
                }
                onClick={() => {
                  const target = pickupGaps[0];
                  const nowMs = Date.now();
                  const day =
                    target && partnerTourMatchesExperienceDayOffset(target, 0, nowMs)
                      ? 'today'
                      : target && partnerTourMatchesExperienceDayOffset(target, 1, nowMs)
                        ? 'tomorrow'
                        : undefined;
                  openSupplierPickup(target?.id, { day, needsOnly: true });
                }}
              />
            )}
            {(unreadMessageCount ?? 0) > 0 && (
              <AttentionItem
                tone="info"
                title={
                  unreadMessageCount === 1
                    ? 'Unread traveler message'
                    : `${unreadMessageCount} unread traveler messages`
                }
                detail={
                  firstUnreadBooking
                    ? `${bookingLabel(firstUnreadBooking, listingTitlesById)}${
                        firstUnreadBooking.guest_name?.trim()
                          ? ` · ${firstUnreadBooking.guest_name.trim()}`
                          : ''
                      }`
                    : 'Open Inbox to reply'
                }
                onClick={() =>
                  openSupplierInbox(firstUnreadBookingId ?? undefined, { unreadOnly: true })
                }
              />
            )}
            {(unrepliedReviewCount ?? 0) > 0 && (
              <AttentionItem
                tone="info"
                title={
                  unrepliedReviewCount === 1
                    ? 'Review needs a reply'
                    : `${unrepliedReviewCount} reviews need a reply`
                }
                detail="Respond to written guest feedback"
                onClick={() => openSupplierReviews({ reply: 'unreplied' })}
              />
            )}
            {pendingBookings.length > 0 && (
              <AttentionItem
                tone="warn"
                title={
                  pendingBookings.length === 1
                    ? 'Checkout hold still active'
                    : `${pendingBookings.length} checkout holds still active`
                }
                detail={
                  firstPending
                    ? `${bookingLabel(firstPending, listingTitlesById)} · Holding inventory spots`
                    : 'Holding inventory spots'
                }
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=unpaid`)}
              />
            )}
            {draftListingsCount != null && draftListingsCount > 0 && (
              <AttentionItem
                tone="info"
                title={
                  draftListingsCount === 1
                    ? 'Draft listing'
                    : `${draftListingsCount} draft listings`
                }
                detail="Finish and publish when ready"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?filter=draft`)}
              />
            )}
            {verificationNeedsAction && (
              <AttentionItem
                tone="warn"
                title="Finish business and payout setup"
                detail="Required before live payouts"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
              />
            )}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <SectionHead
          title="Today’s schedule"
          meta={
            todayDepartures.length > 0
              ? `${todayDepartures.length} booking${todayDepartures.length === 1 ? '' : 's'} · ${todayGuestTotal} guest${todayGuestTotal === 1 ? '' : 's'}`
              : undefined
          }
          action={<TextLink onClick={() => openSupplierCalendar(calendarFocusListingId)}>Availability →</TextLink>}
        />
        {dashboardLoading && publishedListingsCount === null ? (
          <SupplierListSkeleton rows={3} />
        ) : bookingsLoadFailed ? (
          // Phase 1617: do not look like an empty schedule when bookings failed to load.
          <div className="partner-surface-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-800">Bookings couldn’t load</p>
              <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">
                Today’s schedule is unavailable until bookings load again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void reloadDashboard()}
              className="partner-btn-secondary lux-flat shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : todayDepartures.length === 0 ? (
          <div className="partner-surface-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-800">{todayEmptyCopy.title}</p>
              <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{todayEmptyCopy.body}</p>
            </div>
            {attentionCount === 0 ? (
              <button
                type="button"
                onClick={() => openSupplierCalendar(calendarFocusListingId)}
                className="partner-btn-secondary lux-flat shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Availability
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="partner-surface-panel overflow-hidden">
            {todayDepartures.map((b, idx) => {
              const isStay = bookingIsStayNight(b);
              const stay = isStay ? stayRangeFromBooking(b) : null;
              const experienceToday = scheduleTodayIsoForBooking(b);
              const opsHm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time) || null;
              const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsHm);
              const startHm = dep.displayHm || null;
              const pickupMissing = pickupGaps.some((g) => g.id === b.id);
              const timeLabel = isStay
                ? stay && stay.checkIn === experienceToday
                  ? 'In'
                  : stay && stay.checkOut === experienceToday
                    ? 'Out'
                    : 'Stay'
                : (startHm ?? '—');
              const fallbackTitle = isStay ? 'Stay' : 'Tour';
              const liveOpt = !isStay
                ? (() => {
                    const opts = materializedBookingOptions(
                      parseListingExtras(listingsById[b.listing_id]?.listingExtras as unknown).bookingOptions
                    );
                    return b.booking_option_id
                      ? opts.find((o) => o.id === b.booking_option_id) ?? null
                      : opts[0] ?? null;
                  })()
                : null;
              const title = displayListingTitleFromPurchase(
                b.purchase_snapshot,
                listingTitlesById[b.listing_id],
                fallbackTitle
              );
              const optionLabel = displayOptionLabelFromPurchase(
                b.purchase_snapshot,
                liveOpt?.name?.trim() || ''
              );
              // Phase 1742: Today Meet line honors Pickup planner overrides (Bookings parity).
              const listing = listingsById[b.listing_id];
              const meetingPoint = resolvePartnerPickupCopy({
                purchaseSnapshot: b.purchase_snapshot,
                bookingOptionId: b.booking_option_id,
                specialRequests: b.special_requests,
                listingMeetingPoint: listing?.meetingPoint,
                listingPickupInstructions: listing?.pickupInstructions,
                bookingOptions: isPurchaseSnapshot(b.purchase_snapshot)
                  ? null
                  : materializedBookingOptions(
                      parseListingExtras(listing?.listingExtras as unknown).bookingOptions
                    ),
              }).meetingPoint;
              const placePrefix =
                displayFulfillmentFromPurchase(b.purchase_snapshot) === 'pickup' ? 'Pickup' : 'Meet';
              const isLast = idx === todayDepartures.length - 1;
              return (
                <li key={b.id} className="relative">
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                    className="partner-row-interact lux-flat group grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-0 text-left sm:grid-cols-[5.25rem_minmax(0,1fr)_auto]"
                  >
                    <span className="relative flex justify-end pr-4 py-3.5 sm:pr-5">
                      <span className="text-[15px] font-semibold tabular-nums tracking-tight text-finland">
                        {timeLabel}
                      </span>
                      {/* timeline rail */}
                      <span
                        className={`absolute right-[7px] top-0 w-px bg-slate-200 ${idx === 0 ? 'top-5' : 'top-0'} ${
                          isLast ? 'h-5' : 'bottom-0'
                        }`}
                        aria-hidden
                      />
                      <span
                        className="absolute right-[4px] top-[1.4rem] h-2 w-2 rounded-full bg-finland ring-[3px] ring-white"
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 py-3.5 pl-3 pr-2">
                      <span className="block break-words text-[15px] font-semibold text-slate-900 [overflow-wrap:anywhere] line-clamp-2">
                        {title}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-slate-500">
                        {b.guest_name?.trim() ? `${b.guest_name.trim()} · ` : ''}
                        {formatBookingParticipantsLabel(b)}
                        {optionLabel ? ` · ${optionLabel}` : ''}
                      </span>
                      {meetingPoint ? (
                        <span className="mt-0.5 block text-[12px] text-slate-400 break-words [overflow-wrap:anywhere]">
                          {placePrefix} · {meetingPoint}
                        </span>
                      ) : null}
                      {dep.purchasedNote ? (
                        <span className="mt-0.5 block text-[12px] text-slate-400">{dep.purchasedNote}</span>
                      ) : null}
                      <span className="mt-0.5 block text-[12px] text-slate-400">
                        {typeof b.booking_number === 'number' && b.booking_number > 0 ? (
                          <span className="font-mono text-finland/80">Booking #{b.booking_number}</span>
                        ) : (
                          'Booking'
                        )}
                        {isStay && stay
                          ? ` · ${formatStayNightHuman(stay.checkIn)} → ${formatStayNightHuman(stay.checkOut)}`
                          : ''}
                      </span>
                      {pickupMissing ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                          Pickup details missing
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center self-center pr-3.5">
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-finland"
                        aria-hidden
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <section>
          <SectionHead
            title="Business performance"
            meta="Last 30 days"
            action={
              <TextLink onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/performance`)}>
                View performance →
              </TextLink>
            }
          />
          <div className="partner-surface-panel overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              <div className="px-4 py-4">
                <p className="text-[12px] font-medium text-slate-500">Collected</p>
                <p className="mt-1.5 text-[1.25rem] font-semibold tabular-nums tracking-tight text-slate-900 leading-none">
                  {performance30d.primary
                    ? formatMoney(performance30d.primary[1].revenue, performance30d.primary[0])
                    : '—'}
                </p>
                {performance30d.currencies.length > 1 ? (
                  <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">
                    +{performance30d.currencies.length - 1} more currency
                    {performance30d.currencies.length - 1 === 1 ? '' : 'ies'}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-slate-400">Paid traveler bookings</p>
                )}
              </div>
              <div className="px-4 py-4">
                <p className="text-[12px] font-medium text-slate-500">Bookings</p>
                <p className="mt-1.5 text-[1.25rem] font-semibold tabular-nums tracking-tight text-slate-900 leading-none">
                  {performance30d.bookings}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">Collected in window</p>
              </div>
              <div className="px-4 py-4">
                <p className="text-[12px] font-medium text-slate-500">Rating</p>
                <p className="mt-1.5 flex items-center gap-1 text-[1.25rem] font-semibold tabular-nums tracking-tight text-slate-900 leading-none">
                  {ratingAvg != null && ratingCount > 0 ? (
                    <>
                      {ratingAvg.toFixed(2)}
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    </>
                  ) : (
                    '—'
                  )}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {ratingCount > 0
                    ? `${ratingCount} review${ratingCount === 1 ? '' : 's'}`
                    : 'No reviews yet'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHead
            title="Next 7 days"
            action={
              <TextLink onClick={() => openSupplierCalendar()}>Availability →</TextLink>
            }
          />
          {bookingsLoadFailed ? (
            // Phase 1617: Next 7 days — same honest failure panel as Today’s schedule.
            <div className="partner-surface-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-slate-800">Bookings couldn’t load</p>
                <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">
                  The week-ahead schedule needs bookings to load successfully.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reloadDashboard()}
                className="partner-btn-secondary lux-flat shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
            </div>
          ) : upcomingByDate.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white/60 px-4 py-5">
              <p className="text-[14px] text-slate-500">No confirmed departures in the next week.</p>
            </div>
          ) : (
            <div className="partner-surface-panel space-y-1 px-3 py-2.5">
              {upcomingByDate.map(([ymd, rows]) => {
                const dayLabel = formatBookingDateDisplay(ymd);
                return (
                  <div key={ymd} className="flex gap-3 py-1">
                    <div className="w-[7.5rem] shrink-0 pt-0.5 sm:w-36">
                      <p className="text-[11px] font-semibold leading-snug tracking-[0.04em] text-finland">
                        {dayLabel}
                      </p>
                    </div>
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      {rows.map((b) => {
                        const liveOption = b.booking_option_id
                          ? materializedBookingOptions(
                              parseListingExtras(listingsById[b.listing_id]?.listingExtras as unknown)
                                .bookingOptions
                            ).find((o) => o.id === b.booking_option_id)?.name?.trim() || ''
                          : '';
                        const title = displayListingTitleFromPurchase(
                          b.purchase_snapshot,
                          listingTitlesById[b.listing_id],
                          'Tour'
                        );
                        const optionLabel = displayOptionLabelFromPurchase(
                          b.purchase_snapshot,
                          liveOption
                        );
                        const opsHm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time) || null;
                        const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsHm);
                        const startHm = dep.displayHm || null;
                        return (
                        <li key={b.id}>
                          <button
                            type="button"
                            onClick={() =>
                              navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)
                            }
                            className="partner-row-interact lux-flat group w-full rounded-md px-2.5 py-2 text-left"
                          >
                            <span className="block break-words text-[14px] font-semibold text-slate-900 [overflow-wrap:anywhere] line-clamp-2">
                              {title}
                            </span>
                            <span className="mt-0.5 block break-words text-[12.5px] text-slate-500 [overflow-wrap:anywhere] line-clamp-2">
                              {startHm ? `${startHm} · ` : ''}
                              {b.guest_name?.trim() ? `${b.guest_name.trim()} · ` : ''}
                              {formatBookingParticipantsLabel(b)}
                              {optionLabel ? ` · ${optionLabel}` : ''}
                              {dep.purchasedNote ? ` · ${dep.purchasedNote}` : ''}
                            </span>
                          </button>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {attentionCount === 0 && !dashboardLoading && (
        <p className="mb-6 text-[14px] text-slate-500 leading-snug">Nothing needs your attention right now.</p>
      )}

      {recentBookings.length > 0 && (
        <section className="mb-6">
          <SectionHead
            title="Recent bookings"
            action={
              <TextLink onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
                View all bookings →
              </TextLink>
            }
          />
          <div className="partner-surface-panel overflow-hidden px-4">
            <ul>
              {recentBookings.map((b) => {
                const paid =
                  b.amount_paid != null &&
                  Number.isFinite(Number(b.amount_paid)) &&
                  bookingPaymentWasCollected(b.payment_status)
                    ? Number(b.amount_paid)
                    : null;
                const money = paid == null ? null : formatMoney(paid, b.currency);
                return (
                  <li key={b.id} className="border-b border-slate-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() =>
                        navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)
                      }
                      className="partner-row-interact lux-flat grid w-full grid-cols-1 gap-0.5 py-3 text-left sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto] sm:items-center sm:gap-4"
                    >
                      <span className="break-words text-[14px] font-semibold text-slate-900 [overflow-wrap:anywhere] line-clamp-2">
                        {b.guest_name?.trim() || 'Traveler'}
                      </span>
                      <span className="break-words text-[13px] text-slate-500 [overflow-wrap:anywhere] line-clamp-2">
                        {displayListingTitleFromPurchase(
                          b.purchase_snapshot,
                          listingTitlesById[b.listing_id],
                          'Listing'
                        )}
                      </span>
                      <span className="text-[13px] text-slate-500 tabular-nums">
                        {formatBookingParticipantsLabel(b)}
                      </span>
                      <span className="text-[13px] tabular-nums text-slate-700 sm:text-right">
                        {money ?? '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {isSupabase && user && <SupplierPortalNoticePanel userId={user.id} />}
    </div>
  );
}
