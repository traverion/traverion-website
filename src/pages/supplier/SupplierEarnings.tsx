import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton, SupplierPageHero } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney, isStripeTestCheckoutSession, normalizeCurrency } from '../../lib/money';
import { isCollectedBooking, isRefundDueBooking, REFUND_DUE_MANUAL_COPY } from '../../lib/payment-states';
import { isCollectedEarningKind } from '../../lib/supplier-ledger-balance';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierLedger, type SupplierLedgerEntry } from '../../data/supabase-booking-ops';
import { PARTNER_MONEY_PAYOUT_STATUS_NOTE, PARTNER_MONEY_PAID_OUT_TO_DATE_NOTE, PARTNER_MONEY_EMPTY_TITLE, PARTNER_MONEY_EMPTY_BODY, PARTNER_MONEY_LOAD_ERROR_TITLE, PARTNER_MONEY_FILTER_EMPTY_BODY, PARTNER_MONEY_AVAILABLE_BALANCE_LABEL, PARTNER_MONEY_NEGATIVE_BALANCE_LABEL, PARTNER_MONEY_NEGATIVE_BALANCE_NOTE, PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL, PARTNER_MONEY_THRESHOLD_PROGRESS_SUFFIX } from '../../lib/booking-confirmation-copy';
import NoticeCallout from '../../components/NoticeCallout';
import StatusChip from '../../components/StatusChip';
import {
  PARTNER_MONEY_CSV_HEADER,
  buildPartnerMoneyCsvRows,
  partnerMoneyCsvHasExportableRows,
} from '../../lib/partner-money-csv';

function ledgerKindLabel(kind: string): string {
  const k = kind.trim().toLowerCase();
  if (k === 'cancellation_fee' || k === 'supplier_cancellation_fee' || k === 'cancellation_penalty') {
    return 'Cancellation fee';
  }
  if (k === 'booking_earnings') return 'Booking earnings';
  if (k === 'refund') return 'Earnings reversal';
  if (k === 'offset' || k === 'balance_offset') return 'Balance offset';
  if (k === 'adjustment') return 'Adjustment';
  return kind.replace(/_/g, ' ');
}

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
  const [paidBookings, setPaidBookings] = useState<BookingRow[]>([]);
  const [refundDueBookings, setRefundDueBookings] = useState<BookingRow[]>([]);
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  const load = useCallback(() => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([fetchSupplierEarnings(uid), fetchBookingsForSupplier(uid), fetchMyListings(uid), fetchSupplierLedger(uid)])
      .then(([data, bookings, listings, ledgerRows]) => {
        setEarnings(data);
        setListingTitles(Object.fromEntries(listings.map((l) => [l.id, l.title])));
        setPaidBookings(bookings.filter(isCollectedBooking));
        setRefundDueBookings(bookings.filter(isRefundDueBooking));
        setLedger(ledgerRows);
        setLoading(false);
      })
      .catch((e) => {
        setError(userFacingError(e, USER_ERROR.money));
        setLoading(false);
      });
  }, [isSupabase, user?.id]);

  useEffect(() => {
    if (isSupabase && user?.id) load();
    else setLoading(false);
  }, [isSupabase, user?.id, load]);

  useEffect(() => {
    const uid = user?.id;
    if (isSupabase && uid) fetchSupplierProfile(uid).then(setProfile);
    else setProfile(null);
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

  type CurrencyMoney = {
    currency: string;
    gross: number;
    fees: number;
    paid: number;
    pending: number;
    available: number;
    refundDue: number;
    refundDueCount: number;
  };

  /**
   * sumCollectedAmount / ledgerAdjustmentTotal are documented as single-currency-only
   * ("Callers must not mix currencies without converting" / "same currency assumed by
   * caller") — bucket every input by its own real currency first, matching how Admin's
   * Finance panel mirrors this exact formula, so a supplier whose listings span more than
   * one currency (the platform genuinely supports 9) never sees a blended balance.
   */
  const moneyByCurrency: CurrencyMoney[] = useMemo(() => {
    const byCurrency = new Map<string, CurrencyMoney>();
    const bucket = (code: string | null | undefined) => {
      const currency = normalizeCurrency(code ?? primaryCurrency);
      let s = byCurrency.get(currency);
      if (!s) {
        s = { currency, gross: 0, fees: 0, paid: 0, pending: 0, available: 0, refundDue: 0, refundDueCount: 0 };
        byCurrency.set(currency, s);
      }
      return s;
    };

    const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
    for (const e of nonCancelled) {
      const s = bucket(e.currency);
      if (e.status === 'paid') s.paid += Number(e.amount);
      else if (e.status === 'pending') s.pending += Number(e.amount);
    }
    for (const b of paidBookings) {
      bucket(b.currency).gross += Number(b.amount_paid ?? 0);
    }
    for (const row of ledger) {
      if (isCollectedEarningKind(row.kind)) continue;
      bucket(row.currency).fees += Number(row.amount);
    }
    for (const b of refundDueBookings) {
      const s = bucket(b.currency);
      s.refundDue += Number(b.amount_paid ?? 0);
      s.refundDueCount += 1;
    }
    for (const s of byCurrency.values()) {
      s.available = s.gross + s.fees - s.paid;
      s.pending = s.pending > 0 ? s.pending + s.fees : s.available;
    }
    return [...byCurrency.values()].sort((a, b) => b.gross - a.gross);
  }, [earnings, paidBookings, ledger, refundDueBookings, primaryCurrency]);

  const earningsForInvoices = useMemo(
    () => earnings.filter((e) => e.status !== 'cancelled'),
    [earnings]
  );

  const threshold = profile?.payout_threshold_min ?? 0;
  const nextPayoutLabel = PARTNER_MONEY_PAYOUT_STATUS_NOTE;

  const payoutProgressPctFor = (pendingForCurrency: number): number | null =>
    threshold > 0 && pendingForCurrency > 0
      ? Math.min(100, Math.round((pendingForCurrency / threshold) * 100))
      : null;

  const exportCsv = () => {
    if (
      !partnerMoneyCsvHasExportableRows({
        payouts: filteredEarnings,
        refundDue: refundDueBookings,
        ledger,
      })
    ) {
      return;
    }
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const body = buildPartnerMoneyCsvRows({
      payouts: filteredEarnings,
      refundDue: refundDueBookings,
      ledger,
      ledgerKindLabel,
    });
    const csv = [PARTNER_MONEY_CSV_HEADER.join(','), ...body.map((cols) => cols.map(escape).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-money-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canExportMoney = partnerMoneyCsvHasExportableRows({
    payouts: filteredEarnings,
    refundDue: refundDueBookings,
    ledger,
  });

  const hasMoney =
    moneyByCurrency.some((s) => s.gross > 0 || s.pending !== 0 || s.paid > 0) ||
    earningsForInvoices.length > 0 ||
    ledger.length > 0 ||
    refundDueBookings.length > 0;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Earnings"
        title="Money"
        description="Traveler payments collected, fees & adjustments, and what Traverion has paid you. Payouts are manual — this page never invents a transfer."
      />

      {error && (
        <ErrorState
          className="py-6"
          title={PARTNER_MONEY_LOAD_ERROR_TITLE}
          body={userFacingError(error, USER_ERROR.money)}
          retry={{ onClick: () => void load() }}
        />
      )}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : error ? null : (
        <>
          {moneyByCurrency.length === 0 ? (
            <section className="mb-12 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">
                {PARTNER_MONEY_AVAILABLE_BALANCE_LABEL}
              </p>
              <p className="font-display text-5xl sm:text-6xl tabular-nums tracking-tight text-ink">
                {formatMoney(0, primaryCurrency)}
              </p>
              <p className="mt-4 text-sm text-ink-muted max-w-lg">{nextPayoutLabel}</p>
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
              const payoutProgressPct = payoutProgressPctFor(s.pending);
              return (
                <section
                  key={s.currency}
                  className="mb-12 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">
                    {moneyByCurrency.length > 1 ? `${s.currency} · ` : ''}
                    {s.available < 0 ? PARTNER_MONEY_NEGATIVE_BALANCE_LABEL : PARTNER_MONEY_AVAILABLE_BALANCE_LABEL}
                  </p>
                  <p
                    className={`font-display text-5xl sm:text-6xl tabular-nums tracking-tight ${s.available < 0 ? 'text-red-800' : 'text-ink'}`}
                  >
                    {formatMoney(s.available, s.currency)}
                  </p>
                  <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-black/[0.06] pt-5">
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Collected</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                        {formatMoney(s.gross, s.currency)}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-faint">Paid traveler bookings</p>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Fees &amp; adjustments</dt>
                      <dd className={`mt-1 text-lg font-semibold tabular-nums ${s.fees < 0 ? 'text-red-800' : 'text-ink'}`}>
                        {formatMoney(s.fees, s.currency)}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-faint">Ledger only — never invented</p>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Paid out to date</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                        {formatMoney(s.paid, s.currency)}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-faint">{PARTNER_MONEY_PAID_OUT_TO_DATE_NOTE}</p>
                    </div>
                  </dl>
                  <p className="mt-4 text-sm text-ink-muted max-w-lg">{nextPayoutLabel}</p>
                  {s.available < 0 ? (
                    <div className="mt-4 max-w-lg">
                      <NoticeCallout title={PARTNER_MONEY_NEGATIVE_BALANCE_LABEL} tone="danger">
                        {PARTNER_MONEY_NEGATIVE_BALANCE_NOTE}
                      </NoticeCallout>
                    </div>
                  ) : null}
                  {payoutProgressPct !== null ? (
                    <p className="mt-3 text-sm text-ink-muted">
                      {payoutProgressPct}% {PARTNER_MONEY_THRESHOLD_PROGRESS_SUFFIX}
                    </p>
                  ) : null}
                  {s.refundDueCount > 0 ? (
                    <div className="mt-6 max-w-lg">
                      <NoticeCallout title="Refund due" tone="warn">
                        <p>
                          {s.refundDueCount} cancelled booking
                          {s.refundDueCount === 1 ? '' : 's'} still show Refund due (
                          <span className="tabular-nums font-semibold">
                            {formatMoney(s.refundDue, s.currency)}
                          </span>
                          ). That money is not in Collected. {REFUND_DUE_MANUAL_COPY}
                        </p>
                        <button
                          type="button"
                          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?ops=refund_due`)}
                          className="tv-btn-ghost mt-3 -ml-2"
                        >
                          Open Refund due in Bookings
                        </button>
                      </NoticeCallout>
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
            />
          ) : (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                {filteredEarnings.length > 0 ? 'Payout periods' : 'Collected'}
              </h2>
              <div className="flex flex-wrap items-center gap-1 rounded-full bg-paper-raised p-1 shadow-soft ring-1 ring-black/[0.06]">
                {(['all', 'pending', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
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
                disabled={!canExportMoney}
                className="tv-btn-ghost text-sm disabled:opacity-40"
              >
                Export
              </button>
            </div>
            {ledger.length > 0 ? (
              <div className="mb-8">
                <h3 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">Ledger</h3>
              <ul className="space-y-2">
                {ledger.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-2xl bg-paper-raised px-4 py-3.5 shadow-soft ring-1 ring-black/[0.06] flex items-baseline justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{e.reason}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {ledgerKindLabel(e.kind)}
                        {e.booking_id ? ' · linked booking' : ''}
                        {e.policy_id ? ` · ${e.policy_id}` : ''}
                        {' · '}
                        {new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <p className={`tabular-nums font-semibold shrink-0 ${Number(e.amount) < 0 ? 'text-red-800' : 'text-ink'}`}>
                      {formatMoney(Number(e.amount), e.currency)}
                    </p>
                  </li>
                ))}
              </ul>
              </div>
            ) : null}
            {filteredEarnings.length === 0 ? (
              paidBookings.length > 0 ? (
                <ul className="space-y-2">
                  {paidBookings.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-2xl bg-paper-raised px-4 py-3.5 shadow-soft ring-1 ring-black/[0.06] flex items-baseline justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {b.booking_number != null ? `#${b.booking_number} · ` : ''}
                          {listingTitles[b.listing_id] || b.guest_name?.trim() || 'Guest'}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {b.guest_name?.trim() || 'Guest'} · {b.booking_date}
                          {isStripeTestCheckoutSession(b.checkout_session_id)
                            ? ' · Stripe TEST'
                            : ''}
                          {' · collected, not paid out'}
                        </p>
                      </div>
                      <p className="tabular-nums font-semibold text-ink shrink-0">
                        {formatMoney(Number(b.amount_paid ?? 0), normalizeCurrency(b.currency ?? primaryCurrency))}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
              <SupplierEmptyState
                icon={Wallet}
                className="py-6"
                title="No rows for this filter"
                body={PARTNER_MONEY_FILTER_EMPTY_BODY}
              />
              )
            ) : (
              <ul className="space-y-2">
                {filteredEarnings.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-2xl bg-paper-raised px-4 py-3.5 shadow-soft ring-1 ring-black/[0.06] flex items-baseline justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">
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
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {e.invoice_number ? e.invoice_number : null}
                        {e.status === 'paid' && e.payment_reference
                          ? `${e.invoice_number ? ' · ' : ''}${e.payment_reference}`
                          : null}
                        {!e.invoice_number && !(e.status === 'paid' && e.payment_reference) ? (
                          <span className="text-ink-faint">Payout period</span>
                        ) : null}
                      </p>
                    </div>
                    <p className="tabular-nums font-semibold text-ink shrink-0">
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
