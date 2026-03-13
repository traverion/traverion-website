import { useState, useEffect } from 'react';
import { BarChart3, Calendar, DollarSign, MapPin, Plus, ArrowRight } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';

interface SupplierDashboardProps {
  onNavigateToListings?: () => void;
}

export default function SupplierDashboard({ onNavigateToListings }: SupplierDashboardProps) {
  const { user, isSupabase } = useSupplierAuth();
  const [listingsCount, setListingsCount] = useState<number | null>(null);

  useEffect(() => {
    if (isSupabase && user) {
      fetchMyListings(user.id).then((list) => setListingsCount(list.length));
    } else {
      setListingsCount(0);
    }
  }, [isSupabase, user]);

  const stats = [
    { label: 'Active listings', value: listingsCount !== null ? String(listingsCount) : '—', icon: MapPin, color: 'bg-finland/10 text-finland' },
    { label: 'Bookings this month', value: '0', icon: Calendar, color: 'bg-green-500/10 text-green-600' },
    { label: 'Earnings (pending)', value: '$0', icon: DollarSign, color: 'bg-amber-500/10 text-amber-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your tours and activities</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-xl font-semibold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {listingsCount === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-finland/10 text-finland mb-4">
            <MapPin className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Add your first listing</h2>
          <p className="text-gray-600 mb-6 max-w-sm mx-auto">
            Create a tour or activity to start appearing on Traverion. Travelers can then find and book your experience.
          </p>
          <button
            type="button"
            onClick={onNavigateToListings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add listing
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 text-gray-500 mb-4">
          <BarChart3 className="w-5 h-5" />
          <span className="font-medium">Bookings over time</span>
        </div>
        <div className="h-48 flex items-center justify-center border border-dashed border-gray-200 rounded-lg bg-gray-50">
          <p className="text-gray-400 text-sm">Bookings will appear here once you have activity</p>
        </div>
      </div>
    </div>
  );
}
