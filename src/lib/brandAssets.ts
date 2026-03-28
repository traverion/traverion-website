import { publicSiteBaseUrl } from './publicSiteUrl';

/**
 * Logo file in /public. Change this when you replace the asset; then update the same filename
 * in docs/email-templates/*.html (img src full URL) and index.html favicon links if needed.
 */
export const BRAND_LOGO_FILENAME = 'traverionlogotransparent.png';

/** Use in <img src={BRAND_LOGO_SRC} /> — served from Vite public/. */
export const BRAND_LOGO_SRC = `/${BRAND_LOGO_FILENAME}`;

/** Full URL for emails and sharing meta when you need an absolute address (production default). */
export function brandLogoAbsoluteUrl(): string {
  return `${publicSiteBaseUrl()}/${BRAND_LOGO_FILENAME}`;
}
