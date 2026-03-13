import { Calendar } from 'lucide-react';

export default function SupplierBookings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
        <p className="text-gray-600 mt-1">View and manage incoming bookings</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
          <Calendar className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No bookings yet</h2>
        <p className="text-gray-500 mt-1 max-w-sm mx-auto">
          When travelers book your experiences, they’ll appear here.
        </p>
      </div>
    </div>
  );
}
