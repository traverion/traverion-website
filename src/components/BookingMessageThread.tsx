import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import {
  fetchBookingMessages,
  markBookingMessagesRead,
  notifyNewBookingMessage,
  postBookingMessage,
  type BookingMessageRow,
} from '../data/supabase-booking-ops';
import { userFacingError } from '../lib/userFacingError';
import NoticeCallout from './NoticeCallout';
import {
  PARTNER_INBOX_MESSAGE_DELIVERY_NOTE,
  TRAVELER_BOOKING_THREAD_DELIVERY_NOTE,
  BOOKING_MESSAGE_SUBMIT_ERROR,
  BOOKING_MESSAGE_SUBMIT_ERROR_TITLE,
} from '../lib/booking-confirmation-copy';

type Props = {
  bookingId: string;
  canCompose: boolean;
  composeBlock?: 'unpaid' | 'closed';
  viewerRole: 'traveler' | 'supplier';
  listingTitle: string;
  listingId: string;
  supplierId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  bookingNumber?: number;
  bookingDate?: string | null;
};

function roleLabel(role: string, viewer: 'traveler' | 'supplier'): string {
  if (role === 'system') return 'Traverion';
  if (role === viewer) return 'You';
  if (role === 'traveler') return 'Traveler';
  return 'Host';
}

export default function BookingMessageThread({
  bookingId,
  canCompose,
  composeBlock = 'unpaid',
  viewerRole,
  listingTitle,
  listingId,
  supplierId,
  customerEmail,
  customerName,
  bookingNumber,
  bookingDate,
}: Props) {
  const [rows, setRows] = useState<BookingMessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchBookingMessages(bookingId);
    setRows(list);
    await markBookingMessagesRead(bookingId);
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const res = await postBookingMessage(bookingId, body);
    setSending(false);
    if (!res.ok) {
      setError(userFacingError(res.error, BOOKING_MESSAGE_SUBMIT_ERROR));
      return;
    }
    setDraft('');
    await load();
    void notifyNewBookingMessage({
      fromRole: viewerRole,
      preview: body,
      customerEmail,
      customerName,
      listingTitle,
      bookingId,
      bookingNumber,
      bookingDate,
      supplierId: supplierId ?? '',
      listingId,
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Messages</p>
      {rows.length === 0 ? (
        canCompose ? (
          <div className="rounded-xl bg-paper-raised px-4 py-3.5 ring-1 ring-black/[0.06]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-finland/10">
                <MessageSquare className="h-4 w-4 text-finland" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">No messages yet</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Use this thread for this booking only — contact details stay in Traverion.
                </p>
                <button
                  type="button"
                  className="mt-3 text-xs font-semibold text-finland hover:underline"
                  onClick={() => document.getElementById(`msg-${bookingId}`)?.focus()}
                >
                  Write first message
                </button>
              </div>
            </div>
          </div>
        ) : composeBlock === 'closed' ? (
          <NoticeCallout title="This booking is closed" tone="info">
            Earlier messages stay here for your records.
          </NoticeCallout>
        ) : (
          <NoticeCallout title="Messages unlock after payment" tone="info">
            Messages appear here after a paid booking.
          </NoticeCallout>
        )
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {rows.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.sender_role === 'system'
                  ? 'bg-black/[0.04] text-ink-muted'
                  : m.sender_role === viewerRole
                    ? 'bg-finland/10 text-ink'
                    : 'bg-paper-raised ring-1 ring-black/[0.06] text-ink'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {roleLabel(m.sender_role, viewerRole)}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </p>
              <p className="mt-1 leading-relaxed whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <NoticeCallout title={BOOKING_MESSAGE_SUBMIT_ERROR_TITLE} tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      {canCompose ? (
        <div>
          <label htmlFor={`msg-${bookingId}`} className="sr-only">
            Message about this booking
          </label>
          <textarea
            id={`msg-${bookingId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Write a message about this booking"
            className="tv-input min-h-[5.5rem]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="tv-btn-secondary mt-2"
          >
            {sending ? 'Posting…' : 'Post message'}
          </button>
          {viewerRole === 'supplier' ? (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">{PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}</p>
          ) : (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">{TRAVELER_BOOKING_THREAD_DELIVERY_NOTE}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-faint">
          {composeBlock === 'closed'
            ? 'This booking is closed. You can still read earlier messages.'
            : 'Chat is limited to paid bookings you are part of.'}
        </p>
      )}
    </div>
  );
}
