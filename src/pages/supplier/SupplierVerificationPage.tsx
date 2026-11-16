import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageFinance } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierActiveCommercialTerms,
  type SupplierCommercialTermsRow,
} from '../../data/supabase-earnings';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import type { PayoutWizardStepId } from '../../lib/payout-setup-wizard';

const PayoutSetupWizard = lazy(() => import('../../components/supplier/PayoutSetupWizard'));

/**
 * /partner/verification — opens the unified P9.1 payout setup wizard (same shell as
 * Income → Settings). Legacy dual journey is retired as the primary entry.
 */
export default function SupplierVerificationPage() {
  const { user } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageFinance(role);
  const [profile, setProfile] = useState<SupplierProfileRow | null>(null);
  const [commercialTerms, setCommercialTerms] = useState<SupplierCommercialTermsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const focusBank =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('focus') === 'bank';
  const initialStep: PayoutWizardStepId | undefined = focusBank ? 'bank' : undefined;

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
        const [next, terms] = await Promise.all([
          fetchSupplierProfile(user.id),
          fetchSupplierActiveCommercialTerms(user.id).catch(() => null),
        ]);
        if (!cancelled) {
          setProfile(next);
          setCommercialTerms(terms);
        }
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
        Sign in to continue payout setup.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-white text-[13px] text-[#52525b]">
        Opening payout setup…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-[#18181b]">Payout setup unavailable</h1>
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

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[80] grid place-items-center bg-white text-[13px] text-[#52525b]">
          Opening payout setup…
        </div>
      }
    >
      <PayoutSetupWizard
        userId={user.id}
        profile={profile}
        commercialTerms={commercialTerms}
        payoutCurrency={profile?.connect_default_currency ?? 'EUR'}
        canEdit={canEdit}
        onProfile={setProfile}
        initialStep={initialStep}
        onClose={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=settings`)}
      />
    </Suspense>
  );
}
