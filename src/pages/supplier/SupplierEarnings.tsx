import { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, TrendingUp, Calendar, FileText, Receipt, AlertCircle, RefreshCw, Info, Download } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');

  const load = useCallback(() => {
    if (!isSupabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSupplierEarnings(user.id)
      .then((data) => {
        setEarnings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load earnings');
        setLoading(false);
      });
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) load();
    else setLoading(false);
  }, [isSupabase, user, load]);

  useEffect(() => {
    if (isSupabase && user) fetchSupplierProfile(user.id).then(setProfile);
    else setProfile(null);
  }, [isSupabase, user]);

  const primaryCurrency = earnings[0]?.currency ?? 'USD';

  const { pending, paid, cancelled, filteredEarnings } = useMemo(() => {
    const pendingSum = earnings.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
    const paidSum = earnings.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
    const cancelledSum = earnings.filter((e) => e.status === 'cancelled').reduce((sum, e) => sum + Number(e.amount), 0);
    const filtered =
      statusFilter === 'all'
        ? earnings
        : earnings.filter((e) => e.status === statusFilter);
    return {
      pending: pendingSum,
      paid: paidSum,
      cancelled: cancelledSum,
      filteredEarnings: filtered,
    };
  }, [earnings, statusFilter]);

  const threshold = profile?.payout_threshold_min ?? 0;
  const cycle = profile?.payment_cycle ?? 'monthly';
  const nextPayoutLabel = threshold > 0
    ? `Next payout when pending balance ≥ ${formatMoney(threshold, primaryCurrency)} (${cycle})`
    : cycle
      ? `Payout cycle: ${cycle}. Set minimum in Settings.`
      : 'Set payout schedule in Settings.';

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

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Earnings</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">Payouts and transaction history</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Pending payout</p>
            <p className="text-xl font-semibold text-gray-900 tabular-nums">{formatMoney(pending, primaryCurrency)}</p>
            {payoutProgressPct !== null && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${payoutProgressPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{payoutProgressPct}% of minimum threshold (pending)</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Paid out</p>
            <p className="text-xl font-semibold text-gray-900 tabular-nums">{formatMoney(paid, primaryCurrency)}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Cancelled / adjusted</p>
            <p className="text-xl font-semibold text-gray-900 tabular-nums">{formatMoney(cancelled, primaryCurrency)}</p>
            <p className="text-xs text-gray-400 mt-1">Reversals or voided accruals</p>
          </div>
        </div>
      </div>

      {isSupabase && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
          <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <span>{nextPayoutLabel}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <span className="font-medium text-gray-900">History</span>
            <span className="text-sm text-gray-500">({filteredEarnings.length} row{filteredEarnings.length === 1 ? '' : 's'})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'pending', 'paid', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  statusFilter === s ? 'bg-finland/10 text-finland border-finland/20' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredEarnings.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : earnings.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No earnings yet</p>
            <p className="text-sm text-gray-400 mt-1">When you have completed bookings, payouts will appear here.</p>
          </div>
        ) : filteredEarnings.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No rows for this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {filteredEarnings.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">
                      {e.period_start} – {e.period_end}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatMoney(Number(e.amount), e.currency)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          e.status === 'paid' ? 'bg-green-100 text-green-800' : e.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <FileText className="w-4 h-4" />
                        {(e as { invoice_number?: string }).invoice_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-green-700" title="Payment confirmation">
                          <Receipt className="w-4 h-4" />
                          {(e as { payment_reference?: string }).payment_reference ?? 'Paid'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-finland" />
          Invoices & payment confirmations
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Invoices are generated per period. When a payout is made, a payment confirmation is available. Download links will be available when payment processing is integrated.
        </p>
        {earnings.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {earnings.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span>{e.period_start} – {e.period_end}</span>
                <span className="flex items-center gap-2">
                  <button type="button" className="text-finland hover:underline" disabled>
                    Download invoice
                  </button>
                  {e.status === 'paid' && (
                    <button type="button" className="text-green-600 hover:underline" disabled>
                      Payment confirmation
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
