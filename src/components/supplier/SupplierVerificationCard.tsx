import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import type { SupplierVerificationView } from '../../lib/supplier-verification-state';

export default function SupplierVerificationCard({
  view,
  variant = 'page',
  extra,
}: {
  view: SupplierVerificationView;
  variant?: 'home' | 'page' | 'compact';
  extra?: string | null;
}) {
  const openVerification = () => navigateSupplierUrl(`${PARTNER_APP_BASE}/verification`);
  const openOnboarding = () => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`);

  if (variant === 'compact') {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3" data-verification-status={view.status}>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">{view.title}</p>
          <p className="mt-0.5 text-[13px] text-slate-500">{view.summary}</p>
        </div>
        <button type="button" className="tv-btn-secondary h-10 px-4 text-[13px]" onClick={openVerification}>
          View verification
        </button>
      </div>
    );
  }

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6"
      data-verification-status={view.status}
      aria-label="Verification"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Verification</p>
      <h2 className={`mt-2 font-semibold text-slate-900 ${variant === 'home' ? 'text-[28px] tracking-[-0.03em]' : 'text-[22px]'}`}>
        {view.title}
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">{view.summary}</p>
      {view.requirements.length > 0 ? (
        <ul className="mt-4 space-y-2 text-[14px] text-slate-800">
          {view.requirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 max-w-2xl text-[14px] text-slate-500">{view.next}</p>
      {extra ? <p className="mt-2 max-w-2xl text-[14px] text-slate-600">{extra}</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {view.actionLabel ? (
          <button type="button" className="tv-btn-primary h-11 px-4 text-[14px]" onClick={openOnboarding}>
            {view.actionLabel}
          </button>
        ) : null}
        {variant === 'home' ? (
          <button type="button" className="tv-btn-secondary h-11 px-4 text-[14px]" onClick={openVerification}>
            View verification
          </button>
        ) : null}
      </div>
    </section>
  );
}
