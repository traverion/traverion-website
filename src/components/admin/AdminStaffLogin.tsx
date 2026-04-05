import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, User, Key, Loader2, ShieldAlert } from 'lucide-react';
import LuxuryButton from '../ui/LuxuryButton';
import LuxuryCard from '../ui/LuxuryCard';
import LuxuryInput from '../ui/LuxuryInput';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { isTraverionAdminUser } from '../../lib/adminAuth';
import { isTraverionAdminHost, publicMarketingSiteUrl } from '../../lib/adminHost';
import { subscribePasswordRecovery, updatePasswordAfterRecovery } from '../../lib/passwordRecoveryFlow';
import { normalizeStaffSignInEmail, normalizeStaffSignInPassword } from '../../lib/staffSignInCredentials';
import { hostedSupabaseEnvPairingStatus } from '../../lib/supabaseEnvPairing';

function isInvalidCredentialsAuthMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('invalid login') || m.includes('invalid credentials');
}

function StaffAccessDeniedBanner() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border border-red-400/40 bg-gradient-to-b from-red-950/55 via-slate-900/85 to-slate-950/95 px-5 py-6 text-center animate-admin-denied-glow"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(248,113,113,0.12),transparent_55%)]" />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />
      <ShieldAlert
        className="relative z-[1] mx-auto h-11 w-11 text-red-400 drop-shadow-[0_0_14px_rgba(248,113,113,0.5)] animate-[pulse_2.5s_cubic-bezier(0.4,0,0.6,1)_infinite]"
        aria-hidden
      />
      <div className="relative z-[1] mt-4 flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3">
        <span
          className="text-base font-semibold uppercase tracking-[0.28em] text-red-100 sm:text-lg sm:tracking-[0.38em] animate-fade-in-up"
          style={{ animationDelay: '40ms', animationFillMode: 'both' }}
        >
          Access
        </span>
        <span
          className="text-base font-bold uppercase tracking-[0.28em] text-red-400 sm:text-lg sm:tracking-[0.38em] animate-fade-in-up"
          style={{ animationDelay: '180ms', animationFillMode: 'both' }}
        >
          denied
        </span>
      </div>
      <p
        className="relative z-[1] mt-3 text-xs font-medium text-red-200/80 animate-fade-in-up"
        style={{ animationDelay: '280ms', animationFillMode: 'both' }}
      >
        Wrong email or password.
      </p>
    </div>
  );
}

/**
 * Private sign-in (no public sign-up). Staff host: /login; local dev: /admin gate.
 */
export default function AdminStaffLogin() {
  const viteSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const viteSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const supabaseEnvPairing = hostedSupabaseEnvPairingStatus(viteSupabaseUrl, viteSupabaseAnonKey);

  const { user, loading: authLoading } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  /** On staff host only: false until we know there is no redirect-worthy session (prevents “any password” confusion). */
  const [loginFormAllowed, setLoginFormAllowed] = useState(() => !isTraverionAdminHost());
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  /** Bumps so the access-denied animation replays on each failed password attempt. */
  const [accessDeniedTick, setAccessDeniedTick] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    return subscribePasswordRecovery(supabase, () => setRecoveryMode(true));
  }, []);

  useEffect(() => {
    if (recoveryMode) {
      setLoginFormAllowed(true);
      return;
    }
    if (!isTraverionAdminHost() || !supabase) {
      setLoginFormAllowed(true);
      return;
    }
    if (authLoading) {
      setLoginFormAllowed(false);
      return;
    }
    if (!user) {
      setLoginFormAllowed(true);
      return;
    }
    setLoginFormAllowed(false);
    let cancelled = false;
    void (async () => {
      if (!isTraverionAdminUser(user)) {
        if (!cancelled) setLoginFormAllowed(true);
        return;
      }
      const { data: rpcOk, error: rpcErr } = await supabase.rpc('is_traverion_panel_admin');
      if (cancelled) return;
      if (!rpcErr && rpcOk === true) {
        window.location.replace('/admin');
        return;
      }
      if (!cancelled) setLoginFormAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same user id after TOKEN_REFRESHED must not re-run RPC / replace
  }, [user?.id, recoveryMode, authLoading]);

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccessDenied(false);
    setSuccessMessage('');
    if (!supabase) return;
    const recoveryPw = normalizeStaffSignInPassword(recoveryPassword);
    const recoveryPw2 = normalizeStaffSignInPassword(recoveryConfirm);
    if (recoveryPw !== recoveryPw2) {
      setError('Passwords do not match.');
      return;
    }
    setRecoverySubmitting(true);
    try {
      const { error: err } = await updatePasswordAfterRecovery(supabase, recoveryPw, { minLength: 8 });
      if (err) {
        if (isInvalidCredentialsAuthMessage(err)) {
          setAccessDeniedTick((t) => t + 1);
          setAccessDenied(true);
          setError('');
        } else {
          setAccessDenied(false);
          setError(err);
        }
        return;
      }
      await supabase.auth.signOut();
      setRecoveryMode(false);
      setRecoveryPassword('');
      setRecoveryConfirm('');
      setSuccessMessage('Password updated. Sign in with your new password.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setAccessDenied(false);
    setSuccessMessage('');

    if (!supabase) {
      setIsLoading(false);
      setError('Supabase is not configured.');
      return;
    }

    const email = normalizeStaffSignInEmail(credentials.email);
    const password = normalizeStaffSignInPassword(credentials.password);
    if (!password) {
      setIsLoading(false);
      setError('Enter your password.');
      return;
    }

    // Do not use AuthContext.signIn here: it runs consumer profile setup for non-admin users and can
    // interfere. Panel login only needs Auth + role + public.admin RPC.
    const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) {
      setIsLoading(false);
      if (isInvalidCredentialsAuthMessage(signErr.message)) {
        setAccessDeniedTick((t) => t + 1);
        setAccessDenied(true);
        setError('');
      } else {
        setAccessDenied(false);
        setError(signErr.message || 'Sign-in failed.');
      }
      return;
    }

    const signedUser = signData.user;
    if (!signedUser) {
      setIsLoading(false);
      setError('Sign-in did not return a user. Try again.');
      return;
    }

    if (!signedUser.email_confirmed_at) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(
        'This email is not confirmed yet. In Supabase: Authentication → Users, confirm the user or set email_confirmed_at.'
      );
      return;
    }

    if (!isTraverionAdminUser(signedUser)) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(
        'This account does not have the panel role. Run supabase/manual/grant_traverion_admin.sql in the SQL editor for your email.'
      );
      return;
    }

    const { data: rpcOk, error: rpcErr } = await supabase.rpc('is_traverion_panel_admin');
    if (rpcErr) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(
        `Panel database check failed: ${rpcErr.message}. Apply migration 037 (public.admin + is_traverion_panel_admin).`
      );
      return;
    }
    if (rpcOk !== true) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(
        'This email is not allowed for the panel. The public.admin table must list exactly this email (migration 037).'
      );
      return;
    }

    setIsLoading(false);
    // Full navigation so AuthProvider loads the new session from storage. In-app navigation
    // raced dashboard-only AdminGate (user still null → redirect back to /login).
    if (isTraverionAdminHost()) {
      window.location.assign('/admin');
      return;
    }
    window.location.reload();
  };

  const showSpinnerOnly =
    authLoading || (isTraverionAdminHost() && !recoveryMode && !loginFormAllowed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <LuxuryCard variant="glass" className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img src={BRAND_LOGO_SRC} alt="" className="h-16 w-16 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">{recoveryMode ? 'Set a new password' : 'Sign in'}</h1>
          <p className="text-gray-300 text-sm">
            {recoveryMode
              ? 'Choose a new password, then sign in below.'
              : 'Private access. Authorized users only. There is no sign-up on this page.'}
          </p>
        </div>

        {showSpinnerOnly && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-300">
            <Loader2 className="w-10 h-10 animate-spin text-sky-400" aria-hidden />
            <p className="text-sm text-center">
              {authLoading
                ? 'Checking session…'
                : user
                  ? 'Already signed in. Opening dashboard…'
                  : 'Checking…'}
            </p>
          </div>
        )}

        {!showSpinnerOnly && (
          <>
        {supabaseEnvPairing === 'mismatch' && (
          <div className="mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100">
            <strong className="font-semibold">Configuration error:</strong> the anon key in this build does not
            match the project in <code className="text-xs opacity-90">VITE_SUPABASE_URL</code>. Update both values
            from the same Supabase project (Settings → API) in your host env, then redeploy. This is unrelated to
            using a subdomain.
          </div>
        )}

        {recoveryMode ? (
          <form onSubmit={(e) => void handleRecoverySubmit(e)} className="space-y-6">
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
            value={recoveryPassword}
            onChange={(e) => {
              setAccessDenied(false);
              setRecoveryPassword(e.target.value);
            }}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full"
            />
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm new password"
            value={recoveryConfirm}
            onChange={(e) => {
              setAccessDenied(false);
              setRecoveryConfirm(e.target.value);
            }}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full"
            />
            {accessDenied && <StaffAccessDeniedBanner key={accessDeniedTick} />}
            {error && !accessDenied && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-emerald-800 text-sm">{successMessage}</p>
              </div>
            )}
            <LuxuryButton
              type="submit"
              variant="gradient"
              size="lg"
              disabled={recoverySubmitting || !recoveryPassword || !recoveryConfirm}
              className="w-full"
            >
              {recoverySubmitting ? 'Saving…' : 'Update password'}
            </LuxuryButton>
          </form>
        ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <LuxuryInput
            type="email"
            autoComplete="username"
            placeholder="Email"
            value={credentials.email}
            onChange={(e) => {
              setAccessDenied(false);
              setCredentials({ ...credentials, email: e.target.value });
            }}
            icon={<User className="w-5 h-5" />}
            required
            className="w-full"
          />

          <div className="relative">
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={credentials.password}
              onChange={(e) => {
                setAccessDenied(false);
                setCredentials({ ...credentials, password: e.target.value });
              }}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full pr-12"
            />
            <button
              type="button"
              onClick={() => setIsVisible(!isVisible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={isVisible ? 'Hide password' : 'Show password'}
            >
              {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {accessDenied && <StaffAccessDeniedBanner key={accessDeniedTick} />}
          {error && !accessDenied && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-emerald-800 text-sm">{successMessage}</p>
            </div>
          )}

          <LuxuryButton
            type="submit"
            variant="gradient"
            size="lg"
            disabled={isLoading || !credentials.email || !credentials.password}
            className="w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Key className="w-5 h-5" />
                Continue
              </span>
            )}
          </LuxuryButton>
        </form>
        )}
          </>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          <a href={publicMarketingSiteUrl()} className="underline hover:text-slate-200">
            Back to public site
          </a>
        </p>
      </LuxuryCard>
    </div>
  );
}
