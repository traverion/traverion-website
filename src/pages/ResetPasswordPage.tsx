import { useLayoutEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center" aria-busy="true" aria-label="Verifying your reset link">
          <p className="font-display text-2xl text-ink">Verifying your reset link</p>
          <p className="mt-2 text-sm text-ink-muted">This usually takes a few seconds.</p>
          <div className="mt-8 space-y-3" aria-hidden>
            <div className="h-11 rounded-xl bg-black/[0.06] animate-pulse" />
            <div className="h-11 rounded-xl bg-black/[0.06] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (portal === 'invalid') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4">
          <p className="font-display text-2xl text-ink tracking-tight">This reset link is not valid</p>
          <p className="text-sm text-red-800" role="alert">
            This page only works from the secure link in your password reset email.
          </p>
          <a href={loginHref} className="tv-btn-primary w-full inline-flex justify-center">
            Back to traveler sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-md mx-auto px-4 py-12 pb-16">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="lux-flat mb-8 inline-flex items-center gap-2 text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3 mb-8">
          <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl text-ink tracking-tight">Set a new password</h1>
            <p className="text-sm text-ink-muted mt-1">Traveler account on {siteLabel}</p>
            <p className="text-xs text-ink-faint mt-2">
              This page only works from the secure link in your reset email.
            </p>
          </div>
        </div>
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
  );
}
