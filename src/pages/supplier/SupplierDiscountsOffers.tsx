import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Pencil, Tag } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { TourPackage } from '../../types/tour';
import ListingDiscounts from '../../components/supplier/ListingDiscounts';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl, openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import { fetchDiscountsByListingId, getValidDiscount } from '../../data/supabase-discounts';

export default function SupplierDiscountsOffers() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<Record<string, string | null>>({});

  const loadListings = useCallback(() => {
    if (!isSupabase || !user) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchMyListings(user.id)
      .then(async (data) => {
        setListings(data);
        const summary: Record<string, string | null> = {};
        await Promise.all(
          data.map(async (l) => {
            const discounts = await fetchDiscountsByListingId(l.id);
            const v = getValidDiscount(discounts);
            if (!v) {
              summary[l.id] = null;
              return;
            }
            summary[l.id] =
              v.type === 'percent' ? `${v.value}% off now` : `$${v.value} off now`;
            if (v.code) summary[l.id] += ` · code ${v.code}`;
          })
        );
        setActiveSummary(summary);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load listings');
        setListings([]);
      })
      .finally(() => setLoading(false));
  }, [isSupabase, user]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const goToListings = () => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`);

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-finland mb-1">
            <Tag className="w-6 h-6 shrink-0" aria-hidden />
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Discounts &amp; offers</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 mt-1 max-w-2xl">
            Create percentage or fixed-amount promotions per tour. Optional promo codes and date ranges apply on the public
            site when valid. You can refine this area later — today it uses the same rules as listing-level discounts
            elsewhere.
          </p>
        </div>
        <button
          type="button"
          onClick={goToListings}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl border border-gray-300 text-gray-800 font-medium hover:bg-gray-50 min-h-[48px] touch-manipulation"
        >
          <MapPin className="w-4 h-4" />
          My listings
        </button>
      </div>

      {!canEdit && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Your role can view discounts but not add or remove them.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading your tours…</p>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-gray-700 font-medium">No tours yet</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Add a listing first, then return here to attach discounts and offers.
          </p>
          <button
            type="button"
            onClick={goToListings}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
          >
            Go to My listings
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">By listing</h2>
          <ul className="space-y-2">
            {listings.map((listing) => {
              const open = expandedId === listing.id;
              const live = listing.status === 'published';
              const hint = activeSummary[listing.id];
              return (
                <li
                  key={listing.id}
                  className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === listing.id ? null : listing.id))}
                    className="touch-manipulation w-full flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 text-left hover:bg-gray-50/80 transition-colors"
                  >
                    <img
                      src={listing.image}
                      alt=""
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover shrink-0 bg-gray-100"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{listing.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {live ? (
                          <span className="text-green-700 font-medium">Published</span>
                        ) : (
                          <span>Draft</span>
                        )}
                        {hint ? (
                          <>
                            {' · '}
                            <span className="text-finland font-medium">{hint}</span>
                          </>
                        ) : (
                          <> · No active offer in date range</>
                        )}
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-gray-100 bg-gray-50/50 space-y-3">
                      <div className="flex flex-wrap gap-2 pt-3">
                        <button
                          type="button"
                          onClick={() => openSupplierListingEditor(listing.id)}
                          disabled={!canEdit}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-finland hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit listing
                        </button>
                      </div>
                      <ListingDiscounts
                        listingId={listing.id}
                        readOnly={!canEdit}
                        onChange={() => void loadListings()}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
