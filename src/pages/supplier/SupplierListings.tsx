import { useState, useEffect, useCallback } from 'react';
import { Plus, MapPin, Pencil, Trash2, Eye, EyeOff, AlertCircle, RefreshCw } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import { getSupplierListings, setSupplierListings } from '../../data/listings';
import { fetchMyListings, insertListing, updateListing, updateListingStatus, deleteListing } from '../../data/supabase-listings';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierListingForm from './SupplierListingForm';

export default function SupplierListings() {
  const { user, isSupabase } = useSupplierAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadListings = useCallback(() => {
    if (isSupabase && user) {
      setLoading(true);
      setError(null);
      fetchMyListings(user.id)
        .then((data) => {
          setListings(data);
          setLoading(false);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to load listings');
          setLoading(false);
        });
    } else {
      setListings(getSupplierListings());
      setLoading(false);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (!isSupabase) {
      const onStorage = () => setListings(getSupplierListings());
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
  }, [isSupabase]);

  const refresh = () => {
    loadListings();
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async (tour: TourPackage) => {
    if (isSupabase && user) {
      if (editingId) {
        await updateListing(editingId, tour);
      } else {
        await insertListing(tour, user.id);
      }
      refresh();
    } else {
      const list = getSupplierListings();
      const index = list.findIndex(t => t.id === tour.id);
      const next = index >= 0 ? [...list] : [...list, tour];
      if (index >= 0) next[index] = tour;
      setSupplierListings(next);
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this listing?')) return;
    if (isSupabase) {
      await deleteListing(id);
      refresh();
    } else {
      const next = getSupplierListings().filter(t => t.id !== id);
      setSupplierListings(next);
      refresh();
    }
  };

  const handleStatusChange = async (listing: TourPackage, newStatus: 'draft' | 'published') => {
    if (!isSupabase || !user) return;
    const ok = await updateListingStatus(listing.id, newStatus);
    if (ok) loadListings();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My listings</h1>
          <p className="text-gray-600 mt-1">Manage your tours and activities. They appear on the main site for all travelers.</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingId(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add listing
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => loadListings()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {showForm && (
        <SupplierListingForm
          editingId={editingId}
          existingListings={listings}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {loading ? (
        <p className="text-gray-500">Loading listings…</p>
      ) : listings.length === 0 && !showForm ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
            <MapPin className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No listings yet</h2>
          <p className="text-gray-500 mt-1 max-w-sm mx-auto">
            Add your first tour or activity to start receiving bookings from travelers worldwide.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add your first listing
          </button>
        </div>
      ) : (
        listings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium text-gray-900">Your listings ({listings.length})</h2>
            <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Listing</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location · Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {listings.map((listing) => (
                      <tr key={listing.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={listing.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">{listing.title}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {listing.city && `${listing.city}, `}{listing.country ?? listing.destination} · {listing.duration}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">From ${listing.price.startingFrom}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                            listing.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {listing.status === 'published' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {listing.status ?? 'published'}
                          </span>
                          {isSupabase && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(listing, listing.status === 'published' ? 'draft' : 'published')}
                              className="ml-2 text-xs text-finland hover:underline"
                            >
                              → {listing.status === 'published' ? 'Draft' : 'Publish'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditingId(listing.id); setShowForm(true); }}
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-finland"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(listing.id)}
                              className="p-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
