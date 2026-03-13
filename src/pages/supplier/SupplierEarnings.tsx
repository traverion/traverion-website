import { DollarSign } from 'lucide-react';

export default function SupplierEarnings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Earnings</h1>
        <p className="text-gray-600 mt-1">Payouts and transaction history</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
          <DollarSign className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No earnings yet</h2>
        <p className="text-gray-500 mt-1 max-w-sm mx-auto">
          Your payout details and history will appear here once you have completed bookings.
        </p>
      </div>
    </div>
  );
}
