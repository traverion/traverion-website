import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';

function formatMoney(amount: number, currency: string) {
  const c = currency || 'USD';
  if (c === 'USD') return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${c}`;
}

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
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
    fetchSupplierEarnings(uid)
      .then((data) => {
        setEarnings(data);
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
    const row = earnings.find((e) => e.status !== 'cancelled');
    return row?.currency ?? earnings[0]?.currency ?? 'USD';
  }, [earnings]);

  const { pending, paid, filteredEarnings } = useMemo(() => {
    const nonCancelled = earnings.filter((e) => e.status !== 'cancelled');
    const pendingSum = nonCancelled.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
    const paidSum = nonCancelled.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
    const filtered =
      statusFilter === 'all'
        ? nonCancelled
        : nonCancelled.filter((e) => e.status === statusFilter);
    return {
      pending: pendingSum,
      paid: paidSum,
      filteredEarnings: filtered,
    };
  }, [earnings, statusFilter]);

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

  const hasMoney = pending > 0 || paid > 0 || earningsForInvoices.length > 0;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <header className="pt-2 sm:pt-8 mb-10">
        <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Money</h1>
        <p className="mt-2 text-ink-muted max-w-xl">
          Payouts from completed bookings. Nothing here is estimated.
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">Pending payout</p>
            <p className="font-display text-5xl sm:text-6xl tabular-nums text-ink tracking-tight">
              {formatMoney(pending, primaryCurrency)}
            </p>
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
              body="No traveler has completed a paid booking, so there is nothing to pay out. Traverion does not invent balances. Add payout details so you are ready when the first booking lands."
            />
          ) : (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">History</h2>
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
            {filteredEarnings.length === 0 ? (
              <SupplierEmptyState
                icon={Wallet}
                className="py-6"
                title="No rows for this filter"
                body="Payout history exists, but nothing matches this status. Switch to All to see every period."
              />
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
