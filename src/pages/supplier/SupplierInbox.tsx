import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import StayRequestActions from '../../components/StayRequestActions';
import { isStayRequestAwaitingHost } from '../../lib/stay-request-approval';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import {
  fetchBookingMessages,
  fetchCancellationRequestsForBookings,
  bookingAllowsMessaging,
  messagingComposeBlock,
  type BookingMessageRow,
} from '../../data/supabase-booking-ops';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierListSkeleton,
} from '../../components/supplier/supplierUi';
import NoticeCallout from '../../components/NoticeCallout';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import BookingMessageThread from '../../components/BookingMessageThread';
import { bookingPaymentWasCollected, partnerPaymentLabel } from '../../lib/payment-states';
import { partnerInboxListsBooking } from '../../lib/messaging-authorization';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import {
  PARTNER_INBOX_MESSAGE_FETCH_CAP,
  partnerInboxNextFetchCap,
} from '../../lib/partner-inbox-cap';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import {
  displayListingTitleFromPurchase,
  displayMeetingPointFromPurchase,
  displayOptionLabelFromPurchase,
  displayPickupInstructionsFromPurchase,
  partnerOpsDepartureDisplay,
} from '../../lib/purchase-snapshot';
import { partnerBookingNumberMatchesFilterQuery } from '../../lib/partner-bookings-search';
import { bookingIsStayNight } from '../../lib/pickup-completeness';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';
import { materializedBookingOptions, parseListingExtras } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';

function inboxListingLine(
  b: BookingRow,
  liveTitle: string | undefined,
  listing: TourPackage | undefined
): string {
  const title = displayListingTitleFromPurchase(b.purchase_snapshot, liveTitle, 'Listing');
  const liveOption =
    b.booking_option_id && listing
      ? materializedBookingOptions(parseListingExtras(listing.listingExtras).bookingOptions).find(
          (o) => o.id === b.booking_option_id
        )?.name?.trim() || ''
      : '';
  const option = displayOptionLabelFromPurchase(b.purchase_snapshot, liveOption);
  return option ? `${title} · ${option}` : title;
}

function readBookingIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get('booking');
  return id && id.length > 0 ? id : null;
}

const PARTNER_INBOX_TABPANEL_ID = 'partner-inbox-tabpanel';

function partnerInboxTabId(unreadOnly: boolean): string {
  return unreadOnly ? 'partner-inbox-tab-unread' : 'partner-inbox-tab-all';
}

export default function SupplierInbox() {
  const { user, isSupabase } = useSupplierAuth();
  // Phase 1752: finance/viewer may read threads; host posts need editor roles (RPC 223).
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [listingsById, setListingsById] = useState<Record<string, TourPackage>>({});
  const [lastByBooking, setLastByBooking] = useState<Record<string, BookingMessageRow>>({});
  const lastByBookingRef = useRef(lastByBooking);
  lastByBookingRef.current = lastByBooking;
  const [openCancelIds, setOpenCancelIds] = useState<Set<string>>(new Set());
  const openCancelIdsRef = useRef(openCancelIds);
  openCancelIdsRef.current = openCancelIds;
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => readBookingIdFromUrl());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadGenRef = useRef(0);
  const inboxHubUserIdRef = useRef<string | null>(null);
  const [olderConversationsHidden, setOlderConversationsHidden] = useState(false);
  const [messageFetchCap, setMessageFetchCap] = useState(PARTNER_INBOX_MESSAGE_FETCH_CAP);
  const messageFetchCapRef = useRef(messageFetchCap);
  messageFetchCapRef.current = messageFetchCap;
  const [deepLinkMissing, setDeepLinkMissing] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('unread') === '1';
  });
  const [filterQuery, setFilterQuery] = useState('');
  const [mobileSheet, setMobileSheet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      document.documentElement.style.setProperty('--tv-vv-height', `${Math.round(vv.height)}px`);
      document.documentElement.style.setProperty('--tv-vv-offset', `${Math.round(vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--tv-vv-height');
      document.documentElement.style.removeProperty('--tv-vv-offset');
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setMobileSheet(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setCancelRequestsError(null);
    try {
      const deepLinkId = readBookingIdFromUrl();
      const [rows, listings] = await Promise.all([fetchBookingsForSupplier(uid), fetchMyListings(uid)]);
      if (gen !== loadGenRef.current) return;
      const collected = rows.filter(
        (b) =>
          bookingPaymentWasCollected(b.payment_status) ||
          (String(b.payment_status ?? '').toLowerCase() === 'authorized' &&
            (String(b.approval_status ?? 'pending').toLowerCase() === 'pending' ||
              !b.approval_status))
      );
      setTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
      setListingsById(Object.fromEntries(listings.map((l) => [l.id, l])));
      let openIds = new Set<string>();
      try {
        const cancels = await fetchCancellationRequestsForBookings(collected.map((b) => b.id));
        if (gen !== loadGenRef.current) return;
        openIds = new Set(cancels.filter((c) => c.status === 'requested').map((c) => c.booking_id));
        setOpenCancelIds(openIds);
      } catch (cancelErr) {
        if (gen !== loadGenRef.current) return;
        // Keep prior openCancelIds — failure must not drop cancel threads from the list.
        openIds = openCancelIdsRef.current;
        setCancelRequestsError(userFacingError(cancelErr, USER_ERROR.bookings));
      }
      const lasts: Record<string, BookingMessageRow> = {};
      const failedMessagePrefetch = new Set<string>();
      const cap = messageFetchCapRef.current;
      const withMessagesFetched = collected.slice(0, cap);
      // Always fetch the deep-linked booking so Today → Inbox ?booking= works beyond the cap.
      if (deepLinkId && !withMessagesFetched.some((b) => b.id === deepLinkId)) {
        const deep = collected.find((b) => b.id === deepLinkId);
        if (deep) withMessagesFetched.push(deep);
      }
      setOlderConversationsHidden(collected.length > cap);
      await Promise.all(
        withMessagesFetched.map(async (b) => {
          try {
            const msgs = await fetchBookingMessages(b.id);
            if (msgs.length) lasts[b.id] = msgs[msgs.length - 1]!;
          } catch {
            // Phase 1355: keep prior last-message so closed threads do not vanish on blips.
            failedMessagePrefetch.add(b.id);
          }
        })
      );
      if (gen !== loadGenRef.current) return;
      const priorLasts = lastByBookingRef.current;
      const mergedLasts: Record<string, BookingMessageRow> = { ...priorLasts };
      for (const b of withMessagesFetched) {
        if (failedMessagePrefetch.has(b.id)) continue;
        if (lasts[b.id]) mergedLasts[b.id] = lasts[b.id]!;
        else delete mergedLasts[b.id];
      }
      setLastByBooking(mergedLasts);
      const listed = collected.filter((b) =>
        partnerInboxListsBooking(
          {
            status: b.status,
            payment_status: b.payment_status,
            openCancellation: openIds.has(b.id),
          },
          Boolean(mergedLasts[b.id])
        )
      );
      // Keep a deep-linked paid booking visible even when it would otherwise be filtered out.
      if (deepLinkId && !listed.some((b) => b.id === deepLinkId)) {
        const deep = collected.find((b) => b.id === deepLinkId);
        if (deep) listed.unshift(deep);
      }
      setBookings(listed);
      if (deepLinkId) {
        const found = listed.some((b) => b.id === deepLinkId) || collected.some((b) => b.id === deepLinkId);
        setDeepLinkMissing(!found);
        if (found) setOpenId(deepLinkId);
      } else {
        setDeepLinkMissing(false);
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Keep prior threads — bookings/listings failure must not look like an empty Inbox.
      setError(userFacingError(e, USER_ERROR.bookings));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  // Phase 1387 + layout: clear prior partner inbox before paint on account switch (useEffect ran one frame too late).
  useLayoutEffect(() => {
    const clearInboxPartnerWorkspace = () => {
      setBookings([]);
      setTitles({});
      setListingsById({});
      setLastByBooking({});
      setOpenCancelIds(new Set());
      setOpenId(null);
      setDeepLinkMissing(false);
      setOlderConversationsHidden(false);
      setMessageFetchCap(PARTNER_INBOX_MESSAGE_FETCH_CAP);
      setError(null);
      setCancelRequestsError(null);
      setFilterQuery('');
    };
    if (!user?.id) {
      inboxHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearInboxPartnerWorkspace();
      setLoading(false);
      return;
    }
    if (inboxHubUserIdRef.current !== user.id) {
      inboxHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearInboxPartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load, messageFetchCap]);

  useEffect(() => {
    const syncFromUrl = () => {
      const id = readBookingIdFromUrl();
      setOpenId(id);
      if (!id) setDeepLinkMissing(false);
      setUnreadOnly(new URLSearchParams(window.location.search).get('unread') === '1');
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const setUnreadOnlyAndUrl = useCallback((next: boolean) => {
    setUnreadOnly(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('unread', '1');
    else url.searchParams.delete('unread');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const markInboxThreadRead = useCallback((bookingId: string) => {
    // Phase 1500: only after mark_booking_messages_read succeeds (BookingMessageThread).
    setLastByBooking((prev) => {
      const cur = prev[bookingId];
      if (!cur || cur.sender_role !== 'traveler' || cur.read_by_supplier_at) return prev;
      return { ...prev, [bookingId]: { ...cur, read_by_supplier_at: new Date().toISOString() } };
    });
  }, []);

  const setOpenBookingId = useCallback((id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('booking', id);
    else url.searchParams.delete('booking');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    if (!id) setDeepLinkMissing(false);
  }, []);

  const threads = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const ta = lastByBooking[a.id]?.created_at ?? a.created_at;
      const tb = lastByBooking[b.id]?.created_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
  }, [bookings, lastByBooking]);

  const isUnreadThread = useCallback(
    (b: BookingRow) => {
      const last = lastByBooking[b.id];
      return Boolean(last && last.sender_role === 'traveler' && !last.read_by_supplier_at);
    },
    [lastByBooking]
  );

  const unreadCount = useMemo(() => threads.filter(isUnreadThread).length, [threads, isUnreadThread]);

  const visibleThreads = useMemo(() => {
    const qRaw = filterQuery.trim();
    const qLower = qRaw.toLowerCase();
    let rows = threads;
    if (qLower) {
      rows = rows.filter((b) => {
        // Phase 1487: desk parity — match collapsed card labels (Bookings 1481/1484), not live renames.
        const title = displayListingTitleFromPurchase(
          b.purchase_snapshot,
          titles[b.listing_id],
          'Listing'
        ).toLowerCase();
        const listing = listingsById[b.listing_id];
        const liveOption =
          b.booking_option_id && listing
            ? materializedBookingOptions(parseListingExtras(listing.listingExtras).bookingOptions).find(
                (o) => o.id === b.booking_option_id
              )?.name?.trim() || ''
            : '';
        const option = displayOptionLabelFromPurchase(b.purchase_snapshot, liveOption).toLowerCase();
        const guestName = (b.guest_name ?? '').toLowerCase();
        const guestEmail = (b.guest_email ?? '').toLowerCase();
        const lastBody = (lastByBooking[b.id]?.body ?? '').toLowerCase();
        const publicRef = (travelerPublicBookingReference(b.public_reference) ?? '').toLowerCase();
        return (
          title.includes(qLower) ||
          option.includes(qLower) ||
          publicRef.includes(qLower) ||
          partnerBookingNumberMatchesFilterQuery(qRaw, b.booking_number) ||
          b.id.toLowerCase().includes(qLower) ||
          guestName.includes(qLower) ||
          guestEmail.includes(qLower) ||
          lastBody.includes(qLower)
        );
      });
    }
    if (!unreadOnly) return rows;
    return rows.filter(isUnreadThread);
  }, [threads, filterQuery, unreadOnly, isUnreadThread, titles, listingsById, lastByBooking]);

  const openBooking = useMemo(
    () => (openId ? threads.find((b) => b.id === openId) ?? null : null),
    [openId, threads]
  );

  useEffect(() => {
    setDetailsOpen(false);
  }, [openId]);

  useEffect(() => {
    if (!openId || loading) return;
    const el = document.getElementById(`supplier-inbox-row-${openId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openId, loading, threads]);

  const activityWhen = (b: BookingRow) => {
    if (bookingIsStayNight(b)) {
      const stay = stayRangeFromBooking(b);
      if (stay) return `${formatStayNightHuman(stay.checkIn)} → ${formatStayNightHuman(stay.checkOut)}`;
    }
    const date = b.booking_date ? formatBookingDateDisplay(b.booking_date) : 'Date to be confirmed';
    const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, pgTimeToHm(b.start_time));
    return dep.displayHm ? `${date} · ${dep.displayHm}` : date;
  };

  const messageClock = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const renderOpenThread = (b: BookingRow) => (
    <BookingMessageThread
      bookingId={b.id}
      layout="panel"
      canCompose={
        canEditBookings &&
        bookingAllowsMessaging({
          status: b.status,
          payment_status: b.payment_status,
          openCancellation: openCancelIds.has(b.id),
        })
      }
      composeBlock={
        !canEditBookings
          ? 'role'
          : messagingComposeBlock({
                status: b.status,
                payment_status: b.payment_status,
                openCancellation: openCancelIds.has(b.id),
              }) === 'closed'
            ? 'closed'
            : 'unpaid'
      }
      viewerRole="supplier"
      listingTitle={inboxListingLine(b, titles[b.listing_id], listingsById[b.listing_id])}
      listingId={b.listing_id}
      supplierId={user?.id}
      customerEmail={b.guest_email}
      customerName={b.guest_name}
      bookingNumber={typeof b.booking_number === 'number' ? b.booking_number : undefined}
      bookingDate={b.booking_date}
      onMarkedRead={() => markInboxThreadRead(b.id)}
    />
  );

  const showList = !mobileSheet || !openId;
  const showChat = !mobileSheet || Boolean(openId);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-inbox-workspace`}>
      {error ? (
        <ErrorState
          className="py-6"
          title="Inbox unavailable"
          body={error}
          retry={{ onClick: () => void load() }}
          extra={
            <a href="/contact" className="tv-btn-ghost inline-flex">
              Contact support
            </a>
          }
        />
      ) : null}
      {!error && cancelRequestsError ? (
        <NoticeCallout title="Cancellation status unavailable" tone="warn">
          <p>{cancelRequestsError}</p>
          <button type="button" onClick={() => void load()} className="tv-btn-ghost mt-3 -ml-2">
            Retry
          </button>
        </NoticeCallout>
      ) : null}
      <div className="tv-inbox-split">
        <section className={`tv-inbox-list-pane min-h-0 flex-col ${showList ? 'flex' : 'hidden'}`} aria-label="Conversations">
          <header className="tv-inbox-list-pane__head">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="font-sans text-xl font-bold tracking-tight text-ink">Inbox</h1>
              {unreadCount > 0 ? (
                <p className="text-xs font-semibold text-finland">{unreadCount} unread</p>
              ) : null}
            </div>
            {threads.length > 0 ? (
              <div className="mt-3">
                <label htmlFor="partner-inbox-search" className="sr-only">
                  Search
                </label>
                <input
                  id="partner-inbox-search"
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Name, reference, or experience"
                  className="tv-input h-10"
                />
              </div>
            ) : null}
            {threads.length > 0 ? (
              <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Inbox filter">
                <button
                  type="button"
                  role="tab"
                  id={partnerInboxTabId(false)}
                  aria-controls={PARTNER_INBOX_TABPANEL_ID}
                  aria-selected={!unreadOnly}
                  onClick={() => setUnreadOnlyAndUrl(false)}
                  className="tv-inbox-tab lux-flat"
                >
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  id={partnerInboxTabId(true)}
                  aria-controls={PARTNER_INBOX_TABPANEL_ID}
                  aria-selected={unreadOnly}
                  onClick={() => setUnreadOnlyAndUrl(true)}
                  className="tv-inbox-tab lux-flat"
                >
                  Unread{unreadCount > 0 ? ` · ${unreadCount}` : ''}
                </button>
              </div>
            ) : null}
          </header>
          {olderConversationsHidden ? (
            <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] px-3 py-2">
              <p className="text-xs text-ink-muted">Showing the {messageFetchCap} most recent paid bookings.</p>
              <button
                type="button"
                className="tv-btn-ghost shrink-0"
                onClick={() => setMessageFetchCap((c) => partnerInboxNextFetchCap(c))}
              >
                Load older
              </button>
            </div>
          ) : null}
          {loading && threads.length === 0 ? (
            <SupplierListSkeleton rows={4} />
          ) : threads.length === 0 ? (
            error ? null : (
              <SupplierEmptyState
                icon={MessageSquare}
                title="No booking conversations yet"
                body="When a traveler pays for one of your tours or stays, you can message them here about that booking."
                action={
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="tv-btn-primary" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
                      Open bookings
                    </button>
                    {/* Phase 1641: new suppliers need a path to listings while waiting for paid threads. */}
                    <button type="button" className="tv-btn-ghost" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}>
                      Your listings
                    </button>
                  </div>
                }
              />
            )
          ) : (
            <div
              id={PARTNER_INBOX_TABPANEL_ID}
              role="tabpanel"
              aria-labelledby={partnerInboxTabId(unreadOnly)}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {visibleThreads.length === 0 ? (
                filterQuery.trim() ? (
                  <SupplierEmptyState
                    icon={MessageSquare}
                    title="No conversations match your search"
                    body="Try another guest name, purchased listing title, or booking number."
                    action={
                      <button type="button" className="tv-btn-secondary" onClick={() => setFilterQuery('')}>
                        Clear search
                      </button>
                    }
                  />
                ) : (
                  <SupplierEmptyState
                    icon={MessageSquare}
                    title="No unread messages"
                    body="You’re caught up. Switch to All to see every booking thread."
                    action={
                      <button type="button" className="tv-btn-secondary" onClick={() => setUnreadOnlyAndUrl(false)}>
                        Show all conversations
                      </button>
                    }
                  />
                )
              ) : (
                <ul className="tv-inbox-list" aria-busy={loading || undefined}>
                  {visibleThreads.map((b) => {
                    const open = openId === b.id;
                    const last = lastByBooking[b.id];
                    const unread = isUnreadThread(b);
                    return (
                      <li
                        key={b.id}
                        id={`supplier-inbox-row-${b.id}`}
                        data-unread={unread ? 'true' : 'false'}
                        data-open={open ? 'true' : 'false'}
                        className="tv-inbox-thread"
                      >
                        <button
                          type="button"
                          className="partner-row-interact lux-flat tv-inbox-thread__btn"
                          aria-current={open ? 'true' : undefined}
                          onClick={() => setOpenBookingId(b.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-[0.95rem] font-bold tracking-tight text-ink">
                              <span
                                className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${unread ? 'bg-finland' : 'bg-transparent'}`}
                                aria-hidden={!unread}
                              />
                              {b.guest_name?.trim() || 'Traveler'}
                            </p>
                            {last?.created_at ? (
                              <time dateTime={last.created_at} className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                                {messageClock(last.created_at)}
                              </time>
                            ) : null}
                          </div>
                          <p className={`mt-0.5 truncate pl-3.5 text-[13px] ${unread ? 'font-medium text-ink' : 'text-ink-muted'}`}>
                            {isStayRequestAwaitingHost(b)
                              ? 'Booking request · Accept or decline'
                              : last?.body ?? 'Start a conversation'}
                          </p>
                          <p className="mt-0.5 truncate pl-3.5 text-[12px] text-ink-faint">
                            {displayListingTitleFromPurchase(b.purchase_snapshot, titles[b.listing_id], 'Listing')}
                            {activityWhen(b) ? ` · ${activityWhen(b)}` : ''}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
        <section className={`tv-inbox-chat min-h-0 min-w-0 flex-1 flex-col ${showChat ? 'flex' : 'hidden'}`} aria-label="Conversation">
          {!loading && deepLinkMissing && openId ? (
            <div className="p-4">
              <NoticeCallout title="Booking not in Inbox" tone="warn">
                <p>
                  That booking link is missing from your paid Inbox list (wrong id, unpaid, or not yours). Open it from
                  Bookings if you still need the thread.
                </p>
                <button
                  type="button"
                  className="tv-btn-ghost mt-3 -ml-2"
                  onClick={() => openSupplierBooking(openId)}
                >
                  Open booking desk
                </button>
              </NoticeCallout>
            </div>
          ) : openBooking ? (
            <>
              <header className="tv-inbox-chat__head">
                <button
                  type="button"
                  className="lux-flat mr-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink lg:hidden"
                  aria-label="Back to inbox"
                  onClick={() => setOpenBookingId(null)}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-bold tracking-tight text-ink">
                    {openBooking.guest_name?.trim() || 'Traveler'}
                  </h2>
                  <p className="truncate text-[12px] text-ink-muted">
                    {displayListingTitleFromPurchase(
                      openBooking.purchase_snapshot,
                      titles[openBooking.listing_id],
                      'Listing'
                    )}
                    {activityWhen(openBooking) ? ` · ${activityWhen(openBooking)}` : ''}
                  </p>
                </div>
                <button type="button" className="tv-inbox-details-link tv-btn-ghost shrink-0" onClick={() => setDetailsOpen(true)}>
                  Booking details
                </button>
              </header>
              <div className="tv-inbox-chat__body">
                {isStayRequestAwaitingHost(openBooking) ? (
                  <div className="border-b border-black/[0.06] px-3 py-2">
                    <StayRequestActions
                      compact
                      role="supplier"
                      booking={{
                        ...openBooking,
                        listingTitle: displayListingTitleFromPurchase(
                          openBooking.purchase_snapshot,
                          titles[openBooking.listing_id],
                          'Stay'
                        ),
                      }}
                      onDone={() => void load()}
                    />
                  </div>
                ) : null}
                {renderOpenThread(openBooking)}
              </div>
              {detailsOpen ? (
                <div className="tv-inbox-details" role="dialog" aria-label="Booking details">
                  <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
                    <h3 className="text-sm font-bold text-ink">Booking details</h3>
                    <button type="button" className="tv-btn-ghost" onClick={() => setDetailsOpen(false)}>
                      Close
                    </button>
                  </div>
                  <dl className="space-y-3 px-4 py-4 text-sm">
                    <div>
                      <dt className="text-xs text-ink-faint">Reference</dt>
                      <dd className="font-semibold text-ink">
                        {travelerPublicBookingReference(openBooking.public_reference) ?? 'Reference pending'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Experience</dt>
                      <dd className="break-words text-ink [overflow-wrap:anywhere]">
                        {inboxListingLine(openBooking, titles[openBooking.listing_id], listingsById[openBooking.listing_id])}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">When</dt>
                      <dd className="text-ink">{activityWhen(openBooking)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Participants</dt>
                      <dd className="text-ink">{formatBookingParticipantsLabel(openBooking)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Traveler</dt>
                      <dd className="break-words text-ink [overflow-wrap:anywhere]">
                        {openBooking.guest_name?.trim() || 'Traveler'}
                        {openBooking.guest_email ? ` · ${openBooking.guest_email}` : ''}
                      </dd>
                    </div>
                    {displayMeetingPointFromPurchase(openBooking.purchase_snapshot, '') ? (
                      <div>
                        <dt className="text-xs text-ink-faint">Meeting point</dt>
                        <dd className="break-words text-ink [overflow-wrap:anywhere]">
                          {displayMeetingPointFromPurchase(openBooking.purchase_snapshot, '')}
                        </dd>
                      </div>
                    ) : null}
                    {displayPickupInstructionsFromPurchase(openBooking.purchase_snapshot, '') ? (
                      <div>
                        <dt className="text-xs text-ink-faint">Pickup</dt>
                        <dd className="break-words text-ink [overflow-wrap:anywhere]">
                          {displayPickupInstructionsFromPurchase(openBooking.purchase_snapshot, '')}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs text-ink-faint">Status</dt>
                      <dd className="text-ink">
                        {openBooking.status}
                        {partnerPaymentLabel(openBooking) ? ` · ${partnerPaymentLabel(openBooking)}` : ''}
                      </dd>
                    </div>
                  </dl>
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      className="tv-btn-secondary"
                      onClick={() =>
                        openSupplierBooking(openBooking.id, {
                          isStay: isStayRequestAwaitingHost(openBooking) || bookingIsStayNight(openBooking),
                        })
                      }
                    >
                      {isStayRequestAwaitingHost(openBooking) || bookingIsStayNight(openBooking)
                        ? 'Open in Reservations'
                        : 'Open in Bookings'}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessageSquare className="h-6 w-6 text-finland" aria-hidden />
              <h2 className="mt-3 text-base font-bold text-ink">Select a conversation</h2>
              <p className="mt-1 max-w-xs text-sm text-ink-muted">
                Choose a booking to view messages or contact your traveler.
              </p>
            </div>
          )}
          {!loading && openId && !openBooking && !deepLinkMissing && threads.length > 0 ? (
            <NoticeCallout title="Thread not in this list" tone="info">
              The booking from the link is not among the conversations above. Try Bookings or clear filters by reopening Inbox.
            </NoticeCallout>
          ) : null}
        </section>
      </div>
    </div>
  );
}
