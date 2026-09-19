import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import {
  fetchBookingMessages,
  fetchCancellationRequestsForBookings,
  bookingAllowsMessaging,
  messagingComposeBlock,
  type BookingMessageRow,
} from '../../data/supabase-booking-ops';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton, SupplierPageHero } from '../../components/supplier/supplierUi';
import NoticeCallout from '../../components/NoticeCallout';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import BookingMessageThread from '../../components/BookingMessageThread';
import { PARTNER_INBOX_MESSAGE_DELIVERY_NOTE } from '../../lib/booking-confirmation-copy';
import { bookingPaymentWasCollected, partnerPaymentLabel } from '../../lib/payment-states';
import { partnerInboxListsBooking } from '../../lib/messaging-authorization';
import StatusChip, { toneForPaymentLabel } from '../../components/StatusChip';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';

/** Message previews are only fetched for the most recent N paid bookings; older
 * closed/cancelled threads beyond this may not show here. See olderConversationsHidden. */
const INBOX_MESSAGE_FETCH_CAP = 80;

export default function SupplierInbox() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [lastByBooking, setLastByBooking] = useState<Record<string, BookingMessageRow>>({});
  const [openCancelIds, setOpenCancelIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olderConversationsHidden, setOlderConversationsHidden] = useState(false);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rows, listings] = await Promise.all([fetchBookingsForSupplier(uid), fetchMyListings(uid)]);
      const collected = rows.filter((b) => bookingPaymentWasCollected(b.payment_status));
      setTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
      const cancels = await fetchCancellationRequestsForBookings(collected.map((b) => b.id));
      const openIds = new Set(cancels.filter((c) => c.status === 'requested').map((c) => c.booking_id));
      setOpenCancelIds(openIds);
      const lasts: Record<string, BookingMessageRow> = {};
      const withMessagesFetched = collected.slice(0, INBOX_MESSAGE_FETCH_CAP);
      setOlderConversationsHidden(collected.length > INBOX_MESSAGE_FETCH_CAP);
      await Promise.all(
        withMessagesFetched.map(async (b) => {
          const msgs = await fetchBookingMessages(b.id);
          if (msgs.length) lasts[b.id] = msgs[msgs.length - 1]!;
        })
      );
      setLastByBooking(lasts);
      setBookings(
        collected.filter((b) =>
          partnerInboxListsBooking(
            {
              status: b.status,
              payment_status: b.payment_status,
              openCancellation: openIds.has(b.id),
            },
            Boolean(lasts[b.id])
          )
        )
      );
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
    const id = new URLSearchParams(window.location.search).get('booking');
    if (id) setOpenId(id);
  }, []);

  const threads = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const ta = lastByBooking[a.id]?.created_at ?? a.created_at;
      const tb = lastByBooking[b.id]?.created_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
  }, [bookings, lastByBooking]);

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Messages"
        title="Inbox"
        description={`Messages about paid bookings. Closed and Refund due trips stay here if they already have a thread. ${PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}`}
      />
      {olderConversationsHidden ? (
        <NoticeCallout title="Showing your most recent paid bookings" tone="info">
          You have more than {INBOX_MESSAGE_FETCH_CAP} paid bookings, so this Inbox only checks messages for the {INBOX_MESSAGE_FETCH_CAP}
          most recent ones. A closed or cancelled booking older than that won't appear here even if it has a message
          history — open it from Bookings instead.
        </NoticeCallout>
      ) : null}
      {error ? (
        <ErrorState className="py-6" title="Inbox unavailable" body={error} retry={{ onClick: () => void load() }} />
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
        <ul className="space-y-3">
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
                className={`overflow-hidden rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06] ${
                  unread
                    ? 'border-l-[3px] border-l-amber-500'
                    : isClosed
                      ? 'border-l-[3px] border-l-slate-400'
                      : 'border-l-[3px] border-l-finland'
                } ${open ? 'ring-finland/25 shadow-soft-lg' : ''} ${unread ? 'ring-amber-200/80' : ''}`}
              >
                <button
                  type="button"
                  className="lux-flat w-full text-left"
                  onClick={() => {
                    const opening = !open;
                    setOpenId(opening ? b.id : null);
                    if (opening) {
                      // Opening a thread fires markBookingMessagesRead (see BookingMessageThread).
                      // Clear the Unread chip locally now so it doesn't wait for a full reload.
                      setLastByBooking((prev) => {
                        const cur = prev[b.id];
                        if (!cur || cur.sender_role !== 'traveler' || cur.read_by_supplier_at) return prev;
                        return { ...prev, [b.id]: { ...cur, read_by_supplier_at: new Date().toISOString() } };
                      });
                    }
                    const url = new URL(window.location.href);
                    if (open) url.searchParams.delete('booking');
                    else url.searchParams.set('booking', b.id);
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{b.guest_name?.trim() || 'Traveler'}</p>
                      <p className="mt-0.5 text-sm text-ink-muted truncate">{titles[b.listing_id] ?? 'Listing'}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[45%]">
                      {unread ? <StatusChip tone="warn">Unread</StatusChip> : null}
                      {showMoneyChip ? (
                        <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                      ) : null}
                      {isClosed ? <StatusChip tone="neutral">Closed</StatusChip> : null}
                      {typeof b.booking_number === 'number' ? (
                        <span className="text-xs font-mono text-finland">#{b.booking_number}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {b.booking_date
                      ? new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })
                      : 'Date TBC'}
                    {` · ${formatBookingParticipantsLabel(b)}`}
                    {last?.created_at
                      ? ` · ${new Date(last.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                      : ''}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted line-clamp-2">
                    {last?.body ?? 'No messages yet — open to write about this booking.'}
                  </p>
                </button>
                {open ? (
                  <div className="mt-4 motion-safe:animate-fade-in">
                    <p className="mb-3 text-sm text-ink">
                      Booking {typeof b.booking_number === 'number' ? `#${b.booking_number}` : ''} ·{' '}
                      {titles[b.listing_id] ?? 'Listing'} · {b.guest_name?.trim() || 'Traveler'} ·{' '}
                      {formatBookingParticipantsLabel(b)}
                    </p>
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
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
