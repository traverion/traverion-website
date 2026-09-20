import { Mail } from 'lucide-react';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

const SUPPORT_EMAIL = 'info@traverion.com';

/** In-app Help — real contact paths only. Not a knowledge base. */
export default function PartnerHelpPage() {
  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Help"
        description="Traverion Partner support for your listings, bookings, payouts, and verification."
      />

      <div className="max-w-xl space-y-3">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="partner-surface-panel lux-flat flex items-start gap-3 px-4 py-3.5 hover:border-finland/30"
        >
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-finland/10 text-finland">
            <Mail className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block text-[14px] font-semibold text-slate-900">Email support</span>
            <span className="mt-0.5 block text-[13px] text-slate-500">{SUPPORT_EMAIL}</span>
          </span>
        </a>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
          className="partner-surface-panel lux-flat w-full px-4 py-3.5 text-left hover:border-finland/30"
        >
          <span className="block text-[14px] font-semibold text-slate-900">Business profile</span>
          <span className="mt-0.5 block text-[13px] text-slate-500">
            Company details, verification, and payout setup.
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
          className="partner-surface-panel lux-flat w-full px-4 py-3.5 text-left hover:border-finland/30"
        >
          <span className="block text-[14px] font-semibold text-slate-900">Finish setup</span>
          <span className="mt-0.5 block text-[13px] text-slate-500">
            Listing, business, and payout steps required before live payouts.
          </span>
        </button>
      </div>
    </div>
  );
}
