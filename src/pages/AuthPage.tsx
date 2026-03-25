import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';

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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPage = useMemo(() => {
    const allowed = new Set(['home', 'packages', 'cart', 'bookings', 'account', 'wishlist', 'contact']);
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
          setError(err);
          return;
        }
        onNavigate(nextPage);
      } else {
        const { error: err, hasSession } = await signUp(email, password);
        if (err) {
          setError(err);
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
            <h1 className="text-2xl font-semibold text-gray-900">
              {tab === 'signin' ? 'Sign in' : 'Sign up'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">Access your bookings and cart.</p>
          </div>

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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="auth-page-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="auth-page-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
                required
                minLength={tab === 'signup' ? 6 : undefined}
              />
            </div>
            {tab === 'signup' && (
              <div>
                <label htmlFor="auth-page-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  id="auth-page-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none"
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
        </div>
      </div>
    </div>
  );
}
