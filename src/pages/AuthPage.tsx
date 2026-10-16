import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { subscribePasswordRecovery } from '../lib/passwordRecoveryFlow';
import { TRAVELER_RESET_PASSWORD_PATH } from '../lib/partnerPortalPaths';
import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';
import { HERO_IMG } from '../lib/heroImages';
import SkipLink from '../components/SkipLink';
import { navigateBackOrFallback } from '../lib/appRouting';
import TravelerAuthForm, { type TravelerAuthTab } from '../components/auth/TravelerAuthForm';

interface AuthPageProps {
  onNavigate: (page: string) => void;
}

function readAuthQuery(): { tab: TravelerAuthTab; next: string } {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  let tab: TravelerAuthTab = 'signup';
  if (path === '/log-in' || path === '/login') tab = 'signin';
  else if (path === '/sign-up') tab = 'signup';
  else if (tabParam === 'signin') tab = 'signin';
  return { tab, next: sanitizeTravelerAuthNext(params.get('next')) };
}

function destinationHint(nextPage: string): string | null {
  // Phase 1611: nextPage === 'wishlist' || nextPage === 'bookings'
  if (nextPage === 'wishlist' || nextPage === 'bookings') {
    return nextPage === 'wishlist'
      ? 'After you log in, we will take you to Saved.'
      : 'After you log in, we will take you to Trips.';
  }
  // Phase 1638: nextPage === 'account'
  if (nextPage === 'account') return 'After you log in, we will take you to Account.';
  // Phase 1685: nextPage === 'packages' / stays / contact
  if (nextPage === 'packages') return 'After you log in, we will take you back to Tours.';
  if (nextPage === 'stays') return 'After you log in, we will take you back to Stays.';
  if (nextPage === 'contact') return 'After you log in, we will take you to Contact.';
  return null;
}

export default function AuthPage({ onNavigate }: AuthPageProps) {
  const [{ tab: initialTab, next }] = useState(readAuthQuery);
  const [tab, setTab] = useState<TravelerAuthTab>(initialTab);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const nextPage = useMemo(() => sanitizeTravelerAuthNext(next), [next]);

  useEffect(() => {
    if (!supabase) return;
    return subscribePasswordRecovery(supabase, () => {
      const { search, hash } = window.location;
      window.location.replace(`${TRAVELER_RESET_PASSWORD_PATH}${search}${hash}`);
    });
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('traverion_auth_flash');
      if (!raw) return;
      sessionStorage.removeItem('traverion_auth_flash');
      const parsed = JSON.parse(raw) as { kind?: string; message?: string };
      if (parsed?.kind === 'error' && typeof parsed.message === 'string') {
        setBannerError(parsed.message);
        setTab('signin');
      }
    } catch {
      sessionStorage.removeItem('traverion_auth_flash');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('next', nextPage);
    const path = tab === 'signup' ? '/sign-up' : '/log-in';
    window.history.replaceState({}, '', `${path}?${params.toString()}`);
  }, [tab, nextPage]);

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col lg:flex-row">
      <SkipLink />
      <aside className="relative isolate overflow-hidden lg:w-[44%] lg:min-h-[100dvh] lg:sticky lg:top-0 lg:self-start">
        <div className="relative h-40 sm:h-48 lg:h-[100dvh] min-h-[10rem]">
          <img
            src={HERO_IMG.vacation}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            width={1200}
            height={1600}
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-finland-dark/85 via-finland/35 to-ink/20 lg:bg-gradient-to-br lg:from-finland-dark/75 lg:via-finland/30 lg:to-ink/25" aria-hidden />
          <div className="relative z-10 flex h-full flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-8 lg:p-10">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('home');
              }}
              className="flex w-fit items-center gap-2.5"
              aria-label="Traverion home"
            >
              <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain brightness-0 invert" />
              <span className="font-sans text-sm font-semibold tracking-[0.18em] text-white">TRAVERION</span>
            </a>
            <div className="max-w-sm pb-1 lg:pb-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/70">For travelers</p>
              <p className="font-display text-2xl leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                Book with operators. Manage every trip in one place.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <div className="flex-1 px-5 py-6 pb-12 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[28.5rem]">
            <button
              type="button"
              onClick={() => navigateBackOrFallback(() => onNavigate('home'))}
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Traverion
            </button>
            <div className="tv-auth-panel">
              <TravelerAuthForm
                idPrefix="auth-page"
                tab={tab}
                onTabChange={setTab}
                afterConfirmNext={nextPage}
                destinationHint={destinationHint(nextPage)}
                bannerError={bannerError}
                showPartnerLink
                onAuthenticated={() => onNavigate(nextPage)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
