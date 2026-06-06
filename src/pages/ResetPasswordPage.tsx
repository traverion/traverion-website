import { useLayoutEffect, useState } from 'react';
import { ArrowLeft, Lock, Loader2 } from 'lucide-react';
import { HERO_IMG } from '../lib/heroImages';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import SetNewPasswordForm from '../components/auth/SetNewPasswordForm';
import PartnerResetPasswordPage from '../components/supplier/PartnerResetPasswordPage';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { supabase } from '../lib/supabase';
import { establishPasswordRecoverySession } from '../lib/passwordRecoveryFlow';
import { resolvePasswordRecoveryPortal } from '../lib/recoveryPortal';

interface ResetPasswordPageProps {
  onNavigate: (page: string) => void;
}

type PortalPhase = 'verifying' | 'traveler' | 'partner' | 'invalid';

function readNextAfterReset(): string {
  try {
    const next = new URLSearchParams(window.location.search).get('next');
    const allowed = new Set(['home', 'packages', 'cart', 'bookings', 'booking-confirmed', 'account', 'wishlist', 'contact']);
    if (next && allowed.has(next)) return next;
  } catch {
    /* ignore */
  }
  return 'account';
}

export default function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const [portal, setPortal] = useState<PortalPhase>('verifying');
  const nextPage = readNextAfterReset();
  const loginHref = `/log-in?next=${encodeURIComponent(nextPage)}`;
  const siteLabel = publicSiteBaseUrl().replace(/^https?:\/\//, '');

  useLayoutEffect(() => {
    if (!supabase) {
      setPortal('invalid');
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await establishPasswordRecoverySession(supabase);
      if (cancelled) return;
      if (result !== 'ready') {
        setPortal('invalid');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setPortal('invalid');
        return;
      }
      const resolved = await resolvePasswordRecoveryPortal(session.user.id);
      if (!cancelled) setPortal(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (portal === 'partner') {
    return <PartnerResetPasswordPage />;
  }

  if (portal === 'verifying') {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-finland mx-auto mb-3 animate-spin" aria-hidden />
          <p className="text-sm text-gray-600">Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  if (portal === 'invalid') {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-6 space-y-4">
          <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100" role="alert">
            This page only works from the secure link in your password reset email.
          </p>
          <a
            href={loginHref}
            className="inline-flex w-full justify-center rounded-lg bg-finland px-4 py-3 text-sm font-semibold text-white hover:bg-finland-dark transition-colors"
          >
            Back to traveler sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage: `url(${HERO_IMG.vacation})`,
            filter: 'blur(12px)',
          }}
        />
        <div className="absolute inset-0 bg-white/55" />
      </div>

      <header className="relative z-10 border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 min-w-0 text-gray-900">
            <img src={BRAND_LOGO_SRC} alt="" className="h-9 w-9 object-contain flex-shrink-0" />
            <span className="font-semibold text-finland tracking-tight truncate">Traverion</span>
          </a>
          <a href={loginHref} className="text-sm text-gray-600 hover:text-finland transition-colors whitespace-nowrap">
            Sign in
          </a>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12 pb-12">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="mb-5 inline-flex items-center gap-2 text-gray-600 hover:text-finland"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-finland/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-finland" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-gray-900">Set a new password</h1>
                <p className="text-sm text-gray-600 mt-1">Traveler account on {siteLabel}</p>
                <p className="text-xs text-gray-500 mt-2">
                  This page only works from the secure link in your reset email. Your session is verified before you can
                  choose a new password.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <SetNewPasswordForm
              minPasswordLength={6}
              description="Enter a new password for your traveler account. When you are done, sign in to book trips and manage bookings."
              onSuccess={() => {
                window.location.replace(loginHref);
              }}
              loginHref={loginHref}
              loginLabel="Back to traveler sign in"
              successHint="You can sign in with your new password."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
