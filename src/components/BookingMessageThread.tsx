import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchBookingMessages(bookingId);
      if (gen !== loadGenRef.current) return;
      setRows(list);
      await markBookingMessagesRead(bookingId);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Phase 1340: keep prior thread visible — load failure ≠ empty conversation.
      setLoadError(userFacingError(e, 'We could not load messages. Check your connection and try again.'));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    setRows([]);
    setDraft('');
    setError(null);
    setLoadError(null);
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
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint m-0">Messages</h2>
      {loadError ? (
        <NoticeCallout title="Messages unavailable" tone="warn">
          <p className="text-sm text-ink-muted">{loadError}</p>
          <button type="button" className="mt-2 text-xs font-semibold text-finland hover:underline" onClick={() => void load()}>
            Try again
          </button>
        </NoticeCallout>
      ) : null}
      {loading && rows.length === 0 ? (
        <p className="text-sm text-ink-muted" aria-busy="true">
          Loading messages…
        </p>
      ) : rows.length === 0 && !loadError ? (
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
      ) : rows.length > 0 ? (
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
              <p className="mt-1 leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <NoticeCallout title={BOOKING_MESSAGE_SUBMIT_ERROR_TITLE} tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      {canCompose && !loadError ? (
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
      ) : canCompose && loadError ? (
        <p className="text-xs text-ink-faint">Reload messages to continue this conversation.</p>
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
