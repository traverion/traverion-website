import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Pencil,
  Trash2,
  EyeOff,
  Cog,
  Map,
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
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl, openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import {
  isSupplierBusinessProfileComplete,
  isSupplierPayoutConfigured,
  isSupplierReadyToPublishTours,
} from '../../lib/supplierOnboarding';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { publicStayListingUrl, publicTourListingUrl } from '../../lib/publicSiteUrl';
import { getListingPublishBlockers } from '../../lib/listingPublishGate';
import { listingHeroImageSrc } from '../../lib/listingPhotoGrid';
import { formatMoney } from '../../lib/money';
import { catalogHeadlineAmount } from '../../lib/discount-display';
import { pickHeadlineOption } from '../../lib/headline-price';
import { materializedBookingOptions, parseListingExtras } from '../../types/listingExtras';
import { inventoryFamilyFromListing, PARTNER_CREATE_INVENTORY } from '../../lib/inventory';
import { normalizeListingForDraftSave } from '../../lib/listingDraftUtils';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierModalHeader, SupplierPageHero } from '../../components/supplier/supplierUi';

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
  const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'tour' | 'stay' | 'draft' | 'published'>('all');
  const [showCreateChooser, setShowCreateChooser] = useState(false);
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
  const [justPublishedId, setJustPublishedId] = useState<string | null>(null);
  const [createFamily, setCreateFamily] = useState<'tour' | 'stay'>('tour');
  const createChooserRef = useRef<HTMLDivElement>(null);
  const closeCreateChooser = useCallback(() => setShowCreateChooser(false), []);
  useDialogFocus(showCreateChooser, createChooserRef, closeCreateChooser);

  const startNewTour = useCallback(() => {
    if (!canEditListings || !canPostNewListing) return;
    setShowCreateChooser(false);
    setCreateFamily('tour');
    setEditingId(null);
    setShowForm(true);
    setFormFocusSection(null);
  }, [canEditListings, canPostNewListing]);

  const startNewStay = useCallback(() => {
    if (!canEditListings || !canPostNewListing) return;
    setShowCreateChooser(false);
    setCreateFamily('stay');
    setEditingId(null);
    setShowForm(true);
    setFormFocusSection(null);
  }, [canEditListings, canPostNewListing]);

  const openCreateChooser = useCallback(() => {
    if (!canEditListings || !canPostNewListing) return;
    setShowCreateChooser(true);
  }, [canEditListings, canPostNewListing]);

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
    const wantsNew = params.get('new') === '1';
    if (wantsNew && !edit) {
      setShowCreateChooser(true);
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href);
        u.searchParams.delete('new');
        const q = u.searchParams.toString();
        window.history.replaceState(window.history.state, '', q ? `${u.pathname}?${q}` : u.pathname);
      }
    }
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
          setError(userFacingError(e, USER_ERROR.listings));
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
    const onFocus = () => void loadProfileGate();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
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
        const msg = userFacingError(res.error, USER_ERROR.listingSave);
        setError(msg);
        return { success: false, error: msg };
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
      setError(userFacingError(e, 'Could not remove listing. Try again.'));
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
      if (newStatus === 'published') {
        setJustPublishedId(listing.id);
        window.setTimeout(() => setJustPublishedId((id) => (id === listing.id ? null : id)), 420);
      }
      loadListings();
      window.dispatchEvent(new Event('traverion:supplier-onboarding-refresh'));
      window.dispatchEvent(new CustomEvent('traverion:published-listings-changed'));
      return true;
    }
    setError(userFacingError(res.error, USER_ERROR.listingSave));
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
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Listings"
        description="Tours and stays you operate. Drafts stay private until you publish."
        actions={
          <button
            type="button"
            onClick={openCreateChooser}
            disabled={!canEditListings || !canPostNewListing}
            title={
              !canEditListings
                ? 'Your role can view listings but cannot add new ones.'
                : !canPostNewListing
                  ? 'Traverion must approve your business and your payout (IBAN + BIC) before you can add a listing.'
                  : undefined
            }
            className="tv-btn-primary w-full md:w-auto"
          >
            <Plus className="h-5 w-5 shrink-0" aria-hidden />
            <span>New listing</span>
          </button>
        }
      />

      {listings.length > 0 && !showForm ? (
        <div className="flex flex-wrap gap-1 mb-8" role="tablist" aria-label="Listing filters">
          {([
            { id: 'all', label: 'All' },
            { id: 'tour', label: 'Tours' },
            { id: 'stay', label: 'Stays' },
            { id: 'draft', label: 'Draft' },
            { id: 'published', label: 'Live' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={workspaceFilter === tab.id}
              onClick={() => setWorkspaceFilter(tab.id)}
              className={`lux-flat rounded-full px-3.5 py-2 min-h-11 text-sm font-medium ${
                workspaceFilter === tab.id ? 'bg-ink text-paper-raised' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {!canEditListings && (
        <div className="p-4 rounded-2xl bg-black/[0.03] text-ink text-sm">
          <p className="font-medium text-ink">View-only access</p>
          <p className="mt-1 text-ink-muted">
            You can browse listings on this page. Creating, editing, or publishing requires an owner, manager, or ops role.
          </p>
        </div>
      )}

      {canEditListings && !canPostNewListing && (
        <div className="p-4 rounded-2xl bg-paper-raised ring-1 ring-black/[0.06] text-ink text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {missingBusinessDetails && (
              <p className="font-semibold text-ink">Missing information</p>
            )}
            {missingPayoutForPublish && !missingBusinessDetails && (
              <p className="font-semibold text-ink">
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
              <p className="mt-1 text-xs text-ink-faint">
                Business: <span className="font-semibold text-ink">{verificationStatusLabel(verificationStatus)}</span>
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
                  className="tv-btn-ghost text-sm"
                >
                  Complete business profile
                </button>
              )}
              {missingPayoutForPublish && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-payout`)}
                  className="tv-btn-ghost text-sm"
                >
                  {payoutOnFile ? 'Payment & payouts' : 'Add IBAN & BIC'}
                </button>
              )}
              {!missingBusinessDetails && verificationStatus !== 'verified' && (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile#supplier-business-company`)}
                  className="tv-btn-ghost text-sm"
                >
                  Business profile & verification
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
            className="tv-btn-primary shrink-0"
          >
            Open settings
          </button>
        </div>
      )}

      {publishGate && (
        <div className="p-4 rounded-2xl bg-paper-raised ring-1 ring-black/[0.06] text-ink text-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Complete these before publishing “{publishGate.title}”</p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-ink-muted">
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
                className="tv-btn-primary"
              >
                <Pencil className="w-4 h-4" />
                Edit tour
              </button>
              <button
                type="button"
                onClick={() => setPublishGate(null)}
                className="tv-btn-ghost"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <ErrorState
          className="py-6"
          title="Listings unavailable"
          body={userFacingError(error, USER_ERROR.listings)}
          retry={{ onClick: () => void loadListings() }}
        />
      )}

      {showCreateChooser && (
        <div ref={createChooserRef} className="tv-sheet-overlay z-[85]">
          <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeCreateChooser} />
          <aside role="dialog" aria-modal="true" aria-labelledby="create-listing-title" className="tv-sheet-panel relative motion-safe:animate-slide-up">
            <h2 id="create-listing-title" className="font-display text-2xl text-ink">What would you like to list?</h2>
            <p className="mt-2 text-sm text-ink-muted">Tour or stay. Experiences and packages are not offered here yet.</p>
            <div className="mt-6 space-y-2">
              {PARTNER_CREATE_INVENTORY.map((opt) =>
                opt.canCreate ? (
                  <button
                    key={opt.family}
                    type="button"
                    onClick={opt.family === 'stay' ? startNewStay : startNewTour}
                    className="lux-flat w-full rounded-2xl bg-paper px-4 py-4 text-left hover:bg-black/[0.04]"
                  >
                    <p className="font-semibold text-ink">{opt.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{opt.description}</p>
                  </button>
                ) : (
                  <div key={opt.family} className="w-full rounded-2xl px-4 py-4 text-left opacity-70">
                    <p className="font-semibold text-ink">{opt.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{opt.description}</p>
                  </div>
                ),
              )}
            </div>
            <button type="button" onClick={closeCreateChooser} className="tv-btn-ghost mt-4">
              Cancel
            </button>
          </aside>
        </div>
      )}

      {showForm && (
        <SupplierListingForm
          key={`${editingId ?? 'create'}-${createFamily}`}
          editingId={editingId}
          existingListings={listings}
          onSave={handleSave}
          canPostNewListing={canPostNewListing}
          createFamily={createFamily}
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
        <SupplierEmptyState
          icon={Map}
          title="No listings yet"
          body="You have not created a tour or stay. Photos, price, and the details guests need first; publish when you are ready."
          action={
            <button
              type="button"
              onClick={openCreateChooser}
              disabled={!canEditListings || !canPostNewListing}
              title={
                !canEditListings
                  ? 'Your role cannot add listings.'
                  : !canPostNewListing
                    ? 'Business verification and payout verification (IBAN + BIC) required.'
                    : undefined
              }
              className="tv-btn-primary"
            >
              <Plus className="w-5 h-5" />
              New listing
            </button>
          }
        />
      ) : (
        listings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings
              .filter((listing) => {
                const family = inventoryFamilyFromListing(listing);
                const isLive = listing.status !== 'draft';
                if (workspaceFilter === 'tour') return family === 'tour';
                if (workspaceFilter === 'stay') return family === 'stay';
                if (workspaceFilter === 'draft') return !isLive;
                if (workspaceFilter === 'published') return isLive;
                return true;
              })
              .map((listing) => {
              const isLive = listing.status !== 'draft';
              const family = inventoryFamilyFromListing(listing);
              const isStay = family === 'stay';
              const typeLabel = isStay
                ? isLive
                  ? 'Live stay'
                  : 'Draft stay'
                : isLive
                  ? 'Live tour'
                  : 'Draft tour';
              const currency = listing.price?.currency ?? 'EUR';
              const from = catalogHeadlineAmount(listing);
              const money = from == null ? null : formatMoney(from, currency);
              const opts = materializedBookingOptions(parseListingExtras(listing.listingExtras).bookingOptions);
              const qualifier = pickHeadlineOption(opts).qualifier;
              const place = [listing.city, listing.country ?? listing.destination].filter(Boolean).join(', ');
              const heroSrc = listingHeroImageSrc(listing.image);
              return (
                <article key={listing.id} className="group min-w-0">
                  <button
                    type="button"
                    onClick={() => openSupplierListingEditor(listing.id)}
                    className="lux-flat block w-full text-left"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black/[0.04]">
                      {heroSrc ? (
                        <img
                          src={heroSrc}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        />
                      ) : null}
                      <span
                        className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isLive ? 'bg-paper-raised text-ink' : 'bg-ink/70 text-paper-raised'
                        } ${justPublishedId === listing.id ? 'tv-pop' : ''}`}
                      >
                        {typeLabel}
                      </span>
                    </div>
                    <div className="pt-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{typeLabel}</p>
                      {place ? <p className="mt-1 text-sm text-ink-muted">{place}</p> : null}
                      <h2 className="mt-0.5 font-sans text-base font-semibold text-ink leading-snug">{listing.title}</h2>
                      {money ? (
                        <p className="mt-1 text-sm text-ink">
                          From {money}
                          {qualifier && !isStay ? ` per ${qualifier}` : isStay ? ' per night' : ''}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-ink-faint">Price not set</p>
                      )}
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isSupabase && canEditListings && !isLive && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(listing, 'published')}
                        disabled={!canPostNewListing}
                        className="text-xs font-semibold text-finland hover:underline disabled:opacity-40"
                      >
                        Publish
                      </button>
                    )}
                    {isLive ? (
                      <a
                        href={isStay ? publicStayListingUrl(listing.id) : publicTourListingUrl(listing.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-ink-muted hover:text-ink"
                      >
                        View on Traverion
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
                      aria-label={isStay ? 'Stay actions' : 'Tour actions'}
                      className="ml-auto lux-flat inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:text-ink disabled:opacity-40"
                    >
                      <Cog className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </article>
              );
            })}
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
                className="fixed z-[70] rounded-xl bg-paper-raised py-1 shadow-soft-lg ring-1 ring-black/[0.08] origin-top-right motion-safe:animate-slide-down"
                style={{
                  top: listingActionsMenuBox.top,
                  left: listingActionsMenuBox.left,
                  width: listingActionsMenuBox.width,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2.5 text-left text-sm text-ink hover:bg-paper"
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
                    className="flex w-full px-3 py-2.5 text-left text-sm text-ink hover:bg-paper"
                    onClick={() => {
                      closeListingActionsMenu();
                      setListingPendingDeactivate(menuListing);
                    }}
                  >
                    Deactivate
                  </button>
                ) : null}
                <div className="my-1 border-t border-black/[0.06]" role="separator" />
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
            <div className="tv-sheet-overlay z-[80]">
              <button
                type="button"
                className="absolute inset-0"
                aria-label="Close"
                disabled={deleteBusy}
                onClick={() => !deleteBusy && setListingPendingDelete(null)}
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-delete-listing-title"
                className="tv-sheet-panel relative z-[81] motion-safe:animate-slide-up"
              >
                <SupplierModalHeader
                  icon={Trash2}
                  title="Remove this listing?"
                  onClose={deleteBusy ? undefined : () => setListingPendingDelete(null)}
                />
                <div className="p-4 sm:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-sm text-ink-muted leading-relaxed">
                  <span className="font-medium text-ink">{listingPendingDelete.title}</span> will disappear from
                  Partner listings. Confirmed bookings stay in Bookings. This cannot be undone.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="tv-btn-ghost"
                    disabled={deleteBusy}
                    onClick={() => setListingPendingDelete(null)}
                  >
                    Keep listing
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteListing()}
                  >
                    {deleteBusy ? 'Removing…' : 'Remove listing'}
                  </button>
                </div>
                </div>
              </aside>
            </div>,
            document.body
          )
        : null}

      {listingPendingDeactivate && typeof document !== 'undefined'
        ? createPortal(
            <div className="tv-sheet-overlay z-[80]">
              <button
                type="button"
                className="absolute inset-0"
                aria-label="Close"
                disabled={deactivateBusy}
                onClick={() => !deactivateBusy && setListingPendingDeactivate(null)}
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-deactivate-listing-title"
                className="tv-sheet-panel relative z-[81] motion-safe:animate-slide-up"
              >
                <SupplierModalHeader
                  icon={EyeOff}
                  title="Take this listing offline?"
                  onClose={deactivateBusy ? undefined : () => setListingPendingDeactivate(null)}
                />
                <div className="p-4 sm:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-sm text-ink-muted leading-relaxed">
                  <span className="font-medium text-ink">{listingPendingDeactivate.title}</span> will be hidden from
                  travelers. Existing bookings stay. New checkouts stop until you publish it again.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="tv-btn-ghost"
                    disabled={deactivateBusy}
                    onClick={() => setListingPendingDeactivate(null)}
                  >
                    Keep published
                  </button>
                  <button
                    type="button"
                    className="tv-btn-primary"
                    disabled={deactivateBusy}
                    onClick={() => void confirmDeactivateListing()}
                  >
                    {deactivateBusy ? 'Updating…' : 'Take offline'}
                  </button>
                </div>
                </div>
              </aside>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
