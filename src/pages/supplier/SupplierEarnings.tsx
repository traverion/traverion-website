import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, FileText, Wallet } from 'lucide-react';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { TraverionDateRangeField } from '../../components/calendar/TraverionDateRangeField';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierActiveCommercialTerms,
  fetchSupplierActiveFinancialHolds,
  fetchPartnerIncomeHistory,
  fetchPartnerIncomeSummary,
  fetchSupplierEarnings,
  fetchSupplierPayoutPeriodItems,
  fetchSupplierPayoutPeriods,
  fetchSupplierPeriodEarnings,
  fetchSupplierPeriodSales,
  type BookingCommercialSnapshotRow,
  type PartnerIncomeHistoryRow,
  type PartnerIncomeSummaryRow,
  type BookingFinancialHoldRow,
  type SupplierCommercialTermsRow,
  type SupplierEarning,
  type SupplierEarningItemRow,
  type SupplierPayoutPeriodRow,
  type SupplierPeriodEarningsReport,
  type SupplierPeriodSalesReport,
} from '../../data/supabase-earnings';
import type { BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import { SUPPLIER_PAGE_CLASS, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { isCollectedBooking, isRefundDueBooking } from '../../lib/payment-states';
import { bookingIsRental, bookingIsStayNight } from '../../lib/pickup-completeness';
import {
  isCollectedEarningKind,
  isPlatformCommissionKind,
  ledgerRecoveryTotal,
} from '../../lib/supplier-ledger-balance';
import { formatBpsAsPercent, fromMinorUnits, planDefinition } from '../../lib/commercial-money';
import {
  showAdminStripeTestDiagnostics,
  SUPPLIER_TEST_DATA_LABEL,
} from '../../lib/traveler-env-presentation';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierLedger, type SupplierLedgerEntry } from '../../data/supabase-booking-ops';
import { PARTNER_MONEY_PAYOUT_STATUS_NOTE, PARTNER_MONEY_EMPTY_TITLE, PARTNER_MONEY_EMPTY_BODY, PARTNER_MONEY_LOAD_ERROR_TITLE, PARTNER_MONEY_FILTER_EMPTY_BODY, PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL } from '../../lib/booking-confirmation-copy';
import NoticeCallout from '../../components/NoticeCallout';
import { localYmd } from '../../lib/local-ymd';
import {
  clearIncomeHubCache,
  readIncomeHubCache,
  writeIncomeHubCache,
} from '../../lib/supplier-income-hub-cache';
import {
  PARTNER_MONEY_CSV_HEADER,
  buildPartnerMoneyCsvRows,
  partnerMoneyCsvHasExportableRows,
} from '../../lib/partner-money-csv';
import { csvSafeCell } from '../../lib/csv-export';
import { displayListingTitleFromPurchase } from '../../lib/purchase-snapshot';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import {
  buildIncomeEarningRows,
  buildIncomeReportPeriods,
  commissionPercentLabel,
  earningStatusExplanation,
  earningStatusLabel,
  maskIban,
  payoutMaySayPaid,
  type IncomeEarningRow,
  type IncomeEarningStatus,
  type IncomeReportPeriod,
} from '../../lib/supplier-income';
import { connectPayoutPresentationStatus } from '../../lib/connect-payout-status';
import {
  downloadPdf,
  earningsStatementLines,
  openPdf,
  payoutStatementLines,
  statementPdf,
} from '../../lib/supplier-finance-pdf';
import IncomeFinancialSettings from '../../components/supplier/IncomeFinancialSettings';

function incomeDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ledgerKindLabel(kind: string): string {
  const k = kind.trim().toLowerCase();
  if (k === 'cancellation_fee' || k === 'supplier_cancellation_fee' || k === 'cancellation_penalty') {
    return 'Cancellation fee';
  }
  if (k === 'booking_earnings') return 'Your earnings';
  if (k === 'platform_commission') return 'Traverion commission';
  if (k === 'refund') return 'Earnings reversal';
  if (k === 'offset' || k === 'balance_offset') return 'Balance offset';
  if (k === 'adjustment') return 'Adjustment';
  if (k === 'supplier_recovery') return 'Recovery (post-payout refund)';
  return kind.replace(/_/g, ' ');
}

function earningStatusClass(status: IncomeEarningStatus): string {
  if (status === 'eligible') return 'tv-income-status tv-income-status--available';
  if (status === 'paid') return 'tv-income-status tv-income-status--paid';
  if (status === 'included') return 'tv-income-status tv-income-status--processing';
  if (status === 'reversed') return 'tv-income-status tv-income-status--reversed';
  return 'tv-income-status';
}

function periodPayoutLabel(
  status: string,
  paidAt: string | null | undefined,
  connectLifecycle?: string | null
): string {
  return connectPayoutPresentationStatus({
    periodStatus: status,
    paidAt,
    connectLifecycle,
  });
}

function payoutStatusClass(
  status: string,
  paidAt: string | null | undefined,
  connectLifecycle?: string | null
): string {
  const label = periodPayoutLabel(status, paidAt, connectLifecycle);
  if (label === 'Paid to bank' || label === 'Paid' || label === 'Paid (manual record)') {
    return 'tv-income-status tv-income-status--paid';
  }
  if (
    label === 'Processing transfer' ||
    label === 'Bank payout in progress' ||
    label === 'Sent to connected account' ||
    label === 'Processing'
  ) {
    return 'tv-income-status tv-income-status--processing';
  }
  if (label === 'Failed or restricted' || label === 'Bank payout failed' || label === 'Failed') {
    return 'tv-income-status tv-income-status--failed';
  }
  if (label === 'Upcoming payout' || label === 'Prepared' || label === 'Drafting') {
    return 'tv-income-status tv-income-status--available';
  }
  return 'tv-income-status';
}

function holdReasonLabel(code: string | null | undefined): string {
  const c = (code ?? '').trim().toLowerCase();
  if (c === 'negative_balance') return 'Recovery balance';
  if (c === 'dispute') return 'Dispute hold';
  if (c === 'support_case' || c === 'customer_support') return 'Support case hold';
  if (c === 'fraud_review') return 'Fraud review';
  if (c === 'verification') return 'Verification hold';
  if (c === 'manual_review') return 'Manual review';
  if (!c) return 'Financial hold';
  return c.replace(/_/g, ' ');
}

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  // Phase 1760: Money CSV is finance/owner; viewers must not export or audit-log.
  const { role } = useSupplierRole();
  const canExportFinance = canManageFinance(role);
  const canEditPayoutSettings = canManageBookings(role);
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
  const [paidBookings, setPaidBookings] = useState<BookingRow[]>([]);
  const [refundDueBookings, setRefundDueBookings] = useState<BookingRow[]>([]);
  const [historyBookings, setHistoryBookings] = useState<BookingRow[]>([]);
  const [incomeSummary, setIncomeSummary] = useState<PartnerIncomeSummaryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyAnchorRef = useRef<{ createdAt: string; id: string } | null>(null);
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [commercialTerms, setCommercialTerms] = useState<SupplierCommercialTermsRow | null>(null);
  const [earningItems, setEarningItems] = useState<SupplierEarningItemRow[]>([]);
  const [snapshots, setSnapshots] = useState<BookingCommercialSnapshotRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [payoutPeriods, setPayoutPeriods] = useState<SupplierPayoutPeriodRow[]>([]);
  const [financialHolds, setFinancialHolds] = useState<BookingFinancialHoldRow[]>([]);
  const [reportPeriodId, setReportPeriodId] = useState<string | null>(null);
  const [periodSales, setPeriodSales] = useState<SupplierPeriodSalesReport | null>(null);
  const [periodEarnings, setPeriodEarnings] = useState<SupplierPeriodEarningsReport | null>(null);
  const [periodReportLoading, setPeriodReportLoading] = useState(false);
  const [periodReportError, setPeriodReportError] = useState<string | null>(null);
  const [periodReportNonce, setPeriodReportNonce] = useState(0);
  const [earningQuery, setEarningQuery] = useState('');
  const [earningFrom, setEarningFrom] = useState('');
  const [earningTo, setEarningTo] = useState('');
  const [earningListing, setEarningListing] = useState('');
  const [earningStatus, setEarningStatus] = useState('all');
  const [earningSort, setEarningSort] = useState<'activity' | 'purchase' | 'earnings'>('activity');
  const [earningPage, setEarningPage] = useState(0);
  const [selectedEarningId, setSelectedEarningId] = useState<string | null>(null);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<'all' | 'statements' | 'payouts' | 'confirmations'>('all');
  const [docYear, setDocYear] = useState('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedPayoutItems, setSelectedPayoutItems] = useState<
    Awaited<ReturnType<typeof fetchSupplierPayoutPeriodItems>>
  >([]);
  const [tab, setTab] = useState<'overview' | 'earnings' | 'payouts' | 'documents' | 'settings'>(() => {
    if (typeof window === 'undefined') return 'overview';
    const value = new URLSearchParams(window.location.search).get('tab');
    return value === 'earnings' || value === 'payouts' || value === 'documents' || value === 'settings' ? value : 'overview';
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>(() => {
    if (typeof window === 'undefined') return 'all';
    const s = new URLSearchParams(window.location.search).get('status');
    return s === 'pending' || s === 'paid' ? s : 'all';
  });
  const [listWindow, setListWindow] = useState<'30d' | '90d' | 'all'>(() => {
    if (typeof window === 'undefined') return 'all';
    const w = new URLSearchParams(window.location.search).get('window');
    return w === '30d' || w === '90d' || w === 'all' ? w : 'all';
  });
  const loadGenRef = useRef(0);
  const profileLoadGenRef = useRef(0);
  const earningsHubUserIdRef = useRef<string | null>(null);
  const hasPaintedMoneyRef = useRef(false);

  const setTabAndUrl = useCallback((next: 'overview' | 'earnings' | 'payouts' | 'documents' | 'settings') => {
    setTab(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.pushState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const setListWindowAndUrl = useCallback((next: '30d' | '90d' | 'all') => {
    setListWindow(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('window');
    else url.searchParams.set('window', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('status');
      setStatusFilter(s === 'pending' || s === 'paid' ? s : 'all');
      const w = params.get('window');
      setListWindow(w === '30d' || w === '90d' || w === 'all' ? w : 'all');
      const nextTab = params.get('tab');
      setTab(nextTab === 'earnings' || nextTab === 'payouts' || nextTab === 'documents' || nextTab === 'settings' ? nextTab : 'overview');
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const load = useCallback(() => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    const cached = readIncomeHubCache(uid);
    // Soft refresh when we already have paintable data — never flash three empty cards.
    const soft = Boolean(cached) || hasPaintedMoneyRef.current;
    if (!soft) setLoading(true);
    setError(null);
    setLedgerError(null);
    Promise.all([
      fetchSupplierEarnings(uid),
      fetchPartnerIncomeSummary(),
      fetchMyListings(uid),
      fetchSupplierActiveCommercialTerms(uid),
      fetchSupplierPayoutPeriods(uid),
      fetchSupplierActiveFinancialHolds(uid),
      fetchSupplierLedger(uid)
        .then((rows) => ({ ok: true as const, rows }))
        .catch((err: unknown) => ({ ok: false as const, err })),
    ])
      .then(async ([data, summary, listings, terms, periods, holds, ledgerResult]) => {
        if (gen !== loadGenRef.current) return;
        const titles = Object.fromEntries(listings.map((l) => [l.id, l.title]));
        setEarnings(data);
        setIncomeSummary(summary);
        setCommercialTerms(terms);
        setPayoutPeriods(periods);
        setFinancialHolds(holds);
        setListingTitles(titles);
        let ledgerRows: SupplierLedgerEntry[] = [];
        if (gen !== loadGenRef.current) return;
        if (ledgerResult.ok) {
          ledgerRows = ledgerResult.rows;
          setLedger(ledgerRows);
          setLedgerError(null);
        } else {
          // Keep prior ledger — failure must not look like zero adjustments.
          setLedgerError(userFacingError(ledgerResult.err, USER_ERROR.money));
        }
        hasPaintedMoneyRef.current = true;
        writeIncomeHubCache({
          userId: uid,
          earnings: data,
          paidBookings: [],
          refundDueBookings: [],
          ledger: ledgerRows,
          commercialTerms: terms,
          earningItems: [],
          snapshots: [],
          payoutPeriods: periods,
          financialHolds: holds,
          listingTitles: titles,
          incomeSummary: summary,
        });
      })
      .catch((e) => {
        if (gen !== loadGenRef.current) return;
        // Keep prior earnings/bookings — reload failure must not look like zero income.
        setError(userFacingError(e, USER_ERROR.money));
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    const clearEarningsPartnerWorkspace = () => {
      setEarnings([]);
      setPaidBookings([]);
      setRefundDueBookings([]);
      setHistoryBookings([]);
      setIncomeSummary([]);
      setHistoryTotal(0);
      setEarningItems([]);
      setSnapshots([]);
      historyAnchorRef.current = null;
      setLedger([]);
      setPayoutPeriods([]);
      setFinancialHolds([]);
      setPeriodSales(null);
      setPeriodEarnings(null);
      setPeriodReportError(null);
      setReportPeriodId(null);
      setListingTitles({});
      setProfile(null);
      setError(null);
      setLedgerError(null);
    };
    if (!user?.id) {
      earningsHubUserIdRef.current = null;
      loadGenRef.current += 1;
      profileLoadGenRef.current += 1;
      clearEarningsPartnerWorkspace();
      clearIncomeHubCache();
      hasPaintedMoneyRef.current = false;
      setLoading(false);
      return;
    }
    if (earningsHubUserIdRef.current !== user.id) {
      earningsHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      profileLoadGenRef.current += 1;
      clearEarningsPartnerWorkspace();
      hasPaintedMoneyRef.current = false;
      const cached = readIncomeHubCache(user.id);
      if (cached) {
        setEarnings(cached.earnings as SupplierEarning[]);
        setPaidBookings([]);
        setRefundDueBookings([]);
        setIncomeSummary((cached.incomeSummary ?? []) as PartnerIncomeSummaryRow[]);
        setLedger(cached.ledger as SupplierLedgerEntry[]);
        setCommercialTerms(cached.commercialTerms as SupplierCommercialTermsRow | null);
        setEarningItems(cached.earningItems as SupplierEarningItemRow[]);
        setSnapshots(cached.snapshots as BookingCommercialSnapshotRow[]);
        setPayoutPeriods(cached.payoutPeriods as SupplierPayoutPeriodRow[]);
        setFinancialHolds(cached.financialHolds as BookingFinancialHoldRow[]);
        setListingTitles(cached.listingTitles);
        hasPaintedMoneyRef.current = true;
        setLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (isSupabase && user?.id) void load();
    else {
      loadGenRef.current += 1;
      setLoading(false);
    }
  }, [isSupabase, user?.id, load]);

  useEffect(() => {
    historyAnchorRef.current = null;
    setEarningPage(0);
  }, [earningQuery, earningFrom, earningTo, earningListing, earningStatus, earningSort]);

  useEffect(() => {
    if (!isSupabase || !user?.id) return;
    let cancelled = false;
    const pageSize = 20;
    const anchor = earningPage > 0 ? historyAnchorRef.current : null;
    void fetchPartnerIncomeHistory({
      limit: pageSize,
      offset: earningPage * pageSize,
      notAfter: anchor?.createdAt ?? null,
      notAfterId: anchor?.id ?? null,
      listingId: earningListing || null,
      status: earningStatus,
      from: earningFrom || null,
      to: earningTo || null,
      search: earningQuery,
      sort: earningSort,
    })
      .then(({ rows, total }) => {
        if (cancelled) return;
        setHistoryTotal(total);
        if (earningPage === 0 && rows[0]?.created_at && rows[0].id) {
          historyAnchorRef.current = { createdAt: rows[0].created_at, id: rows[0].id };
        }
        const bookings = rows.map((row) => ({
          id: row.id,
          listing_id: row.listing_id,
          currency: row.currency,
          amount_paid: row.amount_paid,
          booking_date: row.booking_date,
          created_at: row.created_at,
          guest_name: row.guest_name,
          public_reference: row.public_reference,
          booking_number: row.booking_number,
          purchase_snapshot: row.purchase_snapshot,
          status: row.status,
          payment_status: row.payment_status,
          check_out: row.check_out,
          nights: row.nights,
          refund_choice: row.refund_choice,
        })) as BookingRow[];
        setHistoryBookings(bookings);
        setPaidBookings(bookings.filter(isCollectedBooking));
        setRefundDueBookings(bookings.filter(isRefundDueBooking));
        setSnapshots(
          rows
            .filter((row) => row.id && (row.snap_currency != null || row.remaining_supplier_minor != null))
            .map((row) => ({
              booking_id: row.id as string,
              currency: row.snap_currency || row.currency || 'EUR',
              gross_minor: Number(row.remaining_gross_minor) || 0,
              commission_minor: Number(row.remaining_commission_minor) || 0,
              supplier_minor: Number(row.remaining_supplier_minor) || 0,
              remaining_gross_minor: Number(row.remaining_gross_minor) || 0,
              remaining_commission_minor: Number(row.remaining_commission_minor) || 0,
              remaining_supplier_minor: Number(row.remaining_supplier_minor) || 0,
              plan_code: 'standard',
              commission_bps: Number(row.commission_bps) || 0,
              payout_cadence: 'monthly',
            }))
        );
        setEarningItems(
          rows
            .filter((row) => row.id && row.item_status)
            .map((row) => ({
              id: row.id as string,
              booking_id: row.id as string,
              supplier_id: '',
              currency: row.item_currency || row.currency || 'EUR',
              amount_minor: Number(row.item_amount_minor) || 0,
              status: row.item_status as SupplierEarningItemRow['status'],
              experience_at: row.item_experience_at,
              eligible_at: null,
              payout_period_id: null,
              sold_at: row.item_sold_at,
              service_completed_at: row.item_service_completed_at,
              gross_minor: row.item_gross_minor,
              commission_minor: row.item_commission_minor,
              commission_bps: row.item_commission_bps,
            }))
        );
        setListingTitles((current) => {
          const next = { ...current };
          for (const row of rows) {
            if (row.listing_id && row.listing_title) next[row.listing_id] = row.listing_title;
          }
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(userFacingError(err, USER_ERROR.money));
      });
    return () => {
      cancelled = true;
    };
  }, [isSupabase, user?.id, earningPage, earningListing, earningStatus, earningFrom, earningTo, earningQuery, earningSort]);

  useEffect(() => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      profileLoadGenRef.current += 1;
      setProfile(null);
      return;
    }
    const gen = ++profileLoadGenRef.current;
    void fetchSupplierProfile(uid).then((p) => {
      // Phase 1488: stale profile fetch must not paint prior partner payout prefs.
      if (gen !== profileLoadGenRef.current) return;
      setProfile(p);
    });
  }, [isSupabase, user?.id]);

  /** Kept only as a last-resort currency label for a row missing its own currency. */
  const primaryCurrency = useMemo(() => {
    const bookingCur =
      incomeSummary.find((row) => (row.currency ?? '').trim())?.currency ||
      paidBookings.find((b) => (b.currency ?? '').trim())?.currency;
    const row = earnings.find((e) => e.status !== 'cancelled');
    return (bookingCur || row?.currency || earnings[0]?.currency || 'EUR').toUpperCase();
  }, [earnings, incomeSummary, paidBookings]);

  const filteredEarnings = useMemo(() => {
    const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
    return statusFilter === 'all' ? nonCancelled : nonCancelled.filter((e) => e.status === statusFilter);
  }, [earnings, statusFilter]);

  /** List/export window only — hero balances stay all-time truth. */
  const paidBookingsInWindow = useMemo(() => {
    const days = listWindow === '30d' ? 30 : listWindow === '90d' ? 90 : null;
    if (days == null) return paidBookings;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return paidBookings.filter((b) => {
      const t = b.created_at ? new Date(b.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [paidBookings, listWindow]);

  // Phase 1574: list/export Refund due respect the same window as collected/ledger (hero stays all-time).
  const refundDueBookingsInWindow = useMemo(() => {
    const days = listWindow === '30d' ? 30 : listWindow === '90d' ? 90 : null;
    if (days == null) return refundDueBookings;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return refundDueBookings.filter((b) => {
      const t = b.created_at ? new Date(b.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [refundDueBookings, listWindow]);

  const ledgerInWindow = useMemo(() => {
    const days = listWindow === '30d' ? 30 : listWindow === '90d' ? 90 : null;
    if (days == null) return ledger;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return ledger.filter((e) => {
      const t = e.created_at ? new Date(e.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [ledger, listWindow]);

  const filteredEarningsInWindow = useMemo(() => {
    const days = listWindow === '30d' ? 30 : listWindow === '90d' ? 90 : null;
    if (days == null) return filteredEarnings;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return filteredEarnings.filter((e) => {
      const t = e.created_at ? new Date(e.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [filteredEarnings, listWindow]);

  type CurrencyMoney = {
    currency: string;
    /** Traveler GMV collected */
    gross: number;
    /** Traverion commission (from snapshots when present) */
    commission: number;
    /** Supplier contractual earnings (net) */
    yourEarnings: number;
    /** Experience not yet eligible */
    pending: number;
    /** Ready for next payout cycle */
    eligible: number;
    /** Locked into a prepared payout period */
    included: number;
    /** Recorded as paid out */
    paid: number;
    /** Next-payout figure = eligible (authoritative earning items) */
    available: number;
    fees: number;
    refundDue: number;
    refundDueCount: number;
  };

  /**
   * Commercial V1: GMV / commission / your earnings from snapshots when present;
   * pending/eligible/paid from supplier_earning_items. Never mix currencies.
   */
  const moneyByCurrency: CurrencyMoney[] = useMemo(() => {
    const byCurrency = new Map<string, CurrencyMoney>();
    const bucket = (code: string | null | undefined) => {
      const currency = normalizeCurrency(code ?? primaryCurrency);
      let s = byCurrency.get(currency);
      if (!s) {
        s = {
          currency,
          gross: 0,
          commission: 0,
          yourEarnings: 0,
          fees: 0,
          paid: 0,
          pending: 0,
          eligible: 0,
          included: 0,
          available: 0,
          refundDue: 0,
          refundDueCount: 0,
        };
        byCurrency.set(currency, s);
      }
      return s;
    };

    const hasCommercial = incomeSummary.some(
      (row) => Number(row.snapshot_count) > 0 || Number(row.item_count) > 0
    );

    if (hasCommercial) {
      for (const row of incomeSummary) {
        const s = bucket(row.currency);
        s.gross += fromMinorUnits(Number(row.snapshot_gross_minor) || 0);
        s.commission += fromMinorUnits(Number(row.snapshot_commission_minor) || 0);
        s.yourEarnings += fromMinorUnits(Number(row.snapshot_supplier_minor) || 0);
        s.pending = fromMinorUnits(Number(row.item_pending_minor) || 0);
        s.eligible = fromMinorUnits(Number(row.item_eligible_minor) || 0);
        s.included = fromMinorUnits(Number(row.item_included_minor) || 0);
        s.paid = fromMinorUnits(Number(row.item_paid_minor) || 0);
        s.available = s.eligible;
      }
    } else {
      const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
      for (const e of nonCancelled) {
        const s = bucket(e.currency);
        if (e.status === 'paid') s.paid += Number(e.amount);
        else if (e.status === 'pending') s.pending += Number(e.amount);
      }
      for (const row of incomeSummary) {
        const s = bucket(row.currency);
        s.gross += Number(row.legacy_collected_major) || 0;
        s.yourEarnings += Number(row.legacy_collected_major) || 0;
      }
      for (const row of ledger) {
        if (isCollectedEarningKind(row.kind) || isPlatformCommissionKind(row.kind)) continue;
        bucket(row.currency).fees += Number(row.amount);
      }
      for (const s of byCurrency.values()) {
        s.available = s.gross + s.fees - s.paid;
        s.pending = s.pending > 0 ? s.pending + s.fees : s.available;
      }
    }

    for (const row of incomeSummary) {
      const s = bucket(row.currency);
      s.refundDue += Number(row.refund_due_major) || 0;
      s.refundDueCount += Number(row.refund_due_count) || 0;
    }
    return [...byCurrency.values()].sort((a, b) => b.gross - a.gross);
  }, [
    earnings,
    incomeSummary,
    ledger,
    primaryCurrency,
  ]);

  const planSummary = useMemo(() => {
    if (!commercialTerms) return null;
    const def = planDefinition(commercialTerms.plan_code);
    if (def) return def.supplierFacingSummary;
    return `${formatBpsAsPercent(commercialTerms.commission_bps)} commission · ${
      commercialTerms.payout_cadence === 'semimonthly' ? 'Twice-monthly' : 'Monthly'
    } payouts`;
  }, [commercialTerms]);

  /** Negative = supplier owes Traverion after post-payout refund/chargeback recovery. */
  const recoveryBalance = useMemo(() => ledgerRecoveryTotal(ledger), [ledger]);

  const incomeRows = useMemo(() => {
    const bookings = historyBookings.length > 0 ? historyBookings : [...paidBookings, ...refundDueBookings];
    const seen = new Set<string>();
    const unique = bookings.filter((booking) => {
      if (seen.has(booking.id)) return false;
      seen.add(booking.id);
      return true;
    });
    return buildIncomeEarningRows({
      bookings: unique,
      snapshots,
      items: earningItems,
      holds: financialHolds,
      experienceTitle: (booking) =>
        displayListingTitleFromPurchase(
          paidBookings.find((row) => row.id === booking.id)?.purchase_snapshot ??
            refundDueBookings.find((row) => row.id === booking.id)?.purchase_snapshot,
          booking.listing_id ? listingTitles[booking.listing_id] : undefined,
          'Experience'
        ),
      referenceLabel: (booking) =>
        travelerPublicBookingReference(booking.public_reference) ||
        (typeof booking.booking_number === 'number' ? `#${booking.booking_number}` : booking.id.slice(0, 8)),
    });
  }, [historyBookings, paidBookings, refundDueBookings, snapshots, earningItems, listingTitles, financialHolds]);

  const reportPeriods: IncomeReportPeriod[] = useMemo(
    () => buildIncomeReportPeriods(commercialTerms?.payout_cadence ?? 'monthly'),
    [commercialTerms?.payout_cadence]
  );

  const selectedReportPeriod = useMemo(() => {
    if (reportPeriods.length === 0) return null;
    return reportPeriods.find((period) => period.id === reportPeriodId) ?? reportPeriods[0] ?? null;
  }, [reportPeriods, reportPeriodId]);

  useEffect(() => {
    if (!reportPeriodId && reportPeriods[0]) setReportPeriodId(reportPeriods[0].id);
  }, [reportPeriodId, reportPeriods]);

  useEffect(() => {
    const uid = user?.id;
    const period = selectedReportPeriod;
    if (!isSupabase || !uid || !period) {
      setPeriodSales(null);
      setPeriodEarnings(null);
      return;
    }
    let cancelled = false;
    setPeriodReportLoading(true);
    setPeriodReportError(null);
    const currency = (
      incomeSummary.find((row) => row.currency?.trim())?.currency ||
      snapshots.find((row) => row.currency?.trim())?.currency ||
      paidBookings.find((row) => row.currency?.trim())?.currency ||
      'EUR'
    ).toUpperCase();
    void Promise.all([
      fetchSupplierPeriodSales({
        supplierId: uid,
        fromIso: period.fromIso,
        toIso: period.toIso,
        currency,
      }),
      fetchSupplierPeriodEarnings({
        supplierId: uid,
        fromIso: period.fromIso,
        toIso: period.toIso,
        currency,
      }),
    ])
      .then(([sales, earningsReport]) => {
        if (cancelled) return;
        setPeriodSales(sales);
        setPeriodEarnings(earningsReport);
      })
      .catch((err) => {
        if (cancelled) return;
        setPeriodReportError(userFacingError(err, USER_ERROR.money));
      })
      .finally(() => {
        if (!cancelled) setPeriodReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isSupabase,
    user?.id,
    selectedReportPeriod,
    incomeSummary,
    snapshots,
    paidBookings,
    periodReportNonce,
  ]);

  const filteredIncomeRows = incomeRows;

  const earningsForInvoices = useMemo(
    () => earnings.filter((e) => e.status !== 'cancelled'),
    [earnings]
  );

  const nextPayoutLabel = PARTNER_MONEY_PAYOUT_STATUS_NOTE;

  const rowsInExportWindow = <T extends { created_at?: string | null }>(
    rows: T[],
    window: '30d' | '90d' | 'all'
  ): T[] => {
    const days = window === '30d' ? 30 : window === '90d' ? 90 : null;
    if (days == null) return rows;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
      const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
  };

  const exportCsv = async (windowOverride?: '30d' | '90d' | 'all') => {
    // Phase 1760: role gate before download + export_runs insert.
    if (!canExportFinance || !user?.id) return;
    const exportWindow = windowOverride ?? listWindow;
    if (windowOverride && windowOverride !== listWindow) setListWindowAndUrl(windowOverride);
    const history: PartnerIncomeHistoryRow[] = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await fetchPartnerIncomeHistory({
        limit: 200,
        offset,
        listingId: earningListing || null,
        status: earningStatus,
        from: earningFrom || null,
        to: earningTo || null,
        search: earningQuery,
        sort: 'purchase',
      });
      total = page.total;
      history.push(...page.rows);
      if (history.length >= 20000) {
        setError('Too many earnings to export at once. Narrow the filters and try again.');
        return;
      }
      offset += page.rows.length;
      if (page.rows.length < 200) break;
    } while (offset < total);
    const historyBookingsForExport = history.map((row) => ({
      id: row.id,
      listing_id: row.listing_id,
      currency: row.currency,
      amount_paid: row.amount_paid,
      booking_date: row.booking_date,
      created_at: row.created_at,
      guest_name: row.guest_name,
      public_reference: row.public_reference,
      booking_number: row.booking_number,
      purchase_snapshot: row.purchase_snapshot,
      status: row.status,
      payment_status: row.payment_status,
      refund_choice: row.refund_choice,
      listing_title: row.listing_title,
    })) as Array<BookingRow & { listing_title?: string | null }>;
    const payouts = rowsInExportWindow(filteredEarnings, exportWindow);
    const refundDue = rowsInExportWindow(
      historyBookingsForExport.filter(isRefundDueBooking),
      exportWindow
    );
    const collectedBookings = rowsInExportWindow(
      historyBookingsForExport.filter(isCollectedBooking),
      exportWindow
    );
    const ledgerRows = rowsInExportWindow(ledger, exportWindow);
    const collectedForExport =
      payouts.length === 0
        ? collectedBookings.map((b) => ({
            ...b,
            listing_title:
              displayListingTitleFromPurchase(
                b.purchase_snapshot,
                listingTitles[b.listing_id],
                ''
              ) || null,
          }))
        : [];
    if (
      !partnerMoneyCsvHasExportableRows({
        payouts,
        refundDue,
        collected: collectedForExport,
        ledger: ledgerRows,
      })
    ) {
      return;
    }
    const body = buildPartnerMoneyCsvRows({
      payouts,
      refundDue: refundDue.map((b) => ({
        ...b,
        listing_title:
          displayListingTitleFromPurchase(
            b.purchase_snapshot,
            listingTitles[b.listing_id],
            ''
          ) || null,
      })),
      collected: collectedForExport,
      ledger: ledgerRows,
      ledgerKindLabel,
    });
    const csv = [PARTNER_MONEY_CSV_HEADER.join(','), ...body.map((cols) => cols.map(csvSafeCell).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-money-${localYmd()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // Phase 1791: await audit — silent void hid RLS/network failures after download.
    const audited = await insertSupplierExportRun({
      supplierId: user.id,
      actorId: user.id,
      kind: 'ops_summary',
      format: 'csv',
      scope: 'filtered',
      rowCount: body.length,
      filtersSnapshot: {
        surface: 'money',
        statusFilter,
        listWindow: exportWindow,
      },
    });
    if (!audited) {
      setError('Export downloaded, but the audit log failed. Try again or contact support.');
    }
  };

  const canExportMoney = historyTotal > 0 || partnerMoneyCsvHasExportableRows({
    payouts: filteredEarningsInWindow,
    refundDue: refundDueBookingsInWindow,
    collected: filteredEarningsInWindow.length === 0 ? paidBookingsInWindow : [],
    ledger: ledgerInWindow,
  });

  const hasMoney =
    moneyByCurrency.some((s) => s.gross > 0 || s.pending !== 0 || s.paid > 0) ||
    earningsForInvoices.length > 0 ||
    ledger.length > 0 ||
    incomeSummary.some((row) => Number(row.refund_due_count) > 0 || Number(row.legacy_collected_count) > 0 || Number(row.snapshot_count) > 0);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(historyTotal / pageSize));
  const pageRows = filteredIncomeRows;
  const summaryCurrency = moneyByCurrency[0]?.currency ?? primaryCurrency;
  const nextPeriod = [...payoutPeriods]
    .filter((period) => period.status === 'ready' || period.status === 'processing' || period.status === 'drafting')
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  const selectedEarning = incomeRows.find((row) => row.bookingId === selectedEarningId) ?? null;
  const selectedPayout = payoutPeriods.find((period) => period.id === selectedPayoutId) ?? null;
  const supplierAddress = [profile?.address_street, profile?.address_postal_code, profile?.address_city, profile?.address_country]
    .filter(Boolean)
    .join(', ');
  const adjustmentRows = ledger.filter((row) => !isCollectedEarningKind(row.kind) && !isPlatformCommissionKind(row.kind));
  const docYears = [...new Set(incomeRows.map((row) => (row.activityDate ?? row.purchaseDate ?? '').slice(0, 4)).filter((year) => year.length === 4))];

  const openEarningStatement = (row: IncomeEarningRow, download: boolean) => {
    if (row.grossMinor == null || row.commissionMinor == null || row.commissionBps == null) return;
    const bytes = statementPdf(
      earningsStatementLines({
        reference: `ES-${row.reference}`,
        issueDate: localYmd(),
        supplierName: profile?.company_legal_name ?? profile?.display_name ?? null,
        supplierAddress: supplierAddress || null,
        businessId: profile?.company_registration_number ?? null,
        vatId: profile?.vat_id ?? null,
        bookingReference: row.reference,
        experience: row.experience,
        activityDate: row.activityDate,
        purchaseDate: row.purchaseDate,
        currency: row.currency,
        grossMinor: row.grossMinor,
        commissionMinor: row.commissionMinor,
        commissionBps: row.commissionBps,
        netMinor: row.netMinor,
        payoutStatus: earningStatusLabel(row.status),
      })
    );
    if (download) downloadPdf(`traverion-earnings-${row.reference}.pdf`, bytes);
    else openPdf(bytes);
  };

  const openPayoutStatement = async (period: SupplierPayoutPeriodRow, download: boolean) => {
    // Completed payout statements require verified payment confirmation — never for READY alone.
    if (!payoutMaySayPaid(period.status, period.paid_at)) {
      setError(
        'A completed payout statement is available only after payment is confirmed with a completion time. Prepared periods are not bank payouts.'
      );
      return;
    }
    const included = await fetchSupplierPayoutPeriodItems(period.id);
    const bytes = statementPdf(
      payoutStatementLines({
        reference: `PS-${period.period_key}`,
        issueDate: period.paid_at?.slice(0, 10) || localYmd(),
        supplierName: profile?.company_legal_name ?? profile?.display_name ?? null,
        currency: period.currency,
        periodStart: period.period_start,
        periodEnd: period.period_end,
        statusLabel: periodPayoutLabel(period.status, period.paid_at, period.connect_lifecycle),
        paidAt: period.paid_at,
        paymentReference: period.paid_via,
        totalNetMinor: Number(period.amount_minor) || 0,
        lines: included.map((item) => {
          const row = incomeRows.find((earning) => earning.bookingId === item.booking_id);
          return {
            reference: row?.reference ?? item.booking_id.slice(0, 8),
            experience: row?.experience ?? 'Booking',
            grossMinor: row?.grossMinor ?? null,
            commissionMinor: row?.commissionMinor ?? null,
            commissionBps: row?.commissionBps ?? null,
            netMinor: Number(item.amount_minor) || 0,
          };
        }),
      })
    );
    if (download) downloadPdf(`traverion-payout-${period.period_key}.pdf`, bytes);
    else openPdf(bytes);
  };

  useEffect(() => {
    if (!selectedPayoutId) {
      setSelectedPayoutItems([]);
      return;
    }
    let cancelled = false;
    void fetchSupplierPayoutPeriodItems(selectedPayoutId).then((items) => {
      if (!cancelled) setSelectedPayoutItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPayoutId]);

  const bookingAdjustmentsFor = (bookingId: string) =>
    adjustmentRows.filter((row) => row.booking_id === bookingId);

  const runExportForWindow = async (window: '30d' | '90d' | 'all') => {
    setExportMenuOpen(false);
    await exportCsv(window);
  };

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      const root = document.querySelector('.tv-income-export');
      if (root && !root.contains(target)) setExportMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-income font-sans`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tv-income-title">Income & Payouts</h1>
            {showAdminStripeTestDiagnostics() ? (
              <span
                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-950"
                title="This environment uses test financial data. Amounts are not real bank transfers."
              >
                {SUPPLIER_TEST_DATA_LABEL}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tv-income-export">
          <button
            type="button"
            onClick={() => setExportMenuOpen((open) => !open)}
            disabled={!canExportFinance || !canExportMoney}
            className="tv-btn-secondary inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-[13px] disabled:opacity-40"
            title={!canExportFinance ? 'Your role can view Income but cannot export CSV' : 'Export CSV for a date window (all earnings in that window, not only the current Earnings table filters)'}
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
          >
            Export CSV
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
          {exportMenuOpen ? (
            <div className="tv-income-export__menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void runExportForWindow('30d')}>Last 30 days</button>
              <button type="button" role="menuitem" onClick={() => void runExportForWindow('90d')}>Last 90 days</button>
              <button type="button" role="menuitem" onClick={() => void runExportForWindow('all')}>All time</button>
            </div>
          ) : null}
          <p className="tv-income-export__hint">Exports the selected window — not Earnings table filters.</p>
        </div>
      </div>
      <div className="tv-income-tabs" role="tablist" aria-label="Income">
        {([
          ['overview', 'Overview'],
          ['earnings', 'Earnings'],
          ['payouts', 'Payouts'],
          ['documents', 'Documents'],
          ['settings', 'Settings'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTabAndUrl(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <ErrorState
          className="py-6"
          title={PARTNER_MONEY_LOAD_ERROR_TITLE}
          body={userFacingError(error, USER_ERROR.money)}
          retry={{ onClick: () => void load() }}
          extra={<a href="/contact" className="tv-btn-ghost inline-flex">Contact support</a>}
        />
      )}
      {!error && ledgerError ? (
        <NoticeCallout title="Ledger adjustments unavailable" tone="warn">
          <p>{ledgerError}</p>
          <button type="button" onClick={() => void load()} className="tv-btn-ghost mt-2 -ml-2">Retry</button>
        </NoticeCallout>
      ) : null}
      {/* Settings/documents must never show money-list skeletons (blank rectangles above Settings). */}
      {loading && !hasMoney && tab !== 'settings' && tab !== 'documents' ? (
        <SupplierListSkeleton rows={3} />
      ) : null}

      {!loading && !hasMoney && !error && tab !== 'settings' ? (
        <div className="tv-income-empty tv-income-empty--compact">
          <div className="tv-income-empty__icon"><Wallet className="h-5 w-5" aria-hidden /></div>
          <h3 className="text-sm font-bold text-[#18181b]">{PARTNER_MONEY_EMPTY_TITLE}</h3>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-[#71717a]">{PARTNER_MONEY_EMPTY_BODY}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="tv-btn-primary h-9 px-3 text-[13px]" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
              Open bookings
            </button>
            <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}>
              Your listings
            </button>
          </div>
        </div>
      ) : null}

      {hasMoney && tab === 'overview' ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-4">
          <div className="tv-income-period-bar">
            <label className="tv-income-field min-w-[14rem] flex-1 sm:flex-none">
              <span>Reporting period</span>
              <PartnerSelect
                aria-label="Reporting period"
                value={selectedReportPeriod?.id ?? ''}
                options={reportPeriods.map((period) => ({
                  value: period.id,
                  label: `${period.label} (${period.rangeLabel})`,
                }))}
                onChange={(next) => setReportPeriodId(next)}
              />
            </label>
            <p className="tv-income-period-bar__hint">
              {selectedReportPeriod
                ? `${selectedReportPeriod.rangeLabel} · Sales use purchase date; earnings use service completion`
                : 'Select a period'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="income-overview-primary-cards">
            <div className="tv-income-metric tv-income-metric--hero">
              <p className="tv-income-metric__label">Period sales</p>
              <p className="tv-income-metric__value">
                {periodReportLoading
                  ? '…'
                  : formatMoney(
                      ((periodSales?.ok ? Number(periodSales.supplier_net_minor) : 0) || 0) / 100,
                      (periodSales?.currency || summaryCurrency).toUpperCase()
                    )}
              </p>
              <p className="tv-income-metric__hint">
                Supplier-net of bookings sold in this period (includes future services).
                {periodSales?.ok && typeof periodSales.sale_count === 'number'
                  ? ` · ${periodSales.sale_count} sale${periodSales.sale_count === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
            <div className="tv-income-metric tv-income-metric--hero">
              <p className="tv-income-metric__label">Period earnings</p>
              <p className="tv-income-metric__value">
                {periodReportLoading
                  ? '…'
                  : formatMoney(
                      ((periodEarnings?.ok ? Number(periodEarnings.supplier_net_minor) : 0) || 0) / 100,
                      (periodEarnings?.currency || summaryCurrency).toUpperCase()
                    )}
              </p>
              <p className="tv-income-metric__hint">
                Supplier-net from services completed and cleared in this period.
                {periodEarnings?.ok && typeof periodEarnings.earning_count === 'number'
                  ? ` · ${periodEarnings.earning_count} earning${periodEarnings.earning_count === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
          </div>

          {periodReportError ? (
            <NoticeCallout title="Period totals unavailable" tone="warn">
              <p>{periodReportError}</p>
              <button type="button" className="tv-btn-ghost mt-2 -ml-2" onClick={() => setPeriodReportNonce((n) => n + 1)}>
                Retry
              </button>
            </NoticeCallout>
          ) : null}

          {(periodEarnings?.ok && Number(periodEarnings.outstanding_recovery_minor) > 0) || recoveryBalance < 0 ? (
            <NoticeCallout title="Outstanding recovery balance" tone="warn">
              <p>
                Outstanding recovery balance:{' '}
                <strong className="font-semibold tabular-nums text-red-800">
                  −
                  {formatMoney(
                    periodEarnings?.ok && Number(periodEarnings.outstanding_recovery_minor) > 0
                      ? Number(periodEarnings.outstanding_recovery_minor) / 100
                      : Math.abs(recoveryBalance),
                    (periodEarnings?.currency || summaryCurrency).toUpperCase()
                  )}
                </strong>
                . This debt reduces future prepared payouts and is never hidden as €0.00 without explanation.
              </p>
            </NoticeCallout>
          ) : null}

          <div className="tv-income-info-strip">
            <div>
              <span className="tv-income-info-strip__label">Payout preference</span>
              <p className="tv-income-info-strip__value">{planSummary ?? 'Not set'}</p>
              <p className="tv-income-info-strip__hint">Preference only — automatic bank payouts are not enabled</p>
            </div>
            <div>
              <span className="tv-income-info-strip__label">Prepared period</span>
              <p className="tv-income-info-strip__value">
                {nextPeriod ? formatMoney(Number(nextPeriod.amount_minor) / 100, nextPeriod.currency) : 'None'}
              </p>
              <p className="tv-income-info-strip__hint">
                {nextPeriod ? 'Internal READY period — not a bank transfer' : 'No prepared payout period'}
              </p>
            </div>
            <div>
              <span className="tv-income-info-strip__label">Scheduled for</span>
              <p className="tv-income-info-strip__value">
                {nextPeriod ? incomeDate(nextPeriod.scheduled_for) : '—'}
              </p>
            </div>
            <div>
              <span className="tv-income-info-strip__label">Payout account</span>
              <p className="tv-income-info-strip__value">
                {profile?.payout_verification_status === 'verified'
                  ? 'Verified'
                  : profile?.payout_iban
                    ? 'Saved, not verified'
                    : 'Missing'}
              </p>
            </div>
          </div>
          <p className="text-[12px] text-[#71717a]">{nextPayoutLabel}</p>

          <section>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[#18181b]">Recent earnings</h2>
              <button type="button" className="text-[12px] font-semibold text-[#073b83]" onClick={() => setTabAndUrl('earnings')}>
                View all
              </button>
            </div>
            {incomeRows.length === 0 ? (
              <p className="mt-2 text-[13px] text-[#71717a]">No earnings rows yet for this account.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
                {incomeRows.slice(0, 5).map((row) => (
                  <li key={row.bookingId}>
                    <button
                      type="button"
                      className="tv-money-row w-full border-0 bg-transparent text-left shadow-none"
                      onClick={() => setSelectedEarningId(row.bookingId)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[#18181b]">{row.reference} · {row.experience}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#71717a]">
                          <span>{incomeDate(row.activityDate)}</span>
                          <span className={earningStatusClass(row.status)}>{earningStatusLabel(row.status)}</span>
                          {row.held ? <span className="tv-income-status tv-income-status--failed">Held</span> : null}
                        </span>
                      </span>
                      <span className="tv-money-row__amount">{formatMoney(row.netMinor / 100, row.currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[#18181b]">Recent payout periods</h2>
              <button type="button" className="text-[12px] font-semibold text-[#073b83]" onClick={() => setTabAndUrl('payouts')}>
                View all
              </button>
            </div>
            {payoutPeriods.length === 0 ? (
              <p className="mt-2 text-[13px] text-[#71717a]">No payout periods prepared yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
                {payoutPeriods.slice(0, 4).map((period) => (
                  <li key={period.id}>
                    <button type="button" className="tv-money-row w-full text-left" onClick={() => setSelectedPayoutId(period.id)}>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#18181b]">{period.period_key}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#71717a]">
                          <span>{incomeDate(period.scheduled_for || period.period_end)}</span>
                          <span className={payoutStatusClass(period.status, period.paid_at, period.connect_lifecycle)}>
                            {periodPayoutLabel(period.status, period.paid_at, period.connect_lifecycle)}
                          </span>
                        </span>
                      </span>
                      <span className="tv-money-row__amount">{formatMoney(Number(period.amount_minor) / 100, period.currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {hasMoney && tab === 'earnings' ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          {(periodEarnings?.ok && Number(periodEarnings.outstanding_recovery_minor) > 0) || recoveryBalance < 0 ? (
            <NoticeCallout title="Outstanding recovery balance" tone="warn">
              Outstanding recovery balance:{' '}
              <strong className="font-semibold tabular-nums text-red-800">
                −
                {formatMoney(
                  periodEarnings?.ok && Number(periodEarnings.outstanding_recovery_minor) > 0
                    ? Number(periodEarnings.outstanding_recovery_minor) / 100
                    : Math.abs(recoveryBalance),
                  summaryCurrency
                )}
              </strong>
              . Debt offsets reduce prepared payout nets; they are not silently erased.
            </NoticeCallout>
          ) : null}
          <div className="tv-income-filters">
            <label className="tv-income-field">
              <span>Search</span>
              <input
                className="tv-input w-full"
                type="search"
                aria-label="Search earnings"
                placeholder="Reference or experience"
                value={earningQuery}
                onChange={(event) => {
                  setEarningQuery(event.target.value);
                  setEarningPage(0);
                }}
              />
            </label>
            <div className="tv-income-field">
              <span>Activity dates</span>
              <TraverionDateRangeField
                id="income-earning-range"
                className="mt-1"
                from={earningFrom}
                to={earningTo}
                placeholder="Start and end"
                aria-label="Activity dates"
                onChange={({ from, to }) => {
                  setEarningFrom(from);
                  setEarningTo(to);
                  setEarningPage(0);
                }}
              />
            </div>
            <label className="tv-income-field">
              <span>Experience</span>
              <PartnerSelect
                aria-label="Experience"
                value={earningListing}
                searchable="auto"
                options={[
                  { value: '', label: 'All experiences' },
                  ...Object.entries(listingTitles).map(([id, title]) => ({ value: id, label: title })),
                ]}
                onChange={(next) => {
                  setEarningListing(next);
                  setEarningPage(0);
                }}
              />
            </label>
            <label className="tv-income-field">
              <span>Status</span>
              <PartnerSelect
                aria-label="Payout status"
                value={earningStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'eligible', label: 'Available' },
                  { value: 'included', label: 'Processing' },
                  { value: 'paid', label: 'Paid out' },
                  { value: 'reversed', label: 'Reversed' },
                  { value: 'recorded', label: 'Recorded' },
                ]}
                onChange={(next) => {
                  setEarningStatus(next);
                  setEarningPage(0);
                }}
              />
            </label>
            <label className="tv-income-field">
              <span>Sort by</span>
              <PartnerSelect
                aria-label="Sort earnings"
                value={earningSort}
                options={[
                  { value: 'activity', label: 'Activity date' },
                  { value: 'purchase', label: 'Purchase date' },
                  { value: 'earnings', label: 'Your earnings' },
                ]}
                onChange={(next) => setEarningSort(next as 'activity' | 'purchase' | 'earnings')}
              />
            </label>
          </div>
          {pageRows.length === 0 ? (
            <div className="tv-income-empty tv-income-empty--compact">
              <div className="tv-income-empty__icon"><Wallet className="h-5 w-5" aria-hidden /></div>
              <h3 className="text-sm font-bold text-[#18181b]">No rows for this filter</h3>
              <p className="mt-1 max-w-sm text-[13px] text-[#71717a]">{PARTNER_MONEY_FILTER_EMPTY_BODY}</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-[10px] border border-[#e5e7eb] bg-white md:block">
                <table className="w-full min-w-[40rem] text-left text-[13px]">
                  <thead className="border-b border-[#e5e7eb] text-xs font-semibold text-[#3a4452]">
                    <tr>
                      <th className="px-3 py-2.5">Booking</th>
                      <th className="px-3 py-2.5">Experience</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Sold</th>
                      <th className="px-3 py-2.5 text-right">Commission</th>
                      <th className="px-3 py-2.5 text-right">Your earnings</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr
                        key={row.bookingId}
                        className="cursor-pointer border-t border-[#e5e7eb]"
                        tabIndex={0}
                        onClick={() => setSelectedEarningId(row.bookingId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedEarningId(row.bookingId);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-[#18181b]">{row.reference}</td>
                        <td className="max-w-[18rem] truncate px-3 py-2.5 text-[#3f3f46]" title={row.experience}>{row.experience}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[#52525b]">{incomeDate(row.activityDate)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[#52525b]">{incomeDate(row.purchaseDate)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#52525b]">
                          {row.commissionMinor != null
                            ? formatMoney(row.commissionMinor / 100, row.currency)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#18181b]">{formatMoney(row.netMinor / 100, row.currency)}</td>
                        <td className="px-3 py-2.5">
                          <span className={earningStatusClass(row.status)}>{earningStatusLabel(row.status)}</span>
                          {row.held ? (
                            <span className="ml-1 tv-income-status tv-income-status--failed">Held</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white md:hidden">
                {pageRows.map((row) => (
                  <li key={row.bookingId}>
                    <button type="button" className="tv-money-row w-full text-left" onClick={() => setSelectedEarningId(row.bookingId)}>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[#18181b]">{row.reference}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#71717a]">{row.experience} · {incomeDate(row.activityDate)}</span>
                        <span className={`mt-1 ${earningStatusClass(row.status)}`}>{earningStatusLabel(row.status)}</span>
                      </span>
                      <span className="tv-money-row__amount">{formatMoney(row.netMinor / 100, row.currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-[13px]">
                <button type="button" className="tv-btn-secondary h-9 px-3" disabled={earningPage === 0} onClick={() => setEarningPage((page) => Math.max(0, page - 1))}>Previous</button>
                <span className="text-[#71717a]">{earningPage + 1} / {pageCount}</span>
                <button type="button" className="tv-btn-secondary h-9 px-3" disabled={earningPage + 1 >= pageCount} onClick={() => setEarningPage((page) => page + 1)}>Next</button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {hasMoney && tab === 'payouts' ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          <NoticeCallout title="How payout statuses work" tone="info">
            Traverion prepares payout periods from cleared earnings. Funds sent to your payout account are not the same as
            money arriving in your bank — bank payout confirmation is tracked separately.
          </NoticeCallout>
          {payoutPeriods.length === 0 && filteredEarningsInWindow.length === 0 ? (
            <div className="tv-income-empty tv-income-empty--compact">
              <div className="tv-income-empty__icon"><Wallet className="h-5 w-5" aria-hidden /></div>
              <h3 className="text-sm font-bold text-[#18181b]">No payout periods yet</h3>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#71717a]">
                Eligible earnings appear here once Traverion prepares a payout period. Eligible balance is not a bank transfer.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button type="button" className="tv-btn-primary h-9 px-3 text-[13px]" onClick={() => setTabAndUrl('earnings')}>
                  View earnings
                </button>
                <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={() => setTabAndUrl('settings')}>
                  Payout settings
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12px] text-[#71717a]">{nextPayoutLabel}</p>
              <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
                {payoutPeriods.map((period) => (
                  <li key={period.id}>
                    <button type="button" className="tv-money-row w-full text-left" onClick={() => setSelectedPayoutId(period.id)}>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#18181b]">{period.period_key}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#71717a]">
                          <span>{incomeDate(period.period_start)} – {incomeDate(period.period_end)}</span>
                          <span>Due {incomeDate(period.scheduled_for)}</span>
                          <span className={payoutStatusClass(period.status, period.paid_at, period.connect_lifecycle)}>
                            {periodPayoutLabel(period.status, period.paid_at, period.connect_lifecycle)}
                          </span>
                        </span>
                      </span>
                      <span className="tv-money-row__amount">{formatMoney(Number(period.amount_minor) / 100, period.currency)}</span>
                    </button>
                  </li>
                ))}
                {filteredEarningsInWindow.map((period) => (
                  <li key={period.id} className="tv-money-row">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[#18181b]">{period.invoice_number || 'Legacy payout record'}</span>
                      <span className="text-[12px] text-[#71717a]">
                        {period.period_start} – {period.period_end} ·{' '}
                        {period.status === 'paid' && period.payment_reference
                          ? `Paid · ${period.payment_reference}`
                          : PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL}
                      </span>
                    </span>
                    <span className="tv-money-row__amount">{formatMoney(Number(period.amount), period.currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {hasMoney && tab === 'documents' ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {(['all', 'statements', 'payouts', 'confirmations'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`h-9 rounded-md px-2.5 text-[12px] font-semibold transition-colors duration-150 ${docKind === kind ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b] hover:text-[#18181b]'}`}
                onClick={() => setDocKind(kind)}
              >
                {kind === 'all' ? 'All' : kind === 'statements' ? 'Earnings statements' : kind === 'payouts' ? 'Payout statements' : 'Payment confirmations'}
              </button>
            ))}
            <label className="tv-income-field ml-auto min-w-[8rem]">
              <span>Year</span>
              <PartnerSelect
                aria-label="Year"
                value={docYear}
                options={[
                  { value: 'all', label: 'All years' },
                  ...docYears.map((year) => ({ value: year, label: year })),
                ]}
                onChange={setDocYear}
              />
            </label>
          </div>
          {(() => {
            const statementDocs = incomeRows.filter(
              (row) =>
                row.grossMinor != null &&
                (docKind === 'all' || docKind === 'statements') &&
                (docYear === 'all' || (row.activityDate ?? '').startsWith(docYear))
            );
            const confirmedPayoutDocs = payoutPeriods.filter(
              (period) =>
                payoutMaySayPaid(period.status, period.paid_at) &&
                (docKind === 'all' || docKind === 'payouts' || docKind === 'confirmations') &&
                (docYear === 'all' || period.period_end.startsWith(docYear))
            );
            if (statementDocs.length === 0 && confirmedPayoutDocs.length === 0) {
              return (
                <div className="tv-income-empty tv-income-empty--compact">
                  <div className="tv-income-empty__icon"><FileText className="h-5 w-5" aria-hidden /></div>
                  <h3 className="text-sm font-bold text-[#18181b]">No documents yet</h3>
                  <p className="mt-1 max-w-sm text-[13px] text-[#71717a]">
                    Earnings statements appear when a booking has a frozen commercial split. Completed payout statements appear only after payment confirmation — prepared periods are not listed as paid documents.
                  </p>
                </div>
              );
            }
            return (
              <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
                {statementDocs.map((row) => (
                  <li key={`es-${row.bookingId}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f0f4fa] text-[#073b83]">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[#18181b]">Earnings statement · {row.reference}</span>
                      <span className="text-[12px] text-[#71717a]">{incomeDate(row.activityDate)} · {formatMoney(row.netMinor / 100, row.currency)}</span>
                    </span>
                    <span className="flex shrink-0 gap-3">
                      <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => openEarningStatement(row, false)}>View</button>
                      <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => openEarningStatement(row, true)}>Download</button>
                    </span>
                  </li>
                ))}
                {confirmedPayoutDocs.map((period) => (
                  <li key={`ps-${period.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f0f4fa] text-[#073b83]">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[#18181b]">
                        Payout statement · {period.period_key}
                      </span>
                      <span className="text-[12px] text-[#71717a]">
                        Confirmed {incomeDate(period.paid_at)} · {formatMoney(Number(period.amount_minor) / 100, period.currency)}
                        {period.paid_via ? ` · ${period.paid_via}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-3">
                      <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => void openPayoutStatement(period, false)}>View</button>
                      <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => void openPayoutStatement(period, true)}>Download</button>
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="text-[12px] text-[#71717a]">
            Statements use the frozen booking split and are not VAT invoices. Completed payout statements are historically stable and require payment confirmation — READY periods never appear as paid documents.
          </p>
        </div>
      ) : null}

      {tab === 'settings' && user?.id ? (
        <IncomeFinancialSettings
          userId={user.id}
          profile={profile}
          commercialTerms={commercialTerms}
          payoutCurrency={
            snapshots.find((row) => row.currency?.trim())?.currency?.trim().toUpperCase() ||
            paidBookings.find((row) => row.currency?.trim())?.currency?.trim().toUpperCase() ||
            null
          }
          canEdit={canEditPayoutSettings}
          onProfile={setProfile}
        />
      ) : null}

      {selectedEarning ? (
        <div
          className="tv-income-drawer fixed inset-0 z-[80] flex justify-end bg-black/30"
          role="presentation"
          onMouseDown={() => setSelectedEarningId(null)}
        >
          <aside
            className="tv-income-drawer__panel h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Earning details"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-sans text-base font-bold text-[#18181b]">{selectedEarning.reference}</h2>
              <button type="button" className="tv-btn-ghost h-9" onClick={() => setSelectedEarningId(null)}>Close</button>
            </div>
            <p className="mt-2 text-[13px] text-[#3f3f46]">{selectedEarning.experience}</p>
            <p className="mt-1 text-[12px] text-[#71717a]">
              Activity {incomeDate(selectedEarning.activityDate)} · Purchased {incomeDate(selectedEarning.purchaseDate)}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <span className={earningStatusClass(selectedEarning.status)}>{earningStatusLabel(selectedEarning.status)}</span>
              {selectedEarning.held ? (
                <span className="tv-income-status tv-income-status--failed">
                  Held · {holdReasonLabel(selectedEarning.holdReason)}
                </span>
              ) : null}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[#52525b]">
              {earningStatusExplanation(selectedEarning.status)}
              {selectedEarning.held
                ? ' An active financial hold keeps this booking out of automatic payout eligibility until released.'
                : ''}
            </p>

            <dl className="mt-4 space-y-2.5 rounded-[10px] border border-[#e5e7eb] px-3 py-3 text-[13px]">
              {selectedEarning.grossMinor != null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#71717a]">Gross booking</dt>
                  <dd className="font-semibold tabular-nums text-[#18181b]">{formatMoney(selectedEarning.grossMinor / 100, selectedEarning.currency)}</dd>
                </div>
              ) : null}
              {selectedEarning.commissionMinor != null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#71717a]">
                    Commission{commissionPercentLabel(selectedEarning.commissionBps) ? ` (${commissionPercentLabel(selectedEarning.commissionBps)})` : ''}
                  </dt>
                  <dd className="font-semibold tabular-nums text-[#18181b]">{formatMoney(selectedEarning.commissionMinor / 100, selectedEarning.currency)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 border-t border-[#e5e7eb] pt-2.5">
                <dt className="font-semibold text-[#18181b]">Your earnings</dt>
                <dd className="font-sans text-xl font-bold tabular-nums text-[#18181b]">
                  {formatMoney(selectedEarning.netMinor / 100, selectedEarning.currency)}
                </dd>
              </div>
              {bookingAdjustmentsFor(selectedEarning.bookingId).map((row) => (
                <div key={row.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#71717a]">{ledgerKindLabel(row.kind)}</dt>
                  <dd className={`font-semibold tabular-nums ${Number(row.amount) < 0 ? 'text-red-800' : 'text-[#18181b]'}`}>
                    {formatMoney(Number(row.amount), row.currency)}
                  </dd>
                </div>
              ))}
            </dl>
            {selectedEarning.grossMinor == null ? (
              <p className="mt-2 text-[12px] text-[#71717a]">Gross and commission are shown only when a frozen commercial split exists for this booking.</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="tv-btn-primary h-9 px-3 text-[13px]"
                disabled={selectedEarning.grossMinor == null}
                onClick={() => openEarningStatement(selectedEarning, false)}
              >
                View statement
              </button>
              <button
                type="button"
                className="tv-btn-secondary h-9 px-3 text-[13px]"
                onClick={() => {
                  const booking =
                    paidBookings.find((b) => b.id === selectedEarning.bookingId) ??
                    refundDueBookings.find((b) => b.id === selectedEarning.bookingId);
                  openSupplierBooking(selectedEarning.bookingId, {
                    family: booking
                      ? bookingIsRental(booking)
                        ? 'rental'
                        : bookingIsStayNight(booking)
                          ? 'stay'
                          : 'tour'
                      : 'tour',
                    isStay: booking ? bookingIsStayNight(booking) : false,
                  });
                }}
              >
                Open booking
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedPayout ? (
        <div
          className="tv-income-drawer fixed inset-0 z-[80] flex justify-end bg-black/30"
          role="presentation"
          onMouseDown={() => setSelectedPayoutId(null)}
        >
          <aside
            className="tv-income-drawer__panel h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Payout details"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-sans text-base font-bold text-[#18181b]">{selectedPayout.period_key}</h2>
              <button type="button" className="tv-btn-ghost h-9" onClick={() => setSelectedPayoutId(null)}>Close</button>
            </div>
            <p className="mt-3 font-sans text-2xl font-bold tabular-nums text-[#18181b]">
              {formatMoney(Number(selectedPayout.amount_minor) / 100, selectedPayout.currency)}
            </p>
            <p className="mt-2">
              <span className={payoutStatusClass(selectedPayout.status, selectedPayout.paid_at, selectedPayout.connect_lifecycle)}>
                {periodPayoutLabel(selectedPayout.status, selectedPayout.paid_at, selectedPayout.connect_lifecycle)}
              </span>
            </p>
            <dl className="mt-4 space-y-2 text-[13px]">
              <div>
                <dt className="text-[11px] font-semibold text-[#71717a]">Period</dt>
                <dd>{incomeDate(selectedPayout.period_start)} – {incomeDate(selectedPayout.period_end)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-[#71717a]">Scheduled payout date</dt>
                <dd>{incomeDate(selectedPayout.scheduled_for)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-[#71717a]">Account</dt>
                <dd className="tabular-nums">{maskIban(profile?.payout_iban) || 'Not on file'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-[#71717a]">Completion</dt>
                <dd>
                  {selectedPayout.paid_at
                    ? new Date(selectedPayout.paid_at).toLocaleString()
                    : 'No bank payout confirmation recorded'}
                </dd>
              </div>
            </dl>
            {selectedPayoutItems.length > 0 ? (
              <section className="mt-4">
                <h3 className="text-sm font-bold text-ink">Covered transactions</h3>
                <ul className="mt-2 divide-y divide-[#e5e7eb] rounded-[10px] border border-[#e5e7eb]">
                  {selectedPayoutItems.map((item) => {
                    const row = incomeRows.find((earning) => earning.bookingId === item.booking_id);
                    return (
                      <li key={item.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold text-[#18181b]">{row?.reference ?? item.booking_id.slice(0, 8)}</span>
                          <span className="mt-0.5 block truncate text-[12px] text-[#71717a]">{row?.experience ?? 'Booking'}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney((Number(item.amount_minor) || 0) / 100, selectedPayout.currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {!payoutMaySayPaid(selectedPayout.status, selectedPayout.paid_at) &&
            (selectedPayout.connect_lifecycle ?? 'internal_only') !== 'bank_payout_paid' ? (
              <p className="mt-4 text-[12px] leading-relaxed text-[#52525b]">
                Status: {periodPayoutLabel(selectedPayout.status, selectedPayout.paid_at, selectedPayout.connect_lifecycle)}.
                A completed payout statement downloads only after bank payout confirmation. Sending funds to your payout account alone is not a bank payment.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="tv-btn-primary h-9 px-3 text-[13px]" onClick={() => void openPayoutStatement(selectedPayout, false)}>
                  View statement
                </button>
                <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={() => void openPayoutStatement(selectedPayout, true)}>
                  Download
                </button>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
