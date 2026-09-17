import { useLayoutEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { supabase } from '../../lib/supabase';
import NoticeCallout from '../NoticeCallout';
import {
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_APP_BASE,
} from '../../lib/partnerPortalPaths';

type Phase = 'checking' | 'verified' | 'already' | 'invalid' | 'unconfigured';

/**
 * Partner email confirmation landing. Supabase appends signed tokens in the URL (#access_token…&type=signup).
 * Without those tokens, this page cannot confirm anything — we show an error and link to login.
 * useLayoutEffect runs before SupplierAuthProvider’s getSession effect so we consume the hash first.
 */
export default function PartnerEmailVerifiedPage() {
  const [phase, setPhase] = useState<Phase>('checking');

  useLayoutEffect(() => {
    if (!supabase) {
      setPhase('unconfigured');
      return;
    }

    let cancelled = false;

    const stripSensitiveUrl = () => {
      window.history.replaceState({}, document.title, PARTNER_EMAIL_VERIFIED_PATH);
    };

    const fail = () => {
      if (!cancelled) {
        stripSensitiveUrl();
        setPhase('invalid');
      }
    };

    const succeed = async (kind: 'verified' | 'already') => {
      if (cancelled) return;
      setPhase(kind);
      stripSensitiveUrl();
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;
      window.location.replace(`${PARTNER_APP_BASE}/onboarding`);
    };

    void (async () => {
      const search = window.location.search;
      const code = new URLSearchParams(search).get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (cancelled) return;
        if (error || !data.session) {
          fail();
          return;
        }
        await succeed('verified');
        return;
      }

      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user?.email_confirmed_at) {
          await succeed('already');
          return;
        }
        fail();
        return;
      }

      const p = new URLSearchParams(hash);
      const type = p.get('type');
      const access_token = p.get('access_token');
      const refresh_token = p.get('refresh_token');

      if (
        !access_token ||
        !refresh_token ||
        (type !== 'signup' && type !== 'email_change')
      ) {
        fail();
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (cancelled) return;
      if (error || !data.session) {
        fail();
        return;
      }

      await succeed('verified');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <header className="px-5 sm:px-8 py-5 flex justify-center">
        <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06] text-center">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Traverion Partner</p>
          {phase === 'checking' && (
            <div aria-busy="true" aria-label="Confirming your email">
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Confirming your email</h1>
              <p className="mt-3 text-sm text-ink-muted">Please wait a moment.</p>
              <div className="mt-8 space-y-3" aria-hidden>
                <div className="h-3 w-full rounded bg-black/[0.06] animate-pulse" />
                <div className="h-3 w-5/6 mx-auto rounded bg-black/[0.04] animate-pulse" />
              </div>
            </div>
          )}
          {phase === 'verified' && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Account verified</h1>
              <div className="mt-4 text-left">
                <NoticeCallout title="Email confirmed" tone="success">
                  Your partner email is confirmed. Continuing to your workspace…
                </NoticeCallout>
              </div>
            </>
          )}
          {phase === 'already' && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-finland/15">
                <CheckCircle2 className="h-8 w-8 text-finland" aria-hidden />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Already verified</h1>
              <div className="mt-4 text-left">
                <NoticeCallout title="You’re all set" tone="info">
                  This email is already confirmed. Continuing to your workspace…
                </NoticeCallout>
              </div>
            </>
          )}
          {(phase === 'invalid' || phase === 'unconfigured') && (
            <>
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                {phase === 'unconfigured' ? 'Sign-in is not available' : 'This link has expired'}
              </h1>
              <div className="mt-4 text-left">
                <NoticeCallout
                  title={phase === 'unconfigured' ? 'Environment not ready' : 'Open a fresh confirmation email'}
                  tone="danger"
                >
                  {phase === 'unconfigured'
                    ? 'Sign-in is not configured on this environment.'
                    : 'This confirmation link is missing, expired, or was already used. Open the latest email from Traverion, or log in if you already confirmed.'}
                </NoticeCallout>
              </div>
              <a href={PARTNER_LOGIN_PATH} className="tv-btn-primary mt-6 inline-flex w-full justify-center">
                Log in
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
