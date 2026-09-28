import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
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
  SupplierModalHeader,
  SupplierModalShell,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import NoticeCallout from '../../components/NoticeCallout';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import BookingMessageThread from '../../components/BookingMessageThread';
import { PARTNER_INBOX_MESSAGE_DELIVERY_NOTE } from '../../lib/booking-confirmation-copy';
import { bookingPaymentWasCollected, partnerPaymentLabel } from '../../lib/payment-states';
import { partnerInboxListsBooking } from '../../lib/messaging-authorization';
import StatusChip, { toneForPaymentLabel } from '../../components/StatusChip';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { PARTNER_INBOX_MESSAGE_FETCH_CAP } from '../../lib/partner-inbox-cap';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { displayListingTitleFromPurchase, displayOptionLabelFromPurchase, partnerOpsDepartureDisplay } from '../../lib/purchase-snapshot';
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

export default function SupplierInbox() {
  const { user, isSupabase } = useSupplierAuth();
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
  const [deepLinkMissing, setDeepLinkMissing] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('unread') === '1';
  });
  const [mobileSheet, setMobileSheet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
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
      const collected = rows.filter((b) => bookingPaymentWasCollected(b.payment_status));
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
      const withMessagesFetched = collected.slice(0, PARTNER_INBOX_MESSAGE_FETCH_CAP);
      // Always fetch the deep-linked booking so Today → Inbox ?booking= works beyond the cap.
      if (deepLinkId && !withMessagesFetched.some((b) => b.id === deepLinkId)) {
        const deep = collected.find((b) => b.id === deepLinkId);
        if (deep) withMessagesFetched.push(deep);
      }
      setOlderConversationsHidden(collected.length > PARTNER_INBOX_MESSAGE_FETCH_CAP);
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
      setError(null);
      setCancelRequestsError(null);
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
  }, [load]);

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

  const setOpenBookingId = useCallback((id: string | null, opts?: { markReadLocal?: boolean }) => {
    setOpenId(id);
    if (opts?.markReadLocal && id) {
      // Opening a thread fires markBookingMessagesRead (see BookingMessageThread).
      // Clear the Unread chip locally now so it doesn't wait for a full reload.
      setLastByBooking((prev) => {
        const cur = prev[id];
        if (!cur || cur.sender_role !== 'traveler' || cur.read_by_supplier_at) return prev;
        return { ...prev, [id]: { ...cur, read_by_supplier_at: new Date().toISOString() } };
      });
    }
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
    if (!unreadOnly) return threads;
    return threads.filter(isUnreadThread);
  }, [threads, unreadOnly, isUnreadThread]);

  const openBooking = useMemo(
    () => (openId ? threads.find((b) => b.id === openId) ?? null : null),
    [openId, threads]
  );

  useEffect(() => {
    if (!openId || loading) return;
    const el = document.getElementById(`supplier-inbox-row-${openId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openId, loading, threads]);

  const renderThreadBody = (b: BookingRow) => {
    const opsHm = pgTimeToHm(b.start_time);
    const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsHm);
    const pickupHm = pgTimeToHm(b.pickup_time);
    const isStay = bookingIsStayNight(b);
    const timeBits = isStay
      ? null
      : [
          dep.displayHm ? `Start ${dep.displayHm}` : null,
          dep.purchasedNote,
          pickupHm ? `Pickup ${pickupHm}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
    const whenBits = (() => {
      if (isStay) {
        const stay = stayRangeFromBooking(b);
        if (stay) {
          return `${formatStayNightHuman(stay.checkIn)} → ${formatStayNightHuman(stay.checkOut)}`;
        }
      }
      return b.booking_date ? formatBookingDateDisplay(b.booking_date) : '';
    })();
    return (
      <>
        <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs text-ink-muted leading-snug">
            {typeof b.booking_number === 'number' ? `#${b.booking_number} · ` : ''}
            {isStay ? 'Stay' : 'Tour'} · {inboxListingLine(b, titles[b.listing_id], listingsById[b.listing_id])} ·{' '}
            {b.guest_name?.trim() || 'Traveler'} ·{' '}
            {formatBookingParticipantsLabel(b)}
            {whenBits ? ` · ${whenBits}` : ''}
            {timeBits ? ` · ${timeBits}` : ''}
          </p>
          <button
            type="button"
            className="tv-btn-ghost shrink-0 -mr-2"
            onClick={() => openSupplierBooking(b.id)}
          >
            Open in Bookings
          </button>
        </div>
        {openCancelIds.has(b.id) ? (
          <div className="mb-2.5 rounded-lg border border-amber-200/80 border-l-[3px] border-l-amber-500 bg-amber-50/50 px-3 py-2">
            <p className="text-xs font-semibold text-ink">Cancellation pending</p>
            <p className="mt-0.5 text-xs text-ink-muted leading-snug">
              Waiting on the traveler. You can still message them about this booking.
            </p>
          </div>
        ) : null}
        <BookingMessageThread
          bookingId={b.id}
          canCompose={bookingAllowsMessaging({
            status: b.status,
            payment_status: b.payment_status,
            openCancellation: openCancelIds.has(b.id),
          })}
          composeBlock={
            messagingComposeBlock({
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
        />
      </>
    );
  };

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Operate"
        title="Inbox"
        description={
          unreadCount > 0
            ? `${unreadCount} unread · Messages about paid bookings. ${PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}`
            : `Messages about paid bookings. Closed and Refund due trips stay here if they already have a thread. ${PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}`
        }
      />
      {threads.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Inbox filter">
          <button
            type="button"
            role="tab"
            aria-selected={!unreadOnly}
            onClick={() => setUnreadOnlyAndUrl(false)}
            className={`lux-flat rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
              !unreadOnly
                ? 'bg-finland text-white ring-finland'
                : 'bg-transparent text-ink-muted ring-black/[0.08] hover:text-ink'
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={unreadOnly}
            onClick={() => setUnreadOnlyAndUrl(true)}
            className={`lux-flat rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
              unreadOnly
                ? 'bg-amber-500 text-white ring-amber-500'
                : 'bg-transparent text-ink-muted ring-black/[0.08] hover:text-ink'
            }`}
          >
            Unread{unreadCount > 0 ? ` · ${unreadCount}` : ''}
          </button>
        </div>
      ) : null}
      {olderConversationsHidden ? (
        <NoticeCallout title="Showing your most recent paid bookings" tone="info">
          You have more than {PARTNER_INBOX_MESSAGE_FETCH_CAP} paid bookings, so this Inbox only checks messages for the {PARTNER_INBOX_MESSAGE_FETCH_CAP}
          most recent ones. A closed or cancelled booking older than that won't appear here even if it has a message
          history — open it from Bookings instead.
        </NoticeCallout>
      ) : null}
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
      {!loading && deepLinkMissing && openId ? (
        <NoticeCallout title="Booking not in Inbox" tone="warn">
          <p>
            That booking link is missing from your paid Inbox list (wrong id, unpaid, or not yours). Open it from
            Bookings if you still need the thread.
          </p>
          <button type="button" className="tv-btn-ghost mt-3 -ml-2" onClick={() => openSupplierBooking(openId)}>
            Open in Bookings
          </button>
        </NoticeCallout>
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
            <button type="button" className="tv-btn-primary" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
              Open bookings
            </button>
          }
        />
        )
      ) : visibleThreads.length === 0 ? (
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
      ) : (
        <ul
          className="divide-y divide-slate-100 rounded-lg bg-white ring-1 ring-slate-200/90 overflow-hidden"
          aria-busy={loading || undefined}
        >
          {visibleThreads.map((b) => {
            const open = openId === b.id;
            const last = lastByBooking[b.id];
            const unread = isUnreadThread(b);
            const payLabel = partnerPaymentLabel(b);
            const showMoneyChip =
              payLabel === 'Refund due' || payLabel === 'Refunded' || payLabel === 'No refund';
            const isClosed =
              messagingComposeBlock({
                status: b.status,
                payment_status: b.payment_status,
                openCancellation: openCancelIds.has(b.id),
              }) === 'closed';
            return (
              <li
                key={b.id}
                id={`supplier-inbox-row-${b.id}`}
                className={`${open && !mobileSheet ? 'bg-finland/[0.04]' : ''} ${unread ? 'bg-amber-50/40' : ''}`}
              >
                <button
                  type="button"
                  className="partner-row-interact lux-flat w-full text-left px-3 py-2"
                  aria-expanded={open}
                  onClick={() => {
                    const opening = !open;
                    setOpenBookingId(opening ? b.id : null, { markReadLocal: opening });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-amber-500' : 'bg-transparent'}`}
                          aria-hidden={!unread}
                          aria-label={unread ? 'Unread' : undefined}
                        />
                        <p className={`min-w-0 break-words text-sm [overflow-wrap:anywhere] line-clamp-2 ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                          {b.guest_name?.trim() || 'Traveler'}
                        </p>
                      </div>
                      <p className="mt-0.5 break-words pl-4 text-xs text-ink-muted [overflow-wrap:anywhere] line-clamp-2">
                        {inboxListingLine(b, titles[b.listing_id], listingsById[b.listing_id])}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[45%]">
                      {showMoneyChip ? (
                        <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                      ) : null}
                      {openCancelIds.has(b.id) ? <StatusChip tone="warn">Cancel pending</StatusChip> : null}
                      {isClosed ? <StatusChip tone="neutral">Closed</StatusChip> : null}
                      {typeof b.booking_number === 'number' ? (
                        <span className="text-xs font-mono text-finland">#{b.booking_number}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint pl-4">
                    {(() => {
                      if (bookingIsStayNight(b)) {
                        const stay = stayRangeFromBooking(b);
                        if (stay) {
                          return `${formatStayNightHuman(stay.checkIn)} → ${formatStayNightHuman(stay.checkOut)}`;
                        }
                      }
                      return b.booking_date ? formatBookingDateDisplay(b.booking_date) : 'Date TBC';
                    })()}
                    {` · ${formatBookingParticipantsLabel(b)}`}
                    {(() => {
                      if (bookingIsStayNight(b)) return '';
                      const opsHm = pgTimeToHm(b.start_time);
                      const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsHm);
                      if (!dep.displayHm) return '';
                      return dep.purchasedNote
                        ? ` · ${dep.displayHm} (${dep.purchasedNote})`
                        : ` · ${dep.displayHm}`;
                    })()}
                    {last?.created_at
                      ? ` · ${new Date(last.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                      : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted line-clamp-1 pl-4">
                    {last?.body ?? 'No messages yet — open to write about this booking.'}
                  </p>
                </button>
                {open && !mobileSheet ? (
                  <div className="px-4 pb-4 motion-safe:animate-fade-in border-t border-black/[0.04] pt-3">
                    {renderThreadBody(b)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {mobileSheet && openBooking ? (
        <SupplierModalShell onClose={() => setOpenBookingId(null)} maxWidth="lg">
          <SupplierModalHeader
            icon={MessageSquare}
            title={openBooking.guest_name?.trim() || 'Traveler'}
            subtitle={inboxListingLine(
              openBooking,
              titles[openBooking.listing_id],
              listingsById[openBooking.listing_id]
            )}
            onClose={() => setOpenBookingId(null)}
          />
          <div className="p-4 sm:p-5 space-y-3 max-h-[min(70vh,32rem)] overflow-y-auto">
            {renderThreadBody(openBooking)}
          </div>
        </SupplierModalShell>
      ) : null}
      {!loading && openId && !openBooking && !deepLinkMissing && threads.length > 0 ? (
        <NoticeCallout title="Thread not in this list" tone="info">
          The booking from the link is not among the conversations above. Try Bookings or clear filters by reopening Inbox.
        </NoticeCallout>
      ) : null}
    </div>
  );
}
