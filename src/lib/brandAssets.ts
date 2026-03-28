import { publicSiteBaseUrl } from './publicSiteUrl';

/**
 * Official Traverion mark: `public/traverionlogotransparent.png` (landscape ~922×685).
 * Use BRAND_LOGO_SRC everywhere on the site; keep email templates and index.html favicon links
 * on the same filename if you ever rename the file.
 * Email HTML: use proportional width/height (e.g. 200×149), never a square box, or the logo looks stretched.
 * When the PNG changes but the filename stays the same, bump BRAND_LOGO_EMAIL_QUERY and the same query
 * on img src in docs/email-templates/*.html so inboxes fetch the new image (otherwise they keep a cached old one).
 */
export const BRAND_LOGO_FILENAME = 'traverionlogotransparent.png';

/** Must match the ?v= on logo URLs in docs/email-templates (confirm signup, reset password, magic link). */
export const BRAND_LOGO_EMAIL_QUERY = '?v=3';

/** Use in <img src={BRAND_LOGO_SRC} /> — served from Vite public/. */
export const BRAND_LOGO_SRC = `/${BRAND_LOGO_FILENAME}`;

/** Full URL for emails and sharing meta when you need an absolute address (production default). */
export function brandLogoAbsoluteUrl(): string {
  return `${publicSiteBaseUrl()}/${BRAND_LOGO_FILENAME}`;
}
