/**
 * Dedicated partner log in / sign up — not an overlay on the landing page.
 */
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { PARTNER_LOGIN_PATH, PARTNER_SIGNUP_PATH } from '../../lib/partnerPortalPaths';
import { supplierPortalLandingHref } from '../../lib/partnerHost';
import SupplierAuth from '../../pages/supplier/SupplierAuth';
import SkipLink from '../SkipLink';

type Props = {
  mode: 'signin' | 'signup';
  onAuthenticated: () => void;
  isSupabase: boolean;
};

export default function PartnerAuthPage({ mode, onAuthenticated, isSupabase }: Props) {
  const traveler = publicSiteBaseUrl();
  const landing = supplierPortalLandingHref();
  const otherHref = mode === 'signin' ? PARTNER_SIGNUP_PATH : PARTNER_LOGIN_PATH;
  const otherLabel = mode === 'signin' ? 'Create an account' : 'Log in';

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <SkipLink />
      <header className="flex items-center justify-between px-5 sm:px-8 py-5">
        <a href={landing} className="flex items-center gap-2.5 no-lux-interaction" aria-label="Traverion Partner">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
        <div className="flex items-center gap-3">
          <a href={traveler} className="lux-flat text-sm text-ink-muted hover:text-ink">
            For travelers
          </a>
          <a href={otherHref} className="tv-btn-ghost text-sm">
            {otherLabel}
          </a>
        </div>
      </header>
      <main id="main-content" className="flex-1 px-5 sm:px-8 pb-16">
        <div className="mx-auto w-full max-w-md pt-6 sm:pt-10">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Traverion Partner</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-2">
            {mode === 'signin' ? 'Log in' : 'Create your partner account'}
          </h1>
          <p className="text-sm text-ink-muted mb-8 leading-relaxed">
            {mode === 'signin'
              ? 'This is the supplier product — listings, calendar, bookings, and money.'
              : 'Start with an account. You will add business details next, then publish.'}
          </p>
          <SupplierAuth
            onAuthenticated={onAuthenticated}
            isSupabase={isSupabase}
            initialMode={mode}
            compact
            onModeChange={(next) => {
              window.location.assign(next === 'signup' ? PARTNER_SIGNUP_PATH : PARTNER_LOGIN_PATH);
            }}
          />
        </div>
      </main>
    </div>
  );
}
