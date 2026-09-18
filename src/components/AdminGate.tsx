import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { verifyTraverionPanelAccess } from '../lib/adminAuth';
import { supabase } from '../lib/supabase';
import AdminDashboard from '../pages/AdminDashboard';
import AdminStaffLogin from './admin/AdminStaffLogin';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { Loader2, LogOut } from 'lucide-react';
import { publicMarketingSiteUrl } from '../lib/adminHost';

type AdminGateProps = {
  /**
   * `gate` — show login when logged out (for dev / non-subdomain /admin).
   * `dashboard-only` — only /admin on staff host; unauthenticated users go to /login.
   */
  mode?: 'gate' | 'dashboard-only';
};

export default function AdminGate({ mode = 'gate' }: AdminGateProps) {
  const { user, loading, signOut } = useAuth();
  const [panelAllowed, setPanelAllowed] = useState<boolean | null>(null);
  /** Avoid re-running panel verify on every `user` object reference change (TOKEN_REFRESHED, etc.). */
  const panelVerifyUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'dashboard-only') return;
    if (loading) return;
    if (user) return;
    if (window.location.pathname.replace(/\/$/, '') !== '/login') {
      window.location.replace('/login');
    }
  }, [mode, loading, user?.id]);

  useEffect(() => {
    if (loading || !user || !supabase) {
      if (!user) panelVerifyUserIdRef.current = null;
      setPanelAllowed(null);
      return;
    }
    const uid = user.id;
    const newSubject = panelVerifyUserIdRef.current !== uid;
    if (newSubject) {
      panelVerifyUserIdRef.current = uid;
      setPanelAllowed(null);
    }

    let cancelled = false;
    void verifyTraverionPanelAccess(supabase, user).then((ok) => {
      if (!cancelled) setPanelAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify when session subject (id) changes, not token refresh object identity
  }, [loading, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-paper text-ink-muted">
        <Loader2 className="w-8 h-8 animate-spin text-finland" aria-hidden />
        <p className="text-sm">Checking session…</p>
      </div>
    );
  }

  if (user && panelAllowed === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-paper text-ink-muted">
        <Loader2 className="w-8 h-8 animate-spin text-finland" aria-hidden />
        <p className="text-sm">Verifying access…</p>
      </div>
    );
  }

  if (user && panelAllowed === true) {
    return <AdminDashboard />;
  }

  if (user) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="tv-card w-full max-w-md p-8 text-center">
          <img src={BRAND_LOGO_SRC} alt="" className="h-14 w-14 object-contain mx-auto mb-4" />
          <h1 className="font-display text-xl text-ink mb-2">Access denied</h1>
          <p className="text-ink-muted text-sm mb-6">
            Signed in as <span className="text-ink font-medium">{user.email}</span>, but this account is not
            authorized to use this area.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => void signOut()} className="tv-btn-secondary text-sm inline-flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" aria-hidden />
              Sign out
            </button>
            <a href={publicMarketingSiteUrl()} className="tv-btn-ghost text-sm inline-flex items-center justify-center">
              Public site
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'dashboard-only') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-paper text-ink-muted">
        <Loader2 className="w-8 h-8 animate-spin text-finland" aria-hidden />
        <p className="text-sm">Redirecting…</p>
      </div>
    );
  }

  return <AdminStaffLogin />;
}
