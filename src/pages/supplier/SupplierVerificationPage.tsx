import { useEffect } from 'react';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

/**
 * Legacy /partner/verification — P9.41 redirects into the unified onboarding shell.
 * Income & Payouts still opens PayoutSetupWizard fullscreen for account management.
 */
export default function SupplierVerificationPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const step = (params.get('step') ?? '').trim();
    const focus = (params.get('focus') ?? '').trim();
    const phase =
      focus === 'bank' || step === 'bank' || step === 'preferences'
        ? 'payout'
        : step === 'review'
          ? 'status'
          : 'representative';
    navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding?phase=${phase}`);
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
      Opening partner setup…
    </div>
  );
}
