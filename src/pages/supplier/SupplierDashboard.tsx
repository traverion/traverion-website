import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { SUPPLIER_PAGE_CLASS } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import StatusChip from '../../components/StatusChip';
import { USER_ERROR } from '../../lib/userFacingError';
import { ChevronRight } from 'lucide-react';
import {
  partnerAccountStatus,
  partnerBusinessReviewState,
  partnerPayoutReviewState,
} from '../../lib/partnerVerificationStatus';
import {
  isSupplierBusinessProfileComplete,
  isSupplierPayoutConfigured,
} from '../../lib/supplierOnboarding';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierCommercialSnapshots } from '../../data/supabase-earnings';
import { fromMinorUnits } from '../../lib/commercial-money';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import {
  fetchCancellationRequestsForBookings,
  fetchLatestBookingMessage,
} from '../../data/supabase-booking-ops';
import { countUnrepliedWrittenReviewsForSupplier } from '../../data/supabase-reviews';
import {
  bookingNeedsPickupCopy,
  bookingIsRental,
  bookingIsStayNight,
  bookingProductNoun,
  partnerBookingDeskFamily,
  resolvePartnerPickupCopy,
} from '../../lib/pickup-completeness';
import { parseRentalPurchaseSnapshot } from '../../lib/rental-booking-domain';
import { bookingPaymentWasCollected, isCollectedBooking, isRefundDueBooking } from '../../lib/payment-states';
import type { TourPackage } from '../../types/tour';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';
import { navigateSupplierUrl, openSupplierCalendar, openSupplierInbox, openSupplierPickup, openSupplierReviews } from '../../lib/supplierPortalNavigation';
import { partnerBookingDeskPath } from '../../lib/partner-booking-desk-path';
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
        className={`partner-home__attention-row lux-flat group flex w-full items-start gap-3 px-3.5 py-2.5 text-left ${ATTENTION_ROW[tone]}`}
      >
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${ATTENTION_DOT[tone]}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug tracking-tight text-[color:var(--partner-ink,#0c1118)]">
            {title}
          </span>
          {detail ? (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--partner-ink-muted,#5a6472)]">
              {detail}
            </span>
          ) : null}
        </span>
        <ChevronRight
          className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-finland motion-reduce:transition-none"
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
    <div className="partner-home-section__head">
      <div className="partner-home__section-head">
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <h2 className="partner-home__section-title">{title}</h2>
          {meta ? <span className="partner-home__section-meta">{meta}</span> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="partner-nav-item lux-flat text-[12.5px] font-semibold text-finland hover:text-finland-dark"
    >
      {children}
    </button>
  );
}

function recentBookingStatus(b: BookingRow): { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' } {
  const st = (b.status ?? '').trim().toLowerCase();
  if (st === 'cancelled') return { label: 'Cancelled', tone: 'bad' };
  if (isRefundDueBooking(b)) return { label: 'Refund due', tone: 'bad' };
  if (partnerBookingIsActiveUnpaidCheckout(b)) return { label: 'Pending payment', tone: 'warn' };
  if (isCollectedBooking(b)) return { label: 'Confirmed', tone: 'ok' };
  if (st) return { label: st.charAt(0).toUpperCase() + st.slice(1), tone: 'neutral' };
  return { label: 'Booked', tone: 'neutral' };
}

function accountNavHref(profile: NonNullable<Awaited<ReturnType<typeof fetchSupplierProfile>>>, kind: string) {
  const businessOk = (profile.verification_status || '').trim().toLowerCase() === 'verified';
  const payoutOk = (profile.payout_verification_status || '').trim().toLowerCase() === 'verified';
  if (kind === 'setup') return `${PARTNER_APP_BASE}/onboarding`;
  if (businessOk && !payoutOk) return `${PARTNER_APP_BASE}/money?tab=settings#income-payout-account`;
  return `${PARTNER_APP_BASE}/business-profile#company`;
}

function bookingLabel(b: BookingRow | undefined, titles: Record<string, string>): string {
  if (!b) return '';
  return displayListingTitleFromPurchase(
    b.purchase_snapshot,
    titles[b.listing_id],
    bookingProductNoun(b)
  );
}

function rentalCollectionDetail(b: BookingRow, titles: Record<string, string>): string {
  const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
  const title = bookingLabel(b, titles) || 'Rental';
  const qty = snap?.quantity ?? null;
  const itemLabel =
    qty != null && qty > 0 ? `${qty} item${qty === 1 ? '' : 's'}` : null;
  let timeLabel: string | null = null;
  if (snap?.pickupAt) {
    const d = new Date(snap.pickupAt);
    if (!Number.isNaN(d.getTime())) {
      timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
  }
  if (!timeLabel) {
    const hm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time);
    if (hm) timeLabel = hm;
  }
  return [title, itemLabel, timeLabel].filter(Boolean).join(' · ');
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
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const [scheduleTab, setScheduleTab] = useState<'today' | 'week'>('today');
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
    if (settled[0].status === 'fulfilled') {
      const listings = settled[0].value;
      setPublishedListingsCount(listings.filter((t) => t.status === 'published').length);
      setDraftListingsCount(listings.filter((t) => t.status === 'draft').length);
      setListingTitlesById(Object.fromEntries(listings.map((t) => [t.id, t.title])));
      setListingsById(Object.fromEntries(listings.map((t) => [t.id, t])));
    } else {
      // Phase 1306: keep prior listing maps — failure ≠ zero live listings.
      noteFailure('listings');
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

    // Unread traveler messages on paid bookings (same depth Inbox uses).
    const paidForMsgs = bookingsForUnread
      .filter((b) => bookingPaymentWasCollected(b.payment_status))
      .slice(0, PARTNER_INBOX_MESSAGE_FETCH_CAP);
    let messagesLoadFailed = false;
    const unreadFlags = await Promise.all(
      paidForMsgs.map(async (b) => {
        try {
          const last = await fetchLatestBookingMessage(b.id);
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
  const accountStatus = useMemo(() => {
    if (!profile) return null;
    const business = partnerBusinessReviewState({
      verificationStatus: profile.verification_status,
      submittedAt: profile.verification_submitted_at,
      draftComplete: isSupplierBusinessProfileComplete(profile),
    });
    const payout = partnerPayoutReviewState({
      verificationStatus: profile.payout_verification_status,
      submittedAt: profile.payout_verification_submitted_at,
      hasBankDetails: isSupplierPayoutConfigured(profile),
    });
    return partnerAccountStatus({ business, payout });
  }, [profile]);

  /** Incomplete / rejected verification counts toward Needs attention; pending review is shown in Account status. */
  const verificationNeedsAction = Boolean(
    accountStatus && (accountStatus.kind === 'setup' || accountStatus.kind === 'rejected')
  );

  const pickupGaps = useMemo(() => {
    const nowMs = Date.now();
    return supplierBookings.filter((b) => {
      if (!partnerBookingIsOperatingTrip(b)) return false;
      // Rentals use collection/return — never tour pickup attention.
      if (bookingIsRental(b)) return false;
      if (bookingIsStayNight(b)) return false;
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

  /** Paid rentals awaiting collection today — separate from tour pickup gaps. */
  const rentalCollectionsToday = useMemo(() => {
    const nowMs = Date.now();
    return supplierBookings
      .filter((b) => {
        if (!bookingIsRental(b)) return false;
        if (!partnerBookingIsOperatingTrip(b)) return false;
        const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
        if (!snap || snap.rentalOpsStatus !== 'awaiting_pickup') return false;
        return partnerTourMatchesExperienceDayOffset(b, 0, nowMs);
      })
      .sort((a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.id.localeCompare(b.id));
  }, [supplierBookings]);

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
    rentalCollectionsToday.length +
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
  const dateLabel = new Date(`${partnerOpsTodayIso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

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

  // Phase 1321/1322: greeting hour matches platform experience TZ (date strip parity).
  const hour = wallHourInTimeZone();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const todayGuestTotal = todayDepartures.reduce((s, b) => s + (b.guests ?? 0), 0);
  /** Bookings batch failed — empty schedule metrics must not look like a quiet day (Trips 659 parity). */
  const bookingsLoadFailed = dashboardError === USER_ERROR.bookings;

  const [netByBookingId, setNetByBookingId] = useState<Record<string, number>>({});
  useEffect(() => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setNetByBookingId({});
      return;
    }
    let cancelled = false;
    void fetchSupplierCommercialSnapshots(uid)
      .then((rows) => {
        if (cancelled) return;
        setNetByBookingId(
          Object.fromEntries(rows.map((row) => [row.booking_id, fromMinorUnits(Number(row.remaining_supplier_minor) || 0)]))
        );
      })
      .catch(() => {
        if (!cancelled) setNetByBookingId({});
      });
    return () => {
      cancelled = true;
    };
  }, [isSupabase, user?.id]);

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
      cur.revenue += netByBookingId[b.id] ?? Number(b.amount_paid ?? 0);
      cur.count += 1;
      byCurrency.set(code, cur);
    }
    const currencies = [...byCurrency.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    return {
      bookings: collected.length,
      currencies,
      primary: currencies[0] ?? null,
    };
  }, [supplierBookings, netByBookingId]);

  const bookingsById = useMemo(
    () => Object.fromEntries(supplierBookings.map((b) => [b.id, b])),
    [supplierBookings]
  );

  const firstCancelBooking = openCancels[0] ? bookingsById[openCancels[0].booking_id] : undefined;
  const firstUnreadBooking = firstUnreadBookingId ? bookingsById[firstUnreadBookingId] : undefined;
  const firstPickup = pickupGaps[0];
  const firstRentalCollection = rentalCollectionsToday[0];
  const firstRefund = supplierBookings.find(isRefundDueBooking);
  const firstPending = pendingBookings[0];

  const metricsLoading = dashboardLoading && publishedListingsCount === null;
  const earningsLabel = performance30d.primary
    ? formatMoney(performance30d.primary[1].revenue, performance30d.primary[0])
    : '—';
  const greetingSub = bookingsLoadFailed
    ? 'Bookings could not load — retry when your connection is back.'
    : attentionCount > 0
      ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention · ${dateLabel}`
      : todayDepartures.length > 0
        ? `${todayDepartures.length} today · ${todayGuestTotal} guest${todayGuestTotal === 1 ? '' : 's'} · ${dateLabel}`
        : dateLabel;

  const openAccountStatus = () => {
    if (!profile || !accountStatus) return;
    navigateSupplierUrl(accountNavHref(profile, accountStatus.kind));
  };

  const scheduleBookings = scheduleTab === 'today' ? todayDepartures : upcoming;
  const scheduleGuestTotal =
    scheduleTab === 'today'
      ? todayGuestTotal
      : upcoming.reduce((s, b) => s + (b.guests ?? 0), 0);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} partner-home motion-safe:animate-fade-in`}>
      <header className="partner-home__header">
        <div className="min-w-0">
          <h1 className="partner-home__greeting">
            {firstName ? `${hello}, ${firstName}` : hello}
          </h1>
          <p className="partner-home__sub">{greetingSub}</p>
        </div>
        <div className="partner-home__header-actions">
          {accountStatus?.kind === 'operational' && !dashboardLoading ? (
            <button
              type="button"
              className="partner-home__ops-pill lux-flat"
              onClick={openAccountStatus}
              title={accountStatus.detail}
            >
              <span className="partner-home__ops-dot" aria-hidden />
              Operational
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => openSupplierCalendar(calendarFocusListingId)}
            className="tv-btn-secondary lux-flat"
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
            className="tv-btn-primary lux-flat"
          >
            New listing
          </button>
        </div>
      </header>

      {dashboardError && (
        <ErrorState
          className="py-4"
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
        <div className="max-w-lg">
          <NoticeCallout title="Cancellation status unavailable" tone="warn">
            <p>{cancelRequestsError}</p>
            <button type="button" onClick={() => void reloadDashboard()} className="tv-btn-ghost mt-3 -ml-2">
              Retry
            </button>
          </NoticeCallout>
        </div>
      ) : null}

      <section className="partner-home__metrics" aria-label="Business metrics">
        <button
          type="button"
          className="partner-home__metric lux-flat"
          onClick={() => openSupplierCalendar(calendarFocusListingId)}
        >
          <span className="partner-home__metric-label">Today’s bookings</span>
          <p className="partner-home__metric-value">
            {metricsLoading || bookingsLoadFailed ? '—' : todayDepartures.length}
          </p>
          <p className="partner-home__metric-hint">
            {bookingsLoadFailed
              ? 'Unavailable'
              : todayGuestTotal > 0
                ? `${todayGuestTotal} guest${todayGuestTotal === 1 ? '' : 's'} on schedule`
                : 'Open calendar'}
          </p>
        </button>
        <button
          type="button"
          className="partner-home__metric lux-flat"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/performance`)}
        >
          <span className="partner-home__metric-label">Your earnings</span>
          <p className="partner-home__metric-value">{earningsLabel}</p>
          <p className="partner-home__metric-hint">
            {performance30d.bookings > 0
              ? `Net · ${performance30d.bookings} collected · 30 days`
              : 'Net supplier earnings · 30 days'}
          </p>
        </button>
        <button
          type="button"
          className="partner-home__metric lux-flat"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
        >
          <span className="partner-home__metric-label">Live listings</span>
          <p className="partner-home__metric-value">
            {metricsLoading ? '—' : publishedListingsCount ?? 0}
          </p>
          <p className="partner-home__metric-hint">
            {(draftListingsCount ?? 0) > 0
              ? `${draftListingsCount} draft${draftListingsCount === 1 ? '' : 's'} in progress`
              : 'Published on Traverion'}
          </p>
        </button>
        <button
          type="button"
          className="partner-home__metric lux-flat"
          onClick={() => {
            if ((unreadMessageCount ?? 0) > 0 && attentionCount === (unreadMessageCount ?? 0)) {
              openSupplierInbox(firstUnreadBookingId ?? undefined, { unreadOnly: true });
              return;
            }
            const el = document.getElementById('partner-home-attention');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else if ((unreadMessageCount ?? 0) > 0) {
              openSupplierInbox(firstUnreadBookingId ?? undefined, { unreadOnly: true });
            } else {
              navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`);
            }
          }}
        >
          <span className="partner-home__metric-label">Needs attention</span>
          <p
            className={`partner-home__metric-value${
              attentionCount > 0 ? ' partner-home__metric-value--warn' : ''
            }`}
          >
            {metricsLoading ? '—' : attentionCount}
          </p>
          <p className="partner-home__metric-hint">
            {unreadMessageCount === null
              ? 'Includes inbox when available'
              : (unreadMessageCount ?? 0) > 0
                ? `${unreadMessageCount} unread message${unreadMessageCount === 1 ? '' : 's'}`
                : attentionCount > 0
                  ? 'Action items below'
                  : 'All clear'}
          </p>
        </button>
      </section>

      {accountStatus && accountStatus.kind !== 'operational' && !dashboardLoading && profile ? (
        <button
          type="button"
          onClick={openAccountStatus}
          className={`partner-home__account-alert lux-flat partner-row-interact partner-home__account-alert--${accountStatus.kind}`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold text-slate-900">{accountStatus.title}</span>
              <StatusChip tone={accountStatus.tone}>{accountStatus.chipLabel}</StatusChip>
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug text-slate-500">{accountStatus.detail}</span>
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        </button>
      ) : null}

      {attentionCount > 0 && (
        <section className="partner-home-section" id="partner-home-attention">
          <SectionHead title="Needs attention" meta={`${attentionCount}`} />
          <div className="partner-home-section__body">
          <ul className="partner-home__panel divide-y divide-slate-100">
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
                onClick={() =>
                  navigateSupplierUrl(
                    partnerBookingDeskPath({
                      family: firstCancelBooking
                        ? partnerBookingDeskFamily(firstCancelBooking)
                        : 'tour',
                      extraSearch: { ops: 'cancel' },
                    })
                  )
                }
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
                onClick={() =>
                  navigateSupplierUrl(
                    partnerBookingDeskPath({
                      family: firstRefund ? partnerBookingDeskFamily(firstRefund) : 'tour',
                      extraSearch: { ops: 'refund_due' },
                    })
                  )
                }
              />
            )}
            {rentalCollectionsToday.length > 0 && (
              <AttentionItem
                tone="warn"
                title={
                  rentalCollectionsToday.length === 1
                    ? 'Rental collection today'
                    : `${rentalCollectionsToday.length} rental collections today`
                }
                detail={
                  firstRentalCollection
                    ? rentalCollectionDetail(firstRentalCollection, listingTitlesById)
                    : 'Paid rentals awaiting collection'
                }
                onClick={() =>
                  navigateSupplierUrl(
                    partnerBookingDeskPath({
                      family: 'rental',
                      bookingId: firstRentalCollection?.id,
                    })
                  )
                }
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
                onClick={() =>
                  navigateSupplierUrl(
                    partnerBookingDeskPath({
                      family: firstPending ? partnerBookingDeskFamily(firstPending) : 'tour',
                      extraSearch: { ops: 'unpaid' },
                    })
                  )
                }
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
            {verificationNeedsAction && accountStatus?.kind === 'rejected' && (
              <AttentionItem
                tone="danger"
                title={accountStatus.title}
                detail={accountStatus.detail}
                onClick={() => {
                  const businessOk = (profile?.verification_status || '').trim().toLowerCase() === 'verified';
                  const payoutOk = (profile?.payout_verification_status || '').trim().toLowerCase() === 'verified';
                  navigateSupplierUrl(
                    businessOk && !payoutOk
                      ? `${PARTNER_APP_BASE}/money?tab=settings#income-payout-account`
                      : `${PARTNER_APP_BASE}/business-profile#company`
                  );
                }}
              />
            )}
            {verificationNeedsAction && accountStatus?.kind === 'setup' && (
              <AttentionItem
                tone="warn"
                title={accountStatus.title}
                detail={accountStatus.detail}
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
              />
            )}
          </ul>
          </div>
        </section>
      )}

      <section className="partner-home-section" aria-label="Upcoming schedule">
        <SectionHead
          title="Upcoming schedule"
          meta={
            !metricsLoading && !bookingsLoadFailed && scheduleBookings.length > 0
              ? `${scheduleBookings.length} · ${scheduleGuestTotal} guest${scheduleGuestTotal === 1 ? '' : 's'}`
              : undefined
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="partner-home__tabs" role="tablist" aria-label="Schedule range">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleTab === 'today'}
                  className="partner-home__tab lux-flat"
                  onClick={() => setScheduleTab('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleTab === 'week'}
                  className="partner-home__tab lux-flat"
                  onClick={() => setScheduleTab('week')}
                >
                  Next 7 days
                </button>
              </div>
              <TextLink onClick={() => openSupplierCalendar(calendarFocusListingId)}>Calendar →</TextLink>
            </div>
          }
        />
        <div className="partner-home-section__body">
        {metricsLoading ? (
          <div className="flex flex-col gap-2 p-3" aria-hidden>
            <div className="partner-home__skeleton" style={{ minHeight: '3.25rem' }} />
            <div className="partner-home__skeleton" style={{ minHeight: '3.25rem' }} />
            <div className="partner-home__skeleton" style={{ minHeight: '3.25rem' }} />
          </div>
        ) : bookingsLoadFailed ? (
          // Phase 1617: do not look like an empty schedule when bookings failed to load.
          // Unified Upcoming schedule covers both Today and Next 7 days tabs.
          <div className="partner-home__panel">
            <div className="partner-home__panel-empty">
              <div className="min-w-0">
                <p className="partner-home__panel-empty-title">Bookings couldn’t load</p>
                <p className="partner-home__panel-empty-body">
                  Today’s schedule and the week-ahead view need bookings to load successfully.
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
          </div>
        ) : scheduleBookings.length === 0 ? (
          <div className="partner-home__panel">
            <div className="partner-home__panel-empty">
              <div className="min-w-0">
                {scheduleTab === 'today' ? (
                  <>
                    <p className="partner-home__panel-empty-title">{todayEmptyCopy.title}</p>
                    <p className="partner-home__panel-empty-body">{todayEmptyCopy.body}</p>
                  </>
                ) : (
                  <>
                    <p className="partner-home__panel-empty-title">Nothing in the next 7 days</p>
                    <p className="partner-home__panel-empty-body">
                      No confirmed departures or stays in the coming week.
                    </p>
                  </>
                )}
              </div>
              {attentionCount === 0 ? (
                <button
                  type="button"
                  onClick={() => openSupplierCalendar(calendarFocusListingId)}
                  className="partner-btn-secondary lux-flat shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open calendar
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <ul className="partner-home__panel">
            {scheduleBookings.map((b) => {
              const deskFamily = partnerBookingDeskFamily(b);
              const isRental = deskFamily === 'rental';
              const isStay = deskFamily === 'stay';
              const stay = isStay ? stayRangeFromBooking(b) : null;
              const rentalSnap = isRental ? parseRentalPurchaseSnapshot(b.purchase_snapshot) : null;
              const experienceToday = scheduleTodayIsoForBooking(b);
              const opsHm = pgTimeToHm(b.start_time) || pgTimeToHm(b.pickup_time) || null;
              const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsHm);
              let startHm = dep.displayHm || null;
              if (isRental && rentalSnap?.pickupAt) {
                const d = new Date(rentalSnap.pickupAt);
                if (!Number.isNaN(d.getTime())) {
                  startHm = d.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  });
                }
              }
              const pickupMissing =
                deskFamily === 'tour' && pickupGaps.some((g) => g.id === b.id);
              const timeLabel =
                scheduleTab === 'week'
                  ? formatBookingDateDisplay(b.booking_date ?? '')
                  : isStay
                    ? stay && stay.checkIn === experienceToday
                      ? 'Arrival'
                      : stay && stay.checkOut === experienceToday
                        ? 'Departure'
                        : 'Stay'
                    : isRental
                      ? (startHm ?? 'Collect')
                      : (startHm ?? '—');
              const fallbackTitle = bookingProductNoun(b);
              const liveOpt =
                deskFamily === 'tour'
                  ? (() => {
                      const opts = materializedBookingOptions(
                        parseListingExtras(listingsById[b.listing_id]?.listingExtras as unknown)
                          .bookingOptions
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
              const optionLabel = isRental
                ? rentalSnap?.variantName?.trim() || ''
                : displayOptionLabelFromPurchase(
                    b.purchase_snapshot,
                    liveOpt?.name?.trim() || ''
                  );
              // Phase 1742: Today Meet line honors Pickup planner overrides (Bookings parity).
              const listing = listingsById[b.listing_id];
              const meetingPoint =
                deskFamily === 'tour'
                  ? resolvePartnerPickupCopy({
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
                    }).meetingPoint
                  : isRental
                    ? (rentalSnap?.pickupAddress ?? '').trim()
                    : '';
              const guest = b.guest_name?.trim() || 'Guest';
              const participantLabel = isRental
                ? rentalSnap
                  ? `${rentalSnap.quantity} item${rentalSnap.quantity === 1 ? '' : 's'}`
                  : null
                : formatBookingParticipantsLabel(b);
              const metaParts = [
                guest,
                participantLabel,
                optionLabel || null,
                scheduleTab === 'week' && startHm ? startHm : null,
                isStay && stay
                  ? `${formatStayNightHuman(stay.checkIn)} → ${formatStayNightHuman(stay.checkOut)}`
                  : null,
                scheduleTab === 'today' && meetingPoint && deskFamily === 'tour'
                  ? meetingPoint
                  : null,
                dep.purchasedNote || null,
              ].filter(Boolean);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigateSupplierUrl(
                        partnerBookingDeskPath({
                          bookingId: b.id,
                          family: deskFamily,
                        })
                      )
                    }
                    className="partner-home__sched-row lux-flat"
                  >
                    <span className="min-w-0">
                      <span className="partner-home__sched-time">{timeLabel}</span>
                      <span className="partner-home__sched-kind">
                        {isRental ? 'Rental' : isStay ? 'Stay' : 'Tour'}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="partner-home__sched-title" title={title}>
                        {title}
                      </span>
                      <span className="partner-home__sched-meta" title={metaParts.join(' · ')}>
                        {metaParts.join(' · ')}
                      </span>
                      {pickupMissing ? (
                        <span className="partner-home__sched-flag">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                          Pickup details missing
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-slate-300"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </section>

      {recentBookings.length > 0 && (
        <section className="partner-home-section" aria-label="Recent bookings">
          <SectionHead
            title="Recent bookings"
            action={
              <TextLink onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
                View all bookings →
              </TextLink>
            }
          />
          <div className="partner-home-section__body">
            <div className="partner-home__recent-cols" aria-hidden>
              <span>Guest</span>
              <span>Experience / property</span>
              <span>Date</span>
              <span>Guests</span>
              <span>Status</span>
              <span>Your earnings</span>
            </div>
            <ul className="partner-home__panel">
              {recentBookings.map((b) => {
                // Phase 1792: match Money Collected — not refunded / refund-due amounts.
                // Prefer commercial snapshot supplier net; legacy amount_paid only when snapshot absent.
                const hasSupplierNet = Object.prototype.hasOwnProperty.call(netByBookingId, b.id);
                const legacyPaid =
                  b.amount_paid != null && Number.isFinite(Number(b.amount_paid))
                    ? Number(b.amount_paid)
                    : null;
                const paid = isCollectedBooking(b)
                  ? hasSupplierNet
                    ? netByBookingId[b.id]
                    : legacyPaid
                  : null;
                const money = paid == null ? null : formatMoney(paid, b.currency);
                const status = recentBookingStatus(b);
                const statusClass =
                  status.tone === 'ok'
                    ? 'partner-home__status partner-home__status--ok'
                    : status.tone === 'warn'
                      ? 'partner-home__status partner-home__status--warn'
                      : status.tone === 'bad'
                        ? 'partner-home__status partner-home__status--bad'
                        : 'partner-home__status';
                const travelDate = b.booking_date
                  ? formatBookingDateDisplay(b.booking_date)
                  : '—';
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigateSupplierUrl(
                          partnerBookingDeskPath({
                            bookingId: b.id,
                            family: partnerBookingDeskFamily(b),
                          })
                        )
                      }
                      className="partner-home__recent-row lux-flat"
                    >
                      <span className="partner-home__recent-guest">
                        {b.guest_name?.trim() || 'Traveler'}
                      </span>
                      <span
                        className="partner-home__recent-product"
                        title={displayListingTitleFromPurchase(
                          b.purchase_snapshot,
                          listingTitlesById[b.listing_id],
                          'Listing'
                        )}
                      >
                        {displayListingTitleFromPurchase(
                          b.purchase_snapshot,
                          listingTitlesById[b.listing_id],
                          'Listing'
                        )}
                      </span>
                      <span className="partner-home__recent-meta">{travelDate}</span>
                      <span className="partner-home__recent-meta">
                        {formatBookingParticipantsLabel(b)}
                      </span>
                      <span className={statusClass}>{status.label}</span>
                      <span className="partner-home__recent-money">{money ?? '—'}</span>
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
