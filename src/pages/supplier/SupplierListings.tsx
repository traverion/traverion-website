import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Plus, MapPin, Pencil, Trash2, Eye, EyeOff, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import { getSupplierListings, setSupplierListings } from '../../data/listings';
import { fetchMyListings, insertListing, updateListing, updateListingStatus, deleteListing } from '../../data/supabase-listings';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierListingForm from './SupplierListingForm';
import { computeListingQuality, listingQualityPercent } from '../../lib/listingQualityScore';
import { openSupplierListingEditor } from '../../lib/supplierPortalNavigation';

export default function SupplierListings() {
  const { user, isSupabase } = useSupplierAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formFocusSection, setFormFocusSection] = useState<string | null>(null);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQualityId, setExpandedQualityId] = useState<string | null>(null);

  const syncListingsUrlToState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    const focus = params.get('focus');
    if (edit) {
      setEditingId(edit);
      setShowForm(true);
      setFormFocusSection(focus && focus.length > 0 ? focus : null);
    } else {
      setFormFocusSection(null);
      // Keep local "Add listing" / edit-without-URL state; only URL drives deep links.
    }
  }, []);

  useEffect(() => {
    syncListingsUrlToState();
    const onPop = () => syncListingsUrlToState();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncListingsUrlToState]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    if (!edit) return;
    const found = listings.some((l) => l.id === edit);
    if (found) {
      setEditingId(edit);
      setShowForm(true);
      const focus = params.get('focus');
      setFormFocusSection(focus && focus.length > 0 ? focus : null);
    } else {
      setShowForm(false);
      setEditingId(null);
      setFormFocusSection(null);
      window.history.replaceState({}, '', '/supplier/listings');
    }
  }, [listings, loading]);

  const qualityOverview = useMemo(() => {
    if (listings.length === 0) return null;
    let sumPct = 0;
    let below70 = 0;
    const gapCounts: Record<string, { count: number; label: string }> = {};
    for (const l of listings) {
      const { score, maxScore, checks } = computeListingQuality(l);
      const pct = listingQualityPercent(score, maxScore);
      sumPct += pct;
      if (pct < 70) below70++;
      for (const c of checks) {
        if (c.earned < c.max) {
          if (!gapCounts[c.id]) gapCounts[c.id] = { count: 0, label: c.label };
          gapCounts[c.id].count++;
        }
      }
    }
    const quickWins = Object.entries(gapCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([id, v]) => ({ id, label: v.label, count: v.count }));
    return {
      avgPct: Math.round(sumPct / listings.length),
      below70,
      quickWins,
    };
  }, [listings]);

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
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
            setFormFocusSection(null);
            window.history.pushState({}, '', '/supplier/listings');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
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

      {!loading && listings.length > 0 && qualityOverview && (
        <div className="bg-gradient-to-br from-finland/5 via-white to-amber-50/30 border border-finland/15 rounded-xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-finland/10 text-finland flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Listing quality</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Scores are based on your listing content — not AI. Improve checkmarks to lift conversion on the main site.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <span className="text-3xl font-bold text-finland tabular-nums">{qualityOverview.avgPct}%</span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Average across {listings.length} listing{listings.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          {qualityOverview.below70 > 0 && (
            <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <strong>{qualityOverview.below70}</strong> listing{qualityOverview.below70 === 1 ? '' : 's'} under 70% — open <strong>Edit</strong> and work through the checklist below each row.
            </p>
          )}
          {qualityOverview.quickWins.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top gaps across your listings</p>
              <ul className="flex flex-wrap gap-2">
                {qualityOverview.quickWins.map((w) => (
                  <li
                    key={w.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-700"
                  >
                    <span>{w.label}</span>
                    <span className="text-xs text-gray-400">×{w.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <SupplierListingForm
          editingId={editingId}
          existingListings={listings}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
            setFormFocusSection(null);
            window.history.pushState({}, '', '/supplier/listings');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          focusSection={formFocusSection}
          onFocusConsumed={() => setFormFocusSection(null)}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {listings.map((listing) => {
                      const q = computeListingQuality(listing);
                      const pct = listingQualityPercent(q.score, q.maxScore);
                      const tone =
                        pct >= 80 ? 'bg-green-100 text-green-800' : pct >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
                      return (
                      <Fragment key={listing.id}>
                      <tr className="hover:bg-gray-50/50">
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
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full tabular-nums ${tone}`}>
                              {pct}%
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQualityId((id) => (id === listing.id ? null : listing.id))
                              }
                              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100"
                              title="Show quality checklist"
                              aria-expanded={expandedQualityId === listing.id}
                            >
                              {expandedQualityId === listing.id ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
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
                              onClick={() => openSupplierListingEditor(listing.id)}
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
                      {expandedQualityId === listing.id && (
                        <tr className="bg-gray-50/80">
                          <td colSpan={6} className="px-4 py-4 border-t border-gray-100">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                              <p className="text-sm font-medium text-gray-900">Checklist — {listing.title}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  openSupplierListingEditor(listing.id);
                                }}
                                className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
                              >
                                <Pencil className="w-4 h-4" />
                                Edit listing
                              </button>
                            </div>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.checks.map((c) => {
                                const complete = c.earned >= c.max;
                                return (
                                  <li
                                    key={c.id}
                                    className={`text-sm rounded-lg border px-3 py-2 ${
                                      complete ? 'border-green-100 bg-white' : 'border-amber-100 bg-amber-50/40'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={complete ? 'text-gray-700' : 'text-gray-900 font-medium'}>{c.label}</span>
                                      <span className="text-xs tabular-nums text-gray-500">
                                        {c.earned}/{c.max}
                                      </span>
                                    </div>
                                    {!complete && c.tip && (
                                      <p className="text-xs text-gray-600 mt-1">{c.tip}</p>
                                    )}
                                    {!complete && (
                                      <button
                                        type="button"
                                        onClick={() => openSupplierListingEditor(listing.id, c.id)}
                                        className="mt-2 text-xs font-medium text-finland hover:underline"
                                      >
                                        Fix this →
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
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
