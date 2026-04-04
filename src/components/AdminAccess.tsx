import { useState } from 'react';
import { Eye, EyeOff, Lock, User, Key } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryInput from './ui/LuxuryInput';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { canAccessTraverionAdmin } from '../lib/adminAuth';

export default function AdminAccess() {
  const { signIn } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!supabase) {
      setIsLoading(false);
      setError('Supabase is not configured.');
      return;
    }

    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;
    const result = await signIn(email, password);
    if (result.error) {
      setIsLoading(false);
      setError(result.error);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!canAccessTraverionAdmin(session?.user ?? null)) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError(
        'This account is not allowed to use Traverion admin. You need the admin role in Supabase and, if configured, an email on the staff allowlist (VITE_TRAVERION_ADMIN_EMAILS / TRAVERION_ADMIN_EMAILS).'
      );
      return;
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <LuxuryCard variant="glass" className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img src={BRAND_LOGO_SRC} alt="" className="h-16 w-16 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Staff sign-in</h1>
          <p className="text-gray-300">
            This area is not part of the public site. Sign in with a Traverion staff account that has the{' '}
            <span className="text-white/90 font-medium">admin</span> role in Supabase.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div>
            <LuxuryInput
              type="email"
              autoComplete="username"
              placeholder="Work email"
              value={credentials.email}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              icon={<User className="w-5 h-5" />}
              required
              className="w-full"
            />
          </div>

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
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
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

          <LuxuryButton
            type="submit"
            variant="gradient"
            size="lg"
            disabled={isLoading || !credentials.email || !credentials.password}
            className="w-full"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Signing in…
              </div>
            ) : (
              <div className="flex items-center">
                <Key className="w-5 h-5 mr-2" />
                Continue
              </div>
            )}
          </LuxuryButton>
        </form>

        <div className="mt-8 p-4 bg-slate-800/80 border border-slate-600 rounded-lg text-left">
          <h3 className="font-medium text-white mb-2 text-sm">First-time staff setup</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Create your user in Supabase Authentication (or sign up on the main site), then in the SQL Editor run{' '}
            <code className="text-sky-300">supabase/manual/grant_traverion_admin.sql</code> with your email. The admin
            dashboard calls the Edge Function using your session — no separate operations secret in the browser.
          </p>
        </div>
      </LuxuryCard>
    </div>
  );
}
