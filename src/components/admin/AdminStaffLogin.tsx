import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, User, Key } from 'lucide-react';
import LuxuryButton from '../ui/LuxuryButton';
import LuxuryCard from '../ui/LuxuryCard';
import LuxuryInput from '../ui/LuxuryInput';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { canAccessTraverionAdmin } from '../../lib/adminAuth';
import { isTraverionAdminHost, publicMarketingSiteUrl } from '../../lib/adminHost';

type Props = {
  /** After successful staff sign-in (e.g. navigate to /admin on staff host). */
  onSignedIn?: () => void;
};

/**
 * Staff sign-in (no public sign-up). Used on staff host at /login or embedded in AdminGate on /admin (dev).
 */
export default function AdminStaffLogin({ onSignedIn }: Props) {
  const { signIn, user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !canAccessTraverionAdmin(user)) return;
    if (!isTraverionAdminHost()) return;
    window.location.replace('/admin');
  }, [user]);

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
        'Wrong account or not authorized for staff tools. Use the Traverion staff email and ensure admin role + allowlist are set in Supabase.'
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
          <h1 className="text-2xl font-bold text-white mb-2">Traverion staff</h1>
          <p className="text-gray-300 text-sm">
            Private area. Sign in with the staff account only you control. There is no sign-up on this page.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <LuxuryInput
            type="email"
            autoComplete="username"
            placeholder="Staff email"
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
                Sign in to staff dashboard
              </span>
            )}
          </LuxuryButton>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">
          <a href={publicMarketingSiteUrl()} className="underline hover:text-slate-200">
            Back to public site
          </a>
        </p>
      </LuxuryCard>
    </div>
  );
}
