/** Production staff hostname (subdomain). */
const ADMIN_HOSTNAME = 'admin.traverion.com';

const PUBLIC_MARKETING_HOSTNAMES = new Set(['www.traverion.com', 'traverion.com']);

/** Main public site hosts (not admin subdomain, not preview URLs). */
export function isPublicTraverionMarketingHost(): boolean {
  if (typeof window === 'undefined') return false;
  return PUBLIC_MARKETING_HOSTNAMES.has(window.location.hostname);
}

/**
 * True when the app is served on the staff subdomain. Login lives at /login, dashboard at /admin.
 */
export function isTraverionAdminHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === ADMIN_HOSTNAME;
}

/** Public marketing site URL for links from the staff host (avoid linking to admin.traverion.com/). */
export function publicMarketingSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, '');
  return 'https://www.traverion.com';
}

/**
 * If user opens /admin on the public domain, send them to the staff subdomain login.
 * Runs at module load so it happens before paint (single-page load).
 */
export function redirectMainDomainAdminToStaffLogin(): void {
  if (typeof window === 'undefined') return;
  const h = window.location.hostname;
  const p = window.location.pathname.replace(/\/$/, '') || '/';
  if (p !== '/admin') return;
  if (!PUBLIC_MARKETING_HOSTNAMES.has(h)) return;
  window.location.replace(`https://${ADMIN_HOSTNAME}/login`);
}

/**
 * SPA navigation can set `currentPage` to admin on www/apex without a full reload, bypassing `main.tsx`.
 * Full-page redirect to staff login so the dashboard never mounts on the public marketing hosts.
 */
export function redirectIfInAppAdminOnPublicMarketingSite(currentPage: string): void {
  if (typeof window === 'undefined') return;
  if (!PUBLIC_MARKETING_HOSTNAMES.has(window.location.hostname)) return;
  if (currentPage !== 'admin') return;
  window.location.replace(`https://${ADMIN_HOSTNAME}/login`);
}
