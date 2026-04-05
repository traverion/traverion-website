import { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, LogIn, UserPlus, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { subscribePasswordRecovery, updatePasswordAfterRecovery } from '../lib/passwordRecoveryFlow';

type AuthTab = 'signin' | 'signup';

interface AuthPageProps {
  onNavigate: (page: string) => void;
}

function readAuthQuery(): { tab: AuthTab; next: string } {
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  const nextParam = params.get('next');
  return {
    tab: tabParam === 'signin' ? 'signin' : 'signup',
    next: nextParam || 'cart',
  };
}

export default function AuthPage({ onNavigate }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const [{ tab: initialTab, next }] = useState(readAuthQuery);
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    return subscribePasswordRecovery(supabase, () => setRecoveryMode(true));
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('traverion_auth_flash');
      if (!raw) return;
      sessionStorage.removeItem('traverion_auth_flash');
      const parsed = JSON.parse(raw) as { kind?: string; message?: string };
      if (parsed?.kind === 'error' && typeof parsed.message === 'string') {
        setError(parsed.message);
        setTab('signin');
      }
    } catch {
      sessionStorage.removeItem('traverion_auth_flash');
    }
  }, []);

  const mapAuthError = (message: string): string => {
    const m = message.toLowerCase();
    if (m.includes('not configured')) return 'Authentication is currently unavailable. Please try again shortly.';
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
      return 'This email is already in use. Try signing in instead.';
    }
    if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (
      m.includes('contact_phone') ||
      m.includes('phone number already exists') ||
      m.includes('consumer_profiles_contact_phone_norm_unique')
    ) {
      return 'An account with this phone number already exists. Try signing in instead.';
    }
    return message;
  };

  const nextPage = useMemo(() => {
    const allowed = new Set([
      'home',
      'packages',
      'cart',
      'bookings',
      'account',
      'wishlist',
      'contact',
    ]);
    return allowed.has(next) ? next : 'cart';
  }, [next]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    params.set('next', nextPage);
    window.history.replaceState({}, '', `/auth?${params.toString()}`);
  }, [tab, nextPage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!email || !password) return;
    if (tab === 'signup') {
      if (!phoneNumber.trim()) {
        setError('Phone number is required');
        return;
      }
      if (normalizeConsumerPhone(phoneNumber).replace(/\D/g, '').length < 9) {
        setError('Enter a valid phone number');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Use at least 6 characters');
        return;
      }
    }
    setSubmitting(true);
    try {
      if (tab === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(mapAuthError(err));
          return;
        }
        onNavigate(nextPage);
      } else {
        const { error: err, hasSession } = await signUp(email, password, { phoneNumber });
        if (err) {
          setError(mapAuthError(err));
          return;
        }
        if (hasSession) {
          onNavigate(nextPage);
        } else {
          setSuccessMessage('Check your email to confirm your account, then sign in.');
          setTab('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);
    if (!email.trim()) {
      setError('Enter your email, then resend confirmation.');
      return;
    }
    if (!supabase) {
      setError('Authentication is not configured.');
      return;
    }
    setResendSending(true);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${publicSiteBaseUrl()}/auth?tab=signin&next=account` },
    });
    setResendSending(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    setSuccessMessage('Confirmation email sent. Check your inbox and use the new link.');
  }, [email]);

  const handleResetPassword = async () => {
    setError(null);
    setSuccessMessage(null);
    if (!email.trim()) {
      setError('Enter your email first, then reset password.');
      return;
    }
    if (!supabase) {
      setError('Password reset is not configured.');
      return;
    }
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${publicSiteBaseUrl()}/auth?tab=signin&next=${encodeURIComponent(nextPage)}`,
    });
    setResetSending(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    setSuccessMessage('Password reset email sent. Check your inbox.');
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!supabase) return;
    if (recoveryPassword !== recoveryConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setRecoverySubmitting(true);
    try {
      const { error: err } = await updatePasswordAfterRecovery(supabase, recoveryPassword, { minLength: 6 });
      if (err) {
        setError(mapAuthError(err));
        return;
      }
      await supabase.auth.signOut();
      setRecoveryMode(false);
      setRecoveryPassword('');
      setRecoveryConfirm('');
      setTab('signin');
      setSuccessMessage('Your password was updated. Sign in with your new password.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.vacation}
        overlay="slateSoft"
        title="Your account"
        subtitle="Sign in or create an account to use your cart, bookings, and tour requests in one place."
      />
      <div className="max-w-md mx-auto px-4 py-8 pb-12">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="mb-5 inline-flex items-center gap-2 text-gray-600 hover:text-finland"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 sm:h-14 sm:w-14 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {recoveryMode ? 'Set a new password' : tab === 'signin' ? 'Sign in' : 'Sign up'}
                </h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  {recoveryMode
                    ? 'Choose a new password for your account, then sign in.'
                    : 'Access your bookings and cart.'}
                </p>
              </div>
            </div>
          </div>

          {recoveryMode ? (
            <form onSubmit={(e) => void handleRecoverySubmit(e)} className="p-6 space-y-4">
              <div>
                <label htmlFor="auth-recovery-password" className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  id="auth-recovery-password"
                  type="password"
                  name="new-password"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label htmlFor="auth-recovery-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm new password
                </label>
                <input
                  id="auth-recovery-confirm"
                  type="password"
                  name="confirm-password"
                  value={recoveryConfirm}
                  onChange={(e) => setRecoveryConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              {successMessage && (
                <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>
              )}
              <button
                type="submit"
                disabled={recoverySubmitting}
                className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors disabled:opacity-60"
              >
                {recoverySubmitting ? 'Saving…' : 'Update password'}
              </button>
            </form>
          ) : (
            <>
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => { setTab('signin'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'signin' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setTab('signup'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'signup' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="auth-page-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="auth-page-email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                autoComplete="email"
                required
              />
              {tab === 'signin' && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendSending}
                    className="text-xs text-finland hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    {resendSending ? 'Sending…' : 'Resend confirmation email'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetSending}
                    className="text-xs text-finland hover:underline disabled:opacity-50"
                  >
                    {resetSending ? 'Sending reset email…' : 'Forgot password?'}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="auth-page-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="auth-page-password"
                type="password"
                name={tab === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                required
                minLength={tab === 'signup' ? 6 : undefined}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            {tab === 'signup' && (
              <div>
                <label htmlFor="auth-page-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone number
                </label>
                <input
                  id="auth-page-phone"
                  type="tel"
                  name="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+358 40 123 4567"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                  autoComplete="tel"
                  required
                />
              </div>
            )}
            {tab === 'signup' && (
              <div>
                <label htmlFor="auth-page-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  id="auth-page-confirm"
                  type="password"
                  name="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                  autoComplete="new-password"
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {successMessage && <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {tab === 'signin' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  {submitting ? 'Signing in…' : 'Sign in'}
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  {submitting ? 'Creating account…' : 'Create account'}
                </>
              )}
            </button>
          </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
