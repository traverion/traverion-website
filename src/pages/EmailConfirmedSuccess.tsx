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
import NoticeCallout from '../components/NoticeCallout';

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
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06] text-center">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
        <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
          Traveler account
        </div>
        {phase === 'loading' && (
          <div aria-busy="true" aria-label="Verifying your email">
            <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Verifying your email</h1>
            <p className="mt-3 text-sm text-ink-muted">One moment while we confirm your account.</p>
            <div className="mt-8 space-y-3" aria-hidden>
              <div className="h-3 w-full rounded bg-black/[0.06] animate-pulse" />
              <div className="h-3 w-5/6 mx-auto rounded bg-black/[0.04] animate-pulse" />
            </div>
          </div>
        )}
        {phase === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" aria-hidden />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Email verified</h1>
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
            <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Link not valid</h1>
            <div className="mt-4 text-left">
              <NoticeCallout title="Try signing in" tone="danger">
                This confirmation link is missing, expired, or was already used. Request a new confirmation email from
                the sign-in page if needed.
              </NoticeCallout>
            </div>
            <div className="mt-6 flex flex-col gap-2">
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
            <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">Partner account</h1>
            <div className="mt-4 text-left">
              <NoticeCallout title="Use Traverion Partner" tone="info">
                {customerSignInPartnerOnlyMessage(`${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`)}
              </NoticeCallout>
            </div>
            <button
              type="button"
              className="tv-btn-primary mt-6 w-full justify-center"
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
