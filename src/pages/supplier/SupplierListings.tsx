import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Cog,
} from 'lucide-react';
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
  /** Row id whose gear actions dropdown is open (Edit / Deactivate). */
  const [listingActionsMenuId, setListingActionsMenuId] = useState<string | null>(null);
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
      /**
       * Remove `focus` from the address bar as soon as we read it into React state.
       * If we leave it in the URL, any synthetic `popstate` (e.g. partner nav) re-runs this
       * sync and reapplies `focus=title` / `focus=language` → wizard jumps back to step 1.
       */
      if (typeof window !== 'undefined' && focus && focus.length > 0) {
        const u = new URL(window.location.href);
        if (u.searchParams.has('focus')) {
          u.searchParams.delete('focus');
          const q = u.searchParams.toString();
          const next = q ? `${u.pathname}?${q}` : u.pathname;
          window.history.replaceState(window.history.state, '', next);
        }
      }
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
    if (!listingActionsMenuId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListingActionsMenuId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [listingActionsMenuId]);

  useEffect(() => {
    if (!listingActionsMenuId) return;
    const onDown = (e: MouseEvent) => {
      const wrap = document.querySelector(`[data-listing-row-actions="${listingActionsMenuId}"]`);
      if (wrap && !wrap.contains(e.target as Node)) setListingActionsMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [listingActionsMenuId]);

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
  }, [isSupabase, user?.id]);

  const consumeListingFormFocus = useCallback(() => {
    setFormFocusSection(null);
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (!u.searchParams.has('focus')) return;
    u.searchParams.delete('focus');
    const q = u.searchParams.toString();
    const next = q ? `${u.pathname}?${q}` : u.pathname;
    window.history.replaceState(window.history.state, '', next);
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
      if (tour.status === 'published') {
        window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
      }
      refresh();
      return { success: true };
    }
    const list = getSupplierListings();
    const index = list.findIndex(t => t.id === tour.id);
    const next = index >= 0 ? [...list] : [...list, tour];
    if (index >= 0) next[index] = tour;
    setSupplierListings(next);
    setError(null);
    if (tour.status === 'published') {
      window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
    }
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
      window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
    } else {
      setError(res.error);
    }
  };

  const deactivateListingOffline = async (listing: TourPackage) => {
    if (!canEditListings) return;
    if (
      !window.confirm(
        'Take this listing offline? Travelers will not see it on Traverion until you publish it again from this page.'
      )
    ) {
      return;
    }
    setListingActionsMenuId(null);
    if (isSupabase && user) {
      await handleStatusChange(listing, 'draft');
      return;
    }
    const list = getSupplierListings();
    const idx = list.findIndex((t) => t.id === listing.id);
    if (idx < 0) return;
    const next = [...list];
    next[idx] = { ...next[idx], status: 'draft' };
    setSupplierListings(next);
    loadListings();
    window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
  };

  return (
    <div className="space-y-4 sm:space-y-5 w-full min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-gray-900">My listings</h1>
          <p className="text-sm text-gray-600 mt-0.5 sm:mt-1 sm:text-base leading-snug">
            Manage your tours and activities. <span className="font-medium text-gray-800">Publish</span> drafts when they are
            ready to go live. Live listings stay published; use the gear menu to <span className="font-medium text-gray-800">Deactivate</span>{' '}
            if you need to hide one temporarily. Closing the editor without finishing keeps a draft when save-on-close is available.
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

      {showForm && (
        <SupplierListingForm
          key={editingId ?? 'create'}
          editingId={editingId}
          existingListings={listings}
          onSave={handleSave}
          canPostNewListing={canPostNewListing}
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
                <table className="min-w-[560px] w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Listing</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Location · Duration</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {listings.map((listing) => {
                      const isLive = listing.status !== 'draft';
                      return (
                      <tr key={listing.id} className="hover:bg-gray-50/50">
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
                        <td className="px-2 py-2 sm:px-4 sm:py-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                              isLive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isLive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {isLive ? 'Live' : 'Offline'}
                          </span>
                          {isSupabase && canEditListings && !isLive && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(listing, 'published')}
                              disabled={!canPostNewListing}
                              title={
                                !canPostNewListing
                                  ? 'Business and payout verification required to publish'
                                  : 'Publish on Traverion'
                              }
                              className="mt-1 block sm:ml-2 sm:mt-0 sm:inline text-xs text-finland hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 py-1"
                            >
                              → Publish
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3 text-right align-top">
                          <div className="flex items-center justify-end flex-wrap gap-1">
                            {isLive ? (
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
                            <div className="relative" data-listing-row-actions={listing.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setListingActionsMenuId((id) => (id === listing.id ? null : listing.id))
                                }
                                disabled={!canEditListings}
                                aria-expanded={listingActionsMenuId === listing.id}
                                aria-haspopup="menu"
                                aria-label="Listing actions"
                                className="touch-manipulation p-2.5 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-finland disabled:opacity-40 disabled:pointer-events-none min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                title={canEditListings ? 'Listing actions' : 'View only'}
                              >
                                <Cog className="w-4 h-4" aria-hidden />
                              </button>
                              {listingActionsMenuId === listing.id && canEditListings && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-1 z-50 min-w-[10.5rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg text-left"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                                    onClick={() => {
                                      setListingActionsMenuId(null);
                                      openSupplierListingEditor(listing.id);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  {isLive && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                                      onClick={() => void deactivateListingOffline(listing)}
                                    >
                                      Deactivate
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
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
