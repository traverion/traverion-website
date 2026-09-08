import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  consumerProfileEnsurePayloadFromAuthUser,
  ensureConsumerProfile,
  fetchConsumerProfile,
} from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';
import { isTraverionAdminUser } from '../lib/adminAuth';
import { customerSignInPartnerOnlyMessage } from '../lib/customerSupplierAuthMessages';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { PARTNER_LOGIN_PATH } from '../lib/partnerPortalPaths';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';

import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';

const REDIRECT_MS = 3000;

type Phase = 'loading' | 'success' | 'wrong_account' | 'invalid';

export default function EmailConfirmedSuccess() {
  const { user, loading, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(REDIRECT_MS / 1000));
  const next = useMemo(() => sanitizeTravelerAuthNext(new URLSearchParams(window.location.search).get('next')), []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    const run = async () => {
      if (!isSupabaseConfigured() || !supabase) {
        if (!cancelled) setPhase('invalid');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? user;
      if (!u) {
        if (!cancelled) setPhase('invalid');
        return;
      }

      if (!u.email_confirmed_at) {
        if (!cancelled) setPhase('invalid');
        return;
      }

      if (isTraverionAdminUser(u)) {
        if (!cancelled) setPhase('success');
        return;
      }

      const [supplierRow, consumerRow] = await Promise.all([fetchSupplierProfile(u.id), fetchConsumerProfile(u.id)]);
      if (supplierRow && !consumerRow) {
        if (!cancelled) setPhase('wrong_account');
        return;
      }

      const ensured = await ensureConsumerProfile(u.id, consumerProfileEnsurePayloadFromAuthUser(u));
      if (!ensured.success) {
        if (!cancelled) setPhase('invalid');
        return;
      }

      const clean = `/email-confirmed?next=${encodeURIComponent(next)}`;
      window.history.replaceState({}, '', clean);

      if (!cancelled) setPhase('success');
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loading, user, next]);

  useEffect(() => {
    if (phase !== 'success') return;

    const tick = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    window.setTimeout(async () => {
      await signOut();
      window.location.replace(`/log-in?next=${encodeURIComponent(next)}`);
    }, REDIRECT_MS);

    return () => {
      window.clearInterval(tick);
      // Do not clear the redirect timeout: React StrictMode’s dev remount would cancel it before it runs.
    };
  }, [phase, next, signOut]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-10 w-auto mx-auto mb-8" />
        {phase === 'loading' && (
          <div aria-busy="true" aria-label="Verifying your email">
            <h1 className="font-display text-3xl text-ink tracking-tight">Verifying your email</h1>
            <p className="mt-3 text-sm text-ink-muted">One moment while we confirm your account.</p>
            <div className="mt-8 space-y-3" aria-hidden>
              <div className="h-3 w-full rounded bg-black/[0.06] animate-pulse" />
              <div className="h-3 w-5/6 mx-auto rounded bg-black/[0.04] animate-pulse" />
            </div>
          </div>
        )}
        {phase === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" aria-hidden />
            </div>
            <h1 className="font-display text-3xl text-ink tracking-tight">Email verified</h1>
            <p className="mt-3 text-sm text-ink-muted leading-relaxed">
              Your Traverion traveler account is ready. For security, you will be signed out here—then sign in on the
              next screen with the email and password you created.
            </p>
            <p className="text-sm font-medium text-finland mt-4 tabular-nums">
              Redirecting to sign in in {secondsLeft}s…
            </p>
          </>
        )}
        {phase === 'invalid' && (
          <>
            <h1 className="font-display text-3xl text-ink tracking-tight">Link not valid</h1>
            <p className="mt-3 text-sm text-ink-muted leading-relaxed">
              This confirmation link is missing, expired, or was already used. Try signing in, or request a new
              confirmation email from the sign-in page.
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <a href={`/log-in?next=${encodeURIComponent(next)}`} className="tv-btn-primary justify-center">
                Go to sign in
              </a>
              <a href="/sign-up" className="tv-btn-secondary justify-center">
                Create an account
              </a>
            </div>
          </>
        )}
        {phase === 'wrong_account' && (
          <>
            <h1 className="font-display text-3xl text-ink tracking-tight">Partner account</h1>
            <p className="mt-3 text-sm text-ink-muted leading-relaxed">
              {customerSignInPartnerOnlyMessage(`${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`)}
            </p>
            <button
              type="button"
              className="tv-btn-primary mt-8 w-full justify-center"
              onClick={() =>
                void signOut().then(() => {
                  window.location.replace(`${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`);
                })
              }
            >
              Go to partner sign-in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
