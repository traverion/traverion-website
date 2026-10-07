import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Wallet } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageFinance } from '../../lib/supplierTeamRoles';
import {
  earningItemsMajorByStatus,
  fetchSupplierActiveCommercialTerms,
  fetchSupplierCommercialSnapshots,
  fetchSupplierEarningItems,
  fetchSupplierEarnings,
  type BookingCommercialSnapshotRow,
  type SupplierCommercialTermsRow,
  type SupplierEarning,
  type SupplierEarningItemRow,
} from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton, SupplierPageHero } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney, isStripeTestCheckoutSession, appStripeIsTestMode, normalizeCurrency } from '../../lib/money';
import { isCollectedBooking, isRefundDueBooking } from '../../lib/payment-states';
import {
  isCollectedEarningKind,
  isPlatformCommissionKind,
  ledgerRecoveryTotal,
} from '../../lib/supplier-ledger-balance';
import { formatBpsAsPercent, fromMinorUnits, planDefinition } from '../../lib/commercial-money';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierLedger, type SupplierLedgerEntry } from '../../data/supabase-booking-ops';
import { PARTNER_MONEY_PAYOUT_STATUS_NOTE, PARTNER_MONEY_EMPTY_TITLE, PARTNER_MONEY_EMPTY_BODY, PARTNER_MONEY_LOAD_ERROR_TITLE, PARTNER_MONEY_FILTER_EMPTY_BODY, PARTNER_MONEY_AVAILABLE_BALANCE_LABEL, PARTNER_MONEY_NEGATIVE_BALANCE_LABEL, PARTNER_MONEY_NEGATIVE_BALANCE_NOTE, PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL, PARTNER_MONEY_THRESHOLD_PREFERENCE_NOTE, STRIPE_TEST_UNTIL_LIVE } from '../../lib/booking-confirmation-copy';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import NoticeCallout from '../../components/NoticeCallout';
import StatusChip from '../../components/StatusChip';
import { localYmd } from '../../lib/local-ymd';
import {
  PARTNER_MONEY_CSV_HEADER,
  buildPartnerMoneyCsvRows,
  partnerMoneyCsvHasExportableRows,
} from '../../lib/partner-money-csv';
import { csvSafeCell } from '../../lib/csv-export';
import { displayListingTitleFromPurchase } from '../../lib/purchase-snapshot';
import { bookingIsStayNight } from '../../lib/pickup-completeness';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';

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

  const setStatusFilterAndUrl = useCallback((next: 'all' | 'pending' | 'paid') => {
    setStatusFilter(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
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
    ])
      .then(async ([data, bookings, listings, terms, items, snaps]) => {
        if (gen !== loadGenRef.current) return;
        setEarnings(data);
        setCommercialTerms(terms);
        setEarningItems(items);
        setSnapshots(snaps);
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

  const earningsForInvoices = useMemo(
    () => earnings.filter((e) => e.status !== 'cancelled'),
    [earnings]
  );

  const threshold = profile?.payout_threshold_min ?? 0;
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

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Insights"
        title="Income"
        description={`Gross bookings, Traverion commission, and your earnings. Eligible amounts enter the next payout cycle after the activity date — this page never invents a bank transfer. Guest checkout uses ${STRIPE_TEST_UNTIL_LIVE}.`}
      />

      {error && (
        <ErrorState
          className="py-6"
          title={PARTNER_MONEY_LOAD_ERROR_TITLE}
          body={userFacingError(error, USER_ERROR.money)}
          retry={{ onClick: () => void load() }}
          extra={
            <a href="/contact" className="tv-btn-ghost inline-flex">
              Contact support
            </a>
          }
        />
      )}
      {!error && ledgerError ? (
        <div className="mb-5 max-w-lg">
          <NoticeCallout title="Ledger adjustments unavailable" tone="warn">
            <p>{ledgerError}</p>
            <button type="button" onClick={() => void load()} className="tv-btn-ghost mt-3 -ml-2">
              Retry
            </button>
          </NoticeCallout>
        </div>
      ) : null}

      {loading && !hasMoney ? (
        <SupplierListSkeleton rows={3} />
      ) : error && !hasMoney ? null : (
        <>
          {moneyByCurrency.length === 0 ? (
            <section className="mb-10 pb-6 border-b border-black/[0.06]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">
                {PARTNER_MONEY_AVAILABLE_BALANCE_LABEL}
              </p>
              <p className="font-display text-4xl sm:text-5xl tabular-nums tracking-tight text-ink">
                {formatMoney(0, primaryCurrency)}
              </p>
              <p className="mt-3 text-sm text-ink-muted max-w-lg">{nextPayoutLabel}</p>
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-payout`)}
                className="tv-btn-ghost mt-4 -ml-2"
              >
                Payout account
              </button>
            </section>
          ) : (
            moneyByCurrency.map((s) => {
              return (
                <section
                  key={s.currency}
                  className="mb-8 border-b border-black/[0.06] pb-6"
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-1">
                    {moneyByCurrency.length > 1 ? `${s.currency} · ` : ''}
                    {s.available < 0 ? PARTNER_MONEY_NEGATIVE_BALANCE_LABEL : 'Eligible for next payout'}
                  </p>
                  <p
                    className={`font-display text-3xl sm:text-4xl tabular-nums tracking-tight ${s.available < 0 ? 'text-red-800' : 'text-ink'}`}
                  >
                    {formatMoney(s.available, s.currency)}
                  </p>
                  {planSummary ? (
                    <p className="mt-2 text-sm text-ink-muted max-w-lg">
                      Your plan: <span className="font-medium text-ink">{planSummary}</span>
                      . Contact Traverion to change payout plan.
                    </p>
                  ) : null}
                  {recoveryBalance < 0 ? (
                    <div className="mt-3 max-w-lg">
                      <NoticeCallout title="Balance adjustment after payout" tone="warn">
                        A refund or dispute after a recorded payout created a recovery balance of{' '}
                        <span className="tabular-nums font-semibold">
                          {formatMoney(Math.abs(recoveryBalance), s.currency)}
                        </span>
                        . Future payouts may be reduced until this is settled. Traverion will contact
                        you if action is needed.
                      </NoticeCallout>
                    </div>
                  ) : null}
                  <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-black/[0.06] pt-4">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Gross bookings</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.gross, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Traverion commission</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.commission, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Your earnings</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.yourEarnings, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Pending</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.pending, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Eligible</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.eligible, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">In payout prep</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.included, s.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Paid out</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(s.paid, s.currency)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-ink-muted max-w-lg">{nextPayoutLabel}</p>
                  {s.available < 0 ? (
                    <div className="mt-4 max-w-lg">
                      <NoticeCallout title={PARTNER_MONEY_NEGATIVE_BALANCE_LABEL} tone="danger">
                        {PARTNER_MONEY_NEGATIVE_BALANCE_NOTE}
                      </NoticeCallout>
                    </div>
                  ) : null}
                  {threshold > 0 &&
                  (moneyByCurrency.length === 1 || moneyByCurrency[0]?.currency === s.currency) ? (
                    <p className="mt-3 text-sm text-ink-muted max-w-lg">
                      Saved minimum preference: {formatMoney(threshold, s.currency)}.{' '}
                      {PARTNER_MONEY_THRESHOLD_PREFERENCE_NOTE}
                    </p>
                  ) : null}
                  {s.refundDueCount > 0 ? (
                    <div className="mt-4 max-w-xl rounded-lg border border-black/[0.06] border-l-[3px] border-l-amber-500 bg-paper px-3.5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold text-ink">
                          Refund due ·{' '}
                          <span className="tabular-nums">
                            {formatMoney(s.refundDue, s.currency)}
                          </span>
                          <span className="font-normal text-ink-muted">
                            {' '}
                            · {s.refundDueCount} booking{s.refundDueCount === 1 ? '' : 's'}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=refund_due`)}
                          className="text-xs font-semibold text-finland hover:underline"
                        >
                          Open in Bookings
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted leading-snug">
                        Not in Collected. Stripe refunds are manual — status stays Refund due until issued.
                      </p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-payout`)}
                    className="tv-btn-ghost mt-4 -ml-2"
                  >
                    Payout account
                  </button>
                </section>
              );
            })
          )}

          {!hasMoney ? (
            <SupplierEmptyState
              icon={Wallet}
              title={PARTNER_MONEY_EMPTY_TITLE}
              body={PARTNER_MONEY_EMPTY_BODY}
              // Phase 1647: empty Money needs an ops path (Performance / Inbox empty parity).
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="tv-btn-primary"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
                  >
                    Open bookings
                  </button>
                  <button
                    type="button"
                    className="tv-btn-ghost"
                    onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
                  >
                    Your listings
                  </button>
                </div>
              }
            />
          ) : (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                {filteredEarningsInWindow.length > 0 ? 'Payout periods' : 'Collected'}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['30d', '90d', 'all'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setListWindowAndUrl(w)}
                    className={`lux-flat rounded-md px-2.5 py-1 text-xs font-semibold ring-1 transition-colors ${
                      listWindow === w
                        ? 'bg-finland text-white ring-finland'
                        : 'bg-transparent text-ink-muted ring-black/[0.08] hover:text-ink'
                    }`}
                  >
                    {w === '30d' ? '30d' : w === '90d' ? '90d' : 'All time'}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-3 text-xs text-ink-faint">
              List and export use this window. Available balance above stays all-time.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-1 rounded-full bg-paper-raised p-1 shadow-soft ring-1 ring-black/[0.06]">
                {(['all', 'pending', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilterAndUrl(s)}
                    className={`lux-flat rounded-full px-3 py-2 min-h-11 text-sm font-medium transition-colors ${
                      statusFilter === s
                        ? s === 'pending'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : s === 'paid'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                        : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                    }`}
                  >
                    {s === 'all' ? 'All' : s === 'pending' ? PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!canExportFinance || !canExportMoney}
                className="tv-btn-ghost text-sm disabled:opacity-40"
                title={
                  !canExportFinance
                    ? 'Your role can view Income but cannot export CSV'
                    : undefined
                }
              >
                Export
              </button>
            </div>
            {ledgerInWindow.length > 0 ? (
              <div className="mb-8">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2.5">Ledger</h3>
              <ul className="space-y-2">
                {ledgerInWindow.map((e) => (
                  <li key={e.id} className="tv-money-row">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink leading-snug">{e.reason}</p>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                        {ledgerKindLabel(e.kind)}
                        {e.booking_id ? ' · linked booking' : ''}
                        {e.policy_id ? ` · ${e.policy_id}` : ''}
                        {' · '}
                        {new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <p className={`tv-money-row__amount ${Number(e.amount) < 0 ? 'text-red-800' : 'text-ink'}`}>
                      {formatMoney(Number(e.amount), e.currency)}
                    </p>
                  </li>
                ))}
              </ul>
              </div>
            ) : null}
            {filteredEarningsInWindow.length === 0 ? (
              statusFilter === 'all' && paidBookingsInWindow.length > 0 ? (
                <ul className="space-y-2">
                  {paidBookingsInWindow.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => openSupplierBooking(b.id)}
                        className="lux-flat tv-money-row w-full text-left hover:shadow-[0_0_0_1px_rgba(0,53,128,0.18)] transition-shadow"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate leading-snug">
                            {b.booking_number != null ? `#${b.booking_number} · ` : ''}
                            {displayListingTitleFromPurchase(
                              b.purchase_snapshot,
                              listingTitles[b.listing_id],
                              b.guest_name?.trim() || 'Guest'
                            )}
                          </p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint truncate">
                            {b.guest_name?.trim() || 'Guest'} ·{' '}
                            {(() => {
                              // Phase 1575: stays show purchased exclusive range (1564), not check-in alone.
                              if (bookingIsStayNight(b)) {
                                const range = stayRangeFromBooking(b);
                                if (range) {
                                  return `${formatBookingDateDisplay(range.checkIn)} → ${formatBookingDateDisplay(range.checkOut)}`;
                                }
                              }
                              return b.booking_date ? formatBookingDateDisplay(b.booking_date) : 'Date TBC';
                            })()}
                            {isStripeTestCheckoutSession(b.checkout_session_id) || appStripeIsTestMode()
                              ? ' · Stripe TEST'
                              : ''}
                            {' · collected, not paid out'}
                          </p>
                        </div>
                        <p className="tv-money-row__amount text-ink">
                          {formatMoney(Number(b.amount_paid ?? 0), normalizeCurrency(b.currency ?? primaryCurrency))}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
              <SupplierEmptyState
                icon={Wallet}
                className="py-6"
                title="No rows for this filter"
                body={PARTNER_MONEY_FILTER_EMPTY_BODY}
                action={
                  statusFilter !== 'all' || listWindow !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilterAndUrl('all');
                        setListWindowAndUrl('all');
                      }}
                      className="tv-btn-secondary"
                    >
                      Show all money
                    </button>
                  ) : undefined
                }
              />
              )
            ) : (
              <ul className="space-y-2">
                {filteredEarningsInWindow.map((e) => (
                  <li key={e.id} className="tv-money-row">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink leading-snug">
                          {e.period_start} – {e.period_end}
                        </p>
                        <StatusChip tone={e.status === 'paid' ? 'good' : e.status === 'pending' ? 'warn' : 'neutral'}>
                          {e.status === 'paid'
                            ? 'Paid'
                            : e.status === 'pending'
                              ? PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL
                              : e.status}
                        </StatusChip>
                      </div>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                        {e.invoice_number ? e.invoice_number : null}
                        {e.status === 'paid' && e.payment_reference
                          ? `${e.invoice_number ? ' · ' : ''}${e.payment_reference}`
                          : null}
                        {!e.invoice_number && !(e.status === 'paid' && e.payment_reference) ? (
                          <span>Payout period</span>
                        ) : null}
                      </p>
                    </div>
                    <p className="tv-money-row__amount text-ink">
                      {formatMoney(Number(e.amount), e.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </>
      )}
    </div>
  );
}
