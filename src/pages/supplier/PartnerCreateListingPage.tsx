import { Compass, Home, KeyRound } from 'lucide-react';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import { PARTNER_CREATE_INVENTORY } from '../../lib/inventory';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

/**
 * Create starts here: pick a live inventory family, then the existing listing editor.
 * Rentals are not a Traverion inventory family yet — shown as unavailable, not a fake form.
 */
export default function PartnerCreateListingPage() {
  const startFamily = (family: 'tour' | 'stay') => {
    navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?create=${family}`);
  };

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Create a listing"
        description="Pick what travelers will book. Tours and stays use different calendars and rules — Traverion does not fold them into one form."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PARTNER_CREATE_INVENTORY.map((opt) => {
          const Icon = opt.family === 'stay' ? Home : Compass;
          const title = opt.family === 'stay' ? 'Stays' : 'Tours & activities';
          const body =
            opt.family === 'stay'
              ? 'Apartments, cabins, villas, hotels, and other accommodation sold as nights.'
              : 'Tours, activities, attractions, and transfers with a departure and a meeting point.';
          return (
            <button
              key={opt.family}
              type="button"
              onClick={() => startFamily(opt.family as 'tour' | 'stay')}
              className="partner-surface-panel lux-flat group flex flex-col px-4 py-4 text-left hover:border-finland/30"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-finland/10 text-finland">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="mt-3 text-[15px] font-semibold text-slate-900">{title}</span>
              <span className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">{body}</span>
              <span className="mt-3 text-[13px] font-semibold text-finland">
                Continue <span aria-hidden>→</span>
              </span>
            </button>
          );
        })}

        <div className="partner-surface-panel flex flex-col px-4 py-4 opacity-80">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <span className="mt-3 text-[15px] font-semibold text-slate-900">Rentals</span>
          <span className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">
            Cars, campervans, equipment, and other rentable inventory.
          </span>
          <span className="mt-3 text-[12px] font-medium text-slate-400">Not available to list yet</span>
        </div>
      </div>
    </div>
  );
}
