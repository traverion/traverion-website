/**
 * Consumer: saved listings (wishlist). Requires login when Supabase is configured.
 */
import { useState, useEffect, useCallback } from 'react';
import { Heart, LogIn, ArrowLeft, Trash2, RefreshCw } from 'lucide-react';
import { SkeletonListItem } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchWishlistListingIds, removeFromWishlist } from '../data/supabase-wishlist';
import { fetchListingById } from '../data/supabase-listings';
import { TourPackage } from '../types/tour';

interface WishlistPageProps {
  onNavigate: (page: string) => void;
  onTourSelect: (tour: TourPackage) => void;
}

export default function WishlistPage({ onNavigate, onTourSelect }: WishlistPageProps) {
  const { user } = useAuth();
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchWishlistListingIds(user.id);
      const tours: TourPackage[] = [];
      for (const id of ids) {
        const t = await fetchListingById(id);
        if (t) tours.push(t);
      }
      setListings(tours);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  const handleRemove = async (listingId: string) => {
    if (!user) return;
    const ok = await removeFromWishlist(user.id, listingId);
    if (ok) {
      setListings((prev) => prev.filter((t) => t.id !== listingId));
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <Heart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Wishlist unavailable</h1>
            <p className="text-gray-600 mb-6">
              Saved tours are available only in the live app setup. You can still browse all tours.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              Browse tours
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <Heart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Your wishlist</h1>
            <p className="text-gray-600 mb-6">Log in to save tours and activities and see them here.</p>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/sign-up?next=wishlist');
                onNavigate('auth');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <LogIn className="w-5 h-5" />
              Sign in / Sign up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm mb-6">
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className="inline-flex items-center gap-1.5 text-gray-600 hover:text-finland font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            My account
          </button>
          <span className="text-gray-300 hidden sm:inline" aria-hidden>
            |
          </span>
          <button type="button" onClick={() => onNavigate('packages')} className="text-gray-500 hover:text-finland">
            Browse tours
          </button>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Heart className="w-6 h-6 text-red-500 fill-red-500" />
          Wishlist
        </h1>
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
            <span>{error}</span>
            <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">You haven’t saved any tours yet.</p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="mt-4 px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              Find tours
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((tour) => (
              <div
                key={tour.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col sm:flex-row gap-4 p-4"
              >
                <button
                  type="button"
                  onClick={() => onTourSelect(tour)}
                  className="flex-1 text-left flex gap-4 min-w-0"
                >
                  <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
                    <img src={tour.image} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 truncate">{tour.title}</h2>
                    <p className="text-sm text-gray-500">{tour.destination} · {tour.duration}</p>
                    <p className="text-sm font-medium text-finland mt-1">
                      From {tour.price?.currency ?? 'USD'} {tour.price?.startingFrom ?? 0} per person
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTourSelect(tour)}
                    className="px-4 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(tour.id)}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    title="Remove from wishlist"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
