import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

const BusinessOnboardingWizard = lazy(() => import('../../components/supplier/BusinessOnboardingWizard'));

/**
 * /partner/business-setup — full-screen Traverion business verification wizard (P9.16).
 * Does not touch Stripe Connect / payouts.
 */
export default function BusinessSetupPage() {
  const { user } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
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

  const closeToOnboarding = () => {
    navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`);
  };

  if (!user?.id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
        Sign in to continue business setup.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
        Loading business setup…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[13px] text-red-800">{loadError}</p>
        <button type="button" className="tv-btn-secondary h-10 px-4 text-sm" onClick={() => void refreshProfile()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
          Opening business setup…
        </div>
      }
    >
      <BusinessOnboardingWizard
        userId={user.id}
        profile={profile}
        canEdit={canEdit}
        onProfile={setProfile}
        onClose={closeToOnboarding}
        onSubmitted={closeToOnboarding}
      />
    </Suspense>
  );
}
