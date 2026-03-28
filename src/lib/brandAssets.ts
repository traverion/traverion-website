import { publicSiteBaseUrl } from './publicSiteUrl';

/**
 * Official Traverion mark: `public/traverionlogotransparent.png`.
 * Use BRAND_LOGO_SRC everywhere on the site; keep email templates and index.html favicon links
 * on the same filename if you ever rename the file.
 */
export const BRAND_LOGO_FILENAME = 'traverionlogotransparent.png';

/** Use in <img src={BRAND_LOGO_SRC} /> — served from Vite public/. */
export const BRAND_LOGO_SRC = `/${BRAND_LOGO_FILENAME}`;

/** Full URL for emails and sharing meta when you need an absolute address (production default). */
export function brandLogoAbsoluteUrl(): string {
  return `${publicSiteBaseUrl()}/${BRAND_LOGO_FILENAME}`;
}
