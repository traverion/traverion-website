import { sanitizeAuthRedirectTo } from './authRedirect';
import { publicSiteBaseUrl } from './publicSiteUrl';
import { sanitizeTravelerAuthNext } from './travelerAuthLinks';

/** Same-origin return for an email sign-in link. Never accepts an off-site next URL. */
function withEmailLinkMarker(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('via', 'link');
  return parsed.toString();
}

export function travelerMagicLinkRedirect(next: string | null | undefined, returnHref?: string | null): string {
  const fallback = `${publicSiteBaseUrl()}/log-in?next=home`;
  const target = returnHref?.trim()
    ? sanitizeAuthRedirectTo(returnHref, publicSiteBaseUrl(), fallback)
    : sanitizeAuthRedirectTo(
        `${publicSiteBaseUrl()}/log-in?next=${encodeURIComponent(sanitizeTravelerAuthNext(next))}`,
        publicSiteBaseUrl(),
        fallback
      );
  return withEmailLinkMarker(target);
}

export const TRAVELER_MAGIC_LINK_REQUESTED =
  'If an account exists for that email, a sign-in link was requested. Look for mail from Traverion if delivery succeeds. This message is not proof the email arrived.';
