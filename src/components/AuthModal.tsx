import { useState } from 'react';
import { X, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'signin' | 'signup';

export default function AuthModal() {
  const { authModalOpen, closeAuthModal, signIn, signUp, triggerAuthSuccess } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

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
        triggerAuthSuccess();
      } else {
        const { error: err, hasSession } = await signUp(email, password);
        if (err) {
          setError(err);
          return;
        }
        if (hasSession) triggerAuthSuccess();
        else { setError(''); setSuccessMessage('Check your email to confirm your account, then log in.'); }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-fade-in"
      style={{ animationDuration: '0.2s' }}
      role="dialog"
      aria-modal="true"
      aria-label="Log in or sign up"
      onClick={closeAuthModal}
    >
      <div
        className="bg-white rounded-2xl shadow-soft-xl w-full max-w-md overflow-hidden animate-slide-up"
        style={{ animationDelay: '40ms' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {tab === 'signin' ? 'Log in' : 'Sign up'}
          </h2>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors duration-200 ease-smooth active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === 'signin'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(null); setSuccessMessage(null); }}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === 'signup'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none transition-shadow"
              required
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none transition-shadow"
              required
              minLength={tab === 'signup' ? 6 : undefined}
            />
          </div>
          {tab === 'signup' && (
            <div>
              <label htmlFor="auth-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland outline-none transition-shadow"
                required
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          {successMessage && (
            <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {tab === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                {submitting ? 'Logging in…' : 'Log in'}
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                {submitting ? 'Creating account…' : 'Sign up'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
