import { useState, useEffect, useCallback } from 'react';
import { Plus, MapPin, Pencil, Trash2 } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import { getSupplierListings, setSupplierListings } from '../../data/listings';
import { fetchMyListings, insertListing, updateListing, deleteListing } from '../../data/supabase-listings';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierListingForm from './SupplierListingForm';

export default function SupplierListings() {
  const { user, isSupabase } = useSupplierAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadListings = useCallback(() => {
    if (isSupabase && user) {
      setLoading(true);
      fetchMyListings(user.id).then(data => {
        setListings(data);
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
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-xl bg-white overflow-hidden">
              {listings.map((listing) => (
                <li key={listing.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                  <img src={listing.image} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{listing.title}</p>
                    <p className="text-sm text-gray-500">
                      {listing.city && `${listing.city}, `}{listing.country} · {listing.duration} · From ${listing.price.startingFrom}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
