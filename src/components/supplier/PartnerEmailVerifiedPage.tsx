import { useLayoutEffect, useState } from 'react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { supabase } from '../../lib/supabase';
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
        <div className="max-w-md w-full text-center">
          {phase === 'checking' && (
            <>
              <h1 className="font-display text-3xl text-ink tracking-tight">Confirming your email</h1>
              <p className="mt-3 text-sm text-ink-muted">Please wait a moment.</p>
            </>
          )}
          {phase === 'verified' && (
            <>
              <h1 className="font-display text-3xl text-ink tracking-tight">Account verified</h1>
              <p className="mt-3 text-sm text-ink-muted">Your partner email is confirmed. Continuing to your workspace…</p>
            </>
          )}
          {phase === 'already' && (
            <>
              <h1 className="font-display text-3xl text-ink tracking-tight">Already verified</h1>
              <p className="mt-3 text-sm text-ink-muted">This email is already confirmed. Continuing to your workspace…</p>
            </>
          )}
          {(phase === 'invalid' || phase === 'unconfigured') && (
            <>
              <h1 className="font-display text-3xl text-ink tracking-tight">
                {phase === 'unconfigured' ? 'Sign-in is not available' : 'This link has expired'}
              </h1>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">
                {phase === 'unconfigured'
                  ? 'Sign-in is not configured on this environment.'
                  : 'This confirmation link is missing, expired, or was already used. Open the latest email from Traverion, or log in if you already confirmed.'}
              </p>
              <a href={PARTNER_LOGIN_PATH} className="tv-btn-primary mt-8 inline-flex">
                Log in
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
