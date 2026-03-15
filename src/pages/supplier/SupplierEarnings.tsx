import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchSupplierEarnings, SupplierEarning } from '../../data/supabase-earnings';

export default function SupplierEarnings() {
  const { user, isSupabase } = useSupplierAuth();
  const [earnings, setEarnings] = useState<SupplierEarning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabase && user) {
      fetchSupplierEarnings(user.id).then((data) => {
        setEarnings(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [isSupabase, user]);

  const pending = earnings.filter((e) => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0);
  const paid = earnings.filter((e) => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Earnings</h1>
        <p className="text-gray-600 mt-1">Payouts and transaction history</p>
      </div>

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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
