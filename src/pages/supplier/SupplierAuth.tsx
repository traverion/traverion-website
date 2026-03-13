import { useState } from 'react';
import { LogIn, UserPlus, Globe, Check, MapPin, Users, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SupplierAuthProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

type Mode = 'signin' | 'signup';

const BENEFITS = [
  { icon: MapPin, text: 'List once — your tours appear on Traverion for travelers worldwide' },
  { icon: Users, text: 'No upfront cost — reach customers without listing fees' },
  { icon: CreditCard, text: 'Manage everything in one place — listings, bookings, payouts' },
];

export default function SupplierAuth({ onAuthenticated, isSupabase }: SupplierAuthProps) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!email || !password) return;
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      if (isSupabase && supabase) {
        if (mode === 'signup') {
          const { data, error: err } = await supabase.auth.signUp({ email, password });
          if (err) {
            setError(err.message);
            return;
          }
          if (data.session) {
            onAuthenticated();
            return;
          }
          setSuccessMessage('Check your email to confirm your account, then sign in below.');
          setMode('signin');
        } else {
          const { error: err } = await supabase.auth.signInWithPassword({ email, password });
          if (err) {
            setError(err.message);
            return;
          }
          onAuthenticated();
        }
      } else {
        localStorage.setItem('supplier_authenticated', 'true');
        onAuthenticated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col lg:flex-row lg:items-center lg:justify-center gap-12 lg:gap-16 px-4 py-12 max-w-6xl mx-auto">
      {/* Left: value prop + benefits (GYG/Viator style) */}
      <div className="lg:max-w-md">
        <div className="flex items-center gap-3 text-finland mb-4">
          <div className="w-12 h-12 rounded-xl bg-finland/10 flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <span className="font-semibold text-gray-900">Traverion for suppliers</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight mb-4">
          List once. Reach travelers everywhere.
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Add your tours and activities to Traverion. Get in front of travelers searching for experiences worldwide — no upfront cost.
        </p>
        <ul className="space-y-4">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-finland/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-finland" />
              </div>
              <span className="text-gray-700">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Right: Sign up / Sign in card */}
      <div className="w-full max-w-md flex-shrink-0">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-finland text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Create account
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-finland text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign in
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
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
                minLength={mode === 'signup' ? 6 : undefined}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-500 mt-1">At least 6 characters</p>
              )}
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  required
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {mode === 'signup' ? (
                <>
                  <UserPlus className="w-5 h-5" />
                  {submitting ? 'Creating account…' : 'Create account'}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  {submitting ? 'Signing in…' : 'Sign in'}
                </>
              )}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          By continuing, you agree to list your offerings on Traverion and to our terms of use.
        </p>
      </div>
    </div>
  );
}
