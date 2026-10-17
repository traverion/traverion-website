import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Wallet } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import {
  earningItemsMajorByStatus,
  fetchSupplierActiveCommercialTerms,
  fetchSupplierCommercialSnapshots,
  fetchSupplierEarningItems,
  fetchSupplierEarnings,
  fetchSupplierPayoutPeriodItems,
  fetchSupplierPayoutPeriods,
  type BookingCommercialSnapshotRow,
  type SupplierCommercialTermsRow,
  type SupplierEarning,
  type SupplierEarningItemRow,
  type SupplierPayoutPeriodRow,
} from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { isCollectedBooking, isRefundDueBooking } from '../../lib/payment-states';
import {
  isCollectedEarningKind,
  isPlatformCommissionKind,
  ledgerRecoveryTotal,
} from '../../lib/supplier-ledger-balance';
import { formatBpsAsPercent, fromMinorUnits, planDefinition } from '../../lib/commercial-money';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierLedger, type SupplierLedgerEntry } from '../../data/supabase-booking-ops';
import { PARTNER_MONEY_PAYOUT_STATUS_NOTE, PARTNER_MONEY_EMPTY_TITLE, PARTNER_MONEY_EMPTY_BODY, PARTNER_MONEY_LOAD_ERROR_TITLE, PARTNER_MONEY_FILTER_EMPTY_BODY, PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL, STRIPE_TEST_UNTIL_LIVE } from '../../lib/booking-confirmation-copy';
import NoticeCallout from '../../components/NoticeCallout';
import { localYmd } from '../../lib/local-ymd';
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
  earningStatusLabel,
  maskIban,
  payoutMaySayPaid,
  payoutPresentationStatus,
  sumNetMinor,
  type IncomeEarningRow,
} from '../../lib/supplier-income';
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

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  // Phase 1760: Money CSV is finance/owner; viewers must not export or audit-log.
  const { role } = useSupplierRole();
  const canExportFinance = canManageFinance(role);
  const canEditPayoutSettings = canManageBookings(role);
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
  const [paidBookings, setPaidBookings] = useState<BookingRow[]>([]);
  const [refundDueBookings, setRefundDueBookings] = useState<BookingRow[]>([]);
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
    setLoading(true);
    setError(null);
    setLedgerError(null);
    Promise.all([
      fetchSupplierEarnings(uid),
      fetchBookingsForSupplier(uid),
      fetchMyListings(uid),
      fetchSupplierActiveCommercialTerms(uid),
      fetchSupplierEarningItems(uid),
      fetchSupplierCommercialSnapshots(uid),
      fetchSupplierPayoutPeriods(uid),
    ])
      .then(async ([data, bookings, listings, terms, items, snaps, periods]) => {
        if (gen !== loadGenRef.current) return;
        setEarnings(data);
        setCommercialTerms(terms);
        setEarningItems(items);
        setSnapshots(snaps);
        setPayoutPeriods(periods);
        setListingTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
        setPaidBookings(bookings.filter(isCollectedBooking));
        setRefundDueBookings(bookings.filter(isRefundDueBooking));
        try {
          const ledgerRows = await fetchSupplierLedger(uid);
          if (gen !== loadGenRef.current) return;
          setLedger(ledgerRows);
          setLedgerError(null);
        } catch (ledgerErr) {
          if (gen !== loadGenRef.current) return;
          // Keep prior ledger — failure must not look like zero adjustments.
          setLedgerError(userFacingError(ledgerErr, USER_ERROR.money));
        }
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
      setLedger([]);
      setPayoutPeriods([]);
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
      setLoading(false);
      return;
    }
    if (earningsHubUserIdRef.current !== user.id) {
      earningsHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      profileLoadGenRef.current += 1;
      clearEarningsPartnerWorkspace();
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
    const bookingCur = paidBookings.find((b) => (b.currency ?? '').trim())?.currency;
    const row = earnings.find((e) => e.status !== 'cancelled');
    return (bookingCur || row?.currency || earnings[0]?.currency || 'EUR').toUpperCase();
  }, [earnings, paidBookings]);

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

    const hasCommercial = snapshots.length > 0 || earningItems.length > 0;

    if (hasCommercial) {
      for (const snap of snapshots) {
        const s = bucket(snap.currency);
        s.gross += fromMinorUnits(Number(snap.remaining_gross_minor) || 0);
        s.commission += fromMinorUnits(Number(snap.remaining_commission_minor) || 0);
        s.yourEarnings += fromMinorUnits(Number(snap.remaining_supplier_minor) || 0);
      }
      for (const s of byCurrency.values()) {
        const parts = earningItemsMajorByStatus(earningItems, s.currency);
        s.pending = parts.pending;
        s.eligible = parts.eligible;
        s.included = parts.included;
        s.paid = parts.paid;
        s.available = parts.eligible;
      }
    } else {
      // Pre-engine fallback (legacy 0% TEST history)
      const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
      for (const e of nonCancelled) {
        const s = bucket(e.currency);
        if (e.status === 'paid') s.paid += Number(e.amount);
        else if (e.status === 'pending') s.pending += Number(e.amount);
      }
      for (const b of paidBookings) {
        const s = bucket(b.currency);
        s.gross += Number(b.amount_paid ?? 0);
        s.yourEarnings += Number(b.amount_paid ?? 0);
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

    for (const b of refundDueBookings) {
      const s = bucket(b.currency);
      s.refundDue += Number(b.amount_paid ?? 0);
      s.refundDueCount += 1;
    }
    return [...byCurrency.values()].sort((a, b) => b.gross - a.gross);
  }, [
    earnings,
    paidBookings,
    ledger,
    refundDueBookings,
    primaryCurrency,
    snapshots,
    earningItems,
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
    const bookings = [...paidBookings, ...refundDueBookings];
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
  }, [paidBookings, refundDueBookings, snapshots, earningItems, listingTitles]);

  const filteredIncomeRows = useMemo(() => {
    const query = earningQuery.trim().toLowerCase();
    const rows = incomeRows.filter((row) => {
      if (earningStatus !== 'all' && row.status !== earningStatus) return false;
      if (earningListing) {
        const booking = paidBookings.find((item) => item.id === row.bookingId) ?? refundDueBookings.find((item) => item.id === row.bookingId);
        if (booking?.listing_id !== earningListing) return false;
      }
      if (earningFrom && (row.activityDate ?? '') < earningFrom) return false;
      if (earningTo && (row.activityDate ?? '') > earningTo) return false;
      if (!query) return true;
      return `${row.reference} ${row.experience}`.toLowerCase().includes(query);
    });
    rows.sort((a, b) => {
      if (earningSort === 'earnings') return b.netMinor - a.netMinor;
      if (earningSort === 'purchase') return (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? '');
      return (b.activityDate ?? '').localeCompare(a.activityDate ?? '');
    });
    return rows;
  }, [incomeRows, earningQuery, earningStatus, earningListing, earningFrom, earningTo, earningSort, paidBookings, refundDueBookings]);

  const earningsForInvoices = useMemo(
    () => earnings.filter((e) => e.status !== 'cancelled'),
    [earnings]
  );

  const nextPayoutLabel = PARTNER_MONEY_PAYOUT_STATUS_NOTE;

  const exportCsv = async () => {
    // Phase 1760: role gate before download + export_runs insert.
    if (!canExportFinance || !user?.id) return;
    const collectedForExport =
      filteredEarningsInWindow.length === 0
        ? paidBookingsInWindow.map((b) => ({
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
        payouts: filteredEarningsInWindow,
        refundDue: refundDueBookingsInWindow,
        collected: collectedForExport,
        ledger: ledgerInWindow,
      })
    ) {
      return;
    }
    const body = buildPartnerMoneyCsvRows({
      payouts: filteredEarningsInWindow,
      refundDue: refundDueBookingsInWindow.map((b) => ({
        ...b,
        listing_title:
          displayListingTitleFromPurchase(
            b.purchase_snapshot,
            listingTitles[b.listing_id],
            ''
          ) || null,
      })),
      collected: collectedForExport,
      ledger: ledgerInWindow,
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
        listWindow,
      },
    });
    if (!audited) {
      setError('Export downloaded, but the audit log failed. Try again or contact support.');
    }
  };

  const canExportMoney = partnerMoneyCsvHasExportableRows({
    payouts: filteredEarningsInWindow,
    refundDue: refundDueBookingsInWindow,
    collected: filteredEarningsInWindow.length === 0 ? paidBookingsInWindow : [],
    ledger: ledgerInWindow,
  });

  const hasMoney =
    moneyByCurrency.some((s) => s.gross > 0 || s.pending !== 0 || s.paid > 0) ||
    earningsForInvoices.length > 0 ||
    ledger.length > 0 ||
    refundDueBookings.length > 0;

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredIncomeRows.length / pageSize));
  const pageRows = filteredIncomeRows.slice(earningPage * pageSize, earningPage * pageSize + pageSize);
  const summaryCurrency = moneyByCurrency[0]?.currency ?? primaryCurrency;
  const totalNet = sumNetMinor(incomeRows, summaryCurrency);
  const pendingNet = sumNetMinor(incomeRows, summaryCurrency, ['pending', 'recorded']);
  const availableNet = sumNetMinor(incomeRows, summaryCurrency, ['eligible']);
  const paidNet = sumNetMinor(incomeRows, summaryCurrency, ['paid']);
  const processingNet = sumNetMinor(incomeRows, summaryCurrency, ['included']);
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
    const included = await fetchSupplierPayoutPeriodItems(period.id);
    const bytes = statementPdf(
      payoutStatementLines({
        reference: `PS-${period.period_key}`,
        issueDate: localYmd(),
        supplierName: profile?.company_legal_name ?? profile?.display_name ?? null,
        currency: period.currency,
        periodStart: period.period_start,
        periodEnd: period.period_end,
        statusLabel: payoutPresentationStatus(period.status, period.paid_at),
        paidAt: period.paid_at,
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

  const metric = (label: string, minor: number) => (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold text-[#71717a]">{label}</p>
      <p className="mt-1 font-sans text-xl font-bold tabular-nums tracking-tight text-[#18181b]">
        {formatMoney(minor / 100, summaryCurrency)}
      </p>
    </div>
  );

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-income font-sans`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-sans text-lg font-bold tracking-tight text-[#18181b]">Income</h1>
          <p className="text-[12px] text-[#71717a]">{`Guest checkout uses ${STRIPE_TEST_UNTIL_LIVE}. Amounts on this page are not completed bank transfers.`}</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!canExportFinance || !canExportMoney}
          className="tv-btn-secondary h-9 shrink-0 px-2.5 text-[13px] disabled:opacity-40"
          title={!canExportFinance ? 'Your role can view Income but cannot export CSV' : undefined}
        >
          Export
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Income">
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
            className={`h-9 shrink-0 rounded-md px-3 text-[13px] font-semibold ${tab === id ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`}
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
      {loading && !hasMoney ? <SupplierListSkeleton rows={3} /> : null}

      {!loading && !hasMoney && !error ? (
        <SupplierEmptyState
          icon={Wallet}
          title={PARTNER_MONEY_EMPTY_TITLE}
          body={PARTNER_MONEY_EMPTY_BODY}
          action={
            <div className="flex flex-wrap gap-2">
              {/* Phase 1647 */}
              <button type="button" className="tv-btn-primary" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
                Open bookings
              </button>
              <button type="button" className="tv-btn-ghost" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}>
                Your listings
              </button>
            </div>
          }
        />
      ) : null}

      {hasMoney && tab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {metric('Total earnings', totalNet)}
            {metric('Pending', pendingNet)}
            {metric('Available for payout', availableNet)}
            {metric('Paid out', paidNet)}
          </div>
          <p className="text-[12px] text-[#71717a]">Eligible for next payout is the available amount. A customer payment is not a payout.</p>
          <div className="grid gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] sm:grid-cols-4">
            <p><span className="block text-[11px] text-[#71717a]">Payout frequency</span>{planSummary ?? 'Not set'}</p>
            <p><span className="block text-[11px] text-[#71717a]">Next payout</span>{nextPeriod ? formatMoney(Number(nextPeriod.amount_minor) / 100, nextPeriod.currency) : 'Not scheduled'}</p>
            <p><span className="block text-[11px] text-[#71717a]">Next date</span>{nextPeriod ? incomeDate(nextPeriod.scheduled_for) : 'Not scheduled'}</p>
            <p><span className="block text-[11px] text-[#71717a]">Payout account</span>{profile?.payout_verification_status === 'verified' ? 'Verified' : profile?.payout_iban ? 'Saved, not verified' : 'Missing'}</p>
          </div>
          {processingNet > 0 ? <p className="text-[13px] text-[#52525b]">Processing: {formatMoney(processingNet / 100, summaryCurrency)}</p> : null}
          {!nextPeriod ? <p className="text-[12px] text-[#71717a]">{nextPayoutLabel}</p> : null}
          {recoveryBalance < 0 ? (
            <NoticeCallout title="Balance adjustment after payout" tone="warn">
              A refund or dispute after a recorded payout created a recovery balance of {formatMoney(Math.abs(recoveryBalance), summaryCurrency)}. Future payouts may be reduced until this is settled.
            </NoticeCallout>
          ) : null}
          <section>
            <h2 className="font-sans text-sm font-bold text-[#18181b]">Recent earnings</h2>
            <ul className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
              {incomeRows.slice(0, 5).map((row) => (
                <li key={row.bookingId}>
                  <button type="button" className="tv-money-row w-full border-0 bg-transparent px-3 py-2 text-left shadow-none" onClick={() => setSelectedEarningId(row.bookingId)}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-[#18181b]">{row.reference} · {row.experience}</span>
                      <span className="text-[12px] text-[#71717a]">{incomeDate(row.activityDate)} · {earningStatusLabel(row.status)}</span>
                    </span>
                    <span className="tv-money-row__amount text-[#18181b]">{formatMoney(row.netMinor / 100, row.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-sans text-sm font-bold text-[#18181b]">Recent payouts</h2>
            {payoutPeriods.length === 0 && filteredEarningsInWindow.length === 0 ? (
              <p className="mt-1 text-[13px] text-[#71717a]">No payout records yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
                {payoutPeriods.slice(0, 4).map((period) => (
                  <li key={period.id} className="tv-money-row px-3 py-2">
                    <span className="text-[13px] text-[#18181b]">{period.period_key} · {payoutPresentationStatus(period.status, period.paid_at)}</span>
                    <span className="tv-money-row__amount">{formatMoney(Number(period.amount_minor) / 100, period.currency)}</span>
                  </li>
                ))}
                {payoutPeriods.length === 0
                  ? filteredEarningsInWindow.slice(0, 4).map((period) => (
                      <li key={period.id} className="tv-money-row px-3 py-2">
                        <span className="text-[13px] text-[#18181b]">
                          {period.period_start} – {period.period_end} · {period.status === 'paid' && period.payment_reference ? 'Paid' : PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL}
                        </span>
                        <span className="tv-money-row__amount">{formatMoney(Number(period.amount), period.currency)}</span>
                      </li>
                    ))
                  : null}
              </ul>
            )}
          </section>
          {adjustmentRows.length > 0 ? (
            <section>
              <h2 className="font-sans text-sm font-bold text-[#18181b]">Adjustments</h2>
              <ul className="mt-2">
                {adjustmentRows.slice(0, 4).map((row) => (
                  <li key={row.id} className="tv-money-row px-0 py-2">
                    <span className="text-[13px]">{ledgerKindLabel(row.kind)}</span>
                    <span className={`tv-money-row__amount ${Number(row.amount) < 0 ? 'text-red-800' : ''}`}>{formatMoney(Number(row.amount), row.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {hasMoney && tab === 'earnings' ? (
        <div className="space-y-3">
          <div className="tv-pickup-toolbar">
            <input className="tv-input" type="search" aria-label="Search earnings" placeholder="Reference or experience" value={earningQuery} onChange={(event) => { setEarningQuery(event.target.value); setEarningPage(0); }} />
            <input className="tv-input" type="date" aria-label="Activity from" value={earningFrom} onChange={(event) => { setEarningFrom(event.target.value); setEarningPage(0); }} />
            <input className="tv-input" type="date" aria-label="Activity to" value={earningTo} onChange={(event) => { setEarningTo(event.target.value); setEarningPage(0); }} />
            <select className="tv-input" aria-label="Experience" value={earningListing} onChange={(event) => { setEarningListing(event.target.value); setEarningPage(0); }}>
              <option value="">All experiences</option>
              {Object.entries(listingTitles).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
            <select className="tv-input" aria-label="Payout status" value={earningStatus} onChange={(event) => { setEarningStatus(event.target.value); setEarningPage(0); }}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="eligible">Available</option>
              <option value="included">Processing</option>
              <option value="paid">Paid out</option>
              <option value="reversed">Reversed</option>
              <option value="recorded">Recorded</option>
            </select>
            <select className="tv-input" aria-label="Sort earnings" value={earningSort} onChange={(event) => setEarningSort(event.target.value as 'activity' | 'purchase' | 'earnings')}>
              <option value="activity">Activity date</option>
              <option value="purchase">Purchase date</option>
              <option value="earnings">Your earnings</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['30d', '90d', 'all'] as const).map((w) => (
              <button key={w} type="button" className={`h-8 rounded-md px-2 text-[12px] font-semibold ${listWindow === w ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`} onClick={() => setListWindowAndUrl(w)}>
                {w === 'all' ? 'Export: all time' : `Export: ${w}`}
              </button>
            ))}
          </div>
          {pageRows.length === 0 ? (
            <SupplierEmptyState icon={Wallet} className="py-6" title="No rows for this filter" body={PARTNER_MONEY_FILTER_EMPTY_BODY} />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border border-[#e5e7eb] bg-white md:block">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-[#e5e7eb] text-[11px] uppercase tracking-wide text-[#71717a]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Booking</th>
                      <th className="px-3 py-2 font-semibold">Experience</th>
                      <th className="px-3 py-2 font-semibold">Activity date</th>
                      <th className="px-3 py-2 font-semibold">Purchase date</th>
                      <th className="px-3 py-2 font-semibold">Your earnings</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.bookingId} className="cursor-pointer border-t border-[#e5e7eb]" onClick={() => setSelectedEarningId(row.bookingId)}>
                        <td className="px-3 py-2 font-semibold">{row.reference}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2">{row.experience}</td>
                        <td className="px-3 py-2">{incomeDate(row.activityDate)}</td>
                        <td className="px-3 py-2">{incomeDate(row.purchaseDate)}</td>
                        <td className="px-3 py-2 font-bold tabular-nums">{formatMoney(row.netMinor / 100, row.currency)}</td>
                        <td className="px-3 py-2">{earningStatusLabel(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white md:hidden">
                {pageRows.map((row) => (
                  <li key={row.bookingId}>
                    <button type="button" className="tv-money-row w-full px-3 py-2 text-left" onClick={() => setSelectedEarningId(row.bookingId)}>
                      <span>
                        <span className="block font-semibold">{row.reference}</span>
                        <span className="block truncate text-[12px] text-[#71717a]">{row.experience} · {incomeDate(row.activityDate)} · {earningStatusLabel(row.status)}</span>
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
        <div className="space-y-3">
          <p className="text-[12px] text-[#71717a]">{nextPayoutLabel}</p>
          {payoutPeriods.length === 0 && filteredEarningsInWindow.length === 0 ? (
            <p className="text-[13px] text-[#52525b]">No payout has been scheduled or recorded.</p>
          ) : (
            <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
              {payoutPeriods.map((period) => (
                <li key={period.id}>
                  <button type="button" className="tv-money-row w-full px-3 py-2 text-left" onClick={() => setSelectedPayoutId(period.id)}>
                    <span>
                      <span className="block text-[13px] font-semibold">{period.period_key}</span>
                      <span className="text-[12px] text-[#71717a]">{incomeDate(period.period_start)} – {incomeDate(period.period_end)} · {payoutPresentationStatus(period.status, period.paid_at)}</span>
                    </span>
                    <span className="tv-money-row__amount">{formatMoney(Number(period.amount_minor) / 100, period.currency)}</span>
                  </button>
                </li>
              ))}
              {filteredEarningsInWindow.map((period) => (
                <li key={period.id} className="tv-money-row px-3 py-2">
                  <span>
                    <span className="block text-[13px] font-semibold">{period.invoice_number || 'Payout record'}</span>
                    <span className="text-[12px] text-[#71717a]">
                      {period.period_start} – {period.period_end} · {period.status === 'paid' && period.payment_reference ? `Paid · ${period.payment_reference}` : PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL}
                    </span>
                  </span>
                  <span className="tv-money-row__amount">{formatMoney(Number(period.amount), period.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {hasMoney && tab === 'documents' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'statements', 'payouts', 'confirmations'] as const).map((kind) => (
              <button key={kind} type="button" className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${docKind === kind ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`} onClick={() => setDocKind(kind)}>
                {kind === 'all' ? 'All' : kind === 'statements' ? 'Earnings statements' : kind === 'payouts' ? 'Payout statements' : 'Payment confirmations'}
              </button>
            ))}
            <select className="tv-input h-8 w-auto" aria-label="Year" value={docYear} onChange={(event) => setDocYear(event.target.value)}>
              <option value="all">All years</option>
              {docYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
            {incomeRows
              .filter((row) => row.grossMinor != null && (docKind === 'all' || docKind === 'statements') && (docYear === 'all' || (row.activityDate ?? '').startsWith(docYear)))
              .map((row) => (
                <li key={row.bookingId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">Earnings statement · {row.reference}</span>
                    <span className="text-[12px] text-[#71717a]">{incomeDate(row.activityDate)} · Net {formatMoney(row.netMinor / 100, row.currency)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => openEarningStatement(row, false)}>View PDF</button>
                    <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => openEarningStatement(row, true)}>Download PDF</button>
                  </span>
                </li>
              ))}
            {payoutPeriods
              .filter((period) => (docKind === 'all' || docKind === 'payouts' || (docKind === 'confirmations' && payoutMaySayPaid(period.status, period.paid_at))) && (docYear === 'all' || period.period_end.startsWith(docYear)))
              .map((period) => (
                <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="block text-[13px] font-semibold">{payoutMaySayPaid(period.status, period.paid_at) ? 'Payment confirmation' : 'Payout statement'} · {period.period_key}</span>
                    <span className="text-[12px] text-[#71717a]">{payoutPresentationStatus(period.status, period.paid_at)} · {formatMoney(Number(period.amount_minor) / 100, period.currency)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => void openPayoutStatement(period, false)}>View PDF</button>
                    <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => void openPayoutStatement(period, true)}>Download PDF</button>
                  </span>
                </li>
              ))}
          </ul>
          <p className="text-[12px] text-[#71717a]">Statements are generated from the frozen booking split. A payout statement is not a transfer receipt unless a completion time is recorded.</p>
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
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" role="presentation" onMouseDown={() => setSelectedEarningId(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-4" role="dialog" aria-modal="true" aria-label="Earning details" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-base font-bold">{selectedEarning.reference}</h2>
              <button type="button" className="tv-btn-ghost h-9" onClick={() => setSelectedEarningId(null)}>Close</button>
            </div>
            <p className="mt-2 text-[13px]">{selectedEarning.experience}</p>
            <p className="text-[12px] text-[#71717a]">Activity {incomeDate(selectedEarning.activityDate)} · Purchased {incomeDate(selectedEarning.purchaseDate)}</p>
            <p className="mt-3 text-[12px] text-[#71717a]">Your earnings</p>
            <p className="font-sans text-2xl font-bold tabular-nums">{formatMoney(selectedEarning.netMinor / 100, selectedEarning.currency)}</p>
            <p className="text-[13px]">{earningStatusLabel(selectedEarning.status)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="tv-btn-primary h-9 px-3 text-[13px]" disabled={selectedEarning.grossMinor == null} onClick={() => openEarningStatement(selectedEarning, false)}>View financial statement</button>
              <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={() => openSupplierBooking(selectedEarning.bookingId)}>Open booking</button>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedPayout ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" role="presentation" onMouseDown={() => setSelectedPayoutId(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-4" role="dialog" aria-modal="true" aria-label="Payout details" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-base font-bold">{selectedPayout.period_key}</h2>
              <button type="button" className="tv-btn-ghost h-9" onClick={() => setSelectedPayoutId(null)}>Close</button>
            </div>
            <p className="mt-3 font-sans text-2xl font-bold tabular-nums">{formatMoney(Number(selectedPayout.amount_minor) / 100, selectedPayout.currency)}</p>
            <p className="text-[13px]">{payoutPresentationStatus(selectedPayout.status, selectedPayout.paid_at)}</p>
            <p className="text-[12px] text-[#71717a]">{incomeDate(selectedPayout.period_start)} – {incomeDate(selectedPayout.period_end)}</p>
            <p className="text-[12px] text-[#71717a]">Account {maskIban(profile?.payout_iban) || 'not on file'}</p>
            {selectedPayout.paid_at ? <p className="text-[12px] text-[#71717a]">Completed {new Date(selectedPayout.paid_at).toLocaleString()}</p> : <p className="text-[12px] text-[#71717a]">No completion time is recorded.</p>}
            <button type="button" className="tv-btn-primary mt-3 h-9 px-3 text-[13px]" onClick={() => void openPayoutStatement(selectedPayout, true)}>Download payout statement</button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
