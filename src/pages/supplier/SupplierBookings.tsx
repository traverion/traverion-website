import { useState, useEffect, useCallback, useMemo } from 'react';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import {
  Calendar,
  RefreshCw,
  CheckCircle,
  MessageCircle,
  Trash2,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Tag,
  Users,
  ShoppingCart,
} from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchBookingsForSupplier,
  updateBookingStatus,
  acknowledgeBooking,
  batchCancelBookings,
  type BookingRow,
} from '../../data/supabase-bookings';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierBookingOpsNotes,
  upsertSupplierBookingOpsNote,
  deleteSupplierBookingOpsNote,
} from '../../data/supabase-booking-ops-notes';
import {
  fetchSupplierBookingEvents,
  insertSupplierBookingEvent,
  fetchSupplierBookingMessages,
  insertSupplierBookingMessage,
  updateSupplierBookingMessageDelivery,
} from '../../data/supabase-booking-events';
import { sendSupplierEmailViaEdge } from '../../data/supabase-supplier-messaging';
import {
  fetchSupplierBookingVouchers,
  insertSupplierBookingVouchers,
  redeemSupplierBookingVoucherByCode,
  expireSupplierBookingVouchers,
  updateSupplierBookingVoucherStatus,
} from '../../data/supabase-booking-vouchers';
import {
  fetchSupplierMessageCampaigns,
  fetchSupplierExportRuns,
  insertSupplierMessageCampaign,
  updateSupplierMessageCampaignStatus,
  insertSupplierExportRun,
} from '../../data/supabase-supplier-campaigns-exports';

const CANCELLATION_REASONS = [
  { id: 'customer_request', label: 'Customer requested cancellation' },
  { id: 'force_majeure', label: 'Force majeure' },
  { id: 'operational', label: 'Operational reasons' },
];

const REFUND_CHOICES = [
  { id: 'full_refund', label: 'Full refund' },
  { id: 'no_refund', label: 'No refund' },
  { id: 'reschedule', label: 'Offer reschedule' },
];

const COMM_LOG_KEY = 'traverion_supplier_comm_log';
const BOOKING_AUDIT_KEY = 'traverion_supplier_booking_audit';
const VOUCHER_LOG_KEY = 'traverion_supplier_voucher_log';
const REMINDER_SETTINGS_KEY = 'traverion_supplier_reminder_settings';
const REMINDER_SENT_KEY = 'traverion_supplier_reminder_sent';
const MESSAGE_TEMPLATES = [
  {
    id: 'welcome',
    label: 'Welcome + what to bring',
    subject: 'Your upcoming booking - important details',
    body:
      'Hi {{guest}},\n\nThanks for booking {{listing}}. We look forward to hosting you on {{date}}.\nPlease arrive 10 minutes early and bring comfortable shoes + water.\n\nBest regards,\nSupplier team',
  },
  {
    id: 'meeting',
    label: 'Meeting point reminder',
    subject: 'Reminder: meeting point details for your booking',
    body:
      'Hi {{guest}},\n\nQuick reminder for {{listing}} on {{date}}.\nMeeting point: {{meeting}}\nIf you have trouble finding us, reply to this email.\n\nBest,\nSupplier team',
  },
  {
    id: 'pending',
    label: 'Pending booking follow-up',
    subject: 'Booking status update',
    body:
      'Hi {{guest}},\n\nYour booking for {{listing}} is currently pending confirmation. We will confirm shortly.\nThank you for your patience.\n\nBest regards,\nSupplier team',
  },
] as const;

type CommunicationLogEntry = {
  id: string;
  createdAt: string;
  subject: string;
  recipients: string[];
  bookingIds: string[];
  deliveryStatus?: 'queued' | 'sent' | 'failed';
  errorMessage?: string;
};

type BookingAuditEntry = {
  id: string;
  bookingId: string;
  at: string;
  action: 'booking_created' | 'acknowledged' | 'status_confirmed' | 'status_cancelled' | 'note';
  details?: string;
};

type BookingOpsNote = {
  bookingId: string;
  note: string;
  updatedAt: string;
  pendingSync: boolean;
};

type VoucherEntry = {
  id: string;
  bookingId: string;
  listingId: string;
  code: string;
  guestEmail?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  status: 'active' | 'redeemed' | 'expired';
  createdAt: string;
  expiresAt?: string;
  notes?: string;
};

type CampaignHistoryEntry = {
  id: string;
  subject: string;
  scope: 'selected' | 'filtered';
  recipientsCount: number;
  sentCount: number;
  failedCount: number;
  status: 'queued' | 'sent' | 'failed' | 'partial';
  createdAt: string;
};

type ExportHistoryEntry = {
  id: string;
  kind: 'bookings' | 'ops_summary';
  format: 'csv' | 'json';
  scope: 'filtered' | 'selected';
  rowCount: number;
  dateFrom?: string;
  dateTo?: string;
  createdAt: string;
};

type ReminderSettings = {
  enabled: boolean;
  daysBefore: 1 | 2;
  templateId: (typeof MESSAGE_TEMPLATES)[number]['id'];
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
};

type ReminderRunEntry = {
  id: string;
  createdAt: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  mode: 'manual' | 'auto';
};

const OPS_NOTES_KEY = 'traverion_supplier_ops_notes';
const BOOKINGS_PAGE_SIZE = 10;

/** Compact page list: e.g. 1 … 4 5 6 … 20 — not every page at once. */
function bookingPaginationRange(totalPages: number, current: number): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const want = new Set([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...want].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i - 1] + 1 < sorted[i]) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

function bookingPurchaseDateLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatActivityDateLong(bookingDate: string | null, startHm: string | null): string {
  if (!bookingDate) return '—';
  const d = new Date(bookingDate);
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  if (!startHm) return dateStr;
  return `${dateStr} · ${startHm}`;
}

function formatPurchaseDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function SupplierBookings() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState<string>('');
  const [batchModal, setBatchModal] = useState(false);
  const [batchListingId, setBatchListingId] = useState('');
  const [batchDateFrom, setBatchDateFrom] = useState('');
  const [batchDateTo, setBatchDateTo] = useState('');
  const [batchReason, setBatchReason] = useState('');
  const [batchRefund, setBatchRefund] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [view, setView] = useState<'all' | 'pending' | 'needs_ack' | 'upcoming' | 'cancelled'>('all');
  const [filterListingId, setFilterListingId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPurchaseDateFrom, setFilterPurchaseDateFrom] = useState('');
  const [filterPurchaseDateTo, setFilterPurchaseDateTo] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  /** 1-based page index for the main bookings list (after filters). */
  const [bookingsListPage, setBookingsListPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCancelModal, setBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [bulkCancelRefund, setBulkCancelRefund] = useState('');
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<(typeof MESSAGE_TEMPLATES)[number]['id']>(MESSAGE_TEMPLATES[0].id);
  const [commSubject, setCommSubject] = useState('');
  const [commBody, setCommBody] = useState('');
  const [commLog, setCommLog] = useState<CommunicationLogEntry[]>([]);
  const [sendingComm, setSendingComm] = useState(false);
  const [quickMessageBookingId, setQuickMessageBookingId] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignScope, setCampaignScope] = useState<'selected' | 'filtered'>('selected');
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistoryEntry[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyCampaignStatus, setHistoryCampaignStatus] = useState<'all' | CampaignHistoryEntry['status']>('all');
  const [historyExportKind, setHistoryExportKind] = useState<'all' | ExportHistoryEntry['kind']>('all');
  const [historyDateRange, setHistoryDateRange] = useState<'all' | '7d' | '30d' | '90d' | 'custom'>('30d');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({
    enabled: false,
    daysBefore: 1,
    templateId: 'meeting',
    quietHoursEnabled: true,
    quietStartHour: 22,
    quietEndHour: 7,
  });
  const [reminderSentKeys, setReminderSentKeys] = useState<string[]>([]);
  const [reminderRuns, setReminderRuns] = useState<ReminderRunEntry[]>([]);
  const [runningReminders, setRunningReminders] = useState(false);
  const [voucherLog, setVoucherLog] = useState<VoucherEntry[]>([]);
  const [voucherDiscountType, setVoucherDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [voucherDiscountValue, setVoucherDiscountValue] = useState('10');
  const [voucherExpiresAt, setVoucherExpiresAt] = useState('');
  const [voucherNotes, setVoucherNotes] = useState('');
  const [voucherRedeemCode, setVoucherRedeemCode] = useState('');
  const [voucherRedeeming, setVoucherRedeeming] = useState(false);
  const [voucherRedeemResult, setVoucherRedeemResult] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<BookingAuditEntry[]>([]);
  const [timelineBookingId, setTimelineBookingId] = useState<string | null>(null);
  const [opsNotes, setOpsNotes] = useState<Record<string, BookingOpsNote>>({});
  const [bookingDetailsOpen, setBookingDetailsOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const applyTemplateTokens = useCallback(
    (templateBody: string, sample?: BookingRow) => {
      const listing = sample ? listingTitles[sample.listing_id] ?? 'your booking' : 'your booking';
      const guest = sample?.guest_name || 'traveler';
      const date = sample?.booking_date ? new Date(sample.booking_date).toLocaleDateString() : 'your booking date';
      const meeting = sample ? sample.special_requests || 'see your booking details' : 'see your booking details';
      return templateBody
        .split('{{guest}}').join(guest)
        .split('{{listing}}').join(listing)
        .split('{{date}}').join(date)
        .split('{{meeting}}').join(meeting);
    },
    [listingTitles]
  );

  const parseCampaignStatus = useCallback((status: string): CampaignHistoryEntry['status'] => {
    if (status === 'queued' || status === 'sent' || status === 'failed' || status === 'partial') return status;
    return 'queued';
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
      const [bookingsList, listings] = await Promise.all([
        fetchBookingsForSupplier(uid),
        fetchMyListings(uid),
      ]);
      setBookings(bookingsList);
      const titles: Record<string, string> = {};
      listings.forEach((l) => { titles[l.id] = l.title; });
      setListingTitles(titles);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const syncFromUrl = () => {
      const id = new URLSearchParams(window.location.search).get('booking');
      setHighlightBookingId(id && id.length > 0 ? id : null);
      if (id) setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    if (!highlightBookingId) return;
    setBookingDetailsOpen((prev) => ({ ...prev, [highlightBookingId]: true }));
  }, [highlightBookingId]);

  useEffect(() => {
    const syncOpsNotesFromServer = async () => {
      const uid = user?.id;
      if (!isSupabase || !uid || bookings.length === 0) return;
      const ids = bookings.map((b) => b.id);
      const remote = await fetchSupplierBookingOpsNotes(uid, ids);
      setOpsNotes((prev) => {
        const merged = { ...prev };
        Object.entries(remote).forEach(([bookingId, r]) => {
          const local = merged[bookingId];
          if (!local || (!local.pendingSync && new Date(r.updatedAt).getTime() >= new Date(local.updatedAt).getTime())) {
            merged[bookingId] = {
              bookingId,
              note: r.note,
              updatedAt: r.updatedAt,
              pendingSync: false,
            };
          }
        });
        localStorage.setItem(OPS_NOTES_KEY, JSON.stringify(merged));
        return merged;
      });
    };
    syncOpsNotesFromServer();
  }, [isSupabase, user?.id, bookings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPS_NOTES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, BookingOpsNote>;
      if (parsed && typeof parsed === 'object') setOpsNotes(parsed);
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMM_LOG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CommunicationLogEntry[];
      if (Array.isArray(parsed)) setCommLog(parsed.slice(0, 20));
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(COMM_LOG_KEY, JSON.stringify(commLog.slice(0, 20)));
  }, [commLog]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOUCHER_LOG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as VoucherEntry[];
      if (Array.isArray(parsed)) setVoucherLog(parsed.slice(0, 200));
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VOUCHER_LOG_KEY, JSON.stringify(voucherLog.slice(0, 200)));
  }, [voucherLog]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMINDER_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
      if (!parsed || typeof parsed !== 'object') return;
      setReminderSettings((prev) => ({
        ...prev,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : prev.enabled,
        daysBefore: parsed.daysBefore === 2 ? 2 : 1,
        templateId: parsed.templateId && MESSAGE_TEMPLATES.some((t) => t.id === parsed.templateId)
          ? parsed.templateId
          : prev.templateId,
        quietHoursEnabled:
          typeof parsed.quietHoursEnabled === 'boolean'
            ? parsed.quietHoursEnabled
            : prev.quietHoursEnabled,
        quietStartHour:
          typeof parsed.quietStartHour === 'number' ? Math.min(23, Math.max(0, parsed.quietStartHour)) : prev.quietStartHour,
        quietEndHour:
          typeof parsed.quietEndHour === 'number' ? Math.min(23, Math.max(0, parsed.quietEndHour)) : prev.quietEndHour,
      }));
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(reminderSettings));
  }, [reminderSettings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMINDER_SENT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) setReminderSentKeys(parsed.slice(0, 1000));
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(reminderSentKeys.slice(0, 1000)));
  }, [reminderSentKeys]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOKING_AUDIT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BookingAuditEntry[];
      if (Array.isArray(parsed)) setAuditLog(parsed.slice(0, 500));
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    const loadServerEvents = async () => {
      const uid = user?.id;
      if (!isSupabase || !uid || bookings.length === 0) return;
      const ids = bookings.map((b) => b.id);
      const rows = await fetchSupplierBookingEvents(uid, ids);
      if (rows.length === 0) return;
      const mapped: BookingAuditEntry[] = rows.map((r) => ({
        id: r.id,
        bookingId: r.booking_id,
        at: r.created_at,
        action: r.event_type,
        details: r.details ?? undefined,
      }));
      setAuditLog((prev) => {
        const byId = new Map<string, BookingAuditEntry>();
        [...mapped, ...prev].forEach((e) => byId.set(e.id, e));
        const merged = [...byId.values()]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 500);
        localStorage.setItem(BOOKING_AUDIT_KEY, JSON.stringify(merged));
        return merged;
      });
    };
    loadServerEvents();
  }, [isSupabase, user?.id, bookings]);

  useEffect(() => {
    const loadServerMessages = async () => {
      const uid = user?.id;
      if (!isSupabase || !uid) return;
      const rows = await fetchSupplierBookingMessages(uid);
      if (rows.length === 0) return;
      const mapped: CommunicationLogEntry[] = rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        subject: r.subject,
        recipients: r.recipients ?? [],
        bookingIds: r.booking_ids ?? [],
        deliveryStatus: r.delivery_status ?? 'queued',
        errorMessage: r.error_message ?? undefined,
      }));
      setCommLog(mapped.slice(0, 20));
      localStorage.setItem(COMM_LOG_KEY, JSON.stringify(mapped.slice(0, 20)));
    };
    loadServerMessages();
  }, [isSupabase, user?.id, parseCampaignStatus]);

  useEffect(() => {
    const loadServerVouchers = async () => {
      const uid = user?.id;
      if (!isSupabase || !uid) return;
      const rows = await fetchSupplierBookingVouchers(uid);
      if (rows.length === 0) return;
      const mapped: VoucherEntry[] = rows.map((r) => ({
        id: r.id,
        bookingId: r.booking_id,
        listingId: r.listing_id,
        code: r.code,
        guestEmail: r.guest_email ?? undefined,
        discountType: r.discount_type,
        discountValue: Number(r.discount_value),
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at ?? undefined,
        notes: r.notes ?? undefined,
      }));
      setVoucherLog(mapped.slice(0, 200));
      localStorage.setItem(VOUCHER_LOG_KEY, JSON.stringify(mapped.slice(0, 200)));
    };
    loadServerVouchers();
  }, [isSupabase, user?.id, parseCampaignStatus]);

  useEffect(() => {
    const loadServerHistory = async () => {
      const uid = user?.id;
      if (!isSupabase || !uid) return;
      const [campaigns, exports] = await Promise.all([
        fetchSupplierMessageCampaigns(uid),
        fetchSupplierExportRuns(uid),
      ]);
      setCampaignHistory(
        campaigns.map((c) => ({
          id: c.id,
          subject: c.subject,
          scope: c.scope,
          recipientsCount: c.recipients_count,
          sentCount: c.sent_count,
          failedCount: c.failed_count,
          status: parseCampaignStatus(c.status),
          createdAt: c.created_at,
        }))
      );
      setExportHistory(
        exports.map((r) => ({
          id: r.id,
          kind: r.kind,
          format: r.format,
          scope: r.scope,
          rowCount: r.row_count,
          dateFrom: r.date_from ?? undefined,
          dateTo: r.date_to ?? undefined,
          createdAt: r.created_at,
        }))
      );
    };
    loadServerHistory();
  }, [isSupabase, user?.id, parseCampaignStatus]);

  const pushAudit = useCallback((entry: Omit<BookingAuditEntry, 'id' | 'at'>) => {
    const next: BookingAuditEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    };
    setAuditLog((prev) => {
      const combined = [next, ...prev].slice(0, 500);
      localStorage.setItem(BOOKING_AUDIT_KEY, JSON.stringify(combined));
      return combined;
    });
    const uid = user?.id;
    if (isSupabase && uid) {
      void insertSupplierBookingEvent({
        supplierId: uid,
        actorId: uid,
        bookingId: entry.bookingId,
        eventType: entry.action,
        details: entry.details,
      });
    }
  }, [isSupabase, user?.id]);

  const handleStatusChange = async (booking: BookingRow, status: 'pending' | 'confirmed' | 'cancelled', options?: { cancellation_reason?: string; refund_choice?: 'full_refund' | 'no_refund' | 'reschedule' }) => {
    if (!canEditBookings) return;
    setUpdatingId(booking.id);
    const previousStatus = booking.status;
    const ok = await updateBookingStatus(booking.id, status, options);
    if (ok) {
      if (status === 'cancelled' && previousStatus === 'confirmed' && booking.booking_date) {
        await decrementAvailabilityBooked(booking.listing_id, booking.booking_date);
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status, cancelled_at: status === 'cancelled' ? new Date().toISOString() : null, cancellation_reason: options?.cancellation_reason ?? b.cancellation_reason, refund_choice: options?.refund_choice ?? b.refund_choice } : b))
      );
      if (status === 'confirmed') {
        pushAudit({ bookingId: booking.id, action: 'status_confirmed' });
      } else if (status === 'cancelled') {
        const details = [
          options?.cancellation_reason ? `reason: ${options.cancellation_reason}` : '',
          options?.refund_choice ? `refund: ${options.refund_choice}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        pushAudit({ bookingId: booking.id, action: 'status_cancelled', details: details || undefined });
      }
      setCancelModal(null);
      setCancelReason('');
      setCancelRefund('');
    }
    setUpdatingId(null);
  };

  const handleAcknowledge = async (booking: BookingRow) => {
    if (!canEditBookings) return;
    setUpdatingId(booking.id);
    const ok = await acknowledgeBooking(booking.id);
    if (ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, acknowledged_at: new Date().toISOString() } : b))
      );
      pushAudit({ bookingId: booking.id, action: 'acknowledged' });
    }
    setUpdatingId(null);
  };

  const handleBatchCancel = async () => {
    if (!canEditBookings) return;
    if (!user || !batchListingId || !batchDateFrom || !batchDateTo || !batchReason) return;
    setBatchSubmitting(true);
    const res = await batchCancelBookings(user.id, {
      listingIds: [batchListingId],
      dateFrom: batchDateFrom,
      dateTo: batchDateTo,
      cancellation_reason: batchReason,
      refund_choice: batchRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
    });
    setBatchSubmitting(false);
    if (res.count > 0) {
      for (const b of bookings) {
        if (b.listing_id === batchListingId && b.booking_date && b.booking_date >= batchDateFrom && b.booking_date <= batchDateTo && b.status !== 'cancelled') {
          await decrementAvailabilityBooked(b.listing_id, b.booking_date);
        }
      }
      load();
      setBatchModal(false);
      setBatchListingId('');
      setBatchDateFrom('');
      setBatchDateTo('');
      setBatchReason('');
      setBatchRefund('');
    }
  };

  const listingOptions = Object.entries(listingTitles).map(([id, title]) => ({ id, title }));
  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredBookings = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (view === 'pending' && b.status !== 'pending') return false;
      if (view === 'needs_ack' && !!b.acknowledged_at) return false;
      if (view === 'upcoming') {
        if (!b.booking_date) return false;
        if (b.booking_date < todayIso) return false;
        if (b.status === 'cancelled') return false;
      }
      if (view === 'cancelled' && b.status !== 'cancelled') return false;
      if (filterListingId && b.listing_id !== filterListingId) return false;
      if (filterDateFrom && (!b.booking_date || b.booking_date < filterDateFrom)) return false;
      if (filterDateTo && (!b.booking_date || b.booking_date > filterDateTo)) return false;
      const purchaseDay = bookingPurchaseDateLocal(b.created_at);
      if (filterPurchaseDateFrom && purchaseDay < filterPurchaseDateFrom) return false;
      if (filterPurchaseDateTo && purchaseDay > filterPurchaseDateTo) return false;
      if (q) {
        const title = (listingTitles[b.listing_id] ?? '').toLowerCase();
        const idLower = b.id.toLowerCase();
        const guestName = (b.guest_name ?? '').toLowerCase();
        const guestEmail = (b.guest_email ?? '').toLowerCase();
        const matches =
          idLower.includes(q) || guestName.includes(q) || guestEmail.includes(q) || title.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    bookings,
    view,
    filterListingId,
    filterDateFrom,
    filterDateTo,
    filterPurchaseDateFrom,
    filterPurchaseDateTo,
    filterQuery,
    listingTitles,
    todayIso,
  ]);

  const filteredBookingsTotalPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKINGS_PAGE_SIZE));
  const bookingsPageSafe = Math.min(Math.max(1, bookingsListPage), filteredBookingsTotalPages);

  const paginatedBookings = useMemo(() => {
    const start = (bookingsPageSafe - 1) * BOOKINGS_PAGE_SIZE;
    return filteredBookings.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [filteredBookings, bookingsPageSafe]);

  const paginationPageItems = useMemo(
    () => bookingPaginationRange(filteredBookingsTotalPages, bookingsPageSafe),
    [filteredBookingsTotalPages, bookingsPageSafe]
  );

  useEffect(() => {
    setBookingsListPage((p) => Math.min(p, filteredBookingsTotalPages));
  }, [filteredBookingsTotalPages]);

  useEffect(() => {
    setBookingsListPage(1);
  }, [view, filterListingId, filterDateFrom, filterDateTo, filterPurchaseDateFrom, filterPurchaseDateTo]);

  useEffect(() => {
    if (!highlightBookingId) return;
    const idx = filteredBookings.findIndex((b) => b.id === highlightBookingId);
    if (idx >= 0) {
      const page = Math.floor(idx / BOOKINGS_PAGE_SIZE) + 1;
      setBookingsListPage(page);
      requestAnimationFrame(() => {
        document.getElementById(`supplier-booking-row-${highlightBookingId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }
    setView('all');
    setFilterListingId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterPurchaseDateFrom('');
    setFilterPurchaseDateTo('');
    setFilterQuery('');
    setBookingsListPage(1);
  }, [highlightBookingId, filteredBookings]);

  const selectedBookings = useMemo(
    () => filteredBookings.filter((b) => selectedIds.includes(b.id)),
    [filteredBookings, selectedIds]
  );

  const todayOpsBookings = useMemo(
    () =>
      filteredBookings.filter(
        (b) => b.booking_date === todayIso && b.status !== 'cancelled'
      ),
    [filteredBookings, todayIso]
  );
  const bookingSlaAlerts = useMemo(() => {
    const now = Date.now();
    const pendingBreach = bookings.filter((b) => {
      if (b.status !== 'pending') return false;
      const ageH = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
      return ageH > 24;
    });
    const pendingRisk = bookings.filter((b) => {
      if (b.status !== 'pending') return false;
      const ageH = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
      return ageH >= 18 && ageH <= 24;
    });
    const ackBreach = bookings.filter((b) => {
      if (b.status === 'cancelled' || b.acknowledged_at) return false;
      const ageH = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
      return ageH > 12;
    });
    return { pendingRisk, pendingBreach, ackBreach };
  }, [bookings]);

  const targetBookings = selectedBookings.length > 0 ? selectedBookings : filteredBookings.slice(0, 1);
  const recipientEmails = useMemo(
    () =>
      [...new Set(targetBookings.map((b) => b.guest_email).filter((v): v is string => !!v))],
    [targetBookings]
  );
  const campaignBookings = useMemo(
    () => (campaignScope === 'selected' ? selectedBookings : filteredBookings),
    [campaignScope, selectedBookings, filteredBookings]
  );
  const campaignRecipients = useMemo(
    () =>
      [...new Set(campaignBookings.map((b) => b.guest_email).filter((v): v is string => !!v))],
    [campaignBookings]
  );
  const voucherTargetBookings = selectedBookings.length > 0 ? selectedBookings : filteredBookings.slice(0, 1);
  const voucherStats = useMemo(() => {
    const active = voucherLog.filter((v) => v.status === 'active').length;
    const redeemed = voucherLog.filter((v) => v.status === 'redeemed').length;
    const expired = voucherLog.filter((v) => v.status === 'expired').length;
    return { active, redeemed, expired };
  }, [voucherLog]);
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const isWithinHistoryDateRange = useCallback(
    (isoDate: string) => {
      const t = new Date(isoDate).getTime();
      if (Number.isNaN(t)) return false;
      if (historyDateRange === 'all') return true;
      if (historyDateRange === 'custom') {
        if (historyDateFrom) {
          const from = new Date(`${historyDateFrom}T00:00:00`).getTime();
          if (!Number.isNaN(from) && t < from) return false;
        }
        if (historyDateTo) {
          const to = new Date(`${historyDateTo}T23:59:59`).getTime();
          if (!Number.isNaN(to) && t > to) return false;
        }
        return true;
      }
      const days = historyDateRange === '7d' ? 7 : historyDateRange === '30d' ? 30 : 90;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return t >= cutoff;
    },
    [historyDateRange, historyDateFrom, historyDateTo]
  );
  const filteredCampaignHistory = useMemo(() => {
    return campaignHistory.filter((entry) => {
      if (!isWithinHistoryDateRange(entry.createdAt)) return false;
      if (historyCampaignStatus !== 'all' && entry.status !== historyCampaignStatus) return false;
      if (!normalizedHistorySearch) return true;
      return (
        entry.subject.toLowerCase().includes(normalizedHistorySearch) ||
        entry.scope.toLowerCase().includes(normalizedHistorySearch)
      );
    });
  }, [campaignHistory, historyCampaignStatus, normalizedHistorySearch, isWithinHistoryDateRange]);
  const filteredExportHistory = useMemo(() => {
    return exportHistory.filter((entry) => {
      if (!isWithinHistoryDateRange(entry.createdAt)) return false;
      if (historyExportKind !== 'all' && entry.kind !== historyExportKind) return false;
      if (!normalizedHistorySearch) return true;
      const kindLabel = entry.kind === 'bookings' ? 'detailed bookings' : 'ops summary';
      return (
        kindLabel.includes(normalizedHistorySearch) ||
        entry.format.toLowerCase().includes(normalizedHistorySearch) ||
        entry.scope.toLowerCase().includes(normalizedHistorySearch)
      );
    });
  }, [exportHistory, historyExportKind, normalizedHistorySearch, isWithinHistoryDateRange]);

  const isWithinQuietHours = useCallback(() => {
    if (!reminderSettings.quietHoursEnabled) return false;
    const hour = new Date().getHours();
    const start = reminderSettings.quietStartHour;
    const end = reminderSettings.quietEndHour;
    if (start === end) return true;
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }, [reminderSettings.quietHoursEnabled, reminderSettings.quietStartHour, reminderSettings.quietEndHour]);

  const dueReminderBookings = useMemo(() => {
    const daysBefore = reminderSettings.daysBefore;
    const today = new Date();
    return bookings.filter((b) => {
      if (b.status !== 'confirmed' || !b.booking_date || !b.guest_email) return false;
      const bookingDate = new Date(`${b.booking_date}T12:00:00`);
      const todayDate = new Date(`${today.toISOString().slice(0, 10)}T12:00:00`);
      const diffMs = bookingDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays !== daysBefore) return false;
      const sentKey = `${b.id}:${b.booking_date}:${daysBefore}`;
      return !reminderSentKeys.includes(sentKey);
    });
  }, [bookings, reminderSettings.daysBefore, reminderSentKeys]);
  const messageAnalytics = useMemo(() => {
    const total = commLog.length;
    const sent = commLog.filter((m) => m.deliveryStatus === 'sent').length;
    const failed = commLog.filter((m) => m.deliveryStatus === 'failed').length;
    const queued = total - sent - failed;
    const recipientTotal = commLog.reduce((sum, m) => sum + m.recipients.length, 0);
    const avgRecipients = total > 0 ? recipientTotal / total : 0;
    const campaignTotal = campaignHistory.length;
    const campaignSent = campaignHistory.filter((c) => c.status === 'sent').length;
    const campaignFailed = campaignHistory.filter((c) => c.status === 'failed').length;
    const deliveryRate = total > 0 ? (sent / total) * 100 : 0;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;
    const campaignSuccessRate = campaignTotal > 0 ? (campaignSent / campaignTotal) * 100 : 0;
    const byHour = new Array<number>(24).fill(0);
    commLog.forEach((m) => {
      const h = new Date(m.createdAt).getHours();
      if (!Number.isNaN(h)) byHour[h] += 1;
    });
    let bestHour = 0;
    for (let i = 1; i < byHour.length; i += 1) {
      if (byHour[i] > byHour[bestHour]) bestHour = i;
    }
    return {
      total,
      sent,
      failed,
      queued,
      avgRecipients,
      campaignTotal,
      campaignSent,
      campaignFailed,
      deliveryRate,
      failureRate,
      campaignSuccessRate,
      bestHour,
    };
  }, [commLog, campaignHistory]);

  const applyTemplate = useCallback(
    (id: (typeof MESSAGE_TEMPLATES)[number]['id']) => {
      const t = MESSAGE_TEMPLATES.find((x) => x.id === id);
      if (!t) return;
      const sample = targetBookings[0];
      const body = applyTemplateTokens(t.body, sample);
      setTemplateId(id);
      setCommSubject(t.subject);
      setCommBody(body);
    },
    [targetBookings, applyTemplateTokens]
  );

  useEffect(() => {
    if (!commSubject && !commBody) {
      applyTemplate(templateId);
    }
  }, [templateId, commBody, commSubject, applyTemplate]);

  const saveCommLog = (entries: CommunicationLogEntry[]) => {
    setCommLog(entries);
    localStorage.setItem(COMM_LOG_KEY, JSON.stringify(entries.slice(0, 20)));
  };

  const handleSendCommunication = async () => {
    if (recipientEmails.length === 0 || !commSubject.trim() || !commBody.trim()) return;
    setSendingComm(true);
    const entry: CommunicationLogEntry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      subject: commSubject.trim(),
      recipients: recipientEmails,
      bookingIds: targetBookings.map((b) => b.id),
      deliveryStatus: 'queued',
    };
    saveCommLog([entry, ...commLog].slice(0, 20));
    if (isSupabase && user) {
      const inserted = await insertSupplierBookingMessage({
        supplierId: user.id,
        actorId: user.id,
        subject: entry.subject,
        recipients: entry.recipients,
        bookingIds: entry.bookingIds,
        channel: 'email',
        bodyPreview: commBody.trim().slice(0, 500),
        deliveryStatus: 'queued',
      });
      const msgId = inserted.id;
      const send = await sendSupplierEmailViaEdge({
        to: entry.recipients,
        subject: entry.subject,
        body: commBody.trim(),
      });
      const status: CommunicationLogEntry['deliveryStatus'] = send.success ? 'sent' : 'failed';
      setCommLog((prev) =>
        prev.map((m) =>
          m.id === entry.id ? { ...m, deliveryStatus: status, errorMessage: send.error } : m
        )
      );
      if (msgId) {
        await updateSupplierBookingMessageDelivery({
          id: msgId,
          deliveryStatus: send.success ? 'sent' : 'failed',
          providerMessageId: send.providerMessageId,
          errorMessage: send.error,
        });
      }
    } else {
      const to = encodeURIComponent(recipientEmails.join(','));
      const subject = encodeURIComponent(commSubject.trim());
      const body = encodeURIComponent(commBody.trim());
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      setCommLog((prev) =>
        prev.map((m) => (m.id === entry.id ? { ...m, deliveryStatus: 'sent' } : m))
      );
    }
    setSendingComm(false);
  };

  const handleSendQuickTemplate = async (
    booking: BookingRow,
    quickTemplateId: (typeof MESSAGE_TEMPLATES)[number]['id']
  ) => {
    if (!booking.guest_email) return;
    const t = MESSAGE_TEMPLATES.find((x) => x.id === quickTemplateId);
    if (!t) return;
    setQuickMessageBookingId(booking.id);
    const subject = t.subject;
    const body = applyTemplateTokens(t.body, booking);
    const entry: CommunicationLogEntry = {
      id: `${Date.now()}-${booking.id}-quick`,
      createdAt: new Date().toISOString(),
      subject,
      recipients: [booking.guest_email],
      bookingIds: [booking.id],
      deliveryStatus: 'queued',
    };
    saveCommLog([entry, ...commLog].slice(0, 20));
    if (isSupabase && user) {
      const inserted = await insertSupplierBookingMessage({
        supplierId: user.id,
        actorId: user.id,
        subject: entry.subject,
        recipients: entry.recipients,
        bookingIds: entry.bookingIds,
        channel: 'email',
        bodyPreview: body.slice(0, 500),
        deliveryStatus: 'queued',
      });
      const send = await sendSupplierEmailViaEdge({
        to: entry.recipients,
        subject: entry.subject,
        body,
      });
      setCommLog((prev) =>
        prev.map((m) =>
          m.id === entry.id
            ? { ...m, deliveryStatus: send.success ? 'sent' : 'failed', errorMessage: send.error }
            : m
        )
      );
      if (inserted.id) {
        await updateSupplierBookingMessageDelivery({
          id: inserted.id,
          deliveryStatus: send.success ? 'sent' : 'failed',
          providerMessageId: send.providerMessageId,
          errorMessage: send.error,
        });
      }
    } else {
      const to = encodeURIComponent(entry.recipients.join(','));
      const encodedSubject = encodeURIComponent(entry.subject);
      const encodedBody = encodeURIComponent(body);
      window.location.href = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
      setCommLog((prev) =>
        prev.map((m) => (m.id === entry.id ? { ...m, deliveryStatus: 'sent' } : m))
      );
    }
    setQuickMessageBookingId(null);
  };

  const handleRunDueReminders = async (mode: 'manual' | 'auto' = 'manual') => {
    if (!reminderSettings.enabled || dueReminderBookings.length === 0 || runningReminders) return;
    if (isWithinQuietHours()) return;
    setRunningReminders(true);
    let sentCount = 0;
    let failedCount = 0;

    const template = MESSAGE_TEMPLATES.find((t) => t.id === reminderSettings.templateId) ?? MESSAGE_TEMPLATES[1];
    for (const b of dueReminderBookings) {
      const subject = `[Auto reminder] ${template.subject}`;
      const body = applyTemplateTokens(template.body, b);
      const entry: CommunicationLogEntry = {
        id: `${Date.now()}-${b.id}-auto`,
        createdAt: new Date().toISOString(),
        subject,
        recipients: [b.guest_email as string],
        bookingIds: [b.id],
        deliveryStatus: 'queued',
      };
      saveCommLog([entry, ...commLog].slice(0, 20));

      if (isSupabase && user) {
        const inserted = await insertSupplierBookingMessage({
          supplierId: user.id,
          actorId: user.id,
          subject,
          recipients: entry.recipients,
          bookingIds: entry.bookingIds,
          channel: 'email',
          bodyPreview: body.slice(0, 500),
          deliveryStatus: 'queued',
        });
        const send = await sendSupplierEmailViaEdge({
          to: entry.recipients,
          subject,
          body,
        });
        if (inserted.id) {
          await updateSupplierBookingMessageDelivery({
            id: inserted.id,
            deliveryStatus: send.success ? 'sent' : 'failed',
            providerMessageId: send.providerMessageId,
            errorMessage: send.error,
          });
        }
        if (send.success) {
          sentCount += 1;
          setReminderSentKeys((prev) => [`${b.id}:${b.booking_date}:${reminderSettings.daysBefore}`, ...prev]);
        } else {
          failedCount += 1;
        }
      } else {
        failedCount += 1;
      }
    }

    setReminderRuns((prev) =>
      [
        {
          id: `${Date.now()}-reminder-run`,
          createdAt: new Date().toISOString(),
          targetCount: dueReminderBookings.length,
          sentCount,
          failedCount,
          mode,
        },
        ...prev,
      ].slice(0, 20)
    );
    setRunningReminders(false);
  };

  const handleSendCampaign = async () => {
    if (campaignRecipients.length === 0 || !commSubject.trim() || !commBody.trim()) return;
    setSendingCampaign(true);
    const entry: CommunicationLogEntry = {
      id: `${Date.now()}-campaign`,
      createdAt: new Date().toISOString(),
      subject: `[Campaign] ${commSubject.trim()}`,
      recipients: campaignRecipients,
      bookingIds: campaignBookings.map((b) => b.id),
      deliveryStatus: 'queued',
    };
    saveCommLog([entry, ...commLog].slice(0, 20));
    const localCampaignId = `${Date.now()}-local-campaign`;
    setCampaignHistory((prev) =>
      [
        {
          id: localCampaignId,
          subject: entry.subject,
          scope: campaignScope,
          recipientsCount: entry.recipients.length,
          sentCount: 0,
          failedCount: 0,
          status: 'queued' as const,
          createdAt: entry.createdAt,
        } satisfies CampaignHistoryEntry,
        ...prev,
      ].slice(0, 20)
    );

    if (isSupabase && user) {
      const campaign = await insertSupplierMessageCampaign({
        supplierId: user.id,
        actorId: user.id,
        subject: entry.subject,
        scope: campaignScope,
        bookingIds: entry.bookingIds,
        recipients: entry.recipients,
        filtersSnapshot: {
          view,
          filterListingId: filterListingId || null,
          filterDateFrom: filterDateFrom || null,
          filterDateTo: filterDateTo || null,
        },
      });
      const inserted = await insertSupplierBookingMessage({
        supplierId: user.id,
        actorId: user.id,
        campaignId: campaign.id,
        subject: entry.subject,
        recipients: entry.recipients,
        bookingIds: entry.bookingIds,
        channel: 'email',
        bodyPreview: commBody.trim().slice(0, 500),
        deliveryStatus: 'queued',
      });
      const msgId = inserted.id;
      const send = await sendSupplierEmailViaEdge({
        to: entry.recipients,
        subject: entry.subject,
        body: commBody.trim(),
      });
      const status: CommunicationLogEntry['deliveryStatus'] = send.success ? 'sent' : 'failed';
      setCampaignHistory((prev) =>
        prev.map((c) =>
          c.id === localCampaignId
            ? {
                ...c,
                status: send.success ? 'sent' : 'failed',
                sentCount: send.success ? entry.recipients.length : 0,
                failedCount: send.success ? 0 : entry.recipients.length,
              }
            : c
        )
      );
      setCommLog((prev) =>
        prev.map((m) =>
          m.id === entry.id ? { ...m, deliveryStatus: status, errorMessage: send.error } : m
        )
      );
      if (msgId) {
        await updateSupplierBookingMessageDelivery({
          id: msgId,
          deliveryStatus: send.success ? 'sent' : 'failed',
          providerMessageId: send.providerMessageId,
          errorMessage: send.error,
        });
      }
      if (campaign.id) {
        await updateSupplierMessageCampaignStatus({
          campaignId: campaign.id,
          supplierId: user.id,
          status: send.success ? 'sent' : 'failed',
          sentCount: send.success ? entry.recipients.length : 0,
          failedCount: send.success ? 0 : entry.recipients.length,
        });
      }
    } else {
      const to = encodeURIComponent(campaignRecipients.join(','));
      const subject = encodeURIComponent(entry.subject);
      const body = encodeURIComponent(commBody.trim());
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      setCommLog((prev) =>
        prev.map((m) => (m.id === entry.id ? { ...m, deliveryStatus: 'sent' } : m))
      );
      setCampaignHistory((prev) =>
        prev.map((c) =>
          c.id === localCampaignId
            ? { ...c, status: 'sent', sentCount: entry.recipients.length, failedCount: 0 }
            : c
        )
      );
    }
    setSendingCampaign(false);
    setCampaignOpen(false);
  };

  const buildVoucherCode = (bookingId: string, idx: number) => {
    const bookingPart = bookingId.slice(0, 4).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TRV-${bookingPart}-${idx + 1}${randomPart}`;
  };

  const handleGenerateVouchers = async () => {
    const value = Number(voucherDiscountValue);
    if (voucherTargetBookings.length === 0 || Number.isNaN(value) || value <= 0) return;
    const createdAt = new Date().toISOString();
    const next: VoucherEntry[] = voucherTargetBookings.map((b, idx) => ({
      id: `${Date.now()}-${idx}-${b.id}`,
      bookingId: b.id,
      listingId: b.listing_id,
      code: buildVoucherCode(b.id, idx),
      guestEmail: b.guest_email ?? undefined,
      discountType: voucherDiscountType,
      discountValue: value,
      status: 'active',
      createdAt,
      expiresAt: voucherExpiresAt || undefined,
      notes: voucherNotes.trim() || undefined,
    }));
    setVoucherLog((prev) => [...next, ...prev].slice(0, 200));
    if (isSupabase && user) {
      await insertSupplierBookingVouchers(
        next.map((v) => ({
          bookingId: v.bookingId,
          supplierId: user.id,
          listingId: v.listingId,
          code: v.code,
          guestEmail: v.guestEmail,
          discountType: v.discountType,
          discountValue: v.discountValue,
          status: v.status,
          notes: v.notes,
          expiresAt: v.expiresAt,
        }))
      );
      const rows = await fetchSupplierBookingVouchers(user.id);
      if (rows.length > 0) {
        const mapped: VoucherEntry[] = rows.map((r) => ({
          id: r.id,
          bookingId: r.booking_id,
          listingId: r.listing_id,
          code: r.code,
          guestEmail: r.guest_email ?? undefined,
          discountType: r.discount_type,
          discountValue: Number(r.discount_value),
          status: r.status,
          createdAt: r.created_at,
          expiresAt: r.expires_at ?? undefined,
          notes: r.notes ?? undefined,
        }));
        setVoucherLog(mapped.slice(0, 200));
      }
    }
  };

  const handleVoucherStatusChange = async (
    id: string,
    status: VoucherEntry['status']
  ) => {
    let blocked = false;
    setVoucherLog((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        if (v.status === 'redeemed' && status !== 'redeemed') {
          blocked = true;
          return v;
        }
        return { ...v, status };
      })
    );
    if (blocked) {
      setVoucherRedeemResult('Redeemed vouchers are locked and cannot be changed back.');
      return;
    }
    if (isSupabase && user) {
      await updateSupplierBookingVoucherStatus(user.id, id, status);
    }
  };

  const handleRedeemVoucher = async () => {
    const normalized = voucherRedeemCode.trim().toUpperCase();
    if (!normalized) return;
    setVoucherRedeeming(true);
    setVoucherRedeemResult(null);

    const localMatch = voucherLog.find((v) => v.code.toUpperCase() === normalized);
    if (!localMatch) {
      setVoucherRedeemResult('Voucher code not found.');
      setVoucherRedeeming(false);
      return;
    }
    if (localMatch.status === 'redeemed') {
      setVoucherRedeemResult('Voucher already redeemed.');
      setVoucherRedeeming(false);
      return;
    }
    if (localMatch.expiresAt && localMatch.expiresAt < new Date().toISOString().slice(0, 10)) {
      setVoucherLog((prev) => prev.map((v) => (v.id === localMatch.id ? { ...v, status: 'expired' } : v)));
      if (isSupabase && user) {
        await updateSupplierBookingVoucherStatus(user.id, localMatch.id, 'expired');
      }
      setVoucherRedeemResult('Voucher is expired.');
      setVoucherRedeeming(false);
      return;
    }

    if (isSupabase && user) {
      const result = await redeemSupplierBookingVoucherByCode(user.id, normalized);
      if (!result.success) {
        setVoucherRedeemResult(
          result.reason === 'already_redeemed'
            ? 'Voucher already redeemed.'
            : result.reason === 'expired'
              ? 'Voucher is expired.'
              : 'Voucher could not be redeemed.'
        );
        if (result.reason === 'expired' && result.voucherId) {
          setVoucherLog((prev) =>
            prev.map((v) => (v.id === result.voucherId ? { ...v, status: 'expired' } : v))
          );
        }
        setVoucherRedeeming(false);
        return;
      }
    }

    setVoucherLog((prev) =>
      prev.map((v) => (v.code.toUpperCase() === normalized ? { ...v, status: 'redeemed' } : v))
    );
    setVoucherRedeemResult('Voucher redeemed successfully.');
    setVoucherRedeemCode('');
    setVoucherRedeeming(false);
  };

  const handleExpireVouchersNow = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setVoucherLog((prev) =>
      prev.map((v) =>
        v.status === 'active' && v.expiresAt && v.expiresAt < today
          ? { ...v, status: 'expired' }
          : v
      )
    );
    if (isSupabase && user) {
      await expireSupplierBookingVouchers(user.id);
    }
  };

  const handleExportVouchersCsv = () => {
    if (voucherLog.length === 0) return;
    const escapeCsv = (value: string | number | null | undefined) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const header = ['voucher_code', 'booking_id', 'listing', 'guest_email', 'discount_type', 'discount_value', 'status', 'created_at', 'expires_at', 'notes'];
    const lines = voucherLog.map((v) =>
      [
        v.code,
        v.bookingId,
        listingTitles[v.listingId] ?? v.listingId,
        v.guestEmail,
        v.discountType,
        v.discountValue,
        v.status,
        v.createdAt,
        v.expiresAt,
        v.notes,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-vouchers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    const ids = paginatedBookings.map((b) => b.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleBulkAcknowledge = async () => {
    if (!canEditBookings) return;
    const targets = selectedBookings.filter((b) => !b.acknowledged_at && b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    await Promise.all(targets.map((b) => acknowledgeBooking(b.id)));
    setBookings((prev) =>
      prev.map((b) => (targets.some((t) => t.id === b.id) ? { ...b, acknowledged_at: new Date().toISOString() } : b))
    );
    targets.forEach((b) => pushAudit({ bookingId: b.id, action: 'acknowledged', details: 'bulk action' }));
    setBulkActionSubmitting(false);
    clearSelection();
  };

  const handleBulkConfirm = async () => {
    if (!canEditBookings) return;
    const targets = selectedBookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    await Promise.all(targets.map((b) => updateBookingStatus(b.id, 'confirmed')));
    setBookings((prev) => prev.map((b) => (targets.some((t) => t.id === b.id) ? { ...b, status: 'confirmed' } : b)));
    targets.forEach((b) => pushAudit({ bookingId: b.id, action: 'status_confirmed', details: 'bulk action' }));
    setBulkActionSubmitting(false);
    clearSelection();
  };

  const handleBulkCancelSelected = async () => {
    if (!canEditBookings) return;
    if (!bulkCancelReason) return;
    const targets = selectedBookings.filter((b) => b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    for (const b of targets) {
      const previousStatus = b.status;
      await updateBookingStatus(b.id, 'cancelled', {
        cancellation_reason: bulkCancelReason,
        refund_choice: bulkCancelRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
      });
      if (previousStatus === 'confirmed' && b.booking_date) {
        await decrementAvailabilityBooked(b.listing_id, b.booking_date);
      }
    }
    setBookings((prev) =>
      prev.map((b) =>
        targets.some((t) => t.id === b.id)
          ? {
              ...b,
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancellation_reason: bulkCancelReason,
              refund_choice: bulkCancelRefund || b.refund_choice,
            }
          : b
      )
    );
    targets.forEach((b) =>
      pushAudit({
        bookingId: b.id,
        action: 'status_cancelled',
        details: `bulk action${bulkCancelReason ? ` · reason: ${bulkCancelReason}` : ''}${bulkCancelRefund ? ` · refund: ${bulkCancelRefund}` : ''}`,
      })
    );
    setBulkActionSubmitting(false);
    setBulkCancelModal(false);
    setBulkCancelReason('');
    setBulkCancelRefund('');
    clearSelection();
  };

  const exportFilteredBookingsCsv = async () => {
    const exportRows = filteredBookings;
    if (exportRows.length === 0) return;

    const escapeCsv = (value: string | number | null | undefined) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const rows = exportRows.map((b) => ({
      booking_id: b.id,
      listing_id: b.listing_id,
      listing: listingTitles[b.listing_id] ?? b.listing_id,
      guest_name: b.guest_name ?? '',
      guest_email: b.guest_email ?? '',
      booking_date: b.booking_date ?? '',
      start_time: b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
      pickup_time: b.pickup_time ? pgTimeToHm(b.pickup_time) ?? '' : '',
      guests: b.guests ?? '',
      status: b.status,
      acknowledged: b.acknowledged_at ? 'yes' : 'no',
      acknowledged_at: b.acknowledged_at ?? '',
      cancelled_at: b.cancelled_at ?? '',
      cancellation_reason: b.cancellation_reason ?? '',
      refund_choice: b.refund_choice ?? '',
      special_requests: b.special_requests ?? '',
    }));

    const header = Object.keys(rows[0]);
    const lines = rows.map((row) =>
      header.map((key) => escapeCsv(row[key as keyof typeof row])).join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExportHistory((prev) =>
      [
        {
          id: `${Date.now()}-local-export`,
          kind: 'bookings',
          format: 'csv',
          scope: 'filtered',
          rowCount: rows.length,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20)
    );
    if (isSupabase && user) {
      await insertSupplierExportRun({
        supplierId: user.id,
        actorId: user.id,
        kind: 'bookings',
        format: 'csv',
        scope: 'filtered',
        rowCount: rows.length,
        filtersSnapshot: { view, filterListingId: filterListingId || null },
      });
    }
  };

  const bookingTimeline = useMemo(() => {
    if (!timelineBookingId) return [];
    const booking = bookings.find((b) => b.id === timelineBookingId);
    if (!booking) return [];
    const events: { at: string; label: string; details?: string }[] = [];
    events.push({ at: booking.created_at, label: 'Booking created' });
    if (booking.acknowledged_at) {
      events.push({ at: booking.acknowledged_at, label: 'Supplier acknowledged' });
    }
    if (booking.status === 'confirmed') {
      events.push({ at: booking.created_at, label: 'Status: confirmed' });
    }
    if (booking.cancelled_at) {
      events.push({
        at: booking.cancelled_at,
        label: 'Status: cancelled',
        details: [
          booking.cancellation_reason ? `reason: ${booking.cancellation_reason}` : '',
          booking.refund_choice ? `refund: ${booking.refund_choice}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
    const audits = auditLog
      .filter((e) => e.bookingId === timelineBookingId)
      .map((e) => ({
        at: e.at,
        label:
          e.action === 'acknowledged'
            ? 'Supplier acknowledged'
            : e.action === 'status_confirmed'
              ? 'Status changed to confirmed'
              : e.action === 'status_cancelled'
                ? 'Status changed to cancelled'
                : e.action === 'booking_created'
                  ? 'Booking created'
                  : 'Timeline note',
        details: e.details,
      }));
    return [...events, ...audits].sort((a, b) => a.at.localeCompare(b.at));
  }, [timelineBookingId, bookings, auditLog]);

  const persistOpsNotes = (next: Record<string, BookingOpsNote>) => {
    setOpsNotes(next);
    localStorage.setItem(OPS_NOTES_KEY, JSON.stringify(next));
  };

  const saveOpsNote = (bookingId: string, note: string) => {
    const trimmed = note.trim();
    const next = { ...opsNotes };
    if (!trimmed) {
      delete next[bookingId];
      persistOpsNotes(next);
      return;
    }
    next[bookingId] = {
      bookingId,
      note: trimmed,
      updatedAt: new Date().toISOString(),
      pendingSync: true,
    };
    persistOpsNotes(next);
    pushAudit({
      bookingId,
      action: 'note',
      details: 'Ops note updated (offline-safe)',
    });
  };

  const syncSingleOpsNote = useCallback(
    async (bookingId: string) => {
      const uid = user?.id;
      if (!isSupabase || !uid) return;
      const local = opsNotes[bookingId];
      if (!local || !local.pendingSync) return;
      let ok = false;
      if (!local.note.trim()) {
        ok = await deleteSupplierBookingOpsNote(uid, bookingId);
      } else {
        ok = await upsertSupplierBookingOpsNote(uid, bookingId, local.note);
      }
      if (!ok) return;
      setOpsNotes((prev) => {
        const next = { ...prev };
        const curr = next[bookingId];
        if (!curr) return prev;
        next[bookingId] = {
          ...curr,
          pendingSync: false,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(OPS_NOTES_KEY, JSON.stringify(next));
        return next;
      });
    },
    [isSupabase, user?.id, opsNotes]
  );

  const bookingStats = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
    const needsAction = bookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled').length;
    return { total: bookings.length, confirmed, needsAction };
  }, [bookings]);

  return (
    <div className="space-y-6 max-w-4xl w-full min-w-0 animate-fade-in-up">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-6 h-6 text-finland" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Bookings</h1>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                Filter and manage bookings in a scroll-friendly list — confirm, message guests, and track activity dates.
              </p>
              {!canEditBookings && (
                <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Your role is {role}. You can view bookings, but edit actions are restricted.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:w-auto sm:shrink-0">
            <button
              type="button"
              onClick={() => setBatchModal(true)}
              disabled={!canEditBookings}
              className="touch-manipulation inline-flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 min-h-[44px] rounded-xl border border-gray-300 text-sm text-gray-800 font-medium hover:bg-gray-50 active:scale-[0.99]"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="truncate">Batch cancel</span>
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="touch-manipulation inline-flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 min-h-[44px] rounded-xl border border-gray-300 text-sm text-gray-800 font-medium hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {!loading && bookings.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-5">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-gray-900">{bookingStats.total}</p>
              <p className="text-[11px] font-medium text-gray-500">Total</p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-emerald-800">{bookingStats.confirmed}</p>
              <p className="text-[11px] font-medium text-emerald-700">Confirmed</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center ${bookingStats.needsAction > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <p className={`text-lg font-bold tabular-nums ${bookingStats.needsAction > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
                {bookingStats.needsAction}
              </p>
              <p className={`text-[11px] font-medium ${bookingStats.needsAction > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
                Needs action
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Product</label>
              <select
                value={filterListingId}
                onChange={(e) => setFilterListingId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm w-full"
              >
                <option value="">All products</option>
                {listingOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Purchase date</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={filterPurchaseDateFrom}
                  onChange={(e) => setFilterPurchaseDateFrom(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm min-w-0 w-[9.25rem]"
                  aria-label="Purchase date from"
                />
                <span className="text-gray-400 text-sm shrink-0">–</span>
                <input
                  type="date"
                  value={filterPurchaseDateTo}
                  onChange={(e) => setFilterPurchaseDateTo(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm min-w-0 w-[9.25rem]"
                  aria-label="Purchase date to"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Activity date</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm min-w-0 w-[9.25rem]"
                  aria-label="Activity date from"
                />
                <span className="text-gray-400 text-sm shrink-0">–</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm min-w-0 w-[9.25rem]"
                  aria-label="Activity date to"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-[10rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Status</label>
              <select
                value={view}
                onChange={(e) => {
                  setView(e.target.value as typeof view);
                  setSelectedIds([]);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm w-full"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="needs_ack">Needs acknowledgment</option>
                <option value="upcoming">Upcoming</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[min(100%,14rem)]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Search</label>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Guest, email, booking ID, product name…"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm w-full"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setFilterListingId('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setFilterPurchaseDateFrom('');
                  setFilterPurchaseDateTo('');
                  setFilterQuery('');
                  setView('all');
                  setSelectedIds([]);
                  setBookingsListPage(1);
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Clear filters
              </button>
              {!loading && bookings.length > 0 && (
                <span className="text-sm text-gray-500 min-w-0">
                  {filteredBookings.length} of {bookings.length} match filters
                  {filteredBookings.length > BOOKINGS_PAGE_SIZE && (
                    <span className="text-gray-400">
                      {' '}
                      · {BOOKINGS_PAGE_SIZE} per page · page {bookingsPageSafe} of {filteredBookingsTotalPages}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">Try again</button>
        </div>
      )}


      {loading ? (
        <div className="space-y-3">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No bookings yet</h2>
          <p className="text-gray-500 mt-1 max-w-sm mx-auto">
            When travelers book your experiences, they’ll appear here as confirmed. You can request cancellation (with reason and refund choice) if needed.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setView('all')}
              className="px-4 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
            >
              Refresh view
            </button>
          </div>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No matching bookings</h2>
          <p className="text-gray-500 mt-1">Try a different view or clear date/listing filters.</p>
          <button
            type="button"
            onClick={() => {
              setFilterListingId('');
              setFilterDateFrom('');
              setFilterDateTo('');
              setFilterPurchaseDateFrom('');
              setFilterPurchaseDateTo('');
              setFilterQuery('');
              setView('all');
              setBookingsListPage(1);
            }}
            className="mt-4 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="md:hidden bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Mobile quick actions</h2>
              <span className="text-xs text-gray-500">
                Today: {todayOpsBookings.length}
              </span>
            </div>
            {todayOpsBookings.length === 0 ? (
              <p className="text-sm text-gray-500">No active bookings today.</p>
            ) : (
              <div className="space-y-2">
                {todayOpsBookings.map((b) => (
                  <div key={`mobile-${b.id}`} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {listingTitles[b.listing_id] ?? 'Listing'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {typeof b.booking_number === 'number' && b.booking_number > 0 ? (
                            <>#{b.booking_number} · </>
                          ) : null}
                          {b.guest_name ?? b.guest_email ?? 'Guest'} · {b.guests} guest{b.guests === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {b.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {b.special_requests || 'No special requests'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!b.acknowledged_at && (
                        <button
                          type="button"
                          onClick={() => handleAcknowledge(b)}
                          disabled={!canEditBookings || updatingId === b.id}
                          className="text-xs px-2.5 py-1.5 rounded bg-blue-100 text-blue-700 disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                      )}
                      {b.status !== 'confirmed' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(b, 'confirmed')}
                          disabled={!canEditBookings || updatingId === b.id}
                          className="text-xs px-2.5 py-1.5 rounded bg-green-100 text-green-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTimelineBookingId(b.id)}
                        className="text-xs px-2.5 py-1.5 rounded bg-gray-100 text-gray-700"
                      >
                        Timeline
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelModal(b)}
                        disabled={!canEditBookings || updatingId === b.id}
                        className="text-xs px-2.5 py-1.5 rounded bg-red-100 text-red-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Ops note (offline-safe)</label>
                      <textarea
                        defaultValue={opsNotes[b.id]?.note ?? ''}
                        onBlur={async (e) => {
                          saveOpsNote(b.id, e.target.value);
                          await syncSingleOpsNote(b.id);
                        }}
                        rows={2}
                        placeholder="Add quick field notes for this booking..."
                        className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-finland"
                      />
                      {opsNotes[b.id]?.pendingSync && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Saved locally · pending sync
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm w-full min-w-0">
            <div className="px-3 py-3 sm:px-4 border-b border-gray-200 bg-gray-50/70">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {paginatedBookings.length > 0 && paginatedBookings.every((b) => selectedIds.includes(b.id))
                    ? 'Unselect page'
                    : 'Select page'}
                </button>
                <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
                <button
                  type="button"
                  onClick={handleBulkAcknowledge}
                  disabled={!canEditBookings || selectedIds.length === 0 || bulkActionSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                >
                  Acknowledge selected
                </button>
                <button
                  type="button"
                  onClick={handleBulkConfirm}
                  disabled={!canEditBookings || selectedIds.length === 0 || bulkActionSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-green-200 text-sm text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                >
                  Confirm selected
                </button>
                <button
                  type="button"
                  onClick={() => setBulkCancelModal(true)}
                  disabled={!canEditBookings || selectedIds.length === 0 || bulkActionSubmitting}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                >
                  Cancel selected
                </button>
                {selectedIds.length > 0 && (
                  <button type="button" onClick={clearSelection} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void exportFilteredBookingsCsv()}
                  disabled={filteredBookings.length === 0}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Download all rows that match your current filters as CSV"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden />
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 w-full min-w-0">
            <div className="px-0.5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Bookings ({filteredBookings.length})
                </p>
                {filteredBookings.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Showing{' '}
                    {(bookingsPageSafe - 1) * BOOKINGS_PAGE_SIZE + 1}
                    –
                    {(bookingsPageSafe - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
                    {filteredBookingsTotalPages > 1 ? (
                      <>
                        {' '}
                        · Page {bookingsPageSafe} of {filteredBookingsTotalPages}
                      </>
                    ) : null}
                  </p>
                )}
              </div>
            </div>
            {paginatedBookings.map((b) => {
              const startHm = b.start_time ? pgTimeToHm(b.start_time) : null;
              const pickupHm = b.pickup_time ? pgTimeToHm(b.pickup_time) : null;
              const refLabel =
                typeof b.booking_number === 'number' && b.booking_number > 0
                  ? `#${b.booking_number}`
                  : b.id.slice(0, 8);
              const detailsOpen = !!bookingDetailsOpen[b.id];
              return (
                <article
                  key={`card-${b.id}`}
                  id={`supplier-booking-row-${b.id}`}
                  className={`rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-3 w-full min-w-0 max-w-full ${
                    highlightBookingId === b.id ? 'ring-2 ring-finland/30 bg-finland/[0.04]' : ''
                  }`}
                >
                  <div className="flex gap-3 min-w-0">
                    <input
                      type="checkbox"
                      className="mt-1.5 rounded border-gray-300 text-finland focus:ring-finland shrink-0"
                      checked={selectedIds.includes(b.id)}
                      onChange={() => toggleSelected(b.id)}
                      aria-label={`Select booking ${b.id}`}
                    />
                    <div className="hidden sm:flex h-14 w-14 shrink-0 rounded-lg bg-gray-100 text-gray-400 items-center justify-center border border-gray-100">
                      <Calendar className="w-6 h-6" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-gray-900 leading-snug">
                            {listingTitles[b.listing_id] ?? 'Listing'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {b.guest_name ? (
                              <span className="text-gray-700 font-medium">{b.guest_name}</span>
                            ) : (
                              <span>Guest</span>
                            )}
                            {b.guest_email ? (
                              <span className="text-gray-500"> · </span>
                            ) : null}
                            {b.guest_email && !detailsOpen ? (
                              <span className="text-gray-500 break-all line-clamp-1" title={b.guest_email}>
                                {b.guest_email}
                              </span>
                            ) : null}
                            {!b.guest_name && !b.guest_email ? <span className="text-gray-400">—</span> : null}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:text-right">
                          <span
                            className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                              b.status === 'confirmed'
                                ? 'bg-green-100 text-green-800'
                                : b.status === 'cancelled'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.status}
                          </span>
                          <p className="flex items-center gap-1.5 text-xs text-gray-500">
                            <ShoppingCart className="w-3.5 h-3.5 shrink-0 text-gray-400" aria-hidden />
                            <span className="whitespace-nowrap">{formatPurchaseDateShort(b.created_at)}</span>
                          </p>
                        </div>
                      </div>
                      {b.acknowledged_at && (
                        <p className="text-[11px] text-gray-500">Acknowledged</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between border-t border-gray-100 pt-3">
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                      <p className="flex items-start gap-2 text-sm text-gray-700 min-w-0">
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words">{formatActivityDateLong(b.booking_date, startHm)}</span>
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <Tag className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                          <span className="font-mono text-xs sm:text-sm">{refLabel}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                          {b.guests ?? '—'} guest{b.guests === 1 ? '' : 's'}
                        </span>
                        {pickupHm ? (
                          <span className="inline-flex items-baseline gap-1.5 text-gray-600 min-w-0 flex-wrap">
                            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide shrink-0">Pickup</span>
                            <span className="min-w-0 font-medium text-gray-800">{pickupHm}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBookingDetailsOpen((prev) => ({
                          ...prev,
                          [b.id]: !prev[b.id],
                        }))
                      }
                      className="inline-flex items-center justify-center gap-1 text-sm font-medium text-finland hover:underline shrink-0 self-start sm:self-center"
                      aria-expanded={detailsOpen}
                    >
                      {detailsOpen ? 'Hide details' : 'Show details'}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                  </div>

                  {b.status !== 'cancelled' && !b.pickup_time && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                      <span>Pickup time not set — assign one in Pickup planner or expand details.</span>
                    </div>
                  )}

                  {detailsOpen && (
                    <div className="space-y-3 border-t border-gray-100 pt-3">
                      {b.guest_email && (
                        <p className="text-sm text-gray-700 break-all">
                          <span className="text-gray-500 font-medium">Email </span>
                          <a href={`mailto:${b.guest_email}`} className="text-finland hover:underline">
                            {b.guest_email}
                          </a>
                        </p>
                      )}
                      {b.special_requests ? (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Requests & notes</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{b.special_requests}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No special requests.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setTimelineBookingId(b.id)}
                          className="touch-manipulation min-h-[40px] px-3 py-2 rounded-xl bg-gray-100 text-gray-800 text-xs font-semibold active:scale-[0.98]"
                        >
                          Timeline
                        </button>
                        {b.status !== 'cancelled' && (
                          <>
                            {b.guest_email && (
                              <a
                                href={`mailto:${b.guest_email}?subject=Your booking – ${listingTitles[b.listing_id] ?? 'Tour'}`}
                                className="touch-manipulation inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-2 rounded-xl bg-gray-100 text-gray-800 text-xs font-semibold"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Contact
                              </a>
                            )}
                            {b.status !== 'confirmed' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b, 'confirmed')}
                                disabled={!canEditBookings || updatingId === b.id}
                                className="touch-manipulation min-h-[40px] px-3 py-2 rounded-xl bg-green-100 text-green-800 text-xs font-semibold disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            )}
                            {!b.acknowledged_at && (
                              <button
                                type="button"
                                onClick={() => handleAcknowledge(b)}
                                disabled={!canEditBookings || updatingId === b.id}
                                className="touch-manipulation inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-blue-100 text-blue-800 text-xs font-semibold disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                Acknowledge
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setCancelModal(b)}
                              disabled={!canEditBookings || updatingId === b.id}
                              className="touch-manipulation min-h-[40px] px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-semibold disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Ops note</label>
                        <textarea
                          defaultValue={opsNotes[b.id]?.note ?? ''}
                          onBlur={async (e) => {
                            saveOpsNote(b.id, e.target.value);
                            await syncSingleOpsNote(b.id);
                          }}
                          rows={2}
                          placeholder="Field notes…"
                          className="w-full min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-finland"
                        />
                        {opsNotes[b.id]?.pendingSync && (
                          <p className="text-[11px] text-amber-700 mt-1">Saved locally · pending sync</p>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

        {filteredBookings.length > 0 && filteredBookingsTotalPages >= 1 && (
          <nav
            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4"
            aria-label="Bookings pages"
          >
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                {(bookingsPageSafe - 1) * BOOKINGS_PAGE_SIZE + 1}–
                {(bookingsPageSafe - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
              </span>
              <span className="text-gray-500"> of {filteredBookings.length}</span>
              {filteredBookingsTotalPages > 1 ? (
                <span className="text-gray-500">
                  {' '}
                  · Page {bookingsPageSafe} of {filteredBookingsTotalPages}
                </span>
              ) : null}
            </p>
            {filteredBookingsTotalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.max(1, p - 1))}
                  disabled={bookingsPageSafe <= 1}
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {paginationPageItems.map((item, i) =>
                  item === 'ellipsis' ? (
                    <span key={`e-${i}`} className="px-1.5 text-sm text-gray-400 select-none" aria-hidden>
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setBookingsListPage(item)}
                      className={`min-h-[40px] min-w-[40px] rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                        item === bookingsPageSafe
                          ? 'bg-finland text-white shadow-sm'
                          : 'border border-gray-200 text-gray-800 hover:bg-gray-50'
                      }`}
                      aria-label={`Page ${item}`}
                      aria-current={item === bookingsPageSafe ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.min(filteredBookingsTotalPages, p + 1))}
                  disabled={bookingsPageSafe >= filteredBookingsTotalPages}
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </nav>
        )}

        </div>
      )}

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),92dvh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request cancellation</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cancel booking for {listingTitles[cancelModal.listing_id]} – {cancelModal.guest_email ?? cancelModal.guest_name ?? 'Guest'}?
            </p>
            <p className="text-xs text-amber-700 mb-4">
              This updates traveler-facing status immediately and should only be used when cancellation is final.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={cancelRefund}
                  onChange={(e) => setCancelRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCancelModal(null); setCancelReason(''); setCancelRefund(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!cancelReason || updatingId === cancelModal.id}
                onClick={() => handleStatusChange(cancelModal, 'cancelled', {
                  cancellation_reason: cancelReason,
                  refund_choice: cancelRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
                })}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {updatingId === cancelModal.id ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {timelineBookingId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-xl w-full p-4 sm:p-6 max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),90dvh)] sm:max-h-[80vh] overflow-hidden flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Booking timeline</h3>
              <button
                type="button"
                onClick={() => setTimelineBookingId(null)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto pr-1 space-y-3">
              {timelineBookingId && (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
                  <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                    Ops note
                  </label>
                  <textarea
                    value={opsNotes[timelineBookingId]?.note ?? ''}
                    onChange={(e) => {
                      const id = timelineBookingId;
                      if (!id) return;
                      const note = e.target.value;
                      const next = { ...opsNotes };
                      next[id] = {
                        bookingId: id,
                        note,
                        updatedAt: new Date().toISOString(),
                        pendingSync: true,
                      };
                      persistOpsNotes(next);
                    }}
                    onBlur={(e) => {
                      const id = timelineBookingId;
                      if (!id) return;
                      saveOpsNote(id, e.target.value);
                      syncSingleOpsNote(id);
                    }}
                    rows={3}
                    placeholder="Shared handoff note for this booking..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                  {opsNotes[timelineBookingId]?.updatedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last updated {new Date(opsNotes[timelineBookingId].updatedAt).toLocaleString()}
                      {opsNotes[timelineBookingId].pendingSync ? ' · pending sync' : ''}
                    </p>
                  )}
                </div>
              )}
              {bookingTimeline.length === 0 ? (
                <p className="text-sm text-gray-500">No timeline events found for this booking.</p>
              ) : (
                bookingTimeline.map((evt, i) => (
                  <div key={`${evt.at}-${i}`} className="flex items-start gap-3">
                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-finland/70 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{evt.label}</p>
                      {evt.details && <p className="text-sm text-gray-600">{evt.details}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(evt.at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),92dvh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch cancellation</h3>
            <p className="text-sm text-gray-600 mb-4">Cancel all bookings for one listing in a date range.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Listing</label>
                <select
                  value={batchListingId}
                  onChange={(e) => setBatchListingId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select listing</option>
                  {listingOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From date</label>
                  <input
                    type="date"
                    value={batchDateFrom}
                    onChange={(e) => setBatchDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To date</label>
                  <input
                    type="date"
                    value={batchDateTo}
                    onChange={(e) => setBatchDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={batchReason}
                  onChange={(e) => setBatchReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={batchRefund}
                  onChange={(e) => setBatchRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setBatchModal(false); setBatchListingId(''); setBatchDateFrom(''); setBatchDateTo(''); setBatchReason(''); setBatchRefund(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!batchListingId || !batchDateFrom || !batchDateTo || !batchReason || batchSubmitting}
                onClick={handleBatchCancel}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {batchSubmitting ? 'Cancelling…' : 'Cancel bookings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),92dvh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancel selected bookings</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are cancelling {selectedBookings.filter((b) => b.status !== 'cancelled').length} selected booking(s).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={bulkCancelReason}
                  onChange={(e) => setBulkCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={bulkCancelRefund}
                  onChange={(e) => setBulkCancelRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkCancelModal(false);
                  setBulkCancelReason('');
                  setBulkCancelRefund('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!bulkCancelReason || bulkActionSubmitting}
                onClick={handleBulkCancelSelected}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {bulkActionSubmitting ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
