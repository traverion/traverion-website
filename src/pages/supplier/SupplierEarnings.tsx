import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Calendar, FileText, Receipt, AlertCircle, RefreshCw, Info } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const pending = earnings.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
  const paid = earnings.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);
  const threshold = profile?.payout_threshold_min ?? 0;
  const cycle = profile?.payment_cycle ?? 'monthly';
  const nextPayoutLabel = threshold > 0
    ? `Next payout when balance ≥ $${threshold.toFixed(0)} (${cycle})`
    : cycle
      ? `Payout cycle: ${cycle}. Set minimum in Settings.`
      : 'Set payout schedule in Settings.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Earnings</h1>
        <p className="text-gray-600 mt-1">Payouts and transaction history</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-xl font-semibold text-gray-900">${pending.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Paid out</p>
            <p className="text-xl font-semibold text-gray-900">${paid.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {isSupabase && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
          <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <span>{nextPayoutLabel}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900">History</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : earnings.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No earnings yet</p>
            <p className="text-sm text-gray-400 mt-1">When you have completed bookings, payouts will appear here.</p>
          </div>
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
                {earnings.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">
                      {e.period_start} – {e.period_end}
                    </td>
                    <td className="px-4 py-3 font-medium">{e.currency} {Number(e.amount).toFixed(2)}</td>
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
