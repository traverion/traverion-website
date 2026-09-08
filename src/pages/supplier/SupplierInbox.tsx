import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import {
  fetchBookingMessages,
  fetchCancellationRequestsForBookings,
  bookingAllowsMessaging,
  type BookingMessageRow,
} from '../../data/supabase-booking-ops';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import BookingMessageThread from '../../components/BookingMessageThread';
import { isPaidPaymentStatus } from '../../lib/payment-states';
import StatusChip from '../../components/StatusChip';

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
      const paid = rows.filter((b) => isPaidPaymentStatus(b.payment_status));
      setBookings(paid);
      setTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
      const cancels = await fetchCancellationRequestsForBookings(paid.map((b) => b.id));
      setOpenCancelIds(new Set(cancels.filter((c) => c.status === 'requested').map((c) => c.booking_id)));
      const lasts: Record<string, BookingMessageRow> = {};
      await Promise.all(
        paid.slice(0, 40).map(async (b) => {
          const msgs = await fetchBookingMessages(b.id);
          if (msgs.length) lasts[b.id] = msgs[msgs.length - 1]!;
        })
      );
      setLastByBooking(lasts);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.bookings));
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

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
          Messages about paid bookings. Travelers cannot contact you before they book.
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
            return (
              <li key={b.id} className="border-b border-black/[0.06] pb-4">
                <button type="button" className="lux-flat w-full text-left" onClick={() => setOpenId(open ? null : b.id)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-ink truncate">
                      {b.guest_name?.trim() || 'Traveler'} · {titles[b.listing_id] ?? 'Listing'}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {unread ? <StatusChip tone="warn">Unread</StatusChip> : null}
                      {typeof b.booking_number === 'number' ? (
                        <span className="text-xs text-ink-muted">#{b.booking_number}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted line-clamp-2">
                    {last?.body ?? 'No messages yet — open to write about this booking.'}
                  </p>
                </button>
                {open ? (
                  <div className="mt-4 motion-safe:animate-fade-in">
                    <BookingMessageThread
                      bookingId={b.id}
                      canCompose={bookingAllowsMessaging({
                        status: b.status,
                        payment_status: b.payment_status,
                        openCancellation: openCancelIds.has(b.id),
                      })}
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
