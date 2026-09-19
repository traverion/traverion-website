import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** Message previews are only fetched for the most recent N paid bookings; older
 * closed/cancelled threads beyond this may not show here. See olderConversationsHidden. */

function readBookingIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get('booking');
  return id && id.length > 0 ? id : null;
}

export default function SupplierInbox() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [lastByBooking, setLastByBooking] = useState<Record<string, BookingMessageRow>>({});
  const [openCancelIds, setOpenCancelIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(() => readBookingIdFromUrl());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olderConversationsHidden, setOlderConversationsHidden] = useState(false);
  const [deepLinkMissing, setDeepLinkMissing] = useState(false);
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
    setLoading(true);
    setError(null);
    try {
      const deepLinkId = readBookingIdFromUrl();
      const [rows, listings] = await Promise.all([fetchBookingsForSupplier(uid), fetchMyListings(uid)]);
      const collected = rows.filter((b) => bookingPaymentWasCollected(b.payment_status));
      setTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
      const cancels = await fetchCancellationRequestsForBookings(collected.map((b) => b.id));
      const openIds = new Set(cancels.filter((c) => c.status === 'requested').map((c) => c.booking_id));
      setOpenCancelIds(openIds);
      const lasts: Record<string, BookingMessageRow> = {};
      const withMessagesFetched = collected.slice(0, PARTNER_INBOX_MESSAGE_FETCH_CAP);
      // Always fetch the deep-linked booking so Today → Inbox ?booking= works beyond the cap.
      if (deepLinkId && !withMessagesFetched.some((b) => b.id === deepLinkId)) {
        const deep = collected.find((b) => b.id === deepLinkId);
        if (deep) withMessagesFetched.push(deep);
      }
      setOlderConversationsHidden(collected.length > PARTNER_INBOX_MESSAGE_FETCH_CAP);
      await Promise.all(
        withMessagesFetched.map(async (b) => {
          const msgs = await fetchBookingMessages(b.id);
          if (msgs.length) lasts[b.id] = msgs[msgs.length - 1]!;
        })
      );
      setLastByBooking(lasts);
      const listed = collected.filter((b) =>
        partnerInboxListsBooking(
          {
            status: b.status,
            payment_status: b.payment_status,
            openCancellation: openIds.has(b.id),
          },
          Boolean(lasts[b.id])
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
      setError(userFacingError(e, USER_ERROR.bookings));
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncFromUrl = () => {
      const id = readBookingIdFromUrl();
      setOpenId(id);
      if (!id) setDeepLinkMissing(false);
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
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
    const startHm = pgTimeToHm(b.start_time);
    const pickupHm = pgTimeToHm(b.pickup_time);
    const timeBits = [startHm ? `Start ${startHm}` : null, pickupHm ? `Pickup ${pickupHm}` : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm text-ink">
            Booking {typeof b.booking_number === 'number' ? `#${b.booking_number}` : ''} ·{' '}
            {titles[b.listing_id] ?? 'Listing'} · {b.guest_name?.trim() || 'Traveler'} ·{' '}
            {formatBookingParticipantsLabel(b)}
            {b.booking_date
              ? ` · ${new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}`
              : ''}
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
          <NoticeCallout title="Cancellation pending" tone="warn">
            A cancellation request is waiting on the traveler. You can still message them about this booking.
          </NoticeCallout>
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
          listingTitle={titles[b.listing_id] ?? 'Listing'}
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
        description={`Messages about paid bookings. Closed and Refund due trips stay here if they already have a thread. ${PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}`}
      />
      {olderConversationsHidden ? (
        <NoticeCallout title="Showing your most recent paid bookings" tone="info">
          You have more than {PARTNER_INBOX_MESSAGE_FETCH_CAP} paid bookings, so this Inbox only checks messages for the {PARTNER_INBOX_MESSAGE_FETCH_CAP}
          most recent ones. A closed or cancelled booking older than that won't appear here even if it has a message
          history — open it from Bookings instead.
        </NoticeCallout>
      ) : null}
      {error ? (
        <ErrorState className="py-6" title="Inbox unavailable" body={error} retry={{ onClick: () => void load() }} />
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
      {loading ? (
        <SupplierListSkeleton rows={4} />
      ) : threads.length === 0 ? (
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
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg bg-white ring-1 ring-slate-200/90 overflow-hidden">
          {threads.map((b) => {
            const open = openId === b.id;
            const last = lastByBooking[b.id];
            const unread = last && last.sender_role === 'traveler' && !last.read_by_supplier_at;
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
                  className="partner-row-interact lux-flat w-full text-left px-3.5 py-2.5"
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
                        <p className={`truncate ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                          {b.guest_name?.trim() || 'Traveler'}
                        </p>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted truncate pl-4">{titles[b.listing_id] ?? 'Listing'}</p>
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
                  <p className="mt-0.5 text-xs text-ink-faint pl-4">
                    {b.booking_date
                      ? new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })
                      : 'Date TBC'}
                    {` · ${formatBookingParticipantsLabel(b)}`}
                    {pgTimeToHm(b.start_time) ? ` · ${pgTimeToHm(b.start_time)}` : ''}
                    {last?.created_at
                      ? ` · ${new Date(last.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                      : ''}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted line-clamp-2 pl-4">
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
            subtitle={titles[openBooking.listing_id] ?? 'Listing'}
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
