import { Compass, Home, KeyRound } from 'lucide-react';
import NoticeCallout from '../../components/NoticeCallout';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { PARTNER_CREATE_INVENTORY, type InventoryFamily } from '../../lib/inventory';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

/**
 * Create starts here: pick an inventory family, then the existing listing editor.
 * Rentals open the dedicated Rental Creator (drafts only — not traveler-bookable yet).
 */
export default function PartnerCreateListingPage() {
  // Phase 1755: finance/viewer must not start a create journey that RLS 216 will reject.
  // Phase 1857: wait for shared role roster before enabling/disabling create.
  const { role, roleStatus } = useSupplierRole();
  const roleReady = roleStatus === 'ready' || roleStatus === 'error';
  const canCreate = roleReady && canManageBookings(role);

  const startFamily = (family: 'tour' | 'stay' | 'rental') => {
    if (!canCreate) return;
    navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?create=${family}`);
  };

  const iconFor = (family: InventoryFamily) => {
    if (family === 'stay') return Home;
    if (family === 'rental') return KeyRound;
    return Compass;
  };

  const titleFor = (family: InventoryFamily) => {
    if (family === 'stay') return 'Stays';
    if (family === 'rental') return 'Rentals';
    return 'Tours & activities';
  };

  const bodyFor = (family: InventoryFamily) => {
    if (family === 'stay') {
      return 'Apartments, cabins, villas, hotels, and other accommodation sold as nights.';
    }
    if (family === 'rental') {
      return 'Bikes, winter clothing, skis, snowmobiles, and outdoor equipment — prepare listings now; traveler booking launches later.';
    }
    return 'Tours, activities, attractions, and transfers with a departure and a meeting point.';
  };

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Create a listing"
        description="Pick what travelers will book. Tours, stays, and rentals use different rules — Traverion does not fold them into one form."
      />

      {!roleReady ? (
        <NoticeCallout tone="info" className="mb-4">
          Checking your workspace role…
        </NoticeCallout>
      ) : !canCreate ? (
        <NoticeCallout tone="info" className="mb-4">
          Your role can view listings but cannot create new ones. Ask an owner, manager, or ops teammate.
        </NoticeCallout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PARTNER_CREATE_INVENTORY.filter((opt) => opt.canCreate).map((opt) => {
          const Icon = iconFor(opt.family);
          const family = opt.family as 'tour' | 'stay' | 'rental';
          return (
            <button
              key={opt.family}
              type="button"
              disabled={!canCreate}
              onClick={() => startFamily(family)}
              className="partner-surface-panel lux-flat group flex flex-col px-4 py-4 text-left hover:border-finland/30 disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-finland/10 text-finland">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="mt-3 text-[15px] font-semibold text-slate-900">{titleFor(opt.family)}</span>
              <span className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">
                {bodyFor(opt.family)}
              </span>
              {family === 'rental' ? (
                <span className="mt-2 text-[11px] font-medium text-slate-400">
                  Drafts only · not bookable by travelers yet
                </span>
              ) : null}
              <span className="mt-3 text-[13px] font-semibold text-finland">
                Continue <span aria-hidden>→</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
