import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import type { OperationalIndicator } from '../../lib/supplier-verification-state';

function Indicator({ item }: { item: OperationalIndicator }) {
  return (
    <div className="partner-ops__item" data-ops={item.key} data-ops-kind={item.kind} data-ops-on={item.operational ? '1' : '0'}>
      <span className={`partner-ops__dot${item.operational ? ' partner-ops__dot--ready' : ''}`} aria-hidden />
      <div className="min-w-0">
        <p className="partner-ops__headline">{item.headline}</p>
        <p className="partner-ops__detail">{item.detail}</p>
      </div>
    </div>
  );
}

export default function PartnerOperationalStatus({
  account,
  payouts,
}: {
  account: OperationalIndicator;
  payouts: OperationalIndicator;
}) {
  return (
    <section className="partner-ops" aria-label="Account and payout status">
      <div className="partner-ops__row">
        <Indicator item={account} />
        <Indicator item={payouts} />
      </div>
      {account.actionLabel ? (
        <button
          type="button"
          className="tv-btn-secondary h-9 shrink-0 px-3 text-[13px]"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
        >
          {account.actionLabel}
        </button>
      ) : null}
    </section>
  );
}
