/**
 * Password reset emails append #...&type=recovery to the redirect URL.
 * If Supabase "Site URL" is only the domain (e.g. https://traverion.com), users land on /
 * and never see a "set new password" form. Send them to a route that handles recovery.
 */
export function redirectIfPasswordRecoveryLandingInWrongPlace(): void {
  if (typeof window === 'undefined') return;
  const { pathname, hash, search, origin } = window.location;
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  let type: string | null = null;
  if (h) {
    try {
      type = new URLSearchParams(h).get('type');
    } catch {
      /* ignore */
    }
  }
  if (type !== 'recovery') {
    try {
      if (new URLSearchParams(window.location.search).get('type') === 'recovery') {
        type = 'recovery';
      }
    } catch {
      return;
    }
  }
  if (type !== 'recovery') return;

  const p = pathname.replace(/\/$/, '') || '/';
  const host = window.location.hostname;

  const fragment = h ? `#${h}` : '';

  if (host === 'admin.traverion.com') {
    if (p === '/login' || p === '/admin') return;
    window.location.replace(`${origin}/login${search}${fragment}`);
    return;
  }

  if (p === '/auth' || p === '/supplier-log-in') return;
  if (p.startsWith('/supplier')) {
    window.location.replace(`${origin}/supplier-log-in${search}${fragment}`);
    return;
  }

  window.location.replace(`${origin}/auth${search}${fragment}`);
}
