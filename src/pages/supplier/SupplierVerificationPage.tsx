import { useCallback, useEffect, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageFinance } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import SupplierNativeVerificationJourney from '../../components/supplier/SupplierNativeVerificationJourney';

/**
 * Dedicated full-screen payout verification workspace at /partner/verification.
 * Keeps Income & Payouts → Settings compact; all form steps live here.
 */
export default function SupplierVerificationPage() {
  const { user } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageFinance(role);
  const [profile, setProfile] = useState<SupplierProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return null;
    const next = await fetchSupplierProfile(user.id);
    setProfile(next);
    return next;
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const next = await fetchSupplierProfile(user.id);
        if (!cancelled) setProfile(next);
      } catch {
        if (!cancelled) setLoadError('Could not load your business profile. Try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
        Sign in to continue verification.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[720px] space-y-4 px-4 py-10" aria-busy="true" aria-label="Loading verification">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-black/[0.06]" />
        <div className="h-5 w-full max-w-md animate-pulse rounded bg-black/[0.04]" />
        <div className="mt-8 h-64 animate-pulse rounded-[12px] border border-[#e5e7eb] bg-white" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-[#18181b]">Verification unavailable</h1>
        <p className="mt-2 text-[13px] text-[#52525b]">{loadError}</p>
        <button
          type="button"
          className="tv-btn-primary mt-6 h-10 px-4 text-[13px]"
          onClick={() => void refreshProfile().then(() => setLoadError(null))}
        >
          Retry
        </button>
      </div>
    );
  }

  const focusBank =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('focus') === 'bank';

  return (
    <SupplierNativeVerificationJourney
      userId={user.id}
      profile={profile}
      canEdit={canEdit}
      onProfile={setProfile}
      onClose={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=settings`)}
      initialFocus={focusBank ? 'bank' : 'full'}
      fullScreen
    />
  );
}
