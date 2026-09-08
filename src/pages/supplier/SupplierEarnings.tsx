import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { formatMoney, isStripeTestCheckoutSession, normalizeCurrency } from '../../lib/money';
import { isCollectedBooking, sumCollectedAmount } from '../../lib/payment-states';
import { ledgerAdjustmentTotal } from '../../lib/supplier-ledger-balance';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierLedger, type SupplierLedgerEntry } from '../../data/supabase-booking-ops';

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

  const primaryCurrency = useMemo(() => {
    const bookingCur = paidBookings.find((b) => (b.currency ?? '').trim())?.currency;
    const row = earnings.find((e) => e.status !== 'cancelled');
    return (bookingCur || row?.currency || earnings[0]?.currency || 'EUR').toUpperCase();
  }, [earnings, paidBookings]);

  const { pending, paid, gross, fees, available, filteredEarnings } = useMemo(() => {
    const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
    const paidOut = nonCancelled.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
    const pendingRows = nonCancelled.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
    const collected = sumCollectedAmount(paidBookings);
    const feeSum = ledgerAdjustmentTotal(ledger);
    const availableBalance = collected + feeSum - paidOut;
    const pendingPayout = pendingRows > 0 ? pendingRows + feeSum : availableBalance;
    const filtered =
      statusFilter === 'all'
        ? nonCancelled
        : nonCancelled.filter((e) => e.status === statusFilter);
    return {
      pending: pendingPayout,
      paid: paidOut,
      gross: collected,
      fees: feeSum,
      available: availableBalance,
      filteredEarnings: filtered,
    };
  }, [earnings, statusFilter, paidBookings, ledger]);

  const earningsForInvoices = useMemo(
    () => earnings.filter((e) => e.status !== 'cancelled'),
    [earnings]
  );

  const threshold = profile?.payout_threshold_min ?? 0;
  const nextPayoutLabel =
    'Payouts are reviewed by Traverion. There is no automatic transfer date until payouts are enabled for your account.';

  const payoutProgressPct =
    threshold > 0 && pending > 0 ? Math.min(100, Math.round((pending / threshold) * 100)) : null;

  const exportCsv = () => {
    const rows = filteredEarnings;
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ['period_start', 'period_end', 'amount', 'currency', 'status', 'invoice_number', 'payment_reference'];
    const lines = rows.map((e) =>
      [e.period_start, e.period_end, e.amount, e.currency, e.status, e.invoice_number ?? '', e.payment_reference ?? '']
        .map(escape)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasMoney = gross > 0 || pending !== 0 || paid > 0 || earningsForInvoices.length > 0 || ledger.length > 0;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <header className="pt-2 sm:pt-8 mb-10">
        <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Money</h1>
        <p className="mt-2 text-ink-muted max-w-xl">
          What travelers paid, and what Traverion has paid you. Payouts are manual — this page never invents a transfer.
        </p>
      </header>

      {error && (
        <ErrorState
          className="py-6"
          title="Payouts unavailable"
          body={userFacingError(error, USER_ERROR.money)}
          retry={{ onClick: () => void load() }}
        />
      )}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : (
        <>
          <section className="mb-12">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">
              {available < 0 ? 'Balance' : 'Pending payout'}
            </p>
            <p className={`font-display text-5xl sm:text-6xl tabular-nums tracking-tight ${available < 0 ? 'text-red-800' : 'text-ink'}`}>
              {formatMoney(available, primaryCurrency)}
            </p>
            <p className="mt-4 text-sm text-ink-muted">
              Collected{' '}
              <span className="tabular-nums font-semibold text-ink">
                {formatMoney(gross, primaryCurrency)}
              </span>
              {fees !== 0 ? (
                <>
                  {' '}
                  · fees & adjustments{' '}
                  <span className="tabular-nums font-semibold text-ink">{formatMoney(fees, primaryCurrency)}</span>
                </>
              ) : null}
              <span className="text-ink-faint">
                {' '}
                · paid traveler bookings only. Refunded payments are excluded. Payouts are manual.
              </span>
            </p>
            {available < 0 ? (
              <p className="mt-3 text-sm text-red-800 max-w-lg">
                This account has a negative balance. Future collected earnings offset it before the next payout.
              </p>
            ) : null}
            {payoutProgressPct !== null ? (
              <p className="mt-3 text-sm text-ink-muted">{payoutProgressPct}% of your payout minimum</p>
            ) : null}
            <p className="mt-4 text-sm text-ink-muted max-w-lg">{nextPayoutLabel}</p>
            <p className="mt-6 text-sm text-ink-muted">
              Paid to date <span className="tabular-nums font-semibold text-ink">{formatMoney(paid, primaryCurrency)}</span>
            </p>
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-payout`)}
              className="tv-btn-ghost mt-4 -ml-2"
            >
              Payout account
            </button>
          </section>

          {!hasMoney ? (
            <SupplierEmptyState
              icon={Wallet}
              title="No payouts yet"
              body="When a traveler completes checkout, the collected amount appears here. Payouts stay manual — Traverion does not invent a transfer."
            />
          ) : (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                {filteredEarnings.length > 0 ? 'Payout history' : 'Collected'}
              </h2>
              <div className="flex flex-wrap items-center gap-1">
                {(['all', 'pending', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`lux-flat rounded-full px-3 py-2 min-h-11 text-sm font-medium ${
                      statusFilter === s ? 'bg-ink text-paper-raised' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={filteredEarnings.length === 0}
                  className="tv-btn-ghost text-sm disabled:opacity-40"
                >
                  Export
                </button>
              </div>
            </div>
            {ledger.length > 0 ? (
              <div className="mb-8">
                <h3 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">Ledger</h3>
              <ul className="divide-y divide-black/[0.06]">
                {ledger.map((e) => (
                  <li key={e.id} className="py-4 flex items-baseline justify-between gap-4">
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
                <ul className="divide-y divide-black/[0.06]">
                  {paidBookings.map((b) => (
                    <li key={b.id} className="py-4 flex items-baseline justify-between gap-4">
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
                body="Payout history exists, but nothing matches this status. Switch to All to see every period."
              />
              )
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {filteredEarnings.map((e) => (
                  <li key={e.id} className="py-4 flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {e.period_start} – {e.period_end}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {e.status === 'paid' ? 'Paid' : e.status === 'pending' ? 'Pending' : e.status}
                        {e.invoice_number ? ` · ${e.invoice_number}` : ''}
                        {e.status === 'paid' && e.payment_reference ? ` · ${e.payment_reference}` : ''}
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
