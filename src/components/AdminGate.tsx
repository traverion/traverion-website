import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canAccessTraverionAdmin } from '../lib/adminAuth';
import AdminDashboard from '../pages/AdminDashboard';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { Loader2, LogOut } from 'lucide-react';

const AUTH_SIGNIN_ADMIN = '/auth?tab=signin&next=admin';

/**
 * Staff area: no UI until Supabase session exists. Unauthenticated visitors are sent to /auth
 * (same login as the rest of the site); only then can they reach /admin, and only if role+email allow.
 */
export default function AdminGate() {
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) return;
    window.location.replace(AUTH_SIGNIN_ADMIN);
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-900 text-gray-300">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" aria-hidden />
        <p className="text-sm">Checking session…</p>
      </div>
    );
  }

  if (canAccessTraverionAdmin(user)) {
    return <AdminDashboard />;
  }

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <LuxuryCard variant="glass" className="w-full max-w-md p-8 text-center">
          <img src={BRAND_LOGO_SRC} alt="" className="h-14 w-14 object-contain mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Access denied</h1>
          <p className="text-gray-300 text-sm mb-6">
            Signed in as <span className="text-white font-medium">{user.email}</span>, but this account is not
            authorized for Traverion staff tools (admin role and allowlisted email in Supabase).
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <LuxuryButton variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </LuxuryButton>
            <a
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20"
            >
              Public site
            </a>
          </div>
        </LuxuryCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-900 text-gray-300">
      <Loader2 className="w-8 h-8 animate-spin text-sky-400" aria-hidden />
      <p className="text-sm">Redirecting to sign-in…</p>
    </div>
  );
}
