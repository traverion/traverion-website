import { useEffect } from 'react';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

/**
 * Legacy /partner/business-setup — P9.41 redirects into the unified onboarding shell.
 */
export default function BusinessSetupPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const step = (params.get('step') ?? '').trim();
    const phase =
      step === 'documents' || step === 'review'
        ? 'documents'
        : step === 'identity' || step === 'contact'
          ? 'business'
          : 'business';
    navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding?phase=${phase}`);
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-[13px] text-[#52525b]">
      Opening partner setup…
    </div>
  );
}
