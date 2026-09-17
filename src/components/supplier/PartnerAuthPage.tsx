/**
 * Dedicated partner log in / sign up — branded split shell (parity with traveler AuthPage).
 * Form logic stays in SupplierAuth.
 */
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { HERO_IMG } from '../../lib/heroImages';
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

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col lg:flex-row">
      <SkipLink />
      <aside className="relative isolate overflow-hidden lg:w-[44%] lg:min-h-[100dvh] lg:sticky lg:top-0 lg:self-start">
        <div className="relative h-44 sm:h-52 lg:h-[100dvh] min-h-[11rem]">
          <img
            src={HERO_IMG.thailand}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            width={1200}
            height={1600}
            decoding="async"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-ink/90 via-finland-dark/45 to-ink/20 lg:bg-gradient-to-br lg:from-ink/85 lg:via-finland-dark/40 lg:to-finland/25"
            aria-hidden
          />
          <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-8 lg:p-10">
            <a href={landing} className="flex items-center gap-2.5 no-lux-interaction w-fit" aria-label="Traverion Partner">
              <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain brightness-0 invert" />
              <span className="font-sans text-sm font-semibold tracking-[0.18em] text-white">TRAVERION</span>
            </a>
            <div className="max-w-sm pb-1 lg:pb-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 mb-2">Traverion Partner</p>
              <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight leading-tight">
                Sell your products. Run the day.
              </p>
              <p className="mt-3 text-sm text-white/80 leading-relaxed hidden sm:block">
                Listings, calendar, bookings, and money — built for operators, not travelers.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-none">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-5">
          <a href={traveler} className="lux-flat text-sm text-ink-muted hover:bg-finland/10 hover:text-finland rounded-full px-3 py-1.5">
            For travelers
          </a>
          <nav className="flex gap-1 rounded-full bg-paper-raised p-1 shadow-soft ring-1 ring-black/[0.06]" aria-label="Partner account mode">
            <a
              href={PARTNER_LOGIN_PATH}
              className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                  : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
              }`}
            >
              Log in
            </a>
            <a
              href={PARTNER_SIGNUP_PATH}
              className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                  : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
              }`}
            >
              Sign up
            </a>
          </nav>
        </div>
        <div className="flex-1 px-5 sm:px-8 pb-16 pt-4 sm:pt-8">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft-lg ring-1 ring-black/[0.06]">
              <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
                Partner account
              </div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight mb-2 text-ink">
                {mode === 'signin' ? 'Log in' : 'Create your partner account'}
              </h1>
              <p className="text-sm text-ink-muted mb-6 leading-relaxed">
                {mode === 'signin'
                  ? 'This is the supplier product — listings, calendar, bookings, and money.'
                  : 'Step 1 of 2 — your account. Business details come next, after you confirm email.'}
              </p>
              <SupplierAuth
                onAuthenticated={onAuthenticated}
                isSupabase={isSupabase}
                initialMode={mode}
                compact
              />
            </div>
            <p className="mt-6 text-center text-xs text-ink-faint">
              <a href={landing} className="text-finland font-medium hover:underline">
                Back to Partner overview
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
