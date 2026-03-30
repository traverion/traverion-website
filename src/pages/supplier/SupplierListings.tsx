import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Plus, MapPin, Pencil, Trash2, Eye, EyeOff, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Sparkles, ExternalLink } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import { getSupplierListings, setSupplierListings } from '../../data/listings';
import { fetchMyListings, insertListing, updateListing, updateListingStatus, deleteListing } from '../../data/supabase-listings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierListingForm from './SupplierListingForm';
import { computeListingQuality, listingQualityPercent } from '../../lib/listingQualityScore';
import { navigateSupplierUrl, openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import { isSupplierBusinessProfileComplete } from '../../lib/supplierOnboarding';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { publicTourListingUrl } from '../../lib/publicSiteUrl';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';

function verificationStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending') return 'Under verification';
  if (s === 'rejected') return 'Rejected';
  if (s === 'verified') return 'Verified';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export default function SupplierListings() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditListings = canManageBookings(role);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formFocusSection, setFormFocusSection] = useState<string | null>(null);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQualityId, setExpandedQualityId] = useState<string | null>(null);
  /** Business profile complete + Traverion verification approved — required to add or publish tours. */
  const [canPostNewListing, setCanPostNewListing] = useState(false);
  const [profileGateMessage, setProfileGateMessage] = useState<string | null>(null);
  const [missingBusinessDetails, setMissingBusinessDetails] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [publishGate, setPublishGate] = useState<{ listingId: string; title: string; blockers: string[] } | null>(null);

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
    if (canEditListings) return;
    setShowForm(false);
    setEditingId(null);
    setFormFocusSection(null);
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit')) {
      window.history.replaceState({}, '', '/supplier/listings');
    }
  }, [canEditListings]);

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

  useEffect(() => {
    const loadProfileGate = async () => {
      if (!isSupabase || !user?.id) {
        setCanPostNewListing(true);
        setProfileGateMessage(null);
        setMissingBusinessDetails(false);
        setVerificationStatus(null);
        return;
      }
      const profile = await fetchSupplierProfile(user.id);
      const businessComplete = isSupplierBusinessProfileComplete(profile);
      const v = profile?.verification_status ?? null;
      setVerificationStatus(v);
      setMissingBusinessDetails(!businessComplete);
      const verified = v === 'verified';
      const canPost = businessComplete && verified;
      setCanPostNewListing(canPost);
      if (!businessComplete) {
        setProfileGateMessage(
          'Add your registered name, address, business registration proof, and payout details in Settings. Companies need an official registration number; individual traders need their business or tax identifier on file (as on their registration). After Traverion verifies your business, you can add and publish tours.'
        );
      } else if (v === 'rejected') {
        setProfileGateMessage(
          'Business verification was not approved. Update your business details in Settings and contact support if you need help before adding tours.'
        );
      } else if (!verified) {
        setProfileGateMessage(
          'Your documents and details are being reviewed. Once Traverion marks your account as verified, you can add and publish tours.'
        );
      } else {
        setProfileGateMessage(null);
      }
    };
    loadProfileGate();
  }, [isSupabase, user?.id, showForm, loading]);

  const refresh = () => {
    loadListings();
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async (tour: TourPackage) => {
    if (!canEditListings) {
      setError('Your role can view listings but cannot create or edit them.');
      setShowForm(false);
      return;
    }
    if (isSupabase && !editingId && !canPostNewListing) {
      setError('Complete business verification before creating a new listing.');
      setShowForm(false);
      return;
    }
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
    if (!canEditListings) return;
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
    if (!canEditListings) {
      setError('Your role cannot change listing status.');
      return;
    }
    if (newStatus === 'published' && !canPostNewListing) {
      setError('Business verification must be approved before publishing listings.');
      return;
    }
    if (newStatus === 'published') {
      const blockers = getListingPublishBlockers(listing);
      if (blockers.length > 0) {
        setPublishGate({ listingId: listing.id, title: listing.title, blockers });
        setError(null);
        return;
      }
    }
    setPublishGate(null);
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
            if (!canEditListings || !canPostNewListing) return;
            setEditingId(null);
            setShowForm(true);
            setFormFocusSection(null);
            window.history.pushState({}, '', '/supplier/listings');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          disabled={!canEditListings || !canPostNewListing}
          title={
            !canEditListings
              ? 'Your role can view listings but cannot add new ones.'
              : !canPostNewListing
                ? 'Complete business profile and get verified before adding a tour.'
                : undefined
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
          Add listing
        </button>
      </div>

      {!canEditListings && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm">
          <p className="font-medium text-slate-900">View-only access</p>
          <p className="mt-1 text-slate-600">
            You can browse listings on this page. Creating, editing, or publishing requires an owner, manager, or ops role.
          </p>
        </div>
      )}

      {canEditListings && !canPostNewListing && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {missingBusinessDetails && (
              <p className="font-semibold text-amber-950">Missing information</p>
            )}
            <p className={missingBusinessDetails ? 'mt-2' : ''}>{profileGateMessage}</p>
            {!missingBusinessDetails && verificationStatus && (
              <p className="mt-1 text-xs text-amber-800/90">
                Current status: <span className="font-semibold">{verificationStatusLabel(verificationStatus)}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {missingBusinessDetails && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl('/supplier/business-profile#supplier-business-company')}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  Complete business profile
                </button>
              )}
              {!missingBusinessDetails && verificationStatus !== 'verified' && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl('/supplier/business-profile#supplier-business-company')}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  Business profile & verification
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateSupplierUrl('/supplier/business-profile')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark shrink-0"
          >
            Open settings
          </button>
        </div>
      )}

      {publishGate && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">Complete these before publishing “{publishGate.title}”</p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-amber-900/90">
                {publishGate.blockers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  openSupplierListingEditor(publishGate.listingId);
                  setPublishGate(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
              >
                <Pencil className="w-4 h-4" />
                Edit listing
              </button>
              <button
                type="button"
                onClick={() => setPublishGate(null)}
                className="px-3 py-2 rounded-lg border border-amber-300 text-amber-900 text-sm hover:bg-amber-100/80"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

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
            onClick={() => {
              if (!canEditListings || !canPostNewListing) return;
              setShowForm(true);
            }}
            disabled={!canEditListings || !canPostNewListing}
            title={
              !canEditListings
                ? 'Your role cannot add listings.'
                : !canPostNewListing
                  ? 'Complete verification before adding a tour.'
                  : undefined
            }
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors disabled:opacity-50"
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
                          {isSupabase && canEditListings && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(listing, listing.status === 'published' ? 'draft' : 'published')}
                              disabled={listing.status !== 'published' && !canPostNewListing}
                              title={
                                listing.status !== 'published' && !canPostNewListing
                                  ? 'Verification required to publish'
                                  : undefined
                              }
                              className="ml-2 text-xs text-finland hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            >
                              → {listing.status === 'published' ? 'Draft' : 'Publish'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end flex-wrap gap-1">
                            <a
                              href={publicTourListingUrl(listing.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-finland border border-finland/30 hover:bg-finland/5"
                              title="Opens the public tour page on Traverion"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              View on site
                            </a>
                            <button
                              type="button"
                              onClick={() => openSupplierListingEditor(listing.id)}
                              disabled={!canEditListings}
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-finland disabled:opacity-40 disabled:pointer-events-none"
                              title={canEditListings ? 'Edit' : 'View only'}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(listing.id)}
                              disabled={!canEditListings}
                              className="p-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none"
                              title={canEditListings ? 'Delete' : 'View only'}
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
                                disabled={!canEditListings}
                                className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-40"
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
                                    {!complete && canEditListings && (
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
