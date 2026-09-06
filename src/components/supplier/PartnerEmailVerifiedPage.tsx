import { useLayoutEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import {
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_APP_BASE,
} from '../../lib/partnerPortalPaths';

type Phase = 'checking' | 'verified' | 'invalid' | 'unconfigured';

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

    const succeed = async () => {
      if (cancelled) return;
      setPhase('verified');
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
        await succeed();
        return;
      }

      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
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

      await succeed();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-center">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-10 shadow-soft-lg text-center">
          {phase === 'checking' && (
            <>
              <Loader2 className="w-14 h-14 text-finland mx-auto mb-4 animate-spin" aria-hidden />
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Confirming your email…</h1>
              <p className="text-sm text-gray-600">Please wait a moment.</p>
            </>
          )}
          {phase === 'verified' && (
            <>
              <div
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 motion-safe:animate-scale-in"
                style={{ animationDuration: '0.45s', animationFillMode: 'both' }}
              >
                <CheckCircle2 className="w-10 h-10 motion-safe:animate-pulse" strokeWidth={2} aria-hidden />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Account verified</h1>
              <p className="text-sm text-gray-600 mb-1">Your partner email is confirmed.</p>
              <p className="text-xs text-ink-muted">Continuing to your workspace…</p>
            </>
          )}
          {(phase === 'invalid' || phase === 'unconfigured') && (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Link not valid</h1>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                {phase === 'unconfigured'
                  ? 'Sign-in is not configured on this environment.'
                  : 'This confirmation link is missing, expired, or was already used. Open the latest email from Traverion or sign in if you already confirmed.'}
              </p>
              <a
                href={PARTNER_LOGIN_PATH}
                className="inline-flex w-full justify-center rounded-xl bg-finland px-4 py-3 text-sm font-semibold text-white hover:bg-finland-dark transition-colors"
              >
                Go to partner sign in
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
