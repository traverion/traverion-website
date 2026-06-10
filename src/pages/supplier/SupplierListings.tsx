import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Star,
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
import { getReviewAggregatesForListingIds } from '../../data/supabase-reviews';
import { SkeletonListItem } from '../../components/ui/Skeleton';

function verificationStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending') return 'Under verification';
  if (s === 'rejected') return 'Rejected';
  if (s === 'verified') return 'Verified';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function ListingReviewsTableCell({
  listing,
  aggregate,
  isSupabase,
}: {
  listing: TourPackage;
  aggregate?: { rating: number; count: number };
  isSupabase: boolean;
}) {
  const count = isSupabase ? aggregate?.count ?? 0 : listing.reviews;
  const rating = isSupabase ? aggregate?.rating ?? 0 : listing.rating;

  if (!count) {
    return (
      <span className="text-xs text-gray-500 tabular-nums">No reviews yet</span>
    );
  }

  const inner = (
    <>
      <Star className="h-3.5 w-3.5 shrink-0 fill-finland text-finland sm:h-4 sm:w-4" aria-hidden />
      <span className="font-semibold text-gray-900 tabular-nums">{rating}</span>
      <span className="text-xs font-medium text-gray-500">({count})</span>
    </>
  );

  if (isSupabase) {
    return (
      <button
        type="button"
        onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/reviews`)}
        className="inline-flex max-w-full items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-left text-sm text-gray-800 transition-colors hover:border-finland/25 hover:bg-finland/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 focus-visible:ring-offset-1"
        title="Open Reviews to read and reply"
      >
        {inner}
      </button>
    );
  }

  return <span className="inline-flex items-center gap-1 text-sm text-gray-800">{inner}</span>;
}

export default function SupplierListings() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditListings = canManageBookings(role);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formFocusSection, setFormFocusSection] = useState<string | null>(null);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Row id whose gear actions dropdown is open (Edit / Deactivate / Delete). */
  const [listingActionsMenuId, setListingActionsMenuId] = useState<string | null>(null);
  /** Fixed viewport position for portaled gear menu. */
  const [listingActionsMenuBox, setListingActionsMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [listingPendingDelete, setListingPendingDelete] = useState<TourPackage | null>(null);
  const [listingPendingDeactivate, setListingPendingDeactivate] = useState<TourPackage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
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
        .then(async (data) => {
          setListings(data);
          try {
            const agg = await getReviewAggregatesForListingIds(data.map((l) => l.id));
            setReviewAggregates(agg);
          } catch {
            setReviewAggregates(new Map());
          }
          setLoading(false);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to load listings');
          setReviewAggregates(new Map());
          setLoading(false);
        });
    } else {
      setListings(getSupplierListings());
      setReviewAggregates(new Map());
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const closeListingActionsMenu = useCallback(() => {
    setListingActionsMenuId(null);
    setListingActionsMenuBox(null);
  }, []);

  const updateListingActionsMenuPosition = useCallback(() => {
    if (!listingActionsMenuId) return;
    const el = document.querySelector(`[data-listing-gear="${listingActionsMenuId}"]`);
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    const width = 176;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setListingActionsMenuBox({ top: rect.bottom + 4, left, width });
  }, [listingActionsMenuId]);

  useEffect(() => {
    if (!listingActionsMenuId) {
      setListingActionsMenuBox(null);
      return;
    }
    updateListingActionsMenuPosition();
    window.addEventListener('resize', updateListingActionsMenuPosition);
    window.addEventListener('scroll', updateListingActionsMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateListingActionsMenuPosition);
      window.removeEventListener('scroll', updateListingActionsMenuPosition, true);
    };
  }, [listingActionsMenuId, updateListingActionsMenuPosition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (listingPendingDelete) {
        if (!deleteBusy) setListingPendingDelete(null);
        return;
      }
      if (listingPendingDeactivate) {
        if (!deactivateBusy) setListingPendingDeactivate(null);
        return;
      }
      if (listingActionsMenuId) closeListingActionsMenu();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    listingPendingDelete,
    listingPendingDeactivate,
    deleteBusy,
    deactivateBusy,
    listingActionsMenuId,
    closeListingActionsMenu,
  ]);

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

  const confirmDeleteListing = async () => {
    if (!listingPendingDelete || !canEditListings) return;
    const id = listingPendingDelete.id;
    setDeleteBusy(true);
    try {
      if (isSupabase) {
        await deleteListing(id);
        refresh();
        setListingPendingDelete(null);
      } else {
        const next = getSupplierListings().filter((t) => t.id !== id);
        setSupplierListings(next);
        refresh();
        setListingPendingDelete(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove listing');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleStatusChange = async (
    listing: TourPackage,
    newStatus: 'draft' | 'published'
  ): Promise<boolean> => {
    if (!isSupabase || !user) return false;
    if (!canEditListings) {
      setError('Your role cannot change listing status.');
      return false;
    }
    if (newStatus === 'published' && !canPostNewListing) {
      setError(
        'Publishing needs business verification and payout verification (IBAN + BIC) approved by Traverion. Check Settings.'
      );
      return false;
    }
    if (newStatus === 'published') {
      const fresh = await fetchListingById(listing.id);
      const toCheck = fresh ?? listing;
      const blockers = getListingPublishBlockers(toCheck);
      if (blockers.length > 0) {
        setPublishGate({ listingId: listing.id, title: toCheck.title, blockers });
        setError(null);
        return false;
      }
    }
    setPublishGate(null);
    const res = await updateListingStatus(listing.id, newStatus);
    if (res.ok) {
      setError(null);
      loadListings();
      window.dispatchEvent(new Event('traverion:supplier-onboarding-refresh'));
      window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
      return true;
    }
    setError(res.error);
    return false;
  };

  const confirmDeactivateListing = async () => {
    const listing = listingPendingDeactivate;
    if (!listing || !canEditListings) return;
    setDeactivateBusy(true);
    try {
      if (isSupabase && user) {
        const ok = await handleStatusChange(listing, 'draft');
        if (ok) setListingPendingDeactivate(null);
      } else {
        const list = getSupplierListings();
        const idx = list.findIndex((t) => t.id === listing.id);
        if (idx < 0) return;
        const next = [...list];
        next[idx] = { ...next[idx], status: 'draft' };
        setSupplierListings(next);
        loadListings();
        window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
        setListingPendingDeactivate(null);
      }
    } finally {
      setDeactivateBusy(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 w-full min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
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
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-finland px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-finland-dark active:scale-[0.99] disabled:opacity-50 touch-manipulation min-h-[48px] md:w-auto md:self-center"
        >
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
          <span>Add listing</span>
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
        <div className="space-y-3 animate-fade-in-up">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
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
          <div className="space-y-3 w-full min-w-0">
            <h2 className="text-lg font-medium text-gray-900">Your listings ({listings.length})</h2>
            <div className="border border-gray-200 rounded-2xl bg-white shadow-sm divide-y divide-gray-200">
              {listings.map((listing) => {
                const isLive = listing.status !== 'draft';
                return (
                  <article key={listing.id} className="p-4 sm:p-5 w-full min-w-0 max-w-full">
                    <div className="flex gap-3 min-w-0">
                      <img
                        src={listing.image}
                        alt=""
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-semibold text-gray-900 leading-snug break-words">{listing.title}</p>
                        <p className="text-sm text-gray-600 break-words">
                          {listing.city && `${listing.city}, `}
                          {listing.country ?? listing.destination} · {listing.duration}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          <span className="font-medium text-gray-900">
                            From ${listing.price.startingFrom}
                          </span>
                          <ListingReviewsTableCell
                            listing={listing}
                            aggregate={reviewAggregates.get(listing.id)}
                            isSupabase={Boolean(isSupabase)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
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
                              className="text-xs text-finland hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed touch-manipulation min-h-[44px] sm:min-h-0 py-1"
                            >
                              → Publish
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {isLive ? (
                            <a
                              href={publicTourListingUrl(listing.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="touch-manipulation inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-finland/35 bg-white px-3 text-xs font-medium text-finland shadow-sm hover:bg-finland/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 focus-visible:ring-offset-1"
                              title="Opens the public tour page on Traverion"
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              View on site
                            </a>
                          ) : null}
                          <button
                            type="button"
                            data-listing-gear={listing.id}
                            onClick={() =>
                              setListingActionsMenuId((id) => (id === listing.id ? null : listing.id))
                            }
                            disabled={!canEditListings}
                            aria-expanded={listingActionsMenuId === listing.id}
                            aria-haspopup="menu"
                            aria-label="Listing actions"
                            className="touch-manipulation inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-finland focus:outline-none focus-visible:ring-2 focus-visible:ring-finland/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"
                            title={canEditListings ? 'Listing actions' : 'View only'}
                          >
                            <Cog className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )
      )}

      {listingActionsMenuId &&
        listingActionsMenuBox &&
        canEditListings &&
        typeof document !== 'undefined' &&
        (() => {
          const menuListing = listings.find((l) => l.id === listingActionsMenuId);
          if (!menuListing) return null;
          const menuIsLive = menuListing.status !== 'draft';
          return createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[60] cursor-default bg-transparent"
                aria-label="Close menu"
                onClick={closeListingActionsMenu}
              />
              <div
                role="menu"
                className="fixed z-[70] rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                style={{
                  top: listingActionsMenuBox.top,
                  left: listingActionsMenuBox.left,
                  width: listingActionsMenuBox.width,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    closeListingActionsMenu();
                    openSupplierListingEditor(menuListing.id);
                  }}
                >
                  Edit
                </button>
                {menuIsLive ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      closeListingActionsMenu();
                      setListingPendingDeactivate(menuListing);
                    }}
                  >
                    Deactivate
                  </button>
                ) : null}
                <div className="my-1 border-t border-gray-100" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                  onClick={() => {
                    closeListingActionsMenu();
                    setListingPendingDelete(menuListing);
                  }}
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  Delete listing
                </button>
              </div>
            </>,
            document.body
          );
        })()}

      {listingPendingDelete && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
                aria-label="Close"
                disabled={deleteBusy}
                onClick={() => !deleteBusy && setListingPendingDelete(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-delete-listing-title"
                className="relative z-[81] max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),92dvh)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
              >
                <h3 id="supplier-delete-listing-title" className="text-lg font-semibold text-gray-900">
                  Remove this listing?
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">{listingPendingDelete.title}</span> will be removed from
                  your supplier account. This cannot be undone.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    disabled={deleteBusy}
                    onClick={() => setListingPendingDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteListing()}
                  >
                    {deleteBusy ? 'Removing…' : 'Remove listing'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {listingPendingDeactivate && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
                aria-label="Close"
                disabled={deactivateBusy}
                onClick={() => !deactivateBusy && setListingPendingDeactivate(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-deactivate-listing-title"
                className="relative z-[81] max-h-[min(calc(100dvh_-_env(safe-area-inset-bottom)_-_0.75rem),92dvh)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
              >
                <h3 id="supplier-deactivate-listing-title" className="text-lg font-semibold text-gray-900">
                  Take this listing offline?
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">{listingPendingDeactivate.title}</span> will be hidden from
                  Traverion until you publish it again from this page.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    disabled={deactivateBusy}
                    onClick={() => setListingPendingDeactivate(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-finland px-4 py-2.5 text-sm font-semibold text-white hover:bg-finland-dark disabled:opacity-50"
                    disabled={deactivateBusy}
                    onClick={() => void confirmDeactivateListing()}
                  >
                    {deactivateBusy ? 'Updating…' : 'Deactivate'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
