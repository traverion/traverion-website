import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react';
import { Plus, MapPin, Pencil, Trash2, Eye, EyeOff, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Sparkles, ExternalLink } from 'lucide-react';
import { TourPackage } from '../../types/tour';
import { getSupplierListings, setSupplierListings } from '../../data/listings';
import {
  fetchMyListings,
  fetchListingById,
  insertListing,
  updateListing,
  updateListingStatus,
  deleteListing,
} from '../../data/supabase-listings';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierListingForm, { type ListingEditorSaveResult } from './SupplierListingForm';
import {
  computeListingQualityPartnerFocus,
  listingQualityPercent,
} from '../../lib/listingQualityScore';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl, openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import {
  isSupplierBusinessProfileComplete,
  isSupplierPayoutConfigured,
  isSupplierReadyToPublishTours,
} from '../../lib/supplierOnboarding';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { publicTourListingUrl } from '../../lib/publicSiteUrl';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import { normalizeListingForDraftSave } from '../../lib/listingDraftUtils';

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
  /** Verified profile + complete business details + payout saved — required to add or publish tours. */
  const [canPostNewListing, setCanPostNewListing] = useState(false);
  const [profileGateMessage, setProfileGateMessage] = useState<string | null>(null);
  const [missingBusinessDetails, setMissingBusinessDetails] = useState(false);
  /** Business verified and complete, but payout missing, rejected, or not yet verified by Traverion. */
  const [missingPayoutForPublish, setMissingPayoutForPublish] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [payoutVerificationStatus, setPayoutVerificationStatus] = useState<string | null>(null);
  const [payoutOnFile, setPayoutOnFile] = useState(false);
  const [publishGate, setPublishGate] = useState<{ listingId: string; title: string; blockers: string[] } | null>(null);

  const showFormRef = useRef(false);
  const editorHistoryPushedRef = useRef(false);
  const editorSessionTokenRef = useRef<string | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const editNotFoundCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    showFormRef.current = showForm;
  }, [showForm]);

  function newEditorSessionToken(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `ed-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /** Stack a history entry while the editor is open so Back closes the modal instead of jumping to /partner (dashboard). */
  useEffect(() => {
    if (!showForm) {
      editorHistoryPushedRef.current = false;
      editorSessionTokenRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;
    const st = window.history.state as { supplierListingEditor?: string | boolean } | null;
    const topToken = typeof st?.supplierListingEditor === 'string' ? st.supplierListingEditor : null;

    if (editorSessionTokenRef.current && topToken === editorSessionTokenRef.current) {
      editorHistoryPushedRef.current = true;
      return;
    }

    if (!editorSessionTokenRef.current && topToken && topToken.length > 0) {
      editorSessionTokenRef.current = topToken;
      editorHistoryPushedRef.current = true;
      return;
    }

    if (editorHistoryPushedRef.current) return;

    const url = window.location.pathname + window.location.search;
    const prev = window.history.state;
    const base =
      typeof prev === 'object' && prev !== null ? { ...(prev as Record<string, unknown>) } : ({} as Record<string, unknown>);
    delete base.supplierListingEditor;
    const token = newEditorSessionToken();
    editorSessionTokenRef.current = token;
    editorHistoryPushedRef.current = true;
    window.history.pushState({ ...base, supplierListingEditor: token }, '', url);
  }, [showForm]);

  useEffect(() => {
    const onPopCapture = () => {
      if (!showFormRef.current) return;
      const st = window.history.state as { supplierListingEditor?: string | boolean } | null;
      const token = editorSessionTokenRef.current;
      if (token && st?.supplierListingEditor === token) return;
      editorSessionTokenRef.current = null;
      showFormRef.current = false;
      setShowForm(false);
      setEditingId(null);
      setFormFocusSection(null);
      const u = new URL(window.location.href);
      const path = u.pathname.replace(/\/$/, '') || '/';
      if (path === `${PARTNER_APP_BASE}/listings`) {
        u.searchParams.delete('edit');
        u.searchParams.delete('focus');
        const q = u.searchParams.toString();
        const next = q ? `${PARTNER_APP_BASE}/listings?${q}` : `${PARTNER_APP_BASE}/listings`;
        window.history.replaceState(window.history.state, '', next);
      }
    };
    window.addEventListener('popstate', onPopCapture, true);
    return () => window.removeEventListener('popstate', onPopCapture, true);
  }, []);

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
    editorSessionTokenRef.current = null;
    showFormRef.current = false;
    setShowForm(false);
    setEditingId(null);
    setFormFocusSection(null);
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit')) {
      window.history.replaceState({}, '', `${PARTNER_APP_BASE}/listings`);
    }
  }, [canEditListings]);

  useEffect(() => {
    if (editNotFoundCloseTimerRef.current) {
      clearTimeout(editNotFoundCloseTimerRef.current);
      editNotFoundCloseTimerRef.current = null;
    }
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    if (!edit) return;
    const found = listings.some((l) => l.id === edit);
    if (found) {
      setEditingId(edit);
      setShowForm(true);
      // Do not re-apply `focus` from the URL here — every loadListings() refetch would
      // resurrect ?focus= after onFocusConsumed cleared it and yank the wizard off Tour photos.
      return;
    }
    const listDefinitelyLoaded = listings.length > 0 || (listings.length === 0 && !error);
    if (!listDefinitelyLoaded) return;

    const editId = edit;
    editNotFoundCloseTimerRef.current = setTimeout(() => {
      editNotFoundCloseTimerRef.current = null;
      const p = new URLSearchParams(window.location.search);
      if (p.get('edit') !== editId) return;
      if (listingsRef.current.some((l) => l.id === editId)) return;
      editorSessionTokenRef.current = null;
      showFormRef.current = false;
      setShowForm(false);
      setEditingId(null);
      setFormFocusSection(null);
      window.history.replaceState({}, '', `${PARTNER_APP_BASE}/listings`);
    }, 200);

    return () => {
      if (editNotFoundCloseTimerRef.current) {
        clearTimeout(editNotFoundCloseTimerRef.current);
        editNotFoundCloseTimerRef.current = null;
      }
    };
  }, [listings, loading, error]);

  const qualityOverview = useMemo(() => {
    if (listings.length === 0) return null;
    let sumPct = 0;
    let below70 = 0;
    const gapCounts: Record<string, { count: number; label: string }> = {};
    for (const l of listings) {
      const { score, maxScore, checks } = computeListingQualityPartnerFocus(l);
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
    const uid = user?.id;
    if (isSupabase && uid) {
      setLoading(true);
      setError(null);
      fetchMyListings(uid)
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
  }, [isSupabase, user?.id]);

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
        setMissingPayoutForPublish(false);
        setVerificationStatus(null);
        setPayoutVerificationStatus(null);
        setPayoutOnFile(false);
        return;
      }
      const profile = await fetchSupplierProfile(user.id);
      const businessComplete = isSupplierBusinessProfileComplete(profile);
      const payoutConfigured = isSupplierPayoutConfigured(profile);
      const v = profile?.verification_status ?? null;
      const pv = profile?.payout_verification_status ?? null;
      setVerificationStatus(v);
      setPayoutVerificationStatus(pv);
      setMissingBusinessDetails(!businessComplete);
      const businessVerified = v === 'verified';
      const payoutVerified = (pv ?? '').trim().toLowerCase() === 'verified';
      setPayoutOnFile(payoutConfigured);
      setMissingPayoutForPublish(
        Boolean(businessComplete && businessVerified && (!payoutConfigured || !payoutVerified))
      );
      setCanPostNewListing(isSupplierReadyToPublishTours(profile));
      if (!businessComplete) {
        setProfileGateMessage(
          'Complete your business profile in Settings: registered name, address, registration proof, and tax or company identifiers as required. Payout bank details (IBAN and BIC) are verified separately; you can add them anytime. Publishing requires Traverion to approve both business and payout.'
        );
      } else if (v === 'rejected') {
        setProfileGateMessage(
          'Business verification was not approved. Update your business details in Settings and save again. Your payout section is separate—fix bank details there if needed.'
        );
      } else if (!businessVerified) {
        setProfileGateMessage(
          'Your business details are under review. You can still add or update IBAN and BIC under Payment & payouts in Settings. Publishing requires both business verification and payout verification.'
        );
      } else if (!payoutConfigured) {
        setProfileGateMessage(
          'Business is verified. Add IBAN and BIC under Payment & payouts in Settings and save to submit your bank details for verification.'
        );
      } else if ((pv ?? '').trim().toLowerCase() === 'rejected') {
        setProfileGateMessage(
          'Payout verification was not approved. Update IBAN and BIC in Settings and save again to resubmit.'
        );
      } else if (!payoutVerified) {
        setProfileGateMessage(
          'Your bank details are under review. After Traverion verifies your payout, you can publish (business must already be verified).'
        );
      } else {
        setProfileGateMessage(null);
      }
    };
    loadProfileGate();
  }, [isSupabase, user?.id, showForm, loading]);

  const consumeListingFormFocus = useCallback(() => {
    setFormFocusSection(null);
  }, []);

  const refresh = () => {
    loadListings();
    editorSessionTokenRef.current = null;
    showFormRef.current = false;
    setShowForm(false);
    setEditingId(null);
    if (isSupabase) {
      window.dispatchEvent(new Event('traverion:supplier-onboarding-refresh'));
    }
  };

  const handleSave = async (tour: TourPackage): Promise<ListingEditorSaveResult> => {
    if (!canEditListings) {
      const msg = 'Your role can view listings but cannot create or edit them.';
      setError(msg);
      editorSessionTokenRef.current = null;
      showFormRef.current = false;
      setShowForm(false);
      return { success: false, error: msg };
    }
    if (tour.status === 'published' && !canPostNewListing) {
      const msg =
        'Publishing needs Traverion to verify your business and your payout (IBAN + BIC). Finish both in Settings, then try again.';
      setError(msg);
      return { success: false, error: msg };
    }
    setPublishGate(null);
    if (isSupabase && user) {
      const res = editingId ? await updateListing(editingId, tour) : await insertListing(tour, user.id);
      if (!res.ok) {
        setError(res.error);
        return { success: false, error: res.error };
      }
      setError(null);
      refresh();
      return { success: true };
    }
    const list = getSupplierListings();
    const index = list.findIndex(t => t.id === tour.id);
    const next = index >= 0 ? [...list] : [...list, tour];
    if (index >= 0) next[index] = tour;
    setSupplierListings(next);
    setError(null);
    refresh();
    return { success: true };
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
      setError(
        'Publishing needs business verification and payout verification (IBAN + BIC) approved by Traverion. Check Settings.'
      );
      return;
    }
    if (newStatus === 'published') {
      const fresh = await fetchListingById(listing.id);
      const toCheck = fresh ?? listing;
      const blockers = getListingPublishBlockers(toCheck);
      if (blockers.length > 0) {
        setPublishGate({ listingId: listing.id, title: toCheck.title, blockers });
        setError(null);
        return;
      }
    }
    setPublishGate(null);
    const res = await updateListingStatus(listing.id, newStatus);
    if (res.ok) {
      setError(null);
      loadListings();
      window.dispatchEvent(new Event('traverion:supplier-onboarding-refresh'));
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">My listings</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage your tours and activities. Use <span className="font-medium text-gray-800">Publish</span> when a listing is
            ready to go live, or <span className="font-medium text-gray-800">Draft</span> to hide it. Closing the editor without
            finishing keeps a draft when save-on-close is available.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!canEditListings || !canPostNewListing) return;
            setEditingId(null);
            setShowForm(true);
            setFormFocusSection(null);
            window.history.pushState({}, '', `${PARTNER_APP_BASE}/listings`);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          disabled={!canEditListings || !canPostNewListing}
          title={
            !canEditListings
              ? 'Your role can view listings but cannot add new ones.'
              : !canPostNewListing
                ? 'Traverion must approve your business and your payout (IBAN + BIC) before you can add a tour.'
                : undefined
          }
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-3 sm:py-2.5 min-h-[48px] rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark transition-colors disabled:opacity-50 touch-manipulation shadow-sm active:scale-[0.99]"
        >
          <Plus className="w-5 h-5 shrink-0" />
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
            {missingPayoutForPublish && !missingBusinessDetails && (
              <p className="font-semibold text-amber-950">
                {!payoutOnFile
                  ? 'Payout bank details required'
                  : (payoutVerificationStatus ?? '').trim().toLowerCase() === 'rejected'
                    ? 'Payout verification needs an update'
                    : 'Payout verification in progress'}
              </p>
            )}
            <p
              className={
                missingBusinessDetails || missingPayoutForPublish ? 'mt-2' : ''
              }
            >
              {profileGateMessage}
            </p>
            {!missingBusinessDetails && verificationStatus && (
              <p className="mt-1 text-xs text-amber-800/90">
                Business: <span className="font-semibold">{verificationStatusLabel(verificationStatus)}</span>
                {payoutOnFile ? (
                  <>
                    {' · '}
                    Payout:{' '}
                    <span className="font-semibold">
                      {verificationStatusLabel((payoutVerificationStatus ?? 'pending').trim() || 'pending')}
                    </span>
                  </>
                ) : null}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {missingBusinessDetails && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-company`)}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  Complete business profile
                </button>
              )}
              {missingPayoutForPublish && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-payout`)}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  {payoutOnFile ? 'Payment & payouts' : 'Add IBAN & BIC'}
                </button>
              )}
              {!missingBusinessDetails && verificationStatus !== 'verified' && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-company`)}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  Business profile & verification
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
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
                  Content score only — not AI. Optional highlights/tags and “live on site” are excluded so drafts are not
                  penalised. Publish from this page when you are ready.
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
          enableDraftOnClose={Boolean(isSupabase && canEditListings)}
          onSaveDraft={async (tour) => {
            if (!isSupabase || !user?.id || !canEditListings) return false;
            const draft = normalizeListingForDraftSave(tour);
            const res = editingId
              ? await updateListing(editingId, draft)
              : await insertListing(draft, user.id);
            if (!res.ok) return false;
            loadListings();
            window.dispatchEvent(new Event('traverion:supplier-onboarding-refresh'));
            return true;
          }}
          onCancel={() => {
            editorSessionTokenRef.current = null;
            showFormRef.current = false;
            setShowForm(false);
            setEditingId(null);
            setFormFocusSection(null);
            window.history.pushState({}, '', `${PARTNER_APP_BASE}/listings`);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          focusSection={formFocusSection}
          onFocusConsumed={consumeListingFormFocus}
        />
      )}

      {loading ? (
        <p className="text-gray-500">Loading listings…</p>
      ) : listings.length === 0 && !showForm ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 sm:p-12 text-center">
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
                  ? 'Business verification and payout verification (IBAN + BIC) required.'
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
            <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-sm -mx-0.5 sm:mx-0">
              <div className="overflow-x-auto touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[640px] w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Listing</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Location · Duration</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {listings.map((listing) => {
                      const q = computeListingQualityPartnerFocus(listing);
                      const pct = listingQualityPercent(q.score, q.maxScore);
                      const tone =
                        pct >= 80 ? 'bg-green-100 text-green-800' : pct >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
                      return (
                      <Fragment key={listing.id}>
                      <tr className="hover:bg-gray-50/50">
                        <td className="px-2 py-2 sm:px-4 sm:py-3">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <img src={listing.image} alt="" className="w-11 h-11 sm:w-14 sm:h-14 rounded-lg object-cover flex-shrink-0" />
                            <p className="font-medium text-gray-900 truncate max-w-[9rem] xs:max-w-[12rem] sm:max-w-[200px]">{listing.title}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3 text-sm text-gray-600 whitespace-nowrap">
                          {listing.city && `${listing.city}, `}{listing.country ?? listing.destination} · {listing.duration}
                        </td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3 text-sm font-medium text-gray-900 whitespace-nowrap">From ${listing.price.startingFrom}</td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full tabular-nums ${tone}`}>
                              {pct}%
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQualityId((id) => (id === listing.id ? null : listing.id))
                              }
                              className="touch-manipulation p-2 -m-1 rounded-lg text-gray-500 hover:bg-gray-100 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
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
                        <td className="px-2 py-2 sm:px-4 sm:py-3 align-top">
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
                                  ? 'Business and payout verification required to publish'
                                  : undefined
                              }
                              className="mt-1 block sm:ml-2 sm:mt-0 sm:inline text-xs text-finland hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 py-1"
                            >
                              → {listing.status === 'published' ? 'Draft' : 'Publish'}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3 text-right align-top">
                          <div className="flex items-center justify-end flex-wrap gap-1">
                            {listing.status === 'published' ? (
                              <a
                                href={publicTourListingUrl(listing.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="touch-manipulation inline-flex items-center gap-1 px-2 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-finland border border-finland/30 hover:bg-finland/5 min-h-[40px] sm:min-h-0"
                                title="Opens the public tour page on Traverion"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="hidden xs:inline">View on site</span>
                                <span className="xs:hidden">View</span>
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openSupplierListingEditor(listing.id)}
                              disabled={!canEditListings}
                              className="touch-manipulation p-2.5 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-finland disabled:opacity-40 disabled:pointer-events-none min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                              title={canEditListings ? 'Edit' : 'View only'}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(listing.id)}
                              disabled={!canEditListings}
                              className="touch-manipulation p-2.5 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
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
