import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, User, Key } from 'lucide-react';
import LuxuryButton from '../ui/LuxuryButton';
import LuxuryCard from '../ui/LuxuryCard';
import LuxuryInput from '../ui/LuxuryInput';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { isTraverionAdminUser } from '../../lib/adminAuth';
import { isTraverionAdminHost, publicMarketingSiteUrl } from '../../lib/adminHost';
import { subscribePasswordRecovery, updatePasswordAfterRecovery } from '../../lib/passwordRecoveryFlow';

function formatAuthSignInError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return [
      'Supabase rejected this email/password. That usually means one of:',
      '• Wrong password (try reset via email), or a typo.',
      '• The user does not exist in the Supabase project this site is using.',
      '• admin.traverion.com uses different VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY than www—in Vercel, set those env vars for all domains on the same deployment.',
      `Supabase said: ${message}`,
    ].join(' ');
  }
  return message;
}

type Props = {
  /** After successful staff sign-in (e.g. navigate to /admin on staff host). */
  onSignedIn?: () => void;
};

/**
 * Private sign-in (no public sign-up). Staff host: /login; local dev: /admin gate.
 */
export default function AdminStaffLogin({ onSignedIn }: Props) {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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
    if (recoveryMode) return;
    if (!user || !supabase) return;
    if (!isTraverionAdminHost()) return;
    let cancelled = false;
    void (async () => {
      if (!isTraverionAdminUser(user)) return;
      const { data: rpcOk, error: rpcErr } = await supabase.rpc('is_traverion_panel_admin');
      if (cancelled) return;
      if (!rpcErr && rpcOk === true) window.location.replace('/admin');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, recoveryMode]);

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!supabase) return;
    if (recoveryPassword !== recoveryConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setRecoverySubmitting(true);
    try {
      const { error: err } = await updatePasswordAfterRecovery(supabase, recoveryPassword, { minLength: 8 });
      if (err) {
        setError(formatAuthSignInError(err));
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
    setSuccessMessage('');

    if (!supabase) {
      setIsLoading(false);
      setError('Supabase is not configured.');
      return;
    }

    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    // Do not use AuthContext.signIn here: it runs consumer profile setup for non-admin users and can
    // interfere. Panel login only needs Auth + role + public.admin RPC.
    const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) {
      setIsLoading(false);
      setError(formatAuthSignInError(signErr.message));
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
    if (onSignedIn) {
      onSignedIn();
      return;
    }
    window.location.reload();
  };

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

        {recoveryMode ? (
          <form onSubmit={(e) => void handleRecoverySubmit(e)} className="space-y-6">
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full"
            />
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={recoveryConfirm}
              onChange={(e) => setRecoveryConfirm(e.target.value)}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full"
            />
            {error && (
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
            onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
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
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
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

          {error && (
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

        <p className="mt-8 text-center text-xs text-slate-400">
          <a href={publicMarketingSiteUrl()} className="underline hover:text-slate-200">
            Back to public site
          </a>
        </p>
      </LuxuryCard>
    </div>
  );
}
