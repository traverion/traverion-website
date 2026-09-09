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
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import BookingMessageThread from '../../components/BookingMessageThread';
import { PARTNER_INBOX_MESSAGE_DELIVERY_NOTE } from '../../lib/booking-confirmation-copy';
import { bookingPaymentWasCollected, partnerPaymentLabel } from '../../lib/payment-states';
import { partnerInboxListsBooking } from '../../lib/messaging-authorization';
import StatusChip, { toneForPaymentLabel } from '../../components/StatusChip';

export default function SupplierInbox() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [lastByBooking, setLastByBooking] = useState<Record<string, BookingMessageRow>>({});
  const [openCancelIds, setOpenCancelIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      await Promise.all(
        collected.slice(0, 80).map(async (b) => {
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
      <header className="pt-2 sm:pt-8 mb-10">
        <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Inbox</h1>
        <p className="mt-2 text-ink-muted max-w-xl">
          Messages about paid bookings. Closed and Refund due trips stay here if they already have a thread.{' '}
          {PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}
        </p>
      </header>
      {error ? (
        <ErrorState className="py-6" title="Inbox unavailable" body={error} retry={{ onClick: () => void load() }} />
      ) : null}
      {loading ? (
        <SupplierListSkeleton rows={4} />
      ) : threads.length === 0 ? (
        <SupplierEmptyState
          icon={MessageSquare}
          title="No booking conversations yet"
          body="When a traveler pays for one of your listings, you can message them here about that booking."
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
            return (
              <li key={b.id} className="border-b border-black/[0.06] pb-4">
                <button
                  type="button"
                  className="lux-flat w-full text-left"
                  onClick={() => {
                    setOpenId(open ? null : b.id);
                    const url = new URL(window.location.href);
                    if (open) url.searchParams.delete('booking');
                    else url.searchParams.set('booking', b.id);
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-ink truncate">
                      {b.guest_name?.trim() || 'Traveler'} · {titles[b.listing_id] ?? 'Listing'}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {unread ? <StatusChip tone="warn">Unread</StatusChip> : null}
                      {showMoneyChip ? (
                        <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                      ) : null}
                      {messagingComposeBlock({
                        status: b.status,
                        payment_status: b.payment_status,
                        openCancellation: openCancelIds.has(b.id),
                      }) === 'closed' ? (
                        <StatusChip tone="neutral">Closed</StatusChip>
                      ) : null}
                      {typeof b.booking_number === 'number' ? (
                        <span className="text-xs text-ink-muted">#{b.booking_number}</span>
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
                      {titles[b.listing_id] ?? 'Listing'} · {b.guest_name?.trim() || 'Traveler'}
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
