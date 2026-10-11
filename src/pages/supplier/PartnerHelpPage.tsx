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
        badge="Account"
        title="Help"
        description="Listings, bookings, payouts, and verification — real contact paths only."
      />

      <div className="max-w-xl space-y-2">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[Traverion · Partner] Support')}`}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat flex items-start gap-3 px-3.5 py-3 hover:border-finland/30"
        >
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-finland/10 text-finland">
            <Mail className="partner-icon" aria-hidden />
          </span>
          <span>
            <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Email support</span>
            <span className="mt-0.5 block partner-meta">{SUPPORT_EMAIL}</span>
          </span>
        </a>

        {/* Phase 1648: ops shortcuts named in the Help hero (bookings / payouts). */}
        {/* Phase 1681: Listings shortcut — hero already names listings first. */}
        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Listings</span>
          <span className="mt-0.5 block partner-meta">
            Drafts, live tours and stays, publish readiness.
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Bookings</span>
          <span className="mt-0.5 block partner-meta">Today’s schedule, guests, and checkout holds.</span>
        </button>

        {/* Phase 1699: Inbox shortcut for guest messaging. */}
        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/inbox`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Inbox</span>
          <span className="mt-0.5 block partner-meta">Messages about bookings and pickups.</span>
        </button>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Income</span>
          <span className="mt-0.5 block partner-meta">Collected payments, fees, and payout status.</span>
        </button>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Business profile</span>
          <span className="mt-0.5 block partner-meta">Company details, verification, and payout setup.</span>
        </button>

        <button
          type="button"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
          className="partner-surface-panel partner-surface-panel--quiet lux-flat w-full px-3.5 py-3 text-left hover:border-finland/30"
        >
          <span className="block text-[13px] font-semibold tracking-tight text-slate-900">Finish setup</span>
          <span className="mt-0.5 block partner-meta">Listing, business, and payout steps before live payouts.</span>
        </button>
      </div>
    </div>
  );
}
