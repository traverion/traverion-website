import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
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
  /** Phase 1752: `role` = finance/viewer can read host chat but cannot post. */
  composeBlock?: 'unpaid' | 'closed' | 'role';
  viewerRole: 'traveler' | 'supplier';
  listingTitle: string;
  listingId: string;
  supplierId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  bookingNumber?: number;
  bookingDate?: string | null;
  /** Fires only after mark_booking_messages_read succeeds (Phase 1500). */
  onMarkedRead?: () => void;
  /** Focus the composer after the thread loads. */
  autoFocus?: boolean;
  /** Supplier Inbox fills the conversation column. Traveler Trips keeps the stacked thread. */
  layout?: 'stack' | 'panel';
};

function stampInboundMessagesRead(
  rows: BookingMessageRow[],
  viewerRole: 'traveler' | 'supplier'
): BookingMessageRow[] {
  const now = new Date().toISOString();
  return rows.map((m) => {
    if (viewerRole === 'supplier') {
      if (m.sender_role !== 'traveler' || m.read_by_supplier_at) return m;
      return { ...m, read_by_supplier_at: now };
    }
    if (m.sender_role === 'traveler' || m.read_by_traveler_at) return m;
    return { ...m, read_by_traveler_at: now };
  });
}

const panelDrafts = new Map<string, string>();

const LINK_RE = /https?:\/\/[^\s<>"']+/g;

function MessageText({ text, mine }: { text: string; mine: boolean }) {
  const parts: Array<string | { href: string }> = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ href: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <p className="whitespace-pre-wrap break-words leading-snug [overflow-wrap:anywhere]">
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <span key={index}>{part}</span>
        ) : (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className={mine ? 'underline decoration-white/70' : 'underline text-finland'}
          >
            {part.href}
          </a>
        )
      )}
    </p>
  );
}

function roleLabel(role: string, viewer: 'traveler' | 'supplier'): string {
  if (role === 'system') return 'Traverion';
  if (role === viewer) return 'You';
  if (role === 'traveler') return 'Traveler';
  return viewer === 'traveler' ? 'Operator' : 'Supplier';
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
  onMarkedRead,
  autoFocus = false,
  layout = 'stack',
}: Props) {
  const [rows, setRows] = useState<BookingMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Phase 1859: RPC ok but email notify failed — warn, not submit failure. */
  const [notifyWarning, setNotifyWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const loadGenRef = useRef(0);
  const sendingRef = useRef(false);
  const logRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const gen = ++loadGenRef.current;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
      setMarkReadError(null);
    }
    try {
      const list = await fetchBookingMessages(bookingId);
      if (gen !== loadGenRef.current) return;
      setRows(list);
    } catch (e) {
      if (gen !== loadGenRef.current || silent) return;
      // Phase 1340: keep prior thread visible — load failure ≠ empty conversation.
      setLoadError(userFacingError(e, 'We could not load messages. Check your connection and try again.'));
      return;
    } finally {
      if (!silent && gen === loadGenRef.current) setLoading(false);
    }
    // Phase 1767: finance/viewer composeBlock=role — RPC no-ops but returns ok; do not clear Unread locally.
    if (composeBlock === 'role') {
      return;
    }
    const marked = await markBookingMessagesRead(bookingId);
    if (gen !== loadGenRef.current) return;
    if (!marked.ok) {
      // Phase 1500: load success ≠ read — do not clear Unread until RPC ok.
      setMarkReadError(userFacingError(marked.error, 'We could not mark messages as read. Try again.'));
      return;
    }
    onMarkedRead?.();
    setRows((prev) => stampInboundMessagesRead(prev, viewerRole));
  }, [bookingId, composeBlock, onMarkedRead, viewerRole]);

  useEffect(() => {
    stickToBottomRef.current = true;
    setRows([]);
    setDraft(layout === 'panel' ? panelDrafts.get(bookingId) ?? '' : '');
    setError(null);
    setLoadError(null);
    void load();
  }, [load, layout, bookingId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || sendingRef.current) return;
      void load({ silent: true });
    }, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows]);

  useEffect(() => {
    if (!autoFocus || loading || !canCompose) return;
    document.getElementById(`msg-${bookingId}`)?.focus();
  }, [autoFocus, loading, canCompose, bookingId]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setNotifyWarning(null);
    const res = await postBookingMessage(bookingId, body);
    sendingRef.current = false;
    setSending(false);
    if (!res.ok) {
      setError(userFacingError(res.error, BOOKING_MESSAGE_SUBMIT_ERROR));
      return;
    }
    setDraft('');
    if (layout === 'panel') panelDrafts.delete(bookingId);
    stickToBottomRef.current = true;
    await load();
    // Phase 1859: message RPC already succeeded — soft-warn if email notify fails.
    const notify = await notifyNewBookingMessage({
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
    if (!notify.sent && !notify.skipped) {
      setNotifyWarning(
        notify.error?.trim()
          ? notify.error
          : 'Message saved, but email notification may not have been sent. It remains on this booking in Traverion.'
      );
    }
  };

  const panel = layout === 'panel';

  useEffect(() => {
    if (!panel) return;
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft, panel, canCompose, loading, loadError]);

  if (panel) {
    const nearLimit = draft.length >= 3800;
    return (
      <div className="tv-chat">
        <h2 className="sr-only">Messages</h2>
        {loadError ? (
          <NoticeCallout title="Messages unavailable" tone="warn">
            <p className="text-sm text-ink-muted">{loadError}</p>
            <button type="button" className="mt-2 text-xs font-semibold text-finland hover:underline" onClick={() => void load()}>
              Try again
            </button>
          </NoticeCallout>
        ) : null}
        {markReadError ? (
          <NoticeCallout title="Still marked unread" tone="warn">
            <p className="text-sm text-ink-muted">{markReadError}</p>
            <button type="button" className="mt-2 text-xs font-semibold text-finland hover:underline" onClick={() => void load()}>
              Try again
            </button>
          </NoticeCallout>
        ) : null}
        <div
          ref={(node) => {
            logRef.current = node;
          }}
          className="tv-chat__log"
          aria-busy={loading && rows.length === 0 ? true : undefined}
          onScroll={() => {
            const el = logRef.current;
            if (!el) return;
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {loading && rows.length === 0 ? (
            <p className="text-sm text-ink-muted">Loading messages…</p>
          ) : rows.length === 0 && !loadError ? (
            <div className="tv-chat__empty">
              <MessageSquare className="h-5 w-5 text-finland" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-ink">No messages yet</p>
              {canCompose ? <p className="mt-0.5 text-sm text-ink-muted">Send a message to your traveler.</p> : null}
            </div>
          ) : (
            rows.map((m, index) => {
              const day = new Date(m.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const prev = index > 0 ? rows[index - 1] : null;
              const prevDay = prev
                ? new Date(prev.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '';
              const mine = m.sender_role === viewerRole;
              const grouped =
                prev != null &&
                prev.sender_role === m.sender_role &&
                day === prevDay &&
                Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 8 * 60 * 1000;
              const tone =
                m.sender_role === 'system' ? 'system' : mine ? 'mine' : 'theirs';
              return (
                <div key={m.id} className={grouped ? 'tv-chat__item tv-chat__item--grouped' : 'tv-chat__item'}>
                  {day !== prevDay ? <p className="tv-msg-day">{day}</p> : null}
                  <div className={`tv-chat__bubble tv-chat__bubble--${tone}`}>
                    <MessageText text={m.body} mine={tone === 'mine'} />
                    <time dateTime={m.created_at} className="tv-chat__time">
                      {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {error ? (
          <div className="tv-chat__alert" role="alert">
            <p>{error}</p>
            <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()}>
              Retry
            </button>
          </div>
        ) : null}
        {notifyWarning ? <p className="tv-chat__note">{notifyWarning}</p> : null}
        {canCompose && !loadError && !loading ? (
          <form
            className="tv-chat__composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sendingRef.current && draft.trim()) void send();
            }}
          >
            <label htmlFor={`msg-${bookingId}`} className="sr-only">
              Message about this booking
            </label>
            <textarea
              ref={composerRef}
              id={`msg-${bookingId}`}
              value={draft}
              rows={1}
              maxLength={4000}
              placeholder="Write a message..."
              className="tv-chat__input"
              onChange={(e) => {
                setDraft(e.target.value);
                panelDrafts.set(bookingId, e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                if (!sendingRef.current && draft.trim()) void send();
              }}
            />
            <button
              type="submit"
              className="tv-chat__send"
              aria-label="Send message"
              disabled={sending || !draft.trim()}
            >
              {sending ? <span className="tv-chat__send-dot" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </button>
            {nearLimit ? (
              <p className="tv-chat__limit">{4000 - draft.length} characters left</p>
            ) : null}
            <p className="sr-only">{viewerRole === 'supplier' ? PARTNER_INBOX_MESSAGE_DELIVERY_NOTE : TRAVELER_BOOKING_THREAD_DELIVERY_NOTE}</p>
          </form>
        ) : canCompose && loadError ? (
          <p className="tv-chat__note">Reload messages to continue this conversation.</p>
        ) : !canCompose ? (
          <p className="tv-chat__note">
            {composeBlock === 'closed'
              ? 'This booking is closed. You can still read earlier messages.'
              : composeBlock === 'role'
                ? 'Your role can read booking messages but cannot send them.'
                : 'Chat is limited to paid bookings you are part of.'}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={panel ? 'flex min-h-0 flex-1 flex-col' : 'space-y-3'}>
      <h2 className={panel ? 'sr-only' : 'text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint m-0'}>
        Messages
      </h2>
      {loadError ? (
        <NoticeCallout title="Messages unavailable" tone="warn">
          <p className="text-sm text-ink-muted">{loadError}</p>
          <button type="button" className="mt-2 text-xs font-semibold text-finland hover:underline" onClick={() => void load()}>
            Try again
          </button>
        </NoticeCallout>
      ) : null}
      {markReadError ? (
        <NoticeCallout title="Still marked unread" tone="warn">
          <p className="text-sm text-ink-muted">{markReadError}</p>
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
                  // Phase 1626: real tap target — match other empty-state CTAs on mobile.
                  className="tv-btn-secondary mt-3 min-h-11"
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
        ) : composeBlock === 'role' ? (
          <NoticeCallout title="Read-only for your role" tone="info">
            Your role can read booking messages but cannot send them. Ask an owner, manager, or ops
            teammate.
          </NoticeCallout>
        ) : (
          <NoticeCallout title="Messages unlock after payment" tone="info">
            Messages appear here after a paid booking.
          </NoticeCallout>
        )
      ) : rows.length > 0 ? (
        <ul
          ref={(node) => {
            logRef.current = node;
          }}
          className={`space-y-2.5 overflow-y-auto pr-0.5 ${panel ? 'tv-msg-log tv-msg-log--panel min-h-0 flex-1' : 'max-h-72'}`}
          onScroll={() => {
            const el = logRef.current;
            if (!el) return;
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {rows.map((m, index) => {
            const day = new Date(m.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const prev = index > 0 ? rows[index - 1] : null;
            const prevDay = prev
              ? new Date(prev.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            return (
            <li key={m.id} className="tv-msg-row">
              {day !== prevDay ? (
                <p className="tv-msg-day">{day}</p>
              ) : null}
            <div
              className={`tv-msg-bubble ${
                m.sender_role === 'system'
                  ? 'tv-msg-bubble--system'
                  : m.sender_role === viewerRole
                    ? 'tv-msg-bubble--mine'
                    : 'tv-msg-bubble--theirs'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {roleLabel(m.sender_role, viewerRole)}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </p>
              <p className="mt-1.5 leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{m.body}</p>
            </div>
            </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <NoticeCallout title={BOOKING_MESSAGE_SUBMIT_ERROR_TITLE} tone="danger">
          <p>{error}</p>
          <button
            type="button"
            className="tv-btn-secondary mt-2"
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
          >
            Retry
          </button>
        </NoticeCallout>
      ) : null}
      {notifyWarning ? (
        <NoticeCallout title="Message saved" tone="warn">
          <p className="text-sm text-ink-muted">{notifyWarning}</p>
        </NoticeCallout>
      ) : null}
      {canCompose && !loadError && !loading ? (
        <div className={`tv-msg-composer shrink-0 ${panel ? 'mt-2' : ''}`}>
          <label htmlFor={`msg-${bookingId}`} className="sr-only">
            Message about this booking
          </label>
          <textarea
            id={`msg-${bookingId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={panel ? 2 : 3}
            maxLength={4000}
            placeholder="Write a message about this booking"
            className={`tv-input border-0 bg-transparent shadow-none focus:ring-0 ${panel ? 'min-h-[2.75rem]' : 'min-h-[5.5rem]'}`}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              if (!sendingRef.current && draft.trim()) void send();
            }}
            aria-describedby={`msg-hint-${bookingId}`}
          />
          {/* Phase 1671: calm 4000-char limit hint while composing. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p id={`msg-hint-${bookingId}`} className="text-xs text-ink-faint">
              Up to 4000 characters
              {draft.length > 0 ? ` · ${draft.length} used` : ''}.
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              className="tv-btn-primary min-h-11 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
          {viewerRole === 'supplier' ? (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">{PARTNER_INBOX_MESSAGE_DELIVERY_NOTE}</p>
          ) : (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">{TRAVELER_BOOKING_THREAD_DELIVERY_NOTE}</p>
          )}
        </div>
      ) : canCompose && loadError ? (
        <p className="text-xs text-ink-faint">Reload messages to continue this conversation.</p>
      ) : !canCompose ? (
        <p className="text-xs text-ink-faint">
          {composeBlock === 'closed'
            ? 'This booking is closed. You can still read earlier messages.'
            : composeBlock === 'role'
              ? 'Your role can read booking messages but cannot send them.'
              : 'Chat is limited to paid bookings you are part of.'}
        </p>
      ) : null}
    </div>
  );
}
