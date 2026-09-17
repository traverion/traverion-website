import { useLayoutEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import SetNewPasswordForm from '../components/auth/SetNewPasswordForm';
import PartnerResetPasswordPage from '../components/supplier/PartnerResetPasswordPage';
import NoticeCallout from '../components/NoticeCallout';
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
    const allowed = new Set(['home', 'packages', 'bookings', 'booking-confirmed', 'account', 'wishlist', 'contact']);
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
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 py-16">
        <div
          className="w-full max-w-md rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06] text-center"
          aria-busy="true"
          aria-label="Verifying your reset link"
        >
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
            Traveler account
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Verifying your reset link</h1>
          <p className="mt-3 text-sm text-ink-muted">This usually takes a few seconds.</p>
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
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06] text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
            Traveler account
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">This reset link is not valid</h1>
          <div className="mt-4 text-left">
            <NoticeCallout title="Open the email link" tone="danger">
              This page only works from the secure link in your password reset email.
            </NoticeCallout>
          </div>
          <a href={loginHref} className="tv-btn-primary w-full inline-flex justify-center mt-6">
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
          className="lux-flat mb-6 inline-flex items-center gap-2 text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06]">
          <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-4">
            Traveler account
          </div>
          <div className="flex items-center gap-3 mb-6">
            <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Set a new password</h1>
              <p className="text-sm text-ink-muted mt-1">On {siteLabel}</p>
            </div>
          </div>
          <p className="text-sm text-ink-muted mb-6">
            This page only works from the secure link in your reset email.
          </p>
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
  );
}
