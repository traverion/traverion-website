import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
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

const REDIRECT_MS = 3000;

type Phase = 'loading' | 'success' | 'wrong_account' | 'invalid';

function readNextParam(): string {
  const allowed = new Set(['home', 'packages', 'cart', 'bookings', 'account', 'wishlist', 'contact']);
  const raw = new URLSearchParams(window.location.search).get('next') ?? 'account';
  return allowed.has(raw) ? raw : 'account';
}

export default function EmailConfirmedSuccess() {
  const { user, loading, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(REDIRECT_MS / 1000));
  const next = useMemo(() => readNextParam(), []);

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

    const go = window.setTimeout(async () => {
      await signOut();
      window.location.replace(`/log-in?next=${encodeURIComponent(next)}`);
    }, REDIRECT_MS);

    return () => {
      window.clearInterval(tick);
      // Do not clear `go`: React StrictMode’s dev remount would cancel the redirect before it runs.
    };
  }, [phase, next, signOut]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
        <div className="px-6 pt-8 pb-6 border-b border-gray-100 flex flex-col items-center text-center">
          <img src={BRAND_LOGO_SRC} alt="" className="h-14 w-14 object-contain mb-4" />
          {phase === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 text-finland animate-spin mb-3" aria-hidden />
              <h1 className="text-xl font-semibold text-gray-900">Verifying your email…</h1>
              <p className="text-sm text-gray-600 mt-2">One moment while we confirm your account.</p>
            </>
          )}
          {phase === 'success' && (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Email verified</h1>
              <p className="text-sm text-gray-600 mt-2">
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
              <h1 className="text-xl font-semibold text-gray-900">Link not valid</h1>
              <p className="text-sm text-gray-600 mt-2">
                This confirmation link is missing, expired, or was already used. Try signing in, or request a new
                confirmation email from the sign-in page.
              </p>
              <div className="mt-6 flex flex-col gap-2 w-full">
                <a
                  href={`/log-in?next=${encodeURIComponent(next)}`}
                  className="w-full py-2.5 rounded-lg bg-finland text-white text-sm font-medium text-center hover:bg-finland-dark"
                >
                  Go to sign in
                </a>
                <a href="/sign-up" className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 text-center hover:bg-gray-50">
                  Create an account
                </a>
              </div>
            </>
          )}
          {phase === 'wrong_account' && (
            <>
              <h1 className="text-xl font-semibold text-gray-900">Partner account</h1>
              <p className="text-sm text-gray-600 mt-2">
                {customerSignInPartnerOnlyMessage(`${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`)}
              </p>
              <button
                type="button"
                className="mt-6 w-full py-2.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
                onClick={() => void signOut().then(() => {
                  window.location.replace(`${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`);
                })}
              >
                Go to partner sign-in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
