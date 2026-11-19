import { useCallback, useEffect, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageFinance } from '../../lib/supplierTeamRoles';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import SupplierOnboardingFlow from '../../components/supplier/SupplierOnboardingFlow';

type PartnerOnboardingProps = {
  profile: SupplierProfileRow | null;
  onSkip: () => void;
  onContinuePhase?: (phase: string) => void;
  onTours: () => void;
  hasListing: boolean;
  profileReady?: boolean;
  onDepartures?: () => void;
  onProfileRefresh?: (profile: SupplierProfileRow | null) => void;
};

export default function PartnerOnboarding({
  profile: profileProp,
  onSkip,
  onTours,
  hasListing,
  profileReady = true,
  onProfileRefresh,
}: PartnerOnboardingProps) {
  const { user } = useSupplierAuth();
  const { role } = useSupplierRole();
  const userId = user?.id ?? '';
  const [profile, setProfile] = useState<SupplierProfileRow | null>(profileProp);

  useEffect(() => {
    setProfile(profileProp);
  }, [profileProp]);

  const handleProfile = useCallback(
    (next: SupplierProfileRow | null) => {
      setProfile(next);
      onProfileRefresh?.(next);
    },
    [onProfileRefresh]
  );

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect !== 'return' && connect !== 'refresh') return;
    let cancelled = false;
    void (async () => {
      await invokeConnectSupplierOnboarding('status');
      const next = await fetchSupplierProfile(userId);
      if (cancelled) return;
      handleProfile(next);
      params.delete('connect');
      params.set('phase', 'status');
      params.set('screen', 'status');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, handleProfile]);

  if (!profileReady) {
    return (
      <div
        className="partner-unified-setup-shell flex h-full min-h-0 w-full flex-1 items-center justify-center"
        data-cert="p953"
      >
        <p className="text-[13px] text-[#71717a]" role="status">
          Loading your details…
        </p>
      </div>
    );
  }

  return (
    <SupplierOnboardingFlow
      userId={userId}
      profile={profile}
      canEdit={canManageFinance(role)}
      onProfile={handleProfile}
      onExit={onSkip}
      onOpenListings={onTours}
      hasListing={hasListing}
    />
  );
}
