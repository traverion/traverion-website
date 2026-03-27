import { useState } from 'react';
import { LogIn, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SupplierLoginProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

export default function SupplierLogin({ onAuthenticated, isSupabase }: SupplierLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mapAuthError = (message: string): string => {
    const m = message.toLowerCase();
    if (m.includes('not configured') || m.includes('unavailable')) {
      return 'Supplier authentication is currently unavailable. Please try again shortly.';
    }
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!email || !password) return;
    setSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (isSupabase && supabase) {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (err) {
          setError(mapAuthError(err.message));
          return;
        }
        if (data.user && !data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          setError('Please confirm your email before signing in.');
          setSuccessMessage('Check your inbox and verify your email first, then log in.');
          return;
        }
        onAuthenticated();
      } else {
        setError(
          'Sign-in can’t run here because the site isn’t connected to the account service (Supabase). ' +
            'If you’re on production, the deploy needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
            'If you’re testing locally, add them to .env and restart the dev server.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-finland/10 text-finland mb-4">
            <Globe className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Supplier portal</h1>
          <p className="text-gray-600 mt-1">
            List your tours and activities on Traverion. Reach travelers worldwide.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          {successMessage && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{successMessage}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn className="w-5 h-5" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don’t have an account? Sign up in Supabase (Authentication → Users) or get in touch to become a supplier.
        </p>
      </div>
    </div>
  );
}
